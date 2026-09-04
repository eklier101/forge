import * as SQLite from "expo-sqlite";
import {
  DEFAULT_PREFERENCES,
  normalizePreferences,
  type LocalEntity,
  type Preferences,
  type SyncQueueItem,
} from "./types";

export type { LocalEntity, Preferences, SyncQueueItem } from "./types";

let dbPromise: Promise<SQLite.SQLiteDatabase> | null = null;

export async function initLocalStore() {
  await getDb();
}

function getDb() {
  if (!dbPromise) {
    dbPromise = (async () => {
      const db = await SQLite.openDatabaseAsync("forge.db");
      await db.execAsync(`
        PRAGMA journal_mode = WAL;
        CREATE TABLE IF NOT EXISTS meta (
          key TEXT PRIMARY KEY NOT NULL,
          value TEXT NOT NULL
        );
        CREATE TABLE IF NOT EXISTS sync_queue (
          id TEXT PRIMARY KEY NOT NULL,
          entity_type TEXT NOT NULL,
          payload TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          deleted INTEGER NOT NULL DEFAULT 0,
          synced INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS local_entities (
          id TEXT PRIMARY KEY NOT NULL,
          entity_type TEXT NOT NULL,
          payload TEXT NOT NULL,
          updated_at TEXT NOT NULL,
          deleted INTEGER NOT NULL DEFAULT 0
        );
        CREATE TABLE IF NOT EXISTS preferences (
          id INTEGER PRIMARY KEY CHECK (id = 1),
          gym_days_per_week INTEGER NOT NULL DEFAULT 3,
          gym_weekdays TEXT NOT NULL DEFAULT '[1,3,5]',
          split_id TEXT NOT NULL DEFAULT 'full_body_3',
          home_workouts_enabled INTEGER NOT NULL DEFAULT 1,
          progression_focus TEXT NOT NULL DEFAULT 'balanced',
          units TEXT NOT NULL DEFAULT 'lb',
          rest_timer_seconds INTEGER NOT NULL DEFAULT 90,
          favorite_exercise_ids TEXT NOT NULL DEFAULT '[]',
          disliked_exercise_ids TEXT NOT NULL DEFAULT '[]',
          owned_equipment TEXT NOT NULL DEFAULT '["barbell","dumbbell","cable","machine","bodyweight","kettlebell","band","smith","ez_bar","pullup_bar","bench"]'
        );
        INSERT OR IGNORE INTO preferences (id) VALUES (1);
      `);
      try {
        await db.execAsync(`ALTER TABLE preferences ADD COLUMN owned_equipment TEXT`);
      } catch {
        /* column already exists */
      }
      for (const col of [
        `ALTER TABLE preferences ADD COLUMN split_mode TEXT NOT NULL DEFAULT 'auto'`,
        `ALTER TABLE preferences ADD COLUMN schedule_mode TEXT NOT NULL DEFAULT 'auto'`,
        `ALTER TABLE preferences ADD COLUMN day_kind_overrides TEXT NOT NULL DEFAULT '[null,null,null,null,null,null,null]'`,
        `ALTER TABLE preferences ADD COLUMN default_fast_hours INTEGER DEFAULT 16`,
        `ALTER TABLE preferences ADD COLUMN no_gym_weekdays TEXT NOT NULL DEFAULT '[]'`,
        `ALTER TABLE preferences ADD COLUMN gym_enabled INTEGER NOT NULL DEFAULT 1`,
        `ALTER TABLE preferences ADD COLUMN gym_equipment TEXT`,
        `ALTER TABLE preferences ADD COLUMN home_equipment TEXT`,
      ]) {
        try {
          await db.execAsync(col);
        } catch {
          /* exists */
        }
      }
      return db;
    })();
  }
  return dbPromise;
}

async function writeEntity(entity: LocalEntity, queueForSync: boolean) {
  const db = await getDb();
  const payload = JSON.stringify(entity.payload);
  await db.runAsync(
    `INSERT INTO local_entities (id, entity_type, payload, updated_at, deleted)
     VALUES (?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       entity_type=excluded.entity_type,
       payload=excluded.payload,
       updated_at=excluded.updated_at,
       deleted=excluded.deleted`,
    entity.id,
    entity.entityType,
    payload,
    entity.updatedAt,
    entity.deleted ? 1 : 0,
  );
  await db.runAsync(
    `INSERT INTO sync_queue (id, entity_type, payload, updated_at, deleted, synced)
     VALUES (?, ?, ?, ?, ?, ?)
     ON CONFLICT(id) DO UPDATE SET
       entity_type=excluded.entity_type,
       payload=excluded.payload,
       updated_at=excluded.updated_at,
       deleted=excluded.deleted,
       synced=excluded.synced`,
    entity.id,
    entity.entityType,
    payload,
    entity.updatedAt,
    entity.deleted ? 1 : 0,
    queueForSync ? 0 : 1,
  );
}

export async function upsertLocalEntity(entity: LocalEntity) {
  await writeEntity(entity, true);
}

export async function applyRemoteEntity(entity: LocalEntity) {
  await writeEntity(entity, false);
}

export async function listLocalEntities(entityType?: string) {
  const db = await getDb();
  const rows = entityType
    ? await db.getAllAsync<{
        id: string;
        entity_type: string;
        payload: string;
        updated_at: string;
        deleted: number;
      }>(`SELECT * FROM local_entities WHERE deleted = 0 AND entity_type = ? ORDER BY updated_at DESC`, entityType)
    : await db.getAllAsync<{
        id: string;
        entity_type: string;
        payload: string;
        updated_at: string;
        deleted: number;
      }>(`SELECT * FROM local_entities WHERE deleted = 0 ORDER BY updated_at DESC`);

  return rows.map((r) => ({
    id: r.id,
    entityType: r.entity_type,
    payload: JSON.parse(r.payload),
    updatedAt: r.updated_at,
    deleted: !!r.deleted,
  }));
}

