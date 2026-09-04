import { NativeModulesProxy, requireNativeModule } from "expo-modules-core";
import { Platform } from "react-native";

export type InstalledStakeApp = { packageName: string; label: string };

export type AppStakesStatus = {
  usageAccess: boolean;
  overlay: boolean;
  accessibility: boolean;
  accessibilityBound: boolean;
  samsung: boolean;
  batteryUnrestricted: boolean;
  locked: boolean;
  monitorRunning: boolean;
  packageCount: number;
  packages: string[];
  lastForeground: string;
  a11yConnectedAt: number;
  nativeModule: boolean;
};

export type LockTestResult = {
  ok: boolean;
  activity: boolean;
  a11yListed: boolean;
  a11yBound: boolean;
  a11yOverlay: string;
  appOverlay: string;
  overlayPerm: boolean;
  usage: boolean;
  locked: boolean;
  packages: number;
  lastForeground: string;
  a11yConnectedAt: number;
  samsung: boolean;
  hint: string;
};

type ForgeAppStakesNative = {
  isUsageAccessGranted(): boolean;
  canDrawOverlays(): boolean;
  isAccessibilityEnabled(): boolean;
  isAccessibilityBound(): boolean;
  isSamsungDevice(): boolean;
  testLockCover(): Promise<LockTestResult | Record<string, unknown>>;
  isIgnoringBatteryOptimizations(): boolean;
  openUsageAccessSettings(): Promise<void>;
  openOverlaySettings(): Promise<void>;
  openAccessibilitySettings(): Promise<void>;
  openAppInfoSettings(): Promise<void>;
  openFullScreenIntentSettings(): Promise<void>;
  openSamsungBatterySettings(): Promise<void>;
  requestIgnoreBatteryOptimizations(): Promise<void>;
  setBlockedPackages(packages: string[]): void;
  setWorkoutLocked(locked: boolean): void;
  setStakesEnabled(enabled: boolean): void;
  setUnlockDayKey(dayKey: string): void;
  setGraceByPackageJson(json: string): void;
  getStatus(): AppStakesStatus;
  listEntertainmentApps(): Promise<InstalledStakeApp[]>;
  listLauncherApps(): Promise<InstalledStakeApp[]>;
  isMonitorRunning(): boolean;
  playRestAlarm(): boolean;
  scheduleRestAlarm(delayMs: number): boolean;
  cancelRestAlarm(): boolean;
  stopRestAlarm?(): boolean;
  forceLockNow?(): { ok: boolean; error?: string };
  unlockAfterWorkout?(): { ok: boolean; locked?: boolean };
  pingHabitsComplete?(source: string): { ok: boolean; error?: string };
  getLockLog?(): string[];
  clearLockLog?(): void;
};

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

const stub: ForgeAppStakesNative = {
  isUsageAccessGranted: () => false,
  canDrawOverlays: () => false,
  isAccessibilityEnabled: () => false,
  isAccessibilityBound: () => false,
  isSamsungDevice: () => false,
  testLockCover: async () => ({
    ok: false,
    activity: false,
    a11yListed: false,
    a11yBound: false,
    a11yOverlay: "skipped",
    appOverlay: "skipped",
    overlayPerm: false,
    usage: false,
    locked: false,
    packages: 0,
    lastForeground: "",
    a11yConnectedAt: 0,
    samsung: false,
    hint: "Native lock module missing — reinstall the Forge APK (not the web app).",
  }),
  isIgnoringBatteryOptimizations: () => false,
  openUsageAccessSettings: async () => undefined,
  openOverlaySettings: async () => undefined,
  openAccessibilitySettings: async () => undefined,
  openAppInfoSettings: async () => undefined,
  openFullScreenIntentSettings: async () => undefined,
  openSamsungBatterySettings: async () => undefined,
  requestIgnoreBatteryOptimizations: async () => undefined,
  setBlockedPackages: () => undefined,
  setWorkoutLocked: () => undefined,
  setStakesEnabled: () => undefined,
  setUnlockDayKey: () => undefined,
  setGraceByPackageJson: () => undefined,
  getStatus: () => emptyStatus(),
  listEntertainmentApps: async () => [],
  listLauncherApps: async () => [],
  isMonitorRunning: () => false,
  playRestAlarm: () => false,
  scheduleRestAlarm: () => false,
  cancelRestAlarm: () => false,
  stopRestAlarm: () => false,
  forceLockNow: () => ({ ok: false, error: "no_native" }),
  unlockAfterWorkout: () => ({ ok: false }),
  pingHabitsComplete: () => ({ ok: false, error: "no_native" }),
  getLockLog: () => [],
  clearLockLog: () => undefined,
};

