import { and, eq, inArray } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../db/client.js";
import { integrationAccounts, integrationAlerts, syncEntities } from "../db/schema.js";
import { loadMetricSources } from "../services/metricSources.js";
import { sendUserPush } from "../services/push.js";
import { decryptJson, encryptJson } from "../services/secrets.js";
import { getAppSettings } from "../services/settings.js";
import { integrationAuthorized } from "../services/workerAuth.js";

const syncStatusBody = z.object({
  provider: z.enum(["garmin", "renpho", "health_connect"]),
  userId: z.string().uuid().optional(),
  ok: z.boolean(),
  error: z.string().max(500).optional(),
  needsReauth: z.boolean().optional(),
});

const accountBody = z.object({
  provider: z.enum(["garmin", "renpho"]),
  enabled: z.boolean().optional(),
  email: z.string().email().optional(),
  password: z.string().min(1).max(200).optional(),
});

function maskEmail(email: string | undefined | null): string | null {
  if (!email || !email.includes("@")) return null;
  const [user, domain] = email.split("@");
  if (!user || !domain) return null;
  const visible = user.slice(0, Math.min(2, user.length));
  return `${visible}${"*".repeat(Math.max(3, user.length - 2))}@${domain}`;
}

async function upsertAlert(
  userId: string,
  provider: string,
  opts: { message: string; needsReauth: boolean; active: boolean },
) {
  const now = new Date();
  const existing = await db
    .select()
    .from(integrationAlerts)
    .where(and(eq(integrationAlerts.userId, userId), eq(integrationAlerts.provider, provider)));
  if (existing[0]) {
    await db
      .update(integrationAlerts)
      .set({
        message: opts.message,
        needsReauth: opts.needsReauth,
        active: opts.active,
        updatedAt: now,
      })
      .where(eq(integrationAlerts.id, existing[0].id));
  } else if (opts.active) {
    await db.insert(integrationAlerts).values({
      userId,
      provider,
      message: opts.message,
      needsReauth: opts.needsReauth,
      active: true,
      updatedAt: now,
    });
  }
}

