import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../db/client.js";
import { preferences, syncEntities, users } from "../db/schema.js";
import { unzipFirstJson, zipSingleFile } from "../lib/simpleZip.js";
import { upsertEntity } from "../services/nutritionStore.js";

function csvEscape(v: unknown): string {
  const s = v == null ? "" : String(v);
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`;
  return s;
}

function rowsToCsv(headers: string[], rows: Record<string, unknown>[]): string {
  const lines = [headers.join(",")];
  for (const row of rows) {
    lines.push(headers.map((h) => csvEscape(row[h])).join(","));
  }
  return lines.join("\n");
}

async function buildExportBundle(userId: string) {
  const [user] = await db.select().from(users).where(eq(users.id, userId));
  const [prefs] = await db.select().from(preferences).where(eq(preferences.userId, userId));
  const entities = await db.select().from(syncEntities).where(eq(syncEntities.userId, userId));

  const byType = (t: string) =>
    entities.filter((e) => e.entityType === t && !e.deleted).map((e) => ({ id: e.id, ...(e.payload as object) }));

  const workoutSessions = byType("workout_session");
  const fasting = byType("fasting_session");
  const meals = byType("nutrition_meal");
  const presets = byType("nutrition_preset");
  const recipes = byType("nutrition_recipe");
  const weights = byType("weight");
  const progressPhotos = byType("progress_photo").map((p) => {
    const { imageBase64: _img, ...rest } = p as { imageBase64?: string };
    return rest;
  });
  const daily = entities
    .filter((e) => (e.entityType === "garmin_daily" || e.entityType === "health_daily") && !e.deleted)
    .map((e) => ({ id: e.id, entityType: e.entityType, ...(e.payload as object) }));

  return {
    exportedAt: new Date().toISOString(),
    user: user
      ? { id: user.id, username: user.username, displayName: user.displayName, role: user.role }
      : { id: userId },
    preferences: prefs ?? null,
    workoutSessions,
    fastingSessions: fasting,
    nutritionMeals: meals,
    nutritionPresets: presets,
    nutritionRecipes: recipes,
    weights,
    progressPhotos,
    dailyMetrics: daily,
  };
}

function bundleToCsv(bundle: Awaited<ReturnType<typeof buildExportBundle>>): string {
  const parts: string[] = [];
  parts.push("# forge-export");
  parts.push(`# exportedAt,${bundle.exportedAt}`);
  parts.push("");
  parts.push("# workout_sessions");
  parts.push(
    rowsToCsv(
      ["id", "date", "kind", "focus", "status", "startedAt", "completedAt"],
      bundle.workoutSessions.map((w) => ({
        id: (w as { id?: string }).id,
        date: (w as { date?: string }).date,
        kind: (w as { kind?: string }).kind,
        focus: (w as { focus?: string }).focus,
        status: (w as { status?: string }).status,
        startedAt: (w as { startedAt?: string }).startedAt,
        completedAt: (w as { completedAt?: string }).completedAt,
      })),
    ),
  );
  parts.push("");
  parts.push("# fasting_sessions");
  parts.push(
    rowsToCsv(
      ["id", "startedAt", "endedAt", "targetHours", "status", "durationHours"],
      bundle.fastingSessions.map((f) => ({
        id: (f as { id?: string }).id,
        startedAt: (f as { startedAt?: string }).startedAt,
        endedAt: (f as { endedAt?: string }).endedAt,
        targetHours: (f as { targetHours?: number }).targetHours,
        status: (f as { status?: string }).status,
        durationHours: (f as { durationHours?: number }).durationHours,
      })),
    ),
  );
  parts.push("");
  parts.push("# nutrition_meals");
  parts.push(
    rowsToCsv(
      ["id", "date", "name", "calories", "protein", "carbs", "fat", "fiber", "sugar", "sodium", "source"],
      bundle.nutritionMeals.map((m) => ({
        id: (m as { id?: string }).id,
        date: (m as { date?: string }).date,
        name: (m as { name?: string }).name,
        calories: (m as { calories?: number }).calories,
        protein: (m as { protein?: number }).protein,
        carbs: (m as { carbs?: number }).carbs,
        fat: (m as { fat?: number }).fat,
        fiber: (m as { fiber?: number }).fiber,
        sugar: (m as { sugar?: number }).sugar,
        sodium: (m as { sodium?: number }).sodium,
        source: (m as { source?: string }).source,
      })),
    ),
  );
  parts.push("");
  parts.push("# weights");
  parts.push(
    rowsToCsv(
      ["id", "weighedAt", "weight", "units", "source"],
      bundle.weights.map((w) => ({
        id: (w as { id?: string }).id,
        weighedAt: (w as { weighedAt?: string }).weighedAt,
        weight: (w as { weight?: number }).weight,
        units: (w as { units?: string }).units,
        source: (w as { source?: string }).source,
      })),
    ),
  );
  parts.push("");
  parts.push("# daily_metrics");
  parts.push(
    rowsToCsv(
      ["id", "date", "steps", "sleepMinutes", "restingHr", "source"],
      bundle.dailyMetrics.map((d) => ({
        id: (d as { id?: string }).id,
        date: (d as { date?: string }).date,
        steps: (d as { steps?: number }).steps,
        sleepMinutes: (d as { sleepMinutes?: number }).sleepMinutes,
        restingHr: (d as { restingHr?: number }).restingHr,
        source: (d as { source?: string }).source,
      })),
    ),
  );
  return parts.join("\n");
}

