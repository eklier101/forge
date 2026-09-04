import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../db/client.js";
import { syncEntities } from "../db/schema.js";
import { publishHaEvent } from "../services/homeAssistant.js";
import { getAppSettings } from "../services/settings.js";

const fastingStartBody = z.object({
  startedAt: z.string().datetime().optional(),
  targetHours: z.number().min(1).max(72).optional(),
  notes: z.string().max(500).optional(),
});

const fastingEndBody = z.object({
  id: z.string().min(1),
  endedAt: z.string().datetime().optional(),
});

const garminDailyBody = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  steps: z.number().int().nonnegative().optional(),
  calories: z.number().nonnegative().optional(),
  restingHr: z.number().positive().optional(),
  maxHr: z.number().positive().optional(),
  sleepMinutes: z.number().int().nonnegative().optional(),
  stressAvg: z.number().nonnegative().optional(),
  bodyBattery: z.number().nonnegative().optional(),
  raw: z.unknown().optional(),
});

const renphoWeightBody = z.object({
  weighedAt: z.string().datetime().optional(),
  weight: z.number().positive(),
  units: z.enum(["lb", "kg"]).default("lb"),
  bodyFatPct: z.number().optional(),
  muscleMass: z.number().optional(),
  boneMass: z.number().optional(),
  waterPct: z.number().optional(),
  bmi: z.number().optional(),
  visceralFat: z.number().optional(),
  deviceId: z.string().optional(),
});

async function upsertEntity(
  userId: string,
  id: string,
  entityType: string,
  payload: object,
) {
  const now = new Date();
  await db
    .insert(syncEntities)
    .values({
      id,
      userId,
      entityType,
      payload,
      updatedAt: now,
      deleted: false,
    })
    .onConflictDoUpdate({
      target: syncEntities.id,
      set: {
        payload,
        updatedAt: now,
        deleted: false,
        entityType,
        userId,
      },
    });
}

function integrationAuthorized(request: { headers: Record<string, unknown> }, token: string | null) {
  if (!token) return false;
  const header = String(request.headers["x-forge-token"] ?? request.headers["authorization"] ?? "");
  if (header === token) return true;
  if (header.toLowerCase().startsWith("bearer ") && header.slice(7) === token) return true;
  return false;
}

