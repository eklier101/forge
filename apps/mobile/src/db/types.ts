export type LocalEntity = {
  id: string;
  entityType: string;
  payload: unknown;
  updatedAt: string;
  deleted?: boolean;
};

export type DayKind = "gym" | "home" | "rest";

/** Available loads for gear that uses discrete weights. */
export type WeightInventory = {
  dumbbell: number[];
  kettlebell: number[];
  barbell: number[];
  band: string[];
};

export const EMPTY_WEIGHT_INVENTORY: WeightInventory = {
  dumbbell: [],
  kettlebell: [],
  barbell: [],
  band: [],
};

export const DEFAULT_HOME_WEIGHTS: WeightInventory = {
  dumbbell: [10, 15, 20, 25, 30, 35, 40],
  kettlebell: [15, 25, 35],
  barbell: [],
  band: ["light", "medium", "heavy"],
};

export const DEFAULT_GYM_WEIGHTS: WeightInventory = {
  dumbbell: [10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60],
  kettlebell: [15, 25, 35, 45, 53],
  barbell: [45, 95, 135, 185, 225],
  band: ["light", "medium", "heavy"],
};

export const DUMBBELL_WEIGHTS_LB = [5, 8, 10, 12, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60, 70, 80];
export const DUMBBELL_WEIGHTS_KG = [2, 4, 5, 6, 8, 10, 12, 14, 16, 20, 24, 28, 32];
export const KETTLEBELL_WEIGHTS_LB = [10, 15, 20, 25, 30, 35, 40, 45, 50, 53, 70];
export const KETTLEBELL_WEIGHTS_KG = [4, 6, 8, 12, 16, 20, 24, 28, 32];
export const BAND_LEVELS = ["light", "medium", "heavy", "xheavy"];

export type FeatureFlags = {
  gym?: boolean;
  home?: boolean;
  fuel?: boolean;
  fast?: boolean;
  photos?: boolean;
  sync?: boolean;
  aiPlan?: boolean;
  aiEstimate?: boolean;
  autoTargets?: boolean;
  homeAssistant?: boolean;
};

export type Preferences = {
  gymDaysPerWeek: number;
  gymWeekdays: number[];
  splitId: string;
  splitMode: "auto" | "manual";
  scheduleMode: "auto" | "manual";
  dayKindOverrides: (DayKind | null)[];
  /** When false, no gym sessions are planned */
  gymEnabled: boolean;
  homeWorkoutsEnabled: boolean;
  progressionFocus: string;
  units: string;
  restTimerSeconds: number;
  favoriteExerciseIds: string[];
  dislikedExerciseIds: string[];
  /** @deprecated use gymEquipment — kept for older clients */
  ownedEquipment: string[];
  gymEquipment: string[];
  homeEquipment: string[];
  homeWeights: WeightInventory;
  gymWeights: WeightInventory;
  gymTargetMinutes?: number;
  homeTargetMinutes?: number;
  homeCircuitMode?: boolean;
  homeCircuitCoreIds?: string[];
  homeCircuitExtraIds?: string[];
  lateNightWorkoutWindow?: boolean;
  calorieTarget?: number;
  proteinTarget?: number;
  carbTarget?: number;
  fatTarget?: number;
  fiberTarget?: number;
  sugarTarget?: number;
  sodiumTarget?: number;
  heightCm?: number;
  sex?: string;
  bodyTypeCurrent?: string;
  bodyTypeGoal?: string;
  energyUnit?: string;
  focusMuscleIds?: string[];
  metricSources?: Record<string, string>;
  defaultFastHours?: number;
  postWorkoutPhotoWeekdays?: number[];
  features?: FeatureFlags;
  trainingGoal?: string;
  /** off | ha_gate | app_lock | both */
  motivationStakes?: string;
  stakesBlockedPackages?: string[];
  stakesGraceMinutes?: number;
  stakesGraceByPackage?: Record<string, number | string>;
};

const IMG = "https://raw.githubusercontent.com/yuhonas/free-exercise-db/main/exercises";

export type EquipmentOption = {
  id: string;
  label: string;
  /** Photo showing the gear / typical use */
  image: string;
  scopes: ("gym" | "home")[];
};

