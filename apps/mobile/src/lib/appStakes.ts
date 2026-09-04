import { AppState, Platform } from "react-native";
import { getPreferences } from "../db/local";
import type { DayKind, Preferences } from "../db/types";
import { workoutToday } from "./dates";
import { getCompletedSessionForDate } from "./workout";
import { debugLog } from "./debugLog";
import {
  isUsageAccessGranted,
  openUsageAccessSettings,
  setBlockedPackages,
  setGraceByPackage,
  setWorkoutLocked,
  setStakesEnabled,
  setUnlockDayKey,
  getAppStakesStatus,
  listEntertainmentApps,
  listLauncherApps,
  type InstalledStakeApp,
  type AppStakesStatus,
} from "../../modules/forge-app-stakes";

/** Curated social / media apps (labels). Installed subset comes from the phone scan. */
export const STAKE_APP_CATALOG: { id: string; label: string; packageName: string }[] = [
  { id: "instagram", label: "Instagram", packageName: "com.instagram.android" },
  { id: "threads", label: "Threads", packageName: "com.instagram.barcelona" },
  { id: "tiktok", label: "TikTok", packageName: "com.zhiliaoapp.musically" },
  { id: "tiktok2", label: "TikTok", packageName: "com.ss.android.ugc.trill" },
  { id: "youtube", label: "YouTube", packageName: "com.google.android.youtube" },
  { id: "ytmusic", label: "YouTube Music", packageName: "com.google.android.apps.youtube.music" },
  { id: "reddit", label: "Reddit", packageName: "com.reddit.frontpage" },
  { id: "x", label: "X / Twitter", packageName: "com.twitter.android" },
  { id: "facebook", label: "Facebook", packageName: "com.facebook.katana" },
  { id: "messenger", label: "Messenger", packageName: "com.facebook.orca" },
  { id: "snapchat", label: "Snapchat", packageName: "com.snapchat.android" },
  { id: "discord", label: "Discord", packageName: "com.discord" },
  { id: "twitch", label: "Twitch", packageName: "tv.twitch.android.app" },
  { id: "netflix", label: "Netflix", packageName: "com.netflix.mediaclient" },
  { id: "hulu", label: "Hulu", packageName: "com.hulu.plus" },
  { id: "disney", label: "Disney+", packageName: "com.disney.disneyplus" },
  { id: "prime", label: "Prime Video", packageName: "com.amazon.avod.thirdpartyclient" },
  { id: "max", label: "Max", packageName: "com.wbd.stream" },
  { id: "max2", label: "Max", packageName: "com.max.android" },
  { id: "spotify", label: "Spotify", packageName: "com.spotify.music" },
  { id: "soundcloud", label: "SoundCloud", packageName: "com.soundcloud.android" },
  { id: "pinterest", label: "Pinterest", packageName: "com.pinterest" },
  { id: "tumblr", label: "Tumblr", packageName: "com.tumblr" },
  { id: "telegram", label: "Telegram", packageName: "org.telegram.messenger" },
  { id: "whatsapp", label: "WhatsApp", packageName: "com.whatsapp" },
  { id: "linkedin", label: "LinkedIn", packageName: "com.linkedin.android" },
  { id: "rumble", label: "Rumble", packageName: "com.rumble.rumbleapp" },
  { id: "plex", label: "Plex", packageName: "com.plexapp.android" },
  { id: "crunchyroll", label: "Crunchyroll", packageName: "com.crunchyroll.crunchyroid" },
];

export const DEFAULT_STAKE_PACKAGES: string[] = [];

/** Suggested picks — only auto-select if actually installed. */
export const SUGGESTED_STAKE_PACKAGES = [
  "com.instagram.android",
  "com.zhiliaoapp.musically",
  "com.google.android.youtube",
  "com.reddit.frontpage",
];

export function stakesWantAppLock(mode: string | undefined): boolean {
  return mode === "app_lock" || mode === "both";
}

export function stakesWantHaGate(mode: string | undefined): boolean {
  return mode === "ha_gate" || mode === "both";
}

export function parseGraceMinutes(raw: string | number | null | undefined): number {
  if (raw === null || raw === undefined || raw === "") return 0;
  const n = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isFinite(n) || n < 0) return 0;
  return Math.min(24 * 60, Math.floor(n));
}

export function catalogLabel(packageName: string, fallback?: string): string {
  const hit = STAKE_APP_CATALOG.find((a) => a.packageName === packageName);
  return hit?.label ?? fallback ?? packageName.split(".").pop() ?? packageName;
}

const CATALOG_SET = new Set(STAKE_APP_CATALOG.map((a) => a.packageName));

/** Drop curated apps that aren’t installed; keep true custom adds. */
export function pruneStakePackages(selected: string[], installed: InstalledStakeApp[]): string[] {
  const installedSet = new Set(installed.map((a) => a.packageName));
  return selected.filter((pkg) => installedSet.has(pkg) || !CATALOG_SET.has(pkg));
}