const importBody = z.object({
  /** Full export JSON object, or omit if zipBase64 provided */
  bundle: z.record(z.unknown()).optional(),
  /** Base64 of forge-export.zip or forge-export.json */
  fileBase64: z.string().optional(),
  filename: z.string().optional(),
});

function parseImportPayload(body: z.infer<typeof importBody>): Record<string, unknown> {
  if (body.bundle && typeof body.bundle === "object") return body.bundle;
  if (!body.fileBase64) throw new Error("Provide bundle or fileBase64");
  const raw = Buffer.from(body.fileBase64, "base64");
  const name = (body.filename ?? "").toLowerCase();
  let text: string;
  if (name.endsWith(".zip") || raw.readUInt32LE(0) === 0x04034b50) {
    const extracted = unzipFirstJson(raw);
    if (!extracted) throw new Error("Could not read JSON from zip (store-only zip supported)");
    text = extracted;
  } else {
    text = raw.toString("utf8");
  }
  const parsed = JSON.parse(text) as Record<string, unknown>;
  if (!parsed || typeof parsed !== "object") throw new Error("Invalid backup file");
  return parsed;
}

async function restoreBundle(userId: string, bundle: Record<string, unknown>) {
  let restored = 0;
  const upsertMany = async (list: unknown, entityType: string) => {
    if (!Array.isArray(list)) return;
    for (const item of list) {
      if (!item || typeof item !== "object") continue;
      const row = item as { id?: string };
      const id = row.id ?? `${entityType}-${crypto.randomUUID()}`;
      await upsertEntity(userId, id, entityType, { ...row, id });
      restored += 1;
    }
  };

  await upsertMany(bundle.workoutSessions, "workout_session");
  await upsertMany(bundle.fastingSessions, "fasting_session");
  await upsertMany(bundle.nutritionMeals, "nutrition_meal");
  await upsertMany(bundle.nutritionPresets, "nutrition_preset");
  await upsertMany(bundle.nutritionRecipes, "nutrition_recipe");
  await upsertMany(bundle.weights, "weight");
  await upsertMany(bundle.progressPhotos, "progress_photo");
  if (Array.isArray(bundle.dailyMetrics)) {
    for (const item of bundle.dailyMetrics) {
      if (!item || typeof item !== "object") continue;
      const row = item as { id?: string; entityType?: string };
      const entityType = row.entityType === "health_daily" ? "health_daily" : "garmin_daily";
      const id = row.id ?? `${entityType}-${crypto.randomUUID()}`;
      await upsertEntity(userId, id, entityType, { ...row, id });
      restored += 1;
    }
  }

  if (bundle.preferences && typeof bundle.preferences === "object") {
    const prefs = bundle.preferences as Record<string, unknown>;
    const { userId: _u, ...rest } = prefs;
    await db.update(preferences).set(rest as never).where(eq(preferences.userId, userId));
  }

  return restored;
}

export async function exportRoutes(app: FastifyInstance) {
  app.get("/export/me", { onRequest: [app.authenticate] }, async (request, reply) => {
    const userId = (request.user as { sub: string }).sub;
    const q = request.query as { format?: string };
    const format = q.format === "csv" ? "csv" : q.format === "zip" ? "zip" : "json";
    const bundle = await buildExportBundle(userId);

    if (format === "json") {
      reply.header("Content-Type", "application/json");
      reply.header("Content-Disposition", 'attachment; filename="forge-export.json"');
      return bundle;
    }

    if (format === "zip") {
      const json = JSON.stringify(bundle, null, 2);
      const zip = zipSingleFile("forge-export.json", json);
      reply.header("Content-Type", "application/zip");
      reply.header("Content-Disposition", 'attachment; filename="forge-export.zip"');
      return reply.send(zip);
    }

    reply.header("Content-Type", "text/csv; charset=utf-8");
    reply.header("Content-Disposition", 'attachment; filename="forge-export.csv"');
    return bundleToCsv(bundle);
  });

  app.post("/import/me", { onRequest: [app.authenticate] }, async (request, reply) => {
    const userId = (request.user as { sub: string }).sub;
    const parsed = importBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid import payload", details: parsed.error.flatten() });
    }
    try {
      const bundle = parseImportPayload(parsed.data);
      const restored = await restoreBundle(userId, bundle);
      return { ok: true, restored };
    } catch (e) {
      return reply.status(400).send({ error: e instanceof Error ? e.message : "Import failed" });
    }
  });
}
