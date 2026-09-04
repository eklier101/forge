import bcrypt from "bcryptjs";
import { randomBytes } from "node:crypto";
import { count, eq, sql } from "drizzle-orm";
import type { FastifyInstance, FastifyRequest } from "fastify";
import { z } from "zod";
import { db } from "../db/client.js";
import { devices, inviteCodes, preferences, users } from "../db/schema.js";

const INVITE_TTL_MS = 24 * 60 * 60 * 1000;

const registerBody = z.object({
  username: z
    .string()
    .min(3)
    .max(32)
    .regex(/^[a-zA-Z0-9_]+$/, "Username: letters, numbers, underscore only"),
  password: z.string().min(8).max(128),
  displayName: z.string().min(1).max(64).optional(),
  inviteCode: z.string().min(8).max(128).optional(),
  deviceName: z.string().min(1).max(64).default("device"),
});

const loginBody = z.object({
  username: z.string().min(1).max(32),
  password: z.string().min(1).max(128),
  deviceName: z.string().min(1).max(64).default("device"),
});

async function userCount(): Promise<number> {
  const [row] = await db.select({ n: count() }).from(users);
  return Number(row?.n ?? 0);
}

function publicOrigin(request: FastifyRequest): string {
  const env = process.env.PUBLIC_BASE_URL?.replace(/\/$/, "");
  if (env) return env;
  const xfProto = String(request.headers["x-forwarded-proto"] ?? "").split(",")[0]?.trim();
  const xfHost = String(request.headers["x-forwarded-host"] ?? "").split(",")[0]?.trim();
  const host = xfHost || String(request.headers.host ?? "localhost:3000");
  const proto = xfProto || (host.includes("localhost") || host.startsWith("10.") ? "http" : "https");
  return `${proto}://${host}`;
}

function inviteUrls(origin: string, code: string) {
  return {
    url: `${origin}/invite/${code}`,
    appUrl: `forge://invite/${code}`,
    webUrl: `${origin}/app/pair?invite=${encodeURIComponent(code)}`,
  };
}

function inviteStatus(row: {
  uses: number;
  maxUses: number;
  expiresAt: Date;
}): "ok" | "used" | "expired" {
  if (row.uses >= row.maxUses) return "used";
  if (row.expiresAt.getTime() <= Date.now()) return "expired";
  return "ok";
}

/** Atomically consume a one-time invite. */
async function consumeInvite(
  codeRaw: string,
): Promise<{ ok: true; code: string } | { ok: false; error: string }> {
  const code = codeRaw.trim().toLowerCase();
  if (!code) return { ok: false, error: "Invite link required" };

  const updated = await db.execute<{ code: string }>(sql`
    UPDATE invite_codes
    SET uses = uses + 1
    WHERE code = ${code}
      AND uses < max_uses
      AND expires_at > now()
    RETURNING code
  `);

  const consumed = (updated as unknown as { rows?: { code: string }[] }).rows?.[0]
    ?? (Array.isArray(updated) ? (updated as { code: string }[])[0] : undefined);

  if (consumed?.code) return { ok: true, code: consumed.code };

  const [row] = await db.select().from(inviteCodes).where(eq(inviteCodes.code, code));
  if (!row) return { ok: false, error: "Invalid invite link" };
  const status = inviteStatus(row);
  if (status === "used") return { ok: false, error: "Invite link already used" };
  if (status === "expired") return { ok: false, error: "Invite link expired" };
  return { ok: false, error: "Invite link is no longer valid" };
}

async function issueToken(
  reply: { jwtSign: (p: object) => Promise<string> },
  user: { id: string; displayName: string; username: string; role: string },
  deviceName: string,
) {
  const [device] = await db
    .insert(devices)
    .values({ userId: user.id, deviceName })
    .returning();

  const token = await reply.jwtSign({
    sub: user.id,
    deviceId: device.id,
    name: user.displayName,
    username: user.username,
    role: user.role,
  });

  return {
    token,
    user: {
      id: user.id,
      username: user.username,
      displayName: user.displayName,
      role: user.role,
    },
    device: { id: device.id, deviceName: device.deviceName },
  };
}

function serializeInvite(row: typeof inviteCodes.$inferSelect, origin: string) {
  const status = inviteStatus(row);
  return {
    code: row.code,
    note: row.note,
    uses: row.uses,
    maxUses: row.maxUses,
    expiresAt: row.expiresAt.toISOString(),
    createdAt: row.createdAt.toISOString(),
    status,
    ...inviteUrls(origin, row.code),
  };
}

