import { and, eq, inArray } from "drizzle-orm";
import { db } from "../db/client.js";
import { preferences, syncEntities } from "../db/schema.js";

export type MetricSources = {
  steps?: string;
  sleep?: string;
  weight?: string;
  hr?: string;
  workouts?: string;
  bodyFat?: string;
  muscle?: string;
  bmi?: string;
  calories?: string;
  bodyBattery?: string;
  stress?: string;
};

export type DailyPayload = {
  date?: string;
  steps?: number;
  sleepMinutes?: number;
  restingHr?: number;
  maxHr?: number;
  calories?: number;
  bodyBattery?: number;
  stressAvg?: number;
  floors?: number;
  intensityMinutes?: number;
  hrv?: number;
  spo2?: number;
  respiration?: number;
  hydrationMl?: number;
  vo2Max?: number;
  fitnessAge?: number;
  trainingReadiness?: number;
  source?: string;
  [k: string]: unknown;
};

const DEFAULT_SOURCES: Required<
  Pick<MetricSources, "steps" | "sleep" | "weight" | "hr" | "bodyFat" | "muscle" | "bmi" | "calories">
> = {
  steps: "health_connect",
  sleep: "health_connect",
  weight: "health_connect",
  hr: "health_connect",
  bodyFat: "renpho",
  muscle: "renpho",
  bmi: "renpho",
  calories: "health_connect",
};

export function healthDailyId(date: string) {
  return `health-${date}`;
}

export function garminDailyId(date: string) {
  return `garmin-${date}`;
}

export async function loadMetricSources(userId: string): Promise<MetricSources> {
  const [prefs] = await db.select().from(preferences).where(eq(preferences.userId, userId));
  const raw = (prefs?.metricSources ?? {}) as MetricSources;
  return { ...DEFAULT_SOURCES, ...raw };
}

async function loadDailyRows(userId: string, date: string) {
  const ids = [healthDailyId(date), garminDailyId(date)];
  const rows = await db
    .select()
    .from(syncEntities)
    .where(and(eq(syncEntities.userId, userId), inArray(syncEntities.id, ids)));
  const byId = new Map(rows.filter((r) => !r.deleted).map((r) => [r.id, r.payload as DailyPayload]));
  return {
    health: byId.get(healthDailyId(date)) ?? null,
    garmin: byId.get(garminDailyId(date)) ?? null,
    legacy: byId.get(garminDailyId(date)) ?? null,
  };
}

type DailyField =
  | "steps"
  | "sleep"
  | "hr"
  | "calories"
  | "bodyBattery"
  | "stress"
  | "maxHr"
  | "floors"
  | "intensity"
  | "hrv"
  | "spo2"
  | "respiration"
  | "hydration"
  | "vo2"
  | "fitnessAge"
  | "readiness";

function preferredSourceFor(sources: MetricSources, field: DailyField): string {
  switch (field) {
    case "steps":
      return sources.steps ?? "health_connect";
    case "sleep":
      return sources.sleep ?? "health_connect";
    case "hr":
      return sources.hr ?? "health_connect";
    case "calories":
      return sources.calories ?? "health_connect";
    case "bodyBattery":
      return sources.bodyBattery ?? "garmin";
    case "stress":
      return sources.stress ?? "garmin";
    default:
      // Garmin-first extras (HRV, SpO2, etc.)
      return sources.bodyBattery ?? "garmin";
  }
}

function pickDaily(
  sources: MetricSources,
  field: DailyField,
  health: DailyPayload | null,
  garmin: DailyPayload | null,
): DailyPayload | null {
  const pref = preferredSourceFor(sources, field);

  if (pref === "garmin") return garmin;
  if (pref === "health_connect") {
    if (health) return health;
    if (garmin?.source === "health_connect" || garmin?.source === "health") return garmin;
    return health ?? null;
  }
  if (pref === "forge") return health ?? garmin;
  // Prefer garmin for extras when preference is ambiguous, else any
  return garmin ?? health;
}

function convertWeightValue(weight: number, from: "lb" | "kg", to: "lb" | "kg") {
  if (from === to) return weight;
  return from === "kg" ? weight * 2.20462 : weight / 2.20462;
}

