import { Platform } from "react-native";
import { apiFetch } from "./api";
import { localToday } from "./dates";
import { NOTIF_IDS, startStickyNotification, stopStickyNotification } from "./notifications";

let consecutiveHcFails = 0;

export type HealthSnapshot = {
  steps?: number;
  sleepMinutes?: number;
  restingHr?: number;
  calories?: number;
  weightKg?: number;
  bodyFatPct?: number;
  leanMassKg?: number;
  available: boolean;
  error?: string;
};

function startOfLocalDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(0, 0, 0, 0);
  return x;
}

function endOfLocalDay(d = new Date()) {
  const x = new Date(d);
  x.setHours(23, 59, 59, 999);
  return x;
}

/** Read today's metrics from Android Health Connect (no-op on web/iOS). */
export async function readHealthConnectToday(): Promise<HealthSnapshot> {
  if (Platform.OS !== "android") {
    return { available: false, error: "Health Connect is Android-only" };
  }
  try {
    const hc = await import("react-native-health-connect");
    const ok = await hc.initialize();
    if (!ok) return { available: false, error: "Health Connect not available — install the Health Connect app" };

    const granted = await hc.requestPermission([
      { accessType: "read", recordType: "Steps" },
      { accessType: "read", recordType: "SleepSession" },
      { accessType: "read", recordType: "Weight" },
      { accessType: "read", recordType: "RestingHeartRate" },
      { accessType: "read", recordType: "TotalCaloriesBurned" },
      { accessType: "read", recordType: "ActiveCaloriesBurned" },
      { accessType: "read", recordType: "BodyFat" },
      { accessType: "read", recordType: "LeanBodyMass" },
    ]);
    if (!granted?.length) {
      return { available: false, error: "Permission denied" };
    }

    const startTime = startOfLocalDay().toISOString();
    const endTime = endOfLocalDay().toISOString();
    const timeRangeFilter = { operator: "between" as const, startTime, endTime };

    let steps: number | undefined;
    let sleepMinutes: number | undefined;
    let restingHr: number | undefined;
    let calories: number | undefined;
    let weightKg: number | undefined;
    let bodyFatPct: number | undefined;
    let leanMassKg: number | undefined;

    try {
      // Prefer aggregate — summing raw Steps records can double-count overlapping sources.
      const agg = await (hc as { aggregateRecord?: (r: object) => Promise<{ COUNT_TOTAL?: number }> }).aggregateRecord?.({
        recordType: "Steps",
        timeRangeFilter,
      });
      if (agg?.COUNT_TOTAL != null && agg.COUNT_TOTAL > 0) {
        steps = Math.round(agg.COUNT_TOTAL);
      } else {
        const stepRes = await hc.readRecords("Steps", { timeRangeFilter });
        const list = stepRes.records ?? [];
        const byStart = new Map<string, number>();
        for (const r of list) {
          const key = String(r.startTime ?? "");
          const n = r.count ?? 0;
          byStart.set(key, Math.max(byStart.get(key) ?? 0, n));
        }
        const total = [...byStart.values()].reduce((s, n) => s + n, 0);
        if (total > 0) steps = total;
      }
    } catch {
      /* permission partial */
    }

    try {
      const sleepRes = await hc.readRecords("SleepSession", { timeRangeFilter });
      const list = sleepRes.records ?? [];
      let ms = 0;
      for (const r of list) {
        if (r.startTime && r.endTime) {
          ms += new Date(r.endTime).getTime() - new Date(r.startTime).getTime();
        }
      }
      if (ms > 0) sleepMinutes = Math.round(ms / 60000);
    } catch {
      /* ignore */
    }

    try {
      const hrRes = await hc.readRecords("RestingHeartRate", { timeRangeFilter });
      const list = hrRes.records ?? [];
      if (list.length) {
        const avg = list.reduce((s: number, r: { beatsPerMinute?: number }) => s + (r.beatsPerMinute ?? 0), 0) / list.length;
        if (avg > 0) restingHr = Math.round(avg);
      }
    } catch {
      /* ignore */
    }

    try {
      const calAgg = await (
        hc as {
          aggregateRecord?: (r: object) => Promise<{ ENERGY_TOTAL?: { inKilocalories?: number } }>;
        }
      ).aggregateRecord?.({
        recordType: "TotalCaloriesBurned",
        timeRangeFilter,
      });
      const kcal = calAgg?.ENERGY_TOTAL?.inKilocalories;
      if (kcal != null && kcal > 0) {
        calories = Math.round(kcal);
      } else {
        const calRes = await hc.readRecords("TotalCaloriesBurned", { timeRangeFilter });
        const list = calRes.records ?? [];
        const sum = list.reduce((s: number, r: { energy?: { inKilocalories?: number } }) => s + (r.energy?.inKilocalories ?? 0), 0);
        if (sum > 0) calories = Math.round(sum);
      }
    } catch {
      try {
        const activeRes = await hc.readRecords("ActiveCaloriesBurned", { timeRangeFilter });
        const list = activeRes.records ?? [];
        const sum = list.reduce((s: number, r: { energy?: { inKilocalories?: number } }) => s + (r.energy?.inKilocalories ?? 0), 0);
        if (sum > 0) calories = Math.round(sum);
      } catch {
        /* ignore */
      }
    }

    try {
      const wRes = await hc.readRecords("Weight", {
        timeRangeFilter: {
          operator: "between",
          startTime: new Date(Date.now() - 14 * 86400000).toISOString(),
          endTime: new Date().toISOString(),
        },
        ascendingOrder: false,
        pageSize: 1,
      });
      const list = wRes.records ?? [];
      const kg = list[0]?.weight?.inKilograms;
      if (kg != null && kg > 0) weightKg = kg;
    } catch {
      /* ignore */
    }

    try {
      const fatRes = await hc.readRecords("BodyFat", {
        timeRangeFilter: {
          operator: "between",
          startTime: new Date(Date.now() - 30 * 86400000).toISOString(),
          endTime: new Date().toISOString(),
        },
        ascendingOrder: false,
        pageSize: 1,
      });
      const pct = fatRes.records?.[0]?.percentage;
      if (pct != null && pct > 0) bodyFatPct = Math.round(pct * 10) / 10;
    } catch {
      /* ignore */
    }

    try {
      const leanRes = await hc.readRecords("LeanBodyMass", {
        timeRangeFilter: {
          operator: "between",
          startTime: new Date(Date.now() - 30 * 86400000).toISOString(),
          endTime: new Date().toISOString(),
        },
        ascendingOrder: false,
        pageSize: 1,
      });
      const kg = leanRes.records?.[0]?.mass?.inKilograms;
      if (kg != null && kg > 0) leanMassKg = kg;
    } catch {
      /* ignore */
    }

    return { available: true, steps, sleepMinutes, restingHr, calories, weightKg, bodyFatPct, leanMassKg };
  } catch (e) {
    return {
      available: false,
      error: e instanceof Error ? e.message : "Health Connect failed",
    };
  }
}

