import { count, desc, eq } from "drizzle-orm";
import type { FastifyInstance, FastifyReply, FastifyRequest } from "fastify";
import { z } from "zod";
import { db } from "../db/client.js";
import { inviteCodes, users } from "../db/schema.js";
import { publishHaEvent } from "../services/homeAssistant.js";
import {
  getAppSettings,
  SECRET_KEEP,
  toPublicSettings,
  updateAppSettings,
} from "../services/settings.js";

function requireAdmin(request: FastifyRequest, reply: FastifyReply) {
  const role = (request.user as { role?: string }).role;
  if (role !== "admin") {
    reply.status(403).send({ error: "Admin only" });
    return false;
  }
  return true;
}

const settingsBody = z.object({
  publicBaseUrl: z.string().url().nullable().optional().or(z.literal("")),
  haEnabled: z.boolean().optional(),
  haMqttUrl: z.string().nullable().optional().or(z.literal("")),
  haMqttUsername: z.string().nullable().optional().or(z.literal("")),
  haMqttPassword: z.string().nullable().optional(),
  haRestUrl: z.string().nullable().optional().or(z.literal("")),
  haRestToken: z.string().nullable().optional(),
  aiEnabled: z.boolean().optional(),
  ollamaUrl: z.string().nullable().optional().or(z.literal("")),
});

export async function adminRoutes(app: FastifyInstance) {
  app.get("/admin/settings", { onRequest: [app.authenticate] }, async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const settings = await getAppSettings(true);
    return { settings: toPublicSettings(settings) };
  });

  app.patch("/admin/settings", { onRequest: [app.authenticate] }, async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const parsed = settingsBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid settings", details: parsed.error.flatten() });
    }

    const body = parsed.data;
    const normalizeUrl = (v: string | null | undefined) => {
      if (v === undefined) return undefined;
      if (v === null || v === "") return null;
      return v.trim();
    };

    const settings = await updateAppSettings({
      publicBaseUrl: normalizeUrl(body.publicBaseUrl as string | null | undefined),
      haEnabled: body.haEnabled,
      haMqttUrl: normalizeUrl(body.haMqttUrl as string | null | undefined),
      haMqttUsername: normalizeUrl(body.haMqttUsername as string | null | undefined),
      haMqttPassword:
        body.haMqttPassword === undefined
          ? SECRET_KEEP
          : body.haMqttPassword === ""
            ? null
            : body.haMqttPassword,
      haRestUrl: normalizeUrl(body.haRestUrl as string | null | undefined),
      haRestToken:
        body.haRestToken === undefined
          ? SECRET_KEEP
          : body.haRestToken === ""
            ? null
            : body.haRestToken,
      aiEnabled: body.aiEnabled,
      ollamaUrl: normalizeUrl(body.ollamaUrl as string | null | undefined),
    });

    return { settings: toPublicSettings(settings) };
  });

  app.post("/admin/ha/test", { onRequest: [app.authenticate] }, async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const result = await publishHaEvent("workout_completed", {
      sessionId: "admin-test",
      kind: "gym",
      completedAt: new Date().toISOString(),
      notes: "Forge admin panel test event",
    });
    if (!result.ok) return reply.status(502).send(result);
    return result;
  });

  app.get("/admin/users", { onRequest: [app.authenticate] }, async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const rows = await db
      .select({
        id: users.id,
        username: users.username,
        displayName: users.displayName,
        role: users.role,
        createdAt: users.createdAt,
      })
      .from(users)
      .orderBy(desc(users.createdAt));
    return { users: rows };
  });

  app.get("/admin/stats", { onRequest: [app.authenticate] }, async (request, reply) => {
    if (!requireAdmin(request, reply)) return;
    const [userRow] = await db.select({ n: count() }).from(users);
    const [inviteRow] = await db.select({ n: count() }).from(inviteCodes);
    const settings = await getAppSettings();
    return {
      userCount: Number(userRow?.n ?? 0),
      inviteCount: Number(inviteRow?.n ?? 0),
      haEnabled: settings.haEnabled,
      aiEnabled: settings.aiEnabled,
      publicBaseUrl: settings.publicBaseUrl,
    };
  });
}
