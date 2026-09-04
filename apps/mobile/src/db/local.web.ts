import AsyncStorage from "@react-native-async-storage/async-storage";
import { DEFAULT_PREFERENCES, type LocalEntity, type Preferences, type SyncQueueItem } from "./types";

export type { LocalEntity, Preferences, SyncQueueItem } from "./types";

const KEYS = {
  entities: "forge.web.entities",
  syncQueue: "forge.web.sync_queue",
  preferences: "forge.web.preferences",
  meta: "forge.web.meta",
};

type EntityRow = LocalEntity & { deleted: boolean };
type QueueRow = SyncQueueItem & { synced: boolean };

async function readJson<T>(key: string, fallback: T): Promise<T> {
  const raw = await AsyncStorage.getItem(key);
  if (!raw) return fallback;
  try {
    return JSON.parse(raw) as T;
  } catch {
    return fallback;
  }
}

async function writeJson(key: string, value: unknown) {
  await AsyncStorage.setItem(key, JSON.stringify(value));
}

export async function initLocalStore() {
  const prefs = await AsyncStorage.getItem(KEYS.preferences);
  if (!prefs) await writeJson(KEYS.preferences, DEFAULT_PREFERENCES);
}

async function writeEntity(entity: LocalEntity, queueForSync: boolean) {
  const entities = await readJson<Record<string, EntityRow>>(KEYS.entities, {});
  entities[entity.id] = {
    id: entity.id,
    entityType: entity.entityType,
    payload: entity.payload,
    updatedAt: entity.updatedAt,
    deleted: !!entity.deleted,
  };
  await writeJson(KEYS.entities, entities);

  const queue = await readJson<Record<string, QueueRow>>(KEYS.syncQueue, {});
  queue[entity.id] = {
    id: entity.id,
    entityType: entity.entityType,
    payload: entity.payload,
    updatedAt: entity.updatedAt,
    deleted: !!entity.deleted,
    synced: !queueForSync,
  };
  await writeJson(KEYS.syncQueue, queue);
}

export async function upsertLocalEntity(entity: LocalEntity) {
  await writeEntity(entity, true);
}

export async function applyRemoteEntity(entity: LocalEntity) {
  await writeEntity(entity, false);
}

export async function listLocalEntities(entityType?: string) {
  const entities = await readJson<Record<string, EntityRow>>(KEYS.entities, {});
  return Object.values(entities)
    .filter((e) => !e.deleted && (!entityType || e.entityType === entityType))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
    .map((e) => ({
      id: e.id,
      entityType: e.entityType,
      payload: e.payload,
      updatedAt: e.updatedAt,
      deleted: e.deleted,
    }));
}

export async function listPendingSync(): Promise<SyncQueueItem[]> {
  const queue = await readJson<Record<string, QueueRow>>(KEYS.syncQueue, {});
  return Object.values(queue)
    .filter((q) => !q.synced)
    .map(({ synced: _s, ...rest }) => rest);
}

export async function markSynced(ids: string[]) {
  if (!ids.length) return;
  const queue = await readJson<Record<string, QueueRow>>(KEYS.syncQueue, {});
  for (const id of ids) {
    if (queue[id]) queue[id].synced = true;
  }
  await writeJson(KEYS.syncQueue, queue);
}

export async function getPreferences(): Promise<Preferences> {
  return readJson<Preferences>(KEYS.preferences, { ...DEFAULT_PREFERENCES });
}

export async function savePreferences(prefs: Preferences) {
  await writeJson(KEYS.preferences, prefs);
}

export async function getMeta(key: string) {
  const meta = await readJson<Record<string, string>>(KEYS.meta, {});
  return meta[key] ?? null;
}

export async function setMeta(key: string, value: string) {
  const meta = await readJson<Record<string, string>>(KEYS.meta, {});
  meta[key] = value;
  await writeJson(KEYS.meta, meta);
}