export async function integrationRoutes(app: FastifyInstance) {
  /** Worker heartbeat / failure — uses integration token, not user JWT. */
  app.post("/integrations/sync-status", async (request, reply) => {
    const settings = await getAppSettings();
    if (!integrationAuthorized(request, settings.integrationToken ?? null)) {
      return reply.status(401).send({ error: "Unauthorized" });
    }
    const parsed = syncStatusBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid status", details: parsed.error.flatten() });
    }
    const { provider, ok, error, needsReauth } = parsed.data;
    let userId = parsed.data.userId;

    if (!userId) {
      const [acct] = await db
        .select()
        .from(integrationAccounts)
        .where(and(eq(integrationAccounts.provider, provider), eq(integrationAccounts.enabled, true)));
      userId = acct?.userId;
    }
    if (!userId) {
      return reply.status(400).send({ error: "userId required when no enabled account" });
    }

    const now = new Date();
    const [acct] = await db
      .select()
      .from(integrationAccounts)
      .where(and(eq(integrationAccounts.userId, userId), eq(integrationAccounts.provider, provider)));

    if (acct) {
      await db
        .update(integrationAccounts)
        .set({
          lastSuccessAt: ok ? now : acct.lastSuccessAt,
          lastError: ok ? null : error ?? "sync failed",
          needsReauth: needsReauth ?? !ok,
          forceSyncAt: null,
          updatedAt: now,
        })
        .where(eq(integrationAccounts.id, acct.id));
    }

    if (ok) {
      await upsertAlert(userId, provider, {
        message: "ok",
        needsReauth: false,
        active: false,
      });
      return { ok: true };
    }

    const message = error || `${provider} sync failed`;
    await upsertAlert(userId, provider, {
      message,
      needsReauth: needsReauth ?? true,
      active: true,
    });
    await sendUserPush(userId, {
      title: `${provider === "garmin" ? "Garmin" : provider === "renpho" ? "Renpho" : "Health"} sync issue`,
      body: message,
      data: { kind: "integration-alert", provider },
      stickyHint: true,
    });
    return { ok: true, alerted: true };
  });

  app.get("/integrations/accounts", { onRequest: [app.authenticate] }, async (request) => {
    const userId = (request.user as { sub: string }).sub;
    const rows = await db.select().from(integrationAccounts).where(eq(integrationAccounts.userId, userId));
    return {
      accounts: rows.map((r) => {
        const creds = decryptJson<{ email?: string; password?: string }>(r.credentials);
        const encrypted = Boolean(r.credentials?.startsWith("enc:v1:"));
        return {
          provider: r.provider,
          enabled: r.enabled,
          lastSuccessAt: r.lastSuccessAt,
          lastError: r.lastError,
          needsReauth: r.needsReauth,
          hasCredentials: Boolean(r.credentials && creds?.email && creds?.password),
          credentialsEncrypted: encrypted,
          emailMasked: maskEmail(creds?.email),
          syncPending: Boolean(r.forceSyncAt),
        };
      }),
      security: {
        storage: "AES-256-GCM (enc:v1)",
        note: "Passwords are never returned to the app. Only the sync-worker decrypts them on the server.",
      },
    };
  });

  app.patch("/integrations/accounts", { onRequest: [app.authenticate] }, async (request, reply) => {
    const userId = (request.user as { sub: string }).sub;
    const parsed = accountBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid account", details: parsed.error.flatten() });
    }
    const { provider, enabled, email, password } = parsed.data;
    const now = new Date();
    const [existing] = await db
      .select()
      .from(integrationAccounts)
      .where(and(eq(integrationAccounts.userId, userId), eq(integrationAccounts.provider, provider)));

    let credentials = existing?.credentials ?? null;
    if (email && password) {
      credentials = encryptJson({ email, password });
    }

    const nextEnabled = enabled ?? existing?.enabled ?? true;
    const forceSyncAt = email && password ? now : (existing?.forceSyncAt ?? null);

    if (existing) {
      await db
        .update(integrationAccounts)
        .set({
          enabled: nextEnabled,
          credentials,
          needsReauth: false,
          lastError: null,
          forceSyncAt,
          updatedAt: now,
        })
        .where(eq(integrationAccounts.id, existing.id));
    } else {
      await db.insert(integrationAccounts).values({
        userId,
        provider,
        enabled: nextEnabled,
        credentials,
        forceSyncAt,
        updatedAt: now,
      });
    }

    if (nextEnabled) {
      const settings = await getAppSettings();
      const { updateAppSettings } = await import("../services/settings.js");
      if (provider === "garmin" && !settings.garminEnabled) {
        await updateAppSettings({ garminEnabled: true });
      }
      if (provider === "renpho" && !settings.renphoEnabled) {
        await updateAppSettings({ renphoEnabled: true });
      }
    }

    return { ok: true, syncQueued: Boolean(forceSyncAt) };
  });

  /** Queue an immediate sync attempt for the background worker. */
  app.post("/integrations/accounts/sync-now", { onRequest: [app.authenticate] }, async (request, reply) => {
    const userId = (request.user as { sub: string }).sub;
    const parsed = z.object({ provider: z.enum(["garmin", "renpho"]) }).safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "provider required" });
    }
    const { provider } = parsed.data;
    const [acct] = await db
      .select()
      .from(integrationAccounts)
      .where(and(eq(integrationAccounts.userId, userId), eq(integrationAccounts.provider, provider)));
    if (!acct?.credentials) {
      return reply.status(400).send({ error: `No ${provider} credentials saved — sign in first` });
    }
    const now = new Date();
    await db
      .update(integrationAccounts)
      .set({ enabled: true, forceSyncAt: now, needsReauth: false, updatedAt: now })
      .where(eq(integrationAccounts.id, acct.id));

    const settings = await getAppSettings();
    const { updateAppSettings } = await import("../services/settings.js");
    if (provider === "garmin" && !settings.garminEnabled) {
      await updateAppSettings({ garminEnabled: true });
    }
    if (provider === "renpho" && !settings.renphoEnabled) {
      await updateAppSettings({ renphoEnabled: true });
    }

    return { ok: true, queued: true, message: "Sync queued — worker usually picks up within ~30s" };
  });

  /** Worker pulls enabled accounts (integration token). */
  app.get("/integrations/worker/accounts", async (request, reply) => {
    const settings = await getAppSettings();
    if (!integrationAuthorized(request, settings.integrationToken ?? null)) {
      return reply.status(401).send({ error: "Unauthorized" });
    }
    const rows = await db
      .select()
      .from(integrationAccounts)
      .where(eq(integrationAccounts.enabled, true));
    return {
      accounts: rows.map((r) => ({
        userId: r.userId,
        provider: r.provider,
        forceSyncAt: r.forceSyncAt,
        credentials: decryptJson<{ email?: string; password?: string }>(r.credentials),
      })),
      hasForceSync: rows.some((r) => r.forceSyncAt != null),
    };
  });

  app.get("/metrics/history", { onRequest: [app.authenticate] }, async (request) => {
    const userId = (request.user as { sub: string }).sub;
    const q = request.query as { metric?: string; days?: string };
    const metric = q.metric ?? "steps";
    const days = Math.min(90, Math.max(7, Number(q.days) || 30));
    const since = new Date();
    since.setDate(since.getDate() - days);
    const sinceIso = since.toISOString().slice(0, 10);
    const sources = await loadMetricSources(userId);

    if (metric === "weight" || metric === "bodyFat" || metric === "muscle" || metric === "bmi") {
      const rows = await db
        .select()
        .from(syncEntities)
        .where(and(eq(syncEntities.userId, userId), eq(syncEntities.entityType, "weight")));
      const pref = sources.weight ?? "health_connect";
      const valueKey =
        metric === "bodyFat"
          ? "bodyFatPct"
          : metric === "muscle"
            ? "muscleMass"
            : metric === "bmi"
              ? "bmi"
              : "weight";
      const points = rows
        .filter((r) => !r.deleted)
        .map(
          (r) =>
            r.payload as {
              weighedAt?: string;
              weight?: number;
              bodyFatPct?: number;
              muscleMass?: number;
              bmi?: number;
              units?: string;
              source?: string;
            },
        )
        .filter((p) => p.weighedAt && p.weighedAt.slice(0, 10) >= sinceIso)
        .filter((p) => {
          if (pref === "renpho") return p.source === "renpho";
          if (pref === "garmin") return p.source === "garmin";
          if (pref === "health_connect")
            return !p.source || p.source === "health_connect" || p.source === "health";
          return true;
        })
        .sort((a, b) => String(a.weighedAt).localeCompare(String(b.weighedAt)))
        .map((p) => ({
          date: p.weighedAt!.slice(0, 10),
          value: Number((p as Record<string, unknown>)[valueKey] ?? 0),
          units: metric === "weight" ? (p.units ?? "lb") : metric === "bmi" ? "" : "%",
        }))
        .filter((p) => p.value > 0 || metric === "weight");
      return { metric, points };
    }

    const pref =
      metric === "sleep"
        ? sources.sleep ?? "health_connect"
        : metric === "restingHr"
          ? sources.hr ?? "health_connect"
          : sources.steps ?? "health_connect";
    const entityTypes =
      pref === "garmin"
        ? ["garmin_daily"]
        : pref === "health_connect"
          ? ["health_daily", "garmin_daily"]
          : ["health_daily", "garmin_daily"];

    const rows = await db
      .select()
      .from(syncEntities)
      .where(
        and(eq(syncEntities.userId, userId), inArray(syncEntities.entityType, entityTypes as never)),
      );
    const key = metric === "sleep" ? "sleepMinutes" : metric === "restingHr" ? "restingHr" : "steps";
    const byDate = new Map<string, { date: string; value: number; units: string }>();
    for (const r of rows.filter((row) => !row.deleted)) {
      const p = r.payload as Record<string, unknown>;
      const d = String(p.date ?? "");
      if (!d || d < sinceIso) continue;
      if (pref === "garmin" && p.source && p.source !== "garmin") continue;
      if (pref === "health_connect" && r.entityType === "garmin_daily" && p.source === "garmin") {
        continue;
      }
      if (
        pref === "health_connect" &&
        r.entityType === "garmin_daily" &&
        p.source !== "health_connect" &&
        p.source !== "health" &&
        p.source != null
      ) {
        continue;
      }
      if (byDate.has(d) && r.entityType !== "health_daily") continue;
      byDate.set(d, {
        date: d,
        value: Number(p[key] ?? 0),
        units: metric === "sleep" ? "min" : metric === "restingHr" ? "bpm" : "steps",
      });
    }
    const points = [...byDate.values()].sort((a, b) => a.date.localeCompare(b.date));
    return { metric, points };
  });
}