/** Merge per-field from preferred sources into one activity object for the client. */
export async function resolveTodayActivity(userId: string, date: string) {
  const sources = await loadMetricSources(userId);
  const { health, garmin } = await loadDailyRows(userId, date);

  const stepsSrc = pickDaily(sources, "steps", health, garmin);
  const sleepSrc = pickDaily(sources, "sleep", health, garmin);
  const hrSrc = pickDaily(sources, "hr", health, garmin);
  const calSrc = pickDaily(sources, "calories", health, garmin);
  const bbSrc = pickDaily(sources, "bodyBattery", health, garmin);
  const stressSrc = pickDaily(sources, "stress", health, garmin);
  const maxHrSrc = pickDaily(sources, "maxHr", health, garmin);
  const floorsSrc = pickDaily(sources, "floors", health, garmin);
  const intensitySrc = pickDaily(sources, "intensity", health, garmin);
  const hrvSrc = pickDaily(sources, "hrv", health, garmin);
  const spo2Src = pickDaily(sources, "spo2", health, garmin);
  const respSrc = pickDaily(sources, "respiration", health, garmin);
  const hydSrc = pickDaily(sources, "hydration", health, garmin);
  const vo2Src = pickDaily(sources, "vo2", health, garmin);
  const fitSrc = pickDaily(sources, "fitnessAge", health, garmin);
  const readySrc = pickDaily(sources, "readiness", health, garmin);

  const activity: DailyPayload = {
    date,
    source: sources.steps ?? "health_connect",
  };
  if (stepsSrc?.steps != null) activity.steps = stepsSrc.steps;
  if (sleepSrc?.sleepMinutes != null) activity.sleepMinutes = sleepSrc.sleepMinutes;
  if (hrSrc?.restingHr != null) activity.restingHr = hrSrc.restingHr;
  if (maxHrSrc?.maxHr != null) activity.maxHr = maxHrSrc.maxHr;
  if (calSrc?.calories != null) activity.calories = calSrc.calories;
  if (bbSrc?.bodyBattery != null) activity.bodyBattery = bbSrc.bodyBattery;
  if (stressSrc?.stressAvg != null) activity.stressAvg = stressSrc.stressAvg;
  if (floorsSrc?.floors != null) activity.floors = floorsSrc.floors;
  if (intensitySrc?.intensityMinutes != null) activity.intensityMinutes = intensitySrc.intensityMinutes;
  if (hrvSrc?.hrv != null) activity.hrv = hrvSrc.hrv;
  if (spo2Src?.spo2 != null) activity.spo2 = spo2Src.spo2;
  if (respSrc?.respiration != null) activity.respiration = respSrc.respiration;
  if (hydSrc?.hydrationMl != null) activity.hydrationMl = hydSrc.hydrationMl;
  if (vo2Src?.vo2Max != null) activity.vo2Max = vo2Src.vo2Max;
  if (fitSrc?.fitnessAge != null) activity.fitnessAge = fitSrc.fitnessAge;
  if (readySrc?.trainingReadiness != null) activity.trainingReadiness = readySrc.trainingReadiness;

  const hasAny =
    activity.steps != null ||
    activity.sleepMinutes != null ||
    activity.restingHr != null ||
    activity.calories != null ||
    activity.bodyBattery != null ||
    activity.stressAvg != null ||
    activity.maxHr != null ||
    activity.hrv != null ||
    activity.spo2 != null ||
    activity.vo2Max != null ||
    activity.floors != null ||
    activity.trainingReadiness != null;

  return {
    date,
    activity: hasAny ? activity : null,
    garmin: hasAny ? activity : null,
    sources: {
      health,
      garminRaw: garmin?.source === "garmin" ? garmin : null,
    },
    metricSources: sources,
  };
}

type WeightRow = {
  weighedAt?: string;
  weight?: number;
  units?: string;
  source?: string;
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
  [k: string]: unknown;
};

export async function resolveLatestWeight(userId: string) {
  const sources = await loadMetricSources(userId);
  const [prefs] = await db.select().from(preferences).where(eq(preferences.userId, userId));
  const preferredUnits: "lb" | "kg" = prefs?.units === "kg" ? "kg" : "lb";

  const weightRows = await db
    .select()
    .from(syncEntities)
    .where(and(eq(syncEntities.userId, userId), eq(syncEntities.entityType, "weight")));
  const weights = weightRows
    .filter((r) => !r.deleted)
    .map((r) => r.payload as WeightRow)
    .filter((w) => w.weighedAt)
    .sort((a, b) => String(b.weighedAt).localeCompare(String(a.weighedAt)));

  const pref = sources.weight ?? "health_connect";
  let hit: WeightRow | null = null;
  if (pref === "renpho") hit = weights.find((w) => w.source === "renpho") ?? weights[0] ?? null;
  else if (pref === "garmin") hit = weights.find((w) => w.source === "garmin") ?? weights[0] ?? null;
  else if (pref === "health_connect")
    hit = weights.find((w) => w.source === "health_connect" || w.source === "health") ?? weights[0] ?? null;
  else hit = weights[0] ?? null;

  if (!hit || hit.weight == null) return hit;

  const storedUnits: "lb" | "kg" = hit.units === "kg" ? "kg" : "lb";
  const displayWeight = convertWeightValue(Number(hit.weight), storedUnits, preferredUnits);
  const massFields = ["muscleMass", "boneMass", "leanMass", "fatFreeWeight"] as const;
  const converted: WeightRow = {
    ...hit,
    weight: Math.round(displayWeight * 10) / 10,
    units: preferredUnits,
    storedUnits,
  };
  if (storedUnits === "kg" && preferredUnits === "lb") {
    for (const key of massFields) {
      const v = hit[key];
      if (typeof v === "number") converted[key] = Math.round(v * 2.20462 * 10) / 10;
    }
  } else if (storedUnits === "lb" && preferredUnits === "kg") {
    for (const key of massFields) {
      const v = hit[key];
      if (typeof v === "number") converted[key] = Math.round((v / 2.20462) * 10) / 10;
    }
  }
  return converted;
}