export const EQUIPMENT_OPTIONS: EquipmentOption[] = [
  {
    id: "barbell",
    label: "Barbell",
    image: `${IMG}/Barbell_Bench_Press_-_Medium_Grip/0.jpg`,
    scopes: ["gym"],
  },
  {
    id: "dumbbell",
    label: "Dumbbells",
    image: `${IMG}/Dumbbell_Bench_Press/0.jpg`,
    scopes: ["gym", "home"],
  },
  {
    id: "cable",
    label: "Cable stack",
    image: `${IMG}/Cable_Crossover/0.jpg`,
    scopes: ["gym"],
  },
  {
    id: "machine",
    label: "Machines",
    image: `${IMG}/Leverage_Chest_Press/0.jpg`,
    scopes: ["gym"],
  },
  {
    id: "smith",
    label: "Smith machine",
    image: `${IMG}/Smith_Machine_Bench_Press/0.jpg`,
    scopes: ["gym"],
  },
  {
    id: "ez_bar",
    label: "EZ bar",
    image: `${IMG}/EZ-Bar_Curl/0.jpg`,
    scopes: ["gym"],
  },
  {
    id: "kettlebell",
    label: "Kettlebells",
    image: `${IMG}/Kettlebell_Swing/0.jpg`,
    scopes: ["gym", "home"],
  },
  {
    id: "band",
    label: "Resistance bands",
    image: `${IMG}/Band_Pull_Apart/0.jpg`,
    scopes: ["gym", "home"],
  },
  {
    id: "pullup_bar",
    label: "Pull-up bar",
    image: `${IMG}/Pullups/0.jpg`,
    scopes: ["gym", "home"],
  },
  {
    id: "bench",
    label: "Bench",
    image: `${IMG}/Dumbbell_Bench_Press/1.jpg`,
    scopes: ["gym", "home"],
  },
  {
    id: "bodyweight",
    label: "Bodyweight",
    image: `${IMG}/Pushups/0.jpg`,
    scopes: ["gym", "home"],
  },
];

export const DEFAULT_GYM_EQUIPMENT = EQUIPMENT_OPTIONS.filter((e) => e.scopes.includes("gym")).map((e) => e.id);
export const DEFAULT_HOME_EQUIPMENT = ["bodyweight", "dumbbell", "band", "pullup_bar", "kettlebell"];

/** @deprecated */
export const DEFAULT_OWNED_EQUIPMENT = DEFAULT_GYM_EQUIPMENT;
/** @deprecated alias */
export const EQUIPMENT_OPTIONS_LEGACY = EQUIPMENT_OPTIONS;

export type SyncQueueItem = {
  id: string;
  entityType: string;
  payload: unknown;
  updatedAt: string;
  deleted: boolean;
};

/** Spread gym days evenly across the week from a day-count. */
export function defaultWeekdaysForCount(n: number): number[] {
  const map: Record<number, number[]> = {
    1: [3],
    2: [2, 5],
    3: [1, 3, 5],
    4: [1, 2, 4, 5],
    5: [1, 2, 3, 4, 5],
    6: [1, 2, 3, 4, 5, 6],
    7: [0, 1, 2, 3, 4, 5, 6],
  };
  return map[Math.min(7, Math.max(1, n))] ?? [1, 3, 5];
}

export const DEFAULT_PREFERENCES: Preferences = {
  gymDaysPerWeek: 3,
  gymWeekdays: [1, 3, 5],
  splitId: "ppl_3",
  splitMode: "auto",
  scheduleMode: "auto",
  dayKindOverrides: [null, null, null, null, null, null, null],
  gymEnabled: true,
  homeWorkoutsEnabled: true,
  progressionFocus: "balanced",
  units: "lb",
  restTimerSeconds: 90,
  favoriteExerciseIds: [],
  dislikedExerciseIds: [],
  ownedEquipment: [...DEFAULT_GYM_EQUIPMENT],
  gymEquipment: [...DEFAULT_GYM_EQUIPMENT],
  homeEquipment: [...DEFAULT_HOME_EQUIPMENT],
  homeWeights: {
    ...DEFAULT_HOME_WEIGHTS,
    dumbbell: [...DEFAULT_HOME_WEIGHTS.dumbbell],
    kettlebell: [...DEFAULT_HOME_WEIGHTS.kettlebell],
    band: [...DEFAULT_HOME_WEIGHTS.band],
  },
  gymWeights: {
    ...DEFAULT_GYM_WEIGHTS,
    dumbbell: [...DEFAULT_GYM_WEIGHTS.dumbbell],
    kettlebell: [...DEFAULT_GYM_WEIGHTS.kettlebell],
    barbell: [...DEFAULT_GYM_WEIGHTS.barbell],
    band: [...DEFAULT_GYM_WEIGHTS.band],
  },
  gymTargetMinutes: 60,
  homeTargetMinutes: 45,
  homeCircuitMode: true,
  homeCircuitCoreIds: [],
  homeCircuitExtraIds: [],
  lateNightWorkoutWindow: false,
  defaultFastHours: 16,
  postWorkoutPhotoWeekdays: [],
  features: {
    gym: true,
    home: true,
    fuel: true,
    fast: true,
    photos: true,
    sync: true,
    aiPlan: true,
    aiEstimate: true,
    autoTargets: true,
    homeAssistant: false,
  },
  trainingGoal: "recomp",
  motivationStakes: "off",
  stakesBlockedPackages: [],
  stakesGraceMinutes: 0,
  stakesGraceByPackage: {},
  energyUnit: "kcal",
  focusMuscleIds: [],
};

