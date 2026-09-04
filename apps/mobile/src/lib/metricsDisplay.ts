/** Shared metric labels / formatting for Home + Metrics screen. */

export type ActivityDaily = {
  steps?: number;
  sleepMinutes?: number;
  calories?: number;
  restingHr?: number;
  maxHr?: number;
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
};

export type LatestWeight = {
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
};

export type HistoryMetric =
  | "steps"
  | "sleep"
  | "weight"
  | "restingHr"
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
  | "vo2Max"
  | "fitnessAge"
  | "readiness"
  | "bodyFat"
  | "muscle"
  | "bmi"
  | "water"
  | "visceralFat"
  | "boneMass"
  | "bmr"
  | "bodyAge"
  | "leanMass"
  | "protein"
  | "scaleHr";

export const HISTORY_TITLES: Record<HistoryMetric, string> = {
  steps: "Steps",
  sleep: "Sleep",
  weight: "Weight",
  restingHr: "Resting HR",
  calories: "Calories burned",
  bodyBattery: "Body battery",
  stress: "Stress",
  maxHr: "Max HR",
  floors: "Floors",
  intensity: "Intensity min",
  hrv: "HRV",
  spo2: "SpO₂",
  respiration: "Respiration",
  hydration: "Hydration",
  vo2Max: "VO₂ max",
  fitnessAge: "Fitness age",
  readiness: "Training readiness",
  bodyFat: "Body fat",
  muscle: "Muscle",
  bmi: "BMI",
  water: "Body water",
  visceralFat: "Visceral fat",
  boneMass: "Bone mass",
  bmr: "BMR",
  bodyAge: "Body age",
  leanMass: "Lean mass",
  protein: "Protein",
  scaleHr: "Scale HR",
};

export type MetricTile = { key: HistoryMetric; label: string; value: string; section: "activity" | "body" };

export function formatSleep(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
}

export function formatHistoryValue(metric: HistoryMetric, n: number, units?: string) {
  if (metric === "sleep") return formatSleep(Math.round(n));
  if (metric === "steps") return Math.round(n).toLocaleString();
  if (metric === "hydration") return `${Math.round(n)} ml`;
  if (metric === "calories" || metric === "bmr") return `${Math.round(n)}`;
  if (units) return `${Math.round(n * 10) / 10} ${units}`.trim();
  return String(Math.round(n * 10) / 10);
}

