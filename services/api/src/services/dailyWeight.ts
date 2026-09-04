import { and, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { syncEntities } from "../db/schema.js";

export type WeightPayload = {
  weighedAt: string;
  weight: number;
  units: "lb" | "kg";
  source?: string;
  /** Minutes to add to UTC for the weigher's local time (e.g. -240 for EDT). */
  tzOffsetMinutes?: number;
  bodyFatPct?: number;
  muscleMass?: number;
  musclePct?: number;
  boneMass?: number;
  waterPct?: number;
  bmi?: number;
  visceralFat?: number;
  subcutaneousFatPct?: number;
  proteinPct?: number;
  bodyAge?: number;
  bmr?: number;
  leanMass?: number;
  fatFreeWeight?: number;
  heartRate?: number;
  cardiacIndex?: number;
  bodyShape?: string | number;
  deviceId?: string;
};

const EXPLICIT_OFFSET = /(?:[+-]\d{2}:?\d{2})$/;

function dayInTimeZone(ms: number, timeZone: string): string | null {
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone,
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(ms));
  } catch {
    return null;
  }
}

/**
 * Calendar day of a weigh-in in the weigher's local time. An ISO string carrying an
 * explicit offset already reads as local wall-clock; a UTC stamp is shifted using the
 * client-supplied offset, else the server's configured zone. Falling back to a raw UTC
 * slice would push evening weigh-ins in western zones onto the next day.
 */
export function weightDay(weighedAtIso: string, tzOffsetMinutes?: number): string {
  const iso = String(weighedAtIso ?? "").trim();
  if (!iso) return new Date().toISOString().slice(0, 10);
  if (EXPLICIT_OFFSET.test(iso)) return iso.slice(0, 10);

  const ms = new Date(iso).getTime();
  if (!Number.isFinite(ms)) return iso.slice(0, 10);

  if (typeof tzOffsetMinutes === "number" && Number.isFinite(tzOffsetMinutes)) {
    return new Date(ms + tzOffsetMinutes * 60_000).toISOString().slice(0, 10);
  }
  const tz = process.env.FORGE_TIMEZONE;
  if (tz) {
    const day = dayInTimeZone(ms, tz);
    if (day) return day;
  }
  const envOffset = Number(process.env.FORGE_TZ_OFFSET_MINUTES);
  if (Number.isFinite(envOffset)) {
    return new Date(ms + envOffset * 60_000).toISOString().slice(0, 10);
  }
  return iso.slice(0, 10);
}

export function normalizeWeightSource(source?: string): string {
  const s = String(source ?? "manual")
    .trim()
    .toLowerCase();
  if (s === "health" || s === "health_connect") return "health_connect";
  const cleaned = s.replace(/[^a-z0-9_-]/g, "");
  return cleaned || "manual";
}

/** One weight row per user per local day *per source* — sources must not overwrite each other. */
export function weightDayId(
  userId: string,
  weighedAtIso: string,
  source?: string,
  tzOffsetMinutes?: number,
): string {
  const day = weightDay(weighedAtIso, tzOffsetMinutes);
  return `weight-${userId}-${day}-${normalizeWeightSource(source)}`;
}

/** Pre-0.2.51 rows collapsed every source into a single per-day id. */
function legacyWeightDayId(userId: string, day: string): string {
  return `weight-${userId}-${day}`;
}

export async function upsertDailyWeight(userId: string, payload: WeightPayload) {
  const source = normalizeWeightSource(payload.source);
  const day = weightDay(payload.weighedAt, payload.tzOffsetMinutes);
  const id = weightDayId(userId, payload.weighedAt, payload.source, payload.tzOffsetMinutes);
  const now = new Date();
  const stored: WeightPayload = { ...payload, source };

  const [existing] = await db
    .select()
    .from(syncEntities)
    .where(and(eq(syncEntities.userId, userId), eq(syncEntities.id, id)));

  if (existing) {
    await db
      .update(syncEntities)
      .set({ payload: stored, updatedAt: now, deleted: false, entityType: "weight" })
      .where(eq(syncEntities.id, id));
  } else {
    await db.insert(syncEntities).values({
      id,
      userId,
      entityType: "weight",
      payload: stored,
      updatedAt: now,
      deleted: false,
    });
  }

  // Retire the legacy shared row only when it holds this same source, so another
  // scale's reading for the day survives until that source posts again.
  const legacyId = legacyWeightDayId(userId, day);
  const [legacy] = await db
    .select()
    .from(syncEntities)
    .where(and(eq(syncEntities.userId, userId), eq(syncEntities.id, legacyId)));
  if (legacy && !legacy.deleted) {
    const p = legacy.payload as { source?: string };
    if (normalizeWeightSource(p.source) === source) {
      await db
        .update(syncEntities)
        .set({ deleted: true, updatedAt: now })
        .where(eq(syncEntities.id, legacyId));
    }
  }

  return { id, payload: stored };
}