export function suggestInstalledPackages(installed: InstalledStakeApp[]): string[] {
  const installedSet = new Set(installed.map((a) => a.packageName));
  return SUGGESTED_STAKE_PACKAGES.filter((p) => installedSet.has(p));
}

/** Mirror of API planner resolveDayKind — rest days should not lock apps. */
export function resolveScheduleDayKind(prefs: Preferences, weekday: number): DayKind {
  const mode = prefs.scheduleMode === "manual" ? "manual" : "auto";
  if (mode === "manual") {
    const o = prefs.dayKindOverrides?.[weekday];
    if (o === "gym" || o === "home" || o === "rest") return o;
  }
  const gymOn = prefs.gymEnabled !== false;
  const gymWeekdays = Array.isArray(prefs.gymWeekdays) ? prefs.gymWeekdays : [];
  if (gymOn && gymWeekdays.includes(weekday)) return "gym";
  if (prefs.homeWorkoutsEnabled ?? true) return "home";
  return "rest";
}

export type SyncAppStakesResult = {
  locked: boolean;
  reason: string;
  status: AppStakesStatus;
};

/** Push lock state into the native monitor (Android only). */
export async function syncAppStakesLock(): Promise<SyncAppStakesResult | null> {
  if (Platform.OS !== "android") return null;
  const emptyStatus = (): AppStakesStatus => ({
    usageAccess: false,
    overlay: false,
    accessibility: false,
    accessibilityBound: false,
    samsung: false,
    batteryUnrestricted: false,
    locked: false,
    monitorRunning: false,
    packageCount: 0,
    packages: [],
    lastForeground: "",
    a11yConnectedAt: 0,
    nativeModule: false,
  });
  try {
    const prefs = await getPreferences();
    const packages =
      Array.isArray(prefs.stakesBlockedPackages) && prefs.stakesBlockedPackages.length
        ? prefs.stakesBlockedPackages
        : [];
    const wantLock = stakesWantAppLock(prefs.motivationStakes);

    try {
      setStakesEnabled(wantLock);
    } catch (e) {
      void debugLog("stakes", "setStakesEnabled failed", String(e));
    }

    try {
      setBlockedPackages(packages);
    } catch (e) {
      void debugLog("stakes", "setBlockedPackages failed", String(e));
    }

    const graceMap: Record<string, number> = {};
    const byPkg =
      prefs.stakesGraceByPackage && typeof prefs.stakesGraceByPackage === "object"
        ? prefs.stakesGraceByPackage
        : {};
    for (const pkg of packages) {
      const hasPer = Object.prototype.hasOwnProperty.call(byPkg, pkg);
      graceMap[pkg] = hasPer
        ? parseGraceMinutes(byPkg[pkg])
        : parseGraceMinutes(prefs.stakesGraceMinutes);
    }
    try {
      setGraceByPackage(graceMap);
    } catch (e) {
      void debugLog("stakes", "setGraceByPackage failed", String(e));
    }

    let locked = false;
    let reason = "off";
    let unlockDay: string | null = null;
    const dayKey = workoutToday(prefs.lateNightWorkoutWindow ? 2 : null);

    if (!wantLock) {
      reason = "feature_off";
    } else if (!isUsageAccessGranted()) {
      reason = "need_usage_access";
    } else if (!packages.length) {
      reason = "no_apps_selected";
    } else {
      const weekday = new Date(`${dayKey}T12:00:00`).getDay();
      const kind = resolveScheduleDayKind(prefs, weekday);
      if (kind === "rest") {
        reason = "rest_day";
        locked = false;
        unlockDay = dayKey;
      } else {
        const done = await getCompletedSessionForDate(dayKey);
        if (done) {
          reason = "workout_done";
          locked = false;
          unlockDay = dayKey;
        } else {
          reason = "locking";
          locked = true;
          unlockDay = null;
        }
      }
    }

    try {
      setUnlockDayKey(unlockDay ?? "");
    } catch (e) {
      void debugLog("stakes", "setUnlockDayKey failed", String(e));
    }

    try {
      setWorkoutLocked(locked);
    } catch (e) {
      void debugLog("stakes", "setWorkoutLocked failed", String(e));
    }

    // Retry start when app is active (FGS start can fail from background).
    if (locked && AppState.currentState === "active") {
      try {
        setWorkoutLocked(true);
      } catch {
        /* ignore */
      }
    }

    const status = getAppStakesStatus();
    void debugLog("stakes", "sync", { locked, reason, status, packages, unlockDay });
    return { locked, reason, status };
  } catch (e) {
    void debugLog("stakes", "sync failed", String(e));
    // Don't claim unlocked — leave native state alone on failure.
    return { locked: getAppStakesStatus().locked, reason: "error", status: emptyStatus() };
  }
}

export {
  isUsageAccessGranted,
  openUsageAccessSettings,
  listEntertainmentApps,
  listLauncherApps,
  getAppStakesStatus,
};
export type { InstalledStakeApp, AppStakesStatus };