export function buildMetricTiles(
  activity: ActivityDaily | null,
  weightLabel: string | null,
  latestWeight: LatestWeight | null,
): MetricTile[] {
  return [
    {
      key: "steps",
      label: "Steps",
      section: "activity",
      value: activity?.steps != null ? activity.steps.toLocaleString() : "—",
    },
    {
      key: "sleep",
      label: "Sleep",
      section: "activity",
      value: activity?.sleepMinutes != null ? formatSleep(activity.sleepMinutes) : "—",
    },
    { key: "weight", label: "Weight", section: "body", value: weightLabel ?? "—" },
    {
      key: "restingHr",
      label: "Resting HR",
      section: "activity",
      value: activity?.restingHr != null ? `${activity.restingHr} bpm` : "—",
    },
    {
      key: "calories",
      label: "Burned",
      section: "activity",
      value: activity?.calories != null ? `${Math.round(activity.calories)}` : "—",
    },
    {
      key: "bodyBattery",
      label: "Body battery",
      section: "activity",
      value: activity?.bodyBattery != null ? `${Math.round(activity.bodyBattery)}` : "—",
    },
    {
      key: "stress",
      label: "Stress",
      section: "activity",
      value: activity?.stressAvg != null ? `${Math.round(activity.stressAvg)}` : "—",
    },
    {
      key: "hrv",
      label: "HRV",
      section: "activity",
      value: activity?.hrv != null ? `${Math.round(activity.hrv)} ms` : "—",
    },
    {
      key: "spo2",
      label: "SpO₂",
      section: "activity",
      value: activity?.spo2 != null ? `${Math.round(activity.spo2)}%` : "—",
    },
    {
      key: "vo2Max",
      label: "VO₂ max",
      section: "activity",
      value: activity?.vo2Max != null ? String(Math.round(activity.vo2Max * 10) / 10) : "—",
    },
    {
      key: "readiness",
      label: "Readiness",
      section: "activity",
      value: activity?.trainingReadiness != null ? `${Math.round(activity.trainingReadiness)}` : "—",
    },
    {
      key: "maxHr",
      label: "Max HR",
      section: "activity",
      value: activity?.maxHr != null ? `${activity.maxHr} bpm` : "—",
    },
    {
      key: "floors",
      label: "Floors",
      section: "activity",
      value: activity?.floors != null ? String(Math.round(activity.floors)) : "—",
    },
    {
      key: "intensity",
      label: "Intensity",
      section: "activity",
      value: activity?.intensityMinutes != null ? `${activity.intensityMinutes} min` : "—",
    },
    {
      key: "respiration",
      label: "Breathing",
      section: "activity",
      value: activity?.respiration != null ? String(Math.round(activity.respiration * 10) / 10) : "—",
    },
    {
      key: "hydration",
      label: "Hydration",
      section: "activity",
      value: activity?.hydrationMl != null ? `${Math.round(activity.hydrationMl)} ml` : "—",
    },
    {
      key: "fitnessAge",
      label: "Fitness age",
      section: "activity",
      value: activity?.fitnessAge != null ? String(Math.round(activity.fitnessAge)) : "—",
    },
    {
      key: "bodyFat",
      label: "Body fat",
      section: "body",
      value: latestWeight?.bodyFatPct != null ? `${Math.round(latestWeight.bodyFatPct * 10) / 10}%` : "—",
    },
    {
      key: "muscle",
      label: "Muscle",
      section: "body",
      value:
        latestWeight?.musclePct != null
          ? `${Math.round(latestWeight.musclePct * 10) / 10}%`
          : latestWeight?.muscleMass != null
            ? String(latestWeight.muscleMass)
            : "—",
    },
    {
      key: "bmi",
      label: "BMI",
      section: "body",
      value: latestWeight?.bmi != null ? String(Math.round(latestWeight.bmi * 10) / 10) : "—",
    },
    {
      key: "water",
      label: "Water",
      section: "body",
      value: latestWeight?.waterPct != null ? `${Math.round(latestWeight.waterPct * 10) / 10}%` : "—",
    },
    {
      key: "visceralFat",
      label: "Visceral fat",
      section: "body",
      value: latestWeight?.visceralFat != null ? String(latestWeight.visceralFat) : "—",
    },
    {
      key: "boneMass",
      label: "Bone",
      section: "body",
      value: latestWeight?.boneMass != null ? String(latestWeight.boneMass) : "—",
    },
    {
      key: "bmr",
      label: "BMR",
      section: "body",
      value: latestWeight?.bmr != null ? `${Math.round(latestWeight.bmr)}` : "—",
    },
    {
      key: "bodyAge",
      label: "Body age",
      section: "body",
      value: latestWeight?.bodyAge != null ? String(Math.round(latestWeight.bodyAge)) : "—",
    },
    {
      key: "leanMass",
      label: "Lean mass",
      section: "body",
      value: latestWeight?.leanMass != null ? String(latestWeight.leanMass) : "—",
    },
    {
      key: "protein",
      label: "Protein",
      section: "body",
      value: latestWeight?.proteinPct != null ? `${Math.round(latestWeight.proteinPct * 10) / 10}%` : "—",
    },
    {
      key: "scaleHr",
      label: "Scale HR",
      section: "body",
      value: latestWeight?.heartRate != null ? `${Math.round(latestWeight.heartRate)} bpm` : "—",
    },
  ];
}

/** Home strip — only the daily essentials. */
export const HOME_METRIC_KEYS: HistoryMetric[] = ["steps", "sleep", "weight", "restingHr"];