export async function lifestyleRoutes(app: FastifyInstance) {
  app.get("/fasting/active", { onRequest: [app.authenticate] }, async (request) => {
    const userId = (request.user as { sub: string }).sub;
    const rows = await db
      .select()
      .from(syncEntities)
      .where(and(eq(syncEntities.userId, userId), eq(syncEntities.entityType, "fasting_session")));
    const active = rows
      .map((r) => r.payload as { status?: string; startedAt?: string; id?: string })
      .find((p) => p.status === "active");
    return { active: active ?? null };
  });

  app.get("/fasting/history", { onRequest: [app.authenticate] }, async (request) => {
    const userId = (request.user as { sub: string }).sub;
    const rows = await db
      .select()
      .from(syncEntities)
      .where(and(eq(syncEntities.userId, userId), eq(syncEntities.entityType, "fasting_session")));
    const sessions = rows
      .map((r) => ({ id: r.id, ...(r.payload as object) }))
      .sort((a, b) =>
        String((b as { startedAt?: string }).startedAt ?? "").localeCompare(
          String((a as { startedAt?: string }).startedAt ?? ""),
        ),
      );
    return { sessions };
  });

  app.post("/fasting/start", { onRequest: [app.authenticate] }, async (request, reply) => {
    const userId = (request.user as { sub: string }).sub;
    const parsed = fastingStartBody.safeParse(request.body ?? {});
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid fasting start", details: parsed.error.flatten() });
    }

    const existing = await db
      .select()
      .from(syncEntities)
      .where(and(eq(syncEntities.userId, userId), eq(syncEntities.entityType, "fasting_session")));
    const already = existing
      .map((r) => r.payload as { status?: string })
      .find((p) => p.status === "active");
    if (already) {
      return reply.status(409).send({ error: "A fast is already active", active: already });
    }

    const startedAt = parsed.data.startedAt ?? new Date().toISOString();
    const id = `fasting-${startedAt}`;
    const payload = {
      id,
      startedAt,
      targetHours: parsed.data.targetHours ?? 16,
      notes: parsed.data.notes,
      status: "active" as const,
    };
    await upsertEntity(userId, id, "fasting_session", payload);
    return { session: payload };
  });

  app.post("/fasting/end", { onRequest: [app.authenticate] }, async (request, reply) => {
    const userId = (request.user as { sub: string }).sub;
    const parsed = fastingEndBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid fasting end", details: parsed.error.flatten() });
    }
    const [row] = await db
      .select()
      .from(syncEntities)
      .where(and(eq(syncEntities.userId, userId), eq(syncEntities.id, parsed.data.id)));
    if (!row) return reply.status(404).send({ error: "Fast not found" });
    const prev = row.payload as {
      startedAt: string;
      targetHours?: number;
      notes?: string;
      status: string;
    };
    const endedAt = parsed.data.endedAt ?? new Date().toISOString();
    const payload = {
      ...prev,
      id: row.id,
      endedAt,
      status: "completed" as const,
      durationHours:
        (new Date(endedAt).getTime() - new Date(prev.startedAt).getTime()) / (1000 * 60 * 60),
    };
    await upsertEntity(userId, row.id, "fasting_session", payload);
    return { session: payload };
  });

  app.get("/metrics/today", { onRequest: [app.authenticate] }, async (request) => {
    const userId = (request.user as { sub: string }).sub;
    const q = request.query as { date?: string };
    const date =
      q.date && /^\d{4}-\d{2}-\d{2}$/.test(q.date)
        ? q.date
        : new Date().toISOString().slice(0, 10);

    const [garminRow] = await db
      .select()
      .from(syncEntities)
      .where(and(eq(syncEntities.userId, userId), eq(syncEntities.id, `garmin-${date}`)));

    const weightRows = await db
      .select()
      .from(syncEntities)
      .where(and(eq(syncEntities.userId, userId), eq(syncEntities.entityType, "weight")));
    const weights = weightRows
      .map((r) => r.payload as { weighedAt?: string; weight?: number; units?: string; source?: string })
      .filter((w) => w.weighedAt)
      .sort((a, b) => String(b.weighedAt).localeCompare(String(a.weighedAt)));

    return {
      date,
      garmin: garminRow?.payload ?? null,
      latestWeight: weights[0] ?? null,
    };
  });

  /** Garmin Connect / Health Connect / webhook ingest */
  app.post("/integrations/garmin/daily", { onRequest: [app.authenticate] }, async (request, reply) => {
    const settings = await getAppSettings();
    if (!settings.garminEnabled) {
      return reply.status(503).send({ error: "Garmin integration is disabled in admin settings" });
    }
    const parsed = garminDailyBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid garmin payload", details: parsed.error.flatten() });
    }
    const userId = (request.user as { sub: string }).sub;
    const payload = { ...parsed.data, source: "garmin" as const };
    await upsertEntity(userId, `garmin-${parsed.data.date}`, "garmin_daily", payload);
    return { ok: true, metrics: payload };
  });

  /** Token-based ingest for automations (optional shared integration token) */
  app.post("/integrations/garmin/daily/token", async (request, reply) => {
    const settings = await getAppSettings();
    if (!settings.garminEnabled) {
      return reply.status(503).send({ error: "Garmin integration disabled" });
    }
    if (!integrationAuthorized(request as never, settings.integrationToken)) {
      return reply.status(401).send({ error: "Invalid integration token" });
    }
    const body = request.body as { userId?: string } & z.infer<typeof garminDailyBody>;
    if (!body.userId) return reply.status(400).send({ error: "userId required" });
    const parsed = garminDailyBody.safeParse(body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid garmin payload", details: parsed.error.flatten() });
    }
    const payload = { ...parsed.data, source: "garmin" as const };
    await upsertEntity(body.userId, `garmin-${parsed.data.date}`, "garmin_daily", payload);
    return { ok: true };
  });

  app.post("/integrations/renpho/weight", { onRequest: [app.authenticate] }, async (request, reply) => {
    const settings = await getAppSettings();
    if (!settings.renphoEnabled) {
      return reply.status(503).send({ error: "Renpho integration is disabled in admin settings" });
    }
    const parsed = renphoWeightBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid renpho payload", details: parsed.error.flatten() });
    }
    const userId = (request.user as { sub: string }).sub;
    const weighedAt = parsed.data.weighedAt ?? new Date().toISOString();
    const payload = {
      ...parsed.data,
      weighedAt,
      source: "renpho" as const,
    };
    await upsertEntity(userId, `weight-${weighedAt}`, "weight", payload);
    const ha = await publishHaEvent("weight", payload);
    return { ok: true, weight: payload, homeAssistant: ha };
  });
}