function getNative(): ForgeAppStakesNative {
  if (Platform.OS !== "android") return stub;
  try {
    return requireNativeModule<ForgeAppStakesNative>("ForgeAppStakes");
  } catch {
    return (NativeModulesProxy.ForgeAppStakes as ForgeAppStakesNative | undefined) ?? stub;
  }
}

export function isUsageAccessGranted(): boolean {
  return getNative().isUsageAccessGranted();
}

export function canDrawOverlays(): boolean {
  try {
    return getNative().canDrawOverlays();
  } catch {
    return false;
  }
}

export function isAccessibilityEnabled(): boolean {
  try {
    return getNative().isAccessibilityEnabled();
  } catch {
    return false;
  }
}

export function isAccessibilityBound(): boolean {
  try {
    return getNative().isAccessibilityBound();
  } catch {
    return false;
  }
}

export function isSamsungDevice(): boolean {
  try {
    return getNative().isSamsungDevice();
  } catch {
    return false;
  }
}

/** Full lock diagnosis — always tries a full-screen Activity first. */
export async function testLockCover(): Promise<LockTestResult> {
  const fallback: LockTestResult = {
    ok: false,
    activity: false,
    a11yListed: false,
    a11yBound: false,
    a11yOverlay: "skipped",
    appOverlay: "skipped",
    overlayPerm: false,
    usage: false,
    locked: false,
    packages: 0,
    lastForeground: "",
    a11yConnectedAt: 0,
    samsung: false,
    hint: "Test failed — reinstall Forge APK.",
  };
  try {
    const r = (await getNative().testLockCover()) as Record<string, unknown>;
    if (!r || typeof r !== "object") return fallback;
    // Legacy string/boolean
    if (typeof r === "string" || typeof r === "boolean") {
      const s = String(r);
      return {
        ...fallback,
        ok: s === "a11y" || s === "overlay" || r === true,
        a11yOverlay: s === "a11y" ? "ok" : "skipped",
        appOverlay: s === "overlay" ? "ok" : "skipped",
        hint: s === "none" || r === false ? fallback.hint : "Legacy test path.",
      };
    }
    return {
      ok: Boolean(r.ok),
      activity: Boolean(r.activity),
      a11yListed: Boolean(r.a11yListed),
      a11yBound: Boolean(r.a11yBound),
      a11yOverlay: String(r.a11yOverlay ?? "skipped"),
      appOverlay: String(r.appOverlay ?? "skipped"),
      overlayPerm: Boolean(r.overlayPerm),
      usage: Boolean(r.usage),
      locked: Boolean(r.locked),
      packages: Number(r.packages ?? 0),
      lastForeground: String(r.lastForeground ?? ""),
      a11yConnectedAt: Number(r.a11yConnectedAt ?? 0),
      samsung: Boolean(r.samsung),
      hint: String(r.hint ?? ""),
    };
  } catch {
    return fallback;
  }
}

export async function openUsageAccessSettings(): Promise<void> {
  await getNative().openUsageAccessSettings();
}

export async function openOverlaySettings(): Promise<void> {
  await getNative().openOverlaySettings();
}

export async function openAccessibilitySettings(): Promise<void> {
  await getNative().openAccessibilitySettings();
}

export async function openAppInfoSettings(): Promise<void> {
  await getNative().openAppInfoSettings();
}

export async function openFullScreenIntentSettings(): Promise<void> {
  await getNative().openFullScreenIntentSettings();
}

export async function openSamsungBatterySettings(): Promise<void> {
  await getNative().openSamsungBatterySettings();
}

export async function requestIgnoreBatteryOptimizations(): Promise<void> {
  await getNative().requestIgnoreBatteryOptimizations();
}

export function setBlockedPackages(packages: string[]): void {
  getNative().setBlockedPackages(packages);
}

export function setWorkoutLocked(locked: boolean): void {
  getNative().setWorkoutLocked(locked);
}

export function setStakesEnabled(enabled: boolean): void {
  getNative().setStakesEnabled(enabled);
}