async function raiseHcAlert(message: string, needsReauth: boolean) {
  void startStickyNotification({
    id: NOTIF_IDS.hcAlert,
    title: "Health Connect issue",
    body: message,
    data: { kind: "hc-alert" },
    stickyMs: 24 * 60 * 60 * 1000,
  });
  try {
    await apiFetch("/alerts/client", {
      method: "POST",
      body: JSON.stringify({
        provider: "health_connect",
        message,
        needsReauth,
      }),
    });
  } catch {
    /* offline */
  }
}

async function clearHcAlert() {
  void stopStickyNotification(NOTIF_IDS.hcAlert);
  try {
    await apiFetch("/alerts/client", {
      method: "POST",
      body: JSON.stringify({ provider: "health_connect", message: "ok", clear: true }),
    });
  } catch {
    /* ignore */
  }
}

/** Push HC snapshot into Forge metrics (same store the Today strip reads). */
export async function syncHealthConnectToServer(): Promise<HealthSnapshot> {
  const snap = await readHealthConnectToday();
  if (!snap.available) {
    consecutiveHcFails += 1;
    if (consecutiveHcFails >= 2) {
      await raiseHcAlert(
        snap.error || "Health Connect unavailable — check permissions",
        /permission|denied/i.test(snap.error ?? ""),
      );
    }
    return snap;
  }
  const date = localToday();
  try {
    if (
      snap.steps != null ||
      snap.sleepMinutes != null ||
      snap.restingHr != null ||
      snap.calories != null
    ) {
      await apiFetch("/integrations/health/daily", {
        method: "POST",
        body: JSON.stringify({
          date,
          steps: snap.steps,
          sleepMinutes: snap.sleepMinutes,
          restingHr: snap.restingHr,
          calories: snap.calories,
          bodyFatPct: snap.bodyFatPct,
          leanMassKg: snap.leanMassKg,
          source: "health_connect",
        }),
      });
    }
    if (snap.weightKg != null) {
      await apiFetch("/events/weight", {
        method: "POST",
        body: JSON.stringify({
          weighedAt: new Date().toISOString(),
          weight: Math.round(snap.weightKg * 2.20462 * 10) / 10,
          units: "lb",
          source: "health_connect",
          bodyFatPct: snap.bodyFatPct,
          leanMass: snap.leanMassKg != null ? Math.round(snap.leanMassKg * 2.20462 * 10) / 10 : undefined,
        }),
      });
    }
    consecutiveHcFails = 0;
    await clearHcAlert();
  } catch {
    consecutiveHcFails += 1;
    if (consecutiveHcFails >= 2) {
      await raiseHcAlert("Could not sync Health Connect to Forge — check network", false);
    }
  }
  return snap;
}

const HC_POLL_MS = 15 * 60 * 1000;
let hcPollTimer: ReturnType<typeof setInterval> | null = null;

/** Keep Health Connect → server sync warm while the app is open (Android). */
export function startHealthConnectPolling(): () => void {
  if (Platform.OS !== "android") return () => undefined;
  void syncHealthConnectToServer().catch(() => undefined);
  if (hcPollTimer) clearInterval(hcPollTimer);
  hcPollTimer = setInterval(() => {
    void syncHealthConnectToServer().catch(() => undefined);
  }, HC_POLL_MS);
  return () => {
    if (hcPollTimer) {
      clearInterval(hcPollTimer);
      hcPollTimer = null;
    }
  };
}
