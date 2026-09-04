import {
  boolean,
  integer,
  jsonb,
  pgTable,
  text,
  timestamp,
  uuid,
} from "drizzle-orm/pg-core";

export const users = pgTable("users", {
  id: uuid("id").defaultRandom().primaryKey(),
  username: text("username").notNull().unique(),
  passwordHash: text("password_hash").notNull(),
  displayName: text("display_name").notNull(),
  role: text("role").notNull().default("user"),
  inviteCodeUsed: text("invite_code_used"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const inviteCodes = pgTable("invite_codes", {
  code: text("code").primaryKey(),
  createdBy: uuid("created_by").references(() => users.id, { onDelete: "set null" }),
  maxUses: integer("max_uses").notNull().default(1),
  uses: integer("uses").notNull().default(0),
  note: text("note"),
  expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
});

export const devices = pgTable("devices", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  deviceName: text("device_name").notNull(),
  pairedAt: timestamp("paired_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Expo push tokens for authorized devices belonging to a user. */
export const devicePushTokens = pgTable("device_push_tokens", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  expoPushToken: text("expo_push_token").notNull(),
  platform: text("platform").notNull().default("android"),
  deviceName: text("device_name"),
  createdAt: timestamp("created_at", { withTimezone: true }).defaultNow().notNull(),
  lastSeenAt: timestamp("last_seen_at", { withTimezone: true }).defaultNow().notNull(),
  revoked: boolean("revoked").notNull().default(false),
});

/** Active integration / sync alerts (HC, Garmin, Renpho). */
export const integrationAlerts = pgTable("integration_alerts", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  severity: text("severity").notNull().default("warn"),
  message: text("message").notNull(),
  needsReauth: boolean("needs_reauth").notNull().default(false),
  active: boolean("active").notNull().default(true),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

/** Per-user integration credentials / status for background workers. */
export const integrationAccounts = pgTable("integration_accounts", {
  id: uuid("id").defaultRandom().primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  provider: text("provider").notNull(),
  /** Opaque encrypted-ish blob — store email/password or tokens as JSON string */
  credentials: text("credentials"),
  enabled: boolean("enabled").notNull().default(false),
  lastSuccessAt: timestamp("last_success_at", { withTimezone: true }),
  lastError: text("last_error"),
  needsReauth: boolean("needs_reauth").notNull().default(false),
  /** When set, sync-worker should sync this account ASAP (cleared after attempt). */
  forceSyncAt: timestamp("force_sync_at", { withTimezone: true }),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});

export const syncEntities = pgTable("sync_entities", {
  id: text("id").primaryKey(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  entityType: text("entity_type").notNull(),
  payload: jsonb("payload").notNull(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull(),
  deleted: boolean("deleted").default(false).notNull(),
});

export const exercises = pgTable("exercises", {
  id: text("id").primaryKey(),
  name: text("name").notNull(),
  muscleGroup: text("muscle_group").notNull(),
  equipment: text("equipment").notNull().default("bodyweight"),
  location: text("location").notNull().default("gym"),
  isCustom: boolean("is_custom").default(false).notNull(),
  imageStart: text("image_start"),
  imageEnd: text("image_end"),
  instructions: jsonb("instructions").notNull().default([]),
});

/** Default: assume common commercial gym kit until user customizes. */
export const DEFAULT_OWNED_EQUIPMENT = [
  "barbell",
  "dumbbell",
  "cable",
  "chest_press_machine",
  "pec_deck",
  "seated_row_machine",
  "assisted_pullup",
  "shoulder_press_machine",
  "rear_delt_machine",
  "leg_press",
  "hack_squat",
  "leg_extension",
  "leg_curl",
  "calf_machine",
  "bicep_machine",
  "triceps_machine",
  "ab_machine",
  "rower",
  "assault_bike",
  "sled",
  "bodyweight",
  "kettlebell",
  "band",
  "smith",
  "ez_bar",
  "pullup_bar",
  "bench",
];

export const preferences = pgTable("preferences", {
  userId: uuid("user_id")
    .primaryKey()
    .references(() => users.id, { onDelete: "cascade" }),
  gymDaysPerWeek: integer("gym_days_per_week").notNull().default(3),
  gymWeekdays: jsonb("gym_weekdays").notNull().default([1, 3, 5]),
  splitId: text("split_id").notNull().default("ppl_3"),
  splitMode: text("split_mode").notNull().default("auto"),
  scheduleMode: text("schedule_mode").notNull().default("auto"),
  dayKindOverrides: jsonb("day_kind_overrides").notNull().default([null, null, null, null, null, null, null]),
  noGymWeekdays: jsonb("no_gym_weekdays").notNull().default([]),
  gymEnabled: boolean("gym_enabled").notNull().default(true),
  homeWorkoutsEnabled: boolean("home_workouts_enabled").notNull().default(true),
  progressionFocus: text("progression_focus").notNull().default("balanced"),
  units: text("units").notNull().default("lb"),
  restTimerSeconds: integer("rest_timer_seconds").notNull().default(90),
  favoriteExerciseIds: jsonb("favorite_exercise_ids").notNull().default([]),
  dislikedExerciseIds: jsonb("disliked_exercise_ids").notNull().default([]),
  ownedEquipment: jsonb("owned_equipment").notNull().default(DEFAULT_OWNED_EQUIPMENT),
  gymEquipment: jsonb("gym_equipment").notNull().default(DEFAULT_OWNED_EQUIPMENT),
  homeEquipment: jsonb("home_equipment")
    .notNull()
    .default(["bodyweight", "dumbbell", "band", "pullup_bar", "kettlebell"]),
  homeWeights: jsonb("home_weights").notNull().default({
    dumbbell: [10, 15, 20, 25, 30, 35, 40],
    kettlebell: [15, 25, 35],
    barbell: [],
    band: ["light", "medium", "heavy"],
  }),
  gymWeights: jsonb("gym_weights").notNull().default({
    dumbbell: [10, 15, 20, 25, 30, 35, 40, 45, 50, 55, 60],
    kettlebell: [15, 25, 35, 45, 53],
    barbell: [45, 95, 135, 185, 225],
    band: ["light", "medium", "heavy"],
  }),
  gymTargetMinutes: integer("gym_target_minutes").notNull().default(60),
  homeTargetMinutes: integer("home_target_minutes").notNull().default(45),
  homeCircuitMode: boolean("home_circuit_mode").notNull().default(true),
  homeCircuitCoreIds: jsonb("home_circuit_core_ids").notNull().default([]),
  homeCircuitExtraIds: jsonb("home_circuit_extra_ids").notNull().default([]),
  lateNightWorkoutWindow: boolean("late_night_workout_window").notNull().default(false),
  calorieTarget: integer("calorie_target").default(2200),
  proteinTarget: integer("protein_target").default(150),
  carbTarget: integer("carb_target").default(250),
  fatTarget: integer("fat_target").default(70),
  fiberTarget: integer("fiber_target").default(30),
  sugarTarget: integer("sugar_target").default(36),
  sodiumTarget: integer("sodium_target").default(2300),
  /** Height in centimeters for BMI */
  heightCm: integer("height_cm"),
  /** Biological sex for BMR / AI */
  sex: text("sex"),
  /** Current physique tag */
  bodyTypeCurrent: text("body_type_current"),
  /** Goal physique tag */
  bodyTypeGoal: text("body_type_goal"),
  energyUnit: text("energy_unit").notNull().default("kcal"),
  focusMuscleIds: jsonb("focus_muscle_ids").notNull().default([]),
  metricSources: jsonb("metric_sources"),
  defaultFastHours: integer("default_fast_hours").default(16),
  postWorkoutPhotoWeekdays: jsonb("post_workout_photo_weekdays").notNull().default([]),
  /** Feature toggles: fuel, fast, photos, sync, ai* */
  features: jsonb("features").notNull().default({
    gym: true,
    home: true,
    fuel: true,
    fast: true,
    photos: true,
    sync: true,
    aiPlan: true,
    aiEstimate: true,
    autoTargets: true,
    homeAssistant: true,
  }),
  trainingGoal: text("training_goal").notNull().default("recomp"),
  /** off | ha_gate | app_lock | both */
  motivationStakes: text("motivation_stakes").notNull().default("off"),
  stakesBlockedPackages: jsonb("stakes_blocked_packages").notNull().default([]),
  /** Minutes after app lock engages before bounce; 0 = immediate. @deprecated prefer stakesGraceByPackage */
  stakesGraceMinutes: integer("stakes_grace_minutes").notNull().default(0),
  stakesGraceByPackage: jsonb("stakes_grace_by_package").notNull().default({}),
});

/** Singleton row (id = 1) for server-wide admin settings. */
export const appSettings = pgTable("app_settings", {
  id: integer("id").primaryKey().default(1),
  publicBaseUrl: text("public_base_url"),
  haEnabled: boolean("ha_enabled").notNull().default(false),
  haMqttUrl: text("ha_mqtt_url"),
  haMqttUsername: text("ha_mqtt_username"),
  haMqttPassword: text("ha_mqtt_password"),
  haRestUrl: text("ha_rest_url"),
  haRestToken: text("ha_rest_token"),
  aiEnabled: boolean("ai_enabled").notNull().default(false),
  ollamaUrl: text("ollama_url"),
  garminEnabled: boolean("garmin_enabled").notNull().default(false),
  renphoEnabled: boolean("renpho_enabled").notNull().default(false),
  integrationToken: text("integration_token"),
  flowforgeEnabled: boolean("flowforge_enabled").notNull().default(true),
  flowforgeSyncUrl: text("flowforge_sync_url"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).defaultNow().notNull(),
});
