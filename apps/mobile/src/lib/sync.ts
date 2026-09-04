import { apiFetch } from "./api";
import { getPreferences, savePreferences } from "../db/local";
import { normalizePreferences, type Preferences } from "../db/types";
import { applyRemoteEntity, getMeta, listPendingSync, markSynced, setMeta } from "../db/local";

type SyncEntity = {
  id: string;
  entityType: string;
  payload: unknown;
  updatedAt: string;
  deleted: boolean;
};

/** Pull server preferences into local SQLite / AsyncStorage so devices stay aligned. */
export async function pullPreferences(): Promise<Preferences | null> {
  try {
    const remote = await apiFetch<Record<string, unknown>>("/preferences");
    if (!remote || typeof remote !== "object") return null;
    const current = await getPreferences();
    const merged = normalizePreferences({
      ...current,
      ...remote,
      // Keep local favorites if server somehow returns empty while we have some? Prefer server.
    });
    await savePreferences(merged);
    return merged;
  } catch {
    return null;
  }
}

export async function pushPreferences(prefs: Preferences): Promise<void> {
  const payload = {
    gymDaysPerWeek: prefs.gymDaysPerWeek,
    gymWeekdays: prefs.gymWeekdays,
    splitId: prefs.splitId,
    splitMode: prefs.splitMode,
    scheduleMode: prefs.scheduleMode,
    dayKindOverrides: prefs.dayKindOverrides,
    gymEnabled: prefs.gymEnabled,
    homeWorkoutsEnabled: prefs.homeWorkoutsEnabled,
    progressionFocus: prefs.progressionFocus,
    units: prefs.units,
    restTimerSeconds: prefs.restTimerSeconds,
    favoriteExerciseIds: prefs.favoriteExerciseIds,
    dislikedExerciseIds: prefs.dislikedExerciseIds,
    ownedEquipment: prefs.gymEquipment,
    gymEquipment: prefs.gymEquipment,
    homeEquipment: prefs.homeEquipment,
    calorieTarget: prefs.calorieTarget,
    proteinTarget: prefs.proteinTarget,
    defaultFastHours: prefs.defaultFastHours,
  };
  await apiFetch("/preferences", { method: "PATCH", body: JSON.stringify(payload) });
}

export async function syncNow(): Promise<{ pulled: number; pushed: number; offline?: boolean }> {
  try {
    const since = (await getMeta("last_sync_at")) ?? new Date(0).toISOString();
    const pending = await listPendingSync();

    const push = await apiFetch<{ applied: number; serverTime: string }>("/sync", {
      method: "POST",
      body: JSON.stringify({
        entities: pending.map((p) => ({
          id: p.id,
          entityType: p.entityType,
          payload: p.payload,
          updatedAt: p.updatedAt,
          deleted: p.deleted,
        })),
      }),
    });

    await markSynced(pending.map((p) => p.id));

    const pull = await apiFetch<{ serverTime: string; entities: SyncEntity[] }>(
      `/sync?since=${encodeURIComponent(since)}`,
    );

    for (const entity of pull.entities) {
      await applyRemoteEntity({
        id: entity.id,
        entityType: entity.entityType,
        payload: entity.payload,
        updatedAt: entity.updatedAt,
        deleted: entity.deleted,
      });
    }

    await pullPreferences();

    await setMeta("last_sync_at", pull.serverTime || push.serverTime);
    return { pulled: pull.entities.length, pushed: push.applied };
  } catch {
    return { pulled: 0, pushed: 0, offline: true };
  }
}