export async function listPendingSync(): Promise<SyncQueueItem[]> {
  const db = await getDb();
  const rows = await db.getAllAsync<{
    id: string;
    entity_type: string;
    payload: string;
    updated_at: string;
    deleted: number;
  }>(`SELECT * FROM sync_queue WHERE synced = 0`);
  return rows.map((p) => ({
    id: p.id,
    entityType: p.entity_type,
    payload: JSON.parse(p.payload),
    updatedAt: p.updated_at,
    deleted: !!p.deleted,
  }));
}

export async function markSynced(ids: string[]) {
  if (!ids.length) return;
  const db = await getDb();
  for (const id of ids) {
    await db.runAsync(`UPDATE sync_queue SET synced = 1 WHERE id = ?`, id);
  }
}

function parseJson<T>(raw: string | null | undefined, fallback: T): T {
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

export async function getPreferences(): Promise<Preferences> {
  const db = await getDb();
  const row = await db.getFirstAsync<{
    gym_days_per_week: number;
    gym_weekdays: string;
    split_id: string;
    split_mode?: string;
    schedule_mode?: string;
    day_kind_overrides?: string;
    gym_enabled?: number;
    home_workouts_enabled: number;
    progression_focus: string;
    units: string;
    rest_timer_seconds: number;
    favorite_exercise_ids: string;
    disliked_exercise_ids: string;
    owned_equipment: string | null;
    gym_equipment?: string | null;
    home_equipment?: string | null;
    default_fast_hours?: number;
  }>(`SELECT * FROM preferences WHERE id = 1`);
  if (!row) return { ...DEFAULT_PREFERENCES };

  const owned = parseJson<string[]>(row.owned_equipment, [...DEFAULT_PREFERENCES.ownedEquipment]);
  const gymEquipment = parseJson<string[]>(
    row.gym_equipment,
    owned.length ? owned : [...DEFAULT_PREFERENCES.gymEquipment],
  );
  const homeEquipment = parseJson<string[]>(row.home_equipment, [...DEFAULT_PREFERENCES.homeEquipment]);
  const overrides = parseJson(row.day_kind_overrides, [...DEFAULT_PREFERENCES.dayKindOverrides]);

  return normalizePreferences({
    gymDaysPerWeek: row.gym_days_per_week,
    gymWeekdays: parseJson<number[]>(row.gym_weekdays, [1, 3, 5]),
    splitId: row.split_id || "ppl_3",
    splitMode: row.split_mode === "manual" ? "manual" : "auto",
    scheduleMode: row.schedule_mode === "manual" ? "manual" : "auto",
    dayKindOverrides: overrides,
    gymEnabled: row.gym_enabled !== 0,
    homeWorkoutsEnabled: !!row.home_workouts_enabled,
    progressionFocus: row.progression_focus,
    units: row.units,
    restTimerSeconds: row.rest_timer_seconds,
    favoriteExerciseIds: parseJson(row.favorite_exercise_ids, []),
    dislikedExerciseIds: parseJson(row.disliked_exercise_ids, []),
    ownedEquipment: owned,
    gymEquipment,
    homeEquipment,
    defaultFastHours: row.default_fast_hours ?? 16,
  });
}

export async function savePreferences(prefs: Preferences) {
  const db = await getDb();
  const normalized = normalizePreferences(prefs);
  await db.runAsync(
    `UPDATE preferences SET
      gym_days_per_week = ?,
      gym_weekdays = ?,
      split_id = ?,
      split_mode = ?,
      schedule_mode = ?,
      day_kind_overrides = ?,
      gym_enabled = ?,
      home_workouts_enabled = ?,
      progression_focus = ?,
      units = ?,
      rest_timer_seconds = ?,
      favorite_exercise_ids = ?,
      disliked_exercise_ids = ?,
      owned_equipment = ?,
      gym_equipment = ?,
      home_equipment = ?,
      default_fast_hours = ?
     WHERE id = 1`,
    normalized.gymDaysPerWeek,
    JSON.stringify(normalized.gymWeekdays),
    normalized.splitId,
    normalized.splitMode ?? "auto",
    normalized.scheduleMode ?? "auto",
    JSON.stringify(normalized.dayKindOverrides ?? DEFAULT_PREFERENCES.dayKindOverrides),
    normalized.gymEnabled ? 1 : 0,
    normalized.homeWorkoutsEnabled ? 1 : 0,
    normalized.progressionFocus,
    normalized.units,
    normalized.restTimerSeconds,
    JSON.stringify(normalized.favoriteExerciseIds),
    JSON.stringify(normalized.dislikedExerciseIds),
    JSON.stringify(normalized.gymEquipment),
    JSON.stringify(normalized.gymEquipment),
    JSON.stringify(normalized.homeEquipment),
    normalized.defaultFastHours ?? 16,
  );
}

export async function getMeta(key: string) {
  const db = await getDb();
  const row = await db.getFirstAsync<{ value: string }>(`SELECT value FROM meta WHERE key = ?`, key);
  return row?.value ?? null;
}

export async function setMeta(key: string, value: string) {
  const db = await getDb();
  await db.runAsync(
    `INSERT INTO meta (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    key,
    value,
  );
}