export const WEEKDAY_LABELS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

function normalizeWeights(raw: unknown, fallback: WeightInventory): WeightInventory {
  if (!raw || typeof raw !== "object") {
    return {
      ...fallback,
      dumbbell: [...fallback.dumbbell],
      kettlebell: [...fallback.kettlebell],
      barbell: [...fallback.barbell],
      band: [...fallback.band],
    };
  }
  const o = raw as Record<string, unknown>;
  return {
    dumbbell: Array.isArray(o.dumbbell)
      ? (o.dumbbell as number[]).filter((n) => typeof n === "number")
      : [...fallback.dumbbell],
    kettlebell: Array.isArray(o.kettlebell)
      ? (o.kettlebell as number[]).filter((n) => typeof n === "number")
      : [...fallback.kettlebell],
    barbell: Array.isArray(o.barbell)
      ? (o.barbell as number[]).filter((n) => typeof n === "number")
      : [...fallback.barbell],
    band: Array.isArray(o.band)
      ? (o.band as string[]).filter((s) => typeof s === "string")
      : [...fallback.band],
  };
}

function normalizeFeatures(raw: unknown): FeatureFlags {
  const base = DEFAULT_PREFERENCES.features ?? {};
  if (!raw || typeof raw !== "object") return { ...base };
  const o = raw as Record<string, unknown>;
  return {
    gym: o.gym !== false,
    home: o.home !== false,
    fuel: o.fuel !== false,
    fast: o.fast !== false,
    photos: o.photos !== false,
    sync: o.sync !== false,
    aiPlan: o.aiPlan !== false,
    aiEstimate: o.aiEstimate !== false,
    autoTargets: o.autoTargets !== false,
    homeAssistant: o.homeAssistant === true,
  };
}