export function setUnlockDayKey(dayKey: string): void {
  getNative().setUnlockDayKey(dayKey);
}

export function setGraceByPackage(grace: Record<string, number>): void {
  const clean: Record<string, number> = {};
  for (const [k, v] of Object.entries(grace)) {
    if (!k.trim()) continue;
    const n = Math.floor(Number(v));
    if (!Number.isFinite(n) || n < 0) continue;
    clean[k.trim()] = Math.min(24 * 60, n);
  }
  getNative().setGraceByPackageJson(JSON.stringify(clean));
}

export function getAppStakesStatus(): AppStakesStatus {
  try {
    const s = getNative().getStatus();
    return {
      usageAccess: Boolean(s?.usageAccess),
      overlay: Boolean(s?.overlay),
      accessibility: Boolean(s?.accessibility),
      accessibilityBound: Boolean(s?.accessibilityBound),
      samsung: Boolean(s?.samsung),
      batteryUnrestricted: Boolean(s?.batteryUnrestricted),
      locked: Boolean(s?.locked),
      monitorRunning: Boolean(s?.monitorRunning),
      packageCount: Number(s?.packageCount ?? 0),
      packages: Array.isArray(s?.packages) ? s.packages.filter((p) => typeof p === "string") : [],
      lastForeground: typeof s?.lastForeground === "string" ? s.lastForeground : "",
      a11yConnectedAt: Number(s?.a11yConnectedAt ?? 0),
      nativeModule: s?.nativeModule !== false,
    };
  } catch {
    return emptyStatus();
  }
}

export async function listEntertainmentApps(): Promise<InstalledStakeApp[]> {
  try {
    const rows = await getNative().listEntertainmentApps();
    if (!Array.isArray(rows)) return [];
    return rows
      .filter((r) => r && typeof r.packageName === "string" && r.packageName.length > 0)
      .map((r) => ({
        packageName: r.packageName,
        label: typeof r.label === "string" && r.label.trim() ? r.label.trim() : r.packageName,
      }));
  } catch {
    return [];
  }
}

export async function listLauncherApps(): Promise<InstalledStakeApp[]> {
  try {
    const rows = await getNative().listLauncherApps();
    if (!Array.isArray(rows)) return [];
    return rows
      .filter((r) => r && typeof r.packageName === "string" && r.packageName.length > 0)
      .map((r) => ({
        packageName: r.packageName,
        label: typeof r.label === "string" && r.label.trim() ? r.label.trim() : r.packageName,
      }));
  } catch {
    return [];
  }
}

export function isMonitorRunning(): boolean {
  return getNative().isMonitorRunning();
}

export function playRestAlarm(): boolean {
  try {
    return getNative().playRestAlarm();
  } catch {
    return false;
  }
}

export function scheduleRestAlarm(delayMs: number): boolean {
  try {
    return getNative().scheduleRestAlarm(delayMs);
  } catch {
    return false;
  }
}

export function cancelRestAlarm(): boolean {
  try {
    return getNative().cancelRestAlarm();
  } catch {
    return false;
  }
}

export function stopRestAlarm(): boolean {
  try {
    return getNative().stopRestAlarm?.() ?? cancelRestAlarm();
  } catch {
    return false;
  }
}

export function forceLockNow(): { ok: boolean; error?: string } {
  try {
    return getNative().forceLockNow?.() ?? { ok: false, error: "no_native" };
  } catch {
    return { ok: false, error: "no_native" };
  }
}

export function unlockAfterWorkout(): { ok: boolean; locked?: boolean } {
  try {
    return getNative().unlockAfterWorkout?.() ?? { ok: false };
  } catch {
    return { ok: false };
  }
}

export function pingHabitsComplete(_source: string): { ok: boolean; error?: string } {
  try {
    return getNative().pingHabitsComplete?.(_source) ?? { ok: false, error: "no_native" };
  } catch {
    return { ok: false, error: "no_native" };
  }
}

export function getLockLog(): string[] {
  try {
    const rows = getNative().getLockLog?.();
    return Array.isArray(rows) ? rows.filter((r) => typeof r === "string") : [];
  } catch {
    return [];
  }
}

export function clearLockLog(): void {
  try {
    getNative().clearLockLog?.();
  } catch {
    /* native missing */
  }
}