export async function authRoutes(app: FastifyInstance) {
  app.get("/auth/status", async () => {
    const n = await userCount();
    return {
      needsBootstrap: n === 0,
      userCount: n,
    };
  });

  app.get("/auth/invite/:code", async (request, reply) => {
    const code = String((request.params as { code: string }).code ?? "")
      .trim()
      .toLowerCase();
    const [row] = await db.select().from(inviteCodes).where(eq(inviteCodes.code, code));
    if (!row) return reply.status(404).send({ error: "Invalid invite link", valid: false });
    const status = inviteStatus(row);
    if (status !== "ok") {
      return reply.status(410).send({
        error: status === "used" ? "Invite link already used" : "Invite link expired",
        valid: false,
        status,
      });
    }
    return {
      valid: true,
      status,
      expiresAt: row.expiresAt.toISOString(),
    };
  });

  app.post("/auth/register", async (request, reply) => {
    const parsed = registerBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid register payload", details: parsed.error.flatten() });
    }

    const username = parsed.data.username.trim().toLowerCase();
    const n = await userCount();
    const isBootstrap = n === 0;

    if (!isBootstrap) {
      if (!parsed.data.inviteCode) {
        return reply.status(400).send({ error: "Invite link required" });
      }
      const invite = await consumeInvite(parsed.data.inviteCode);
      if (!invite.ok) return reply.status(401).send({ error: invite.error });
    }

    const existing = await db.select().from(users).where(eq(users.username, username));
    if (existing.length) {
      return reply.status(409).send({ error: "Username already taken" });
    }

    const passwordHash = await bcrypt.hash(parsed.data.password, 12);
    const displayName = parsed.data.displayName?.trim() || parsed.data.username;
    const role = isBootstrap ? "admin" : "user";
    const inviteUsed = isBootstrap ? "bootstrap" : parsed.data.inviteCode!.trim().toLowerCase();

    const [user] = await db
      .insert(users)
      .values({
        username,
        passwordHash,
        displayName,
        role,
        inviteCodeUsed: inviteUsed,
      })
      .returning();

    await db.insert(preferences).values({ userId: user.id });

    return issueToken(reply, user, parsed.data.deviceName);
  });

  app.post("/auth/login", async (request, reply) => {
    const parsed = loginBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid login payload", details: parsed.error.flatten() });
    }

    const username = parsed.data.username.trim().toLowerCase();
    const [user] = await db.select().from(users).where(eq(users.username, username));
    if (!user?.passwordHash) return reply.status(401).send({ error: "Invalid username or password" });

    const ok = await bcrypt.compare(parsed.data.password, user.passwordHash);
    if (!ok) return reply.status(401).send({ error: "Invalid username or password" });

    return issueToken(reply, user, parsed.data.deviceName);
  });

  app.get("/me", { onRequest: [app.authenticate] }, async (request) => {
    const userId = (request.user as { sub: string }).sub;
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    const [prefs] = await db.select().from(preferences).where(eq(preferences.userId, userId));
    if (!user) return { user: null, preferences: null };
    return {
      user: {
        id: user.id,
        username: user.username,
        displayName: user.displayName,
        role: user.role,
      },
      preferences: prefs,
    };
  });

  app.get("/admin/invites", { onRequest: [app.authenticate] }, async (request, reply) => {
    const role = (request.user as { role?: string }).role;
    if (role !== "admin") return reply.status(403).send({ error: "Admin only" });
    const origin = publicOrigin(request);
    const rows = await db.select().from(inviteCodes);
    rows.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
    return { invites: rows.map((r) => serializeInvite(r, origin)) };
  });

  app.post("/admin/invites", { onRequest: [app.authenticate] }, async (request, reply) => {
    const role = (request.user as { role?: string }).role;
    const userId = (request.user as { sub: string }).sub;
    if (role !== "admin") return reply.status(403).send({ error: "Admin only" });

    const body = z
      .object({
        note: z.string().max(120).optional(),
      })
      .safeParse(request.body ?? {});
    if (!body.success) return reply.status(400).send({ error: "Invalid invite payload" });

    const code = randomBytes(18).toString("base64url").toLowerCase();
    const expiresAt = new Date(Date.now() + INVITE_TTL_MS);
    const [row] = await db
      .insert(inviteCodes)
      .values({
        code,
        createdBy: userId,
        maxUses: 1,
        note: body.data.note,
        expiresAt,
      })
      .returning();

    const origin = publicOrigin(request);
    return { invite: serializeInvite(row, origin) };
  });

  app.post("/pair", async (_request, reply) => {
    return reply.status(410).send({
      error: "Pairing replaced by login. Use POST /auth/login or an invite link to register.",
    });
  });
}