export function normalizePreferences(raw: Partial<Preferences> & Record<string, unknown>): Preferences {
  const base = { ...DEFAULT_PREFERENCES };
  const gymEquipment =
    (Array.isArray(raw.gymEquipment) && raw.gymEquipment.length
      ? (raw.gymEquipment as string[])
      : Array.isArray(raw.ownedEquipment) && raw.ownedEquipment.length
        ? (raw.ownedEquipment as string[])
        : base.gymEquipment) ?? base.gymEquipment;
  const homeEquipment =
    (Array.isArray(raw.homeEquipment) && raw.homeEquipment.length
      ? (raw.homeEquipment as string[])
      : base.homeEquipment) ?? base.homeEquipment;

  const gymDaysPerWeek = Math.min(7, Math.max(1, Number(raw.gymDaysPerWeek ?? base.gymDaysPerWeek) || 3));
  let gymWeekdays = Array.isArray(raw.gymWeekdays) ? (raw.gymWeekdays as number[]) : base.gymWeekdays;
  if (!gymWeekdays.length) gymWeekdays = defaultWeekdaysForCount(gymDaysPerWeek);

  return {
    ...base,
    ...raw,
    gymDaysPerWeek,
    gymWeekdays,
    splitId: String(raw.splitId ?? base.splitId),
    splitMode: raw.splitMode === "manual" ? "manual" : "auto",
    scheduleMode: raw.scheduleMode === "manual" ? "manual" : "auto",
    dayKindOverrides:
      Array.isArray(raw.dayKindOverrides) && raw.dayKindOverrides.length === 7
        ? (raw.dayKindOverrides as Preferences["dayKindOverrides"])
        : base.dayKindOverrides,
    gymEnabled: raw.gymEnabled !== false,
    homeWorkoutsEnabled: raw.homeWorkoutsEnabled !== false,
    progressionFocus: String(raw.progressionFocus ?? base.progressionFocus),
    units: String(raw.units ?? base.units),
    restTimerSeconds: Number(raw.restTimerSeconds ?? base.restTimerSeconds) || 90,
    favoriteExerciseIds: Array.isArray(raw.favoriteExerciseIds)
      ? (raw.favoriteExerciseIds as string[])
      : [],
    dislikedExerciseIds: Array.isArray(raw.dislikedExerciseIds)
      ? (raw.dislikedExerciseIds as string[])
      : [],
    gymEquipment,
    homeEquipment,
    ownedEquipment: gymEquipment,
    homeWeights: normalizeWeights(raw.homeWeights, DEFAULT_HOME_WEIGHTS),
    gymWeights: normalizeWeights(raw.gymWeights, DEFAULT_GYM_WEIGHTS),
    gymTargetMinutes: Number(raw.gymTargetMinutes ?? base.gymTargetMinutes) || 60,
    homeTargetMinutes: Number(raw.homeTargetMinutes ?? base.homeTargetMinutes) || 45,
    homeCircuitMode: raw.homeCircuitMode !== false,
    homeCircuitCoreIds: Array.isArray(raw.homeCircuitCoreIds) ? (raw.homeCircuitCoreIds as string[]) : [],
    homeCircuitExtraIds: Array.isArray(raw.homeCircuitExtraIds) ? (raw.homeCircuitExtraIds as string[]) : [],
    lateNightWorkoutWindow: raw.lateNightWorkoutWindow === true,
    calorieTarget: raw.calorieTarget != null ? Number(raw.calorieTarget) : base.calorieTarget,
    proteinTarget: raw.proteinTarget != null ? Number(raw.proteinTarget) : base.proteinTarget,
    carbTarget: raw.carbTarget != null ? Number(raw.carbTarget) : base.carbTarget,
    fatTarget: raw.fatTarget != null ? Number(raw.fatTarget) : base.fatTarget,
    fiberTarget: raw.fiberTarget != null ? Number(raw.fiberTarget) : base.fiberTarget,
    sugarTarget: raw.sugarTarget != null ? Number(raw.sugarTarget) : base.sugarTarget,
    sodiumTarget: raw.sodiumTarget != null ? Number(raw.sodiumTarget) : base.sodiumTarget,
    heightCm: raw.heightCm != null ? Number(raw.heightCm) : base.heightCm,
    sex: raw.sex === "male" || raw.sex === "female" ? raw.sex : base.sex,
    bodyTypeCurrent: raw.bodyTypeCurrent != null ? String(raw.bodyTypeCurrent) : base.bodyTypeCurrent,
    bodyTypeGoal: raw.bodyTypeGoal != null ? String(raw.bodyTypeGoal) : base.bodyTypeGoal,
    energyUnit: String(raw.energyUnit ?? base.energyUnit ?? "kcal"),
    focusMuscleIds: Array.isArray(raw.focusMuscleIds) ? (raw.focusMuscleIds as string[]) : [],
    metricSources:
      raw.metricSources && typeof raw.metricSources === "object"
        ? (raw.metricSources as Record<string, string>)
        : base.metricSources,
    defaultFastHours: Number(raw.defaultFastHours ?? base.defaultFastHours) || 16,
    postWorkoutPhotoWeekdays: Array.isArray(raw.postWorkoutPhotoWeekdays)
      ? (raw.postWorkoutPhotoWeekdays as number[])
      : [],
    features: normalizeFeatures(raw.features),
    trainingGoal: (() => {
      const g = String(raw.trainingGoal ?? base.trainingGoal ?? "recomp");
      return ["recomp", "cut", "bulk", "shred", "maintain"].includes(g) ? g : "recomp";
    })(),
    motivationStakes: typeof raw.motivationStakes === "string" ? raw.motivationStakes : "off",
    stakesBlockedPackages: Array.isArray(raw.stakesBlockedPackages)
      ? (raw.stakesBlockedPackages as string[])
      : [],
    stakesGraceMinutes: Number(raw.stakesGraceMinutes ?? 0) || 0,
    stakesGraceByPackage:
      raw.stakesGraceByPackage && typeof raw.stakesGraceByPackage === "object"
        ? (raw.stakesGraceByPackage as Record<string, number | string>)
        : {},
  };
}
