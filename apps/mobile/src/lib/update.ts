import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { Linking, Platform } from "react-native";
import * as FileSystem from "expo-file-system/legacy";
import * as IntentLauncher from "expo-intent-launcher";
import { getApiUrl } from "./session";
import { getUpdateChannel } from "./updateChannel";

export type UpdateBridge = {
  reason: string;
  version: string;
  versionCode: number;
  requiredIfBelowCode: number;
  apkUrl: string;
  apkBytes?: number | null;
};

export type RemoteVersion = {
  version: string;
  versionCode: number;
  apk: boolean;
  apkUrl: string;
  apkBytes?: number;
  channel?: string;
  channelLabel?: string;
  bridge?: UpdateBridge | null;
  notes?: string[];
};
/** FLAG_GRANT_READ_URI_PERMISSION | FLAG_GRANT_WRITE_URI_PERMISSION | FLAG_ACTIVITY_NEW_TASK */
const INSTALL_FLAGS = 1 | 2 | 268435456;
const SNAPSHOT_KEY = "forge.apkDownload.snapshot";

type SavedSnapshot = {
  versionCode: number;
  url: string;
  fileUri: string;
  resumeData: string;
  expectedBytes?: number;
};

export function localBuild(): { version: string; versionCode: number } {
  const extra = Constants.expoConfig?.extra as { forgeVersion?: string; forgeBuild?: number } | undefined;
  return {
    version: extra?.forgeVersion ?? Constants.expoConfig?.version ?? "0.0.0",
    versionCode: Number(extra?.forgeBuild ?? Constants.expoConfig?.android?.versionCode ?? 0),
  };
}

export async function fetchRemoteVersion(channel?: string): Promise<RemoteVersion | null> {
  const base = await getApiUrl();
  if (!base) return null;
  const ch = channel ?? (await getUpdateChannel());
  try {
    const res = await fetch(`${base.replace(/\/$/, "")}/version?channel=${encodeURIComponent(ch)}`);
    if (!res.ok) return null;
    const json = (await res.json()) as Partial<RemoteVersion> & {
      bridge?: UpdateBridge | null;
    };
    if (!json.version) return null;
    return {
      version: json.version,
      versionCode: Number(json.versionCode ?? 0),
      apk: Boolean(json.apk),
      apkUrl:
        json.apkUrl ??
        `/download/forge.apk?channel=${encodeURIComponent(ch)}&v=${encodeURIComponent(json.version)}`,
      apkBytes: json.apkBytes != null ? Number(json.apkBytes) : undefined,
      channel: json.channel ?? ch,
      channelLabel: json.channelLabel,
      bridge: json.bridge ?? null,
      notes: Array.isArray(json.notes) ? json.notes : undefined,
    };
  } catch {
    return null;
  }
}

export async function checkForUpdate(): Promise<{
  available: boolean;
  local: ReturnType<typeof localBuild>;
  remote: RemoteVersion | null;
  needsBridge: boolean;
}> {
  const local = localBuild();
  if (Platform.OS !== "android") {
    return { available: false, local, remote: null, needsBridge: false };
  }
  const remote = await fetchRemoteVersion();
  const available = Boolean(
    remote?.apk && remote.versionCode > 0 && remote.versionCode > local.versionCode,
  );
  const needsBridge = Boolean(
    remote?.bridge &&
      remote.bridge.requiredIfBelowCode > 0 &&
      local.versionCode < remote.bridge.requiredIfBelowCode,
  );
  return { available, local, remote, needsBridge };
}

export function absoluteApkUrl(base: string, remote: RemoteVersion): string {
  if (remote.apkUrl.startsWith("http")) return remote.apkUrl;
  const path = remote.apkUrl.startsWith("/") ? remote.apkUrl : `/${remote.apkUrl}`;
  const sep = path.includes("?") ? "&" : "?";
  return `${base.replace(/\/$/, "")}${path}${sep}t=${Date.now()}`;
}

export type DownloadProgress = {
  progress: number;
  writtenBytes: number;
  totalBytes: number | null;
};

export type ReadyApk = {
  versionCode: number;
  version: string;
  fileUri: string;
  sizeBytes: number;
};

function apkPath(versionCode: number): string | null {
  const dir = FileSystem.documentDirectory ?? FileSystem.cacheDirectory;
  if (!dir) return null;
  return `${dir}forge-update-${versionCode}.apk`;
}

async function clearSnapshot() {
  await AsyncStorage.removeItem(SNAPSHOT_KEY);
}

async function saveSnapshot(snap: SavedSnapshot) {
  await AsyncStorage.setItem(SNAPSHOT_KEY, JSON.stringify(snap));
}

async function loadSnapshot(): Promise<SavedSnapshot | null> {
  try {
    const raw = await AsyncStorage.getItem(SNAPSHOT_KEY);
    if (!raw) return null;
    return JSON.parse(raw) as SavedSnapshot;
  } catch {
    return null;
  }
}

/** True when a complete APK for this versionCode is already on disk. */
export async function findReadyApk(remote: RemoteVersion): Promise<ReadyApk | null> {
  if (Platform.OS !== "android") return null;
  const dest = apkPath(remote.versionCode);
  if (!dest) return null;
  const info = await FileSystem.getInfoAsync(dest);
  if (!info.exists || !("size" in info)) return null;
  const size = Number(info.size ?? 0);
  const expected = remote.apkBytes && remote.apkBytes > 0 ? remote.apkBytes : null;
  if (size < 1_000_000) return null;
  if (expected && size < expected * 0.9) return null;
  return {
    versionCode: remote.versionCode,
    version: remote.version,
    fileUri: dest,
    sizeBytes: size,
  };
}

export async function installDownloadedApk(
  fileUri: string,
): Promise<{ ok: true } | { ok: false; error: string; needsInstallPermission?: boolean }> {
  try {
    await launchInstaller(fileUri);
    return { ok: true };
  } catch (e) {
    const msg = e instanceof Error ? e.message : "Could not open installer";
    if (/install|permission|unknown|package/i.test(msg)) {
      return {
        ok: false,
        error: "Allow Forge to install apps (Android settings → Install unknown apps), then tap Install again.",
        needsInstallPermission: true,
      };
    }
    return { ok: false, error: msg };
  }
}

async function launchInstaller(fileUri: string): Promise<void> {
  const contentUri = await FileSystem.getContentUriAsync(fileUri);
  const attempts: Array<() => Promise<unknown>> = [
    () =>
      IntentLauncher.startActivityAsync("android.intent.action.VIEW", {
        data: contentUri,
        flags: INSTALL_FLAGS,
        type: "application/vnd.android.package-archive",
      }),
    () =>
      IntentLauncher.startActivityAsync("android.intent.action.INSTALL_PACKAGE", {
        data: contentUri,
        flags: INSTALL_FLAGS,
        type: "application/vnd.android.package-archive",
      }),
    () => Linking.openURL(contentUri),
  ];
  let lastErr: unknown;
  for (const run of attempts) {
    try {
      await run();
      return;
    } catch (e) {
      lastErr = e;
    }
  }
  throw lastErr instanceof Error ? lastErr : new Error("Could not open package installer");
}

function validateApkSize(
  size: number,
  expected: number | null,
): { ok: true } | { ok: false; error: string } {
  if (size < 1_000_000) {
    return { ok: false, error: "Download looks corrupt (file too small). Tap Download to try again." };
  }
  if (expected && size < expected * 0.9) {
    return {
      ok: false,
      error: `Incomplete download (${Math.round(size / 1e6)}MB of ~${Math.round(expected / 1e6)}MB). Tap Download to resume.`,
    };
  }
  return { ok: true };
}

/**
 * Prefer LAN for big APK pulls when the session URL is a public tunnel
 * (Cloudflare often cuts ~100s / large streams).
 */
async function resolveApkDownloadBase(sessionBase: string): Promise<string> {
  const clean = sessionBase.replace(/\/$/, "");
  let host = "";
  try {
    host = new URL(clean).hostname;
  } catch {
    return clean;
  }
  const isLan =
    /^(10\.|192\.168\.|172\.(1[6-9]|2\d|3[01])\.|100\.)/.test(host) ||
    host === "localhost" ||
    host === "127.0.0.1";
  if (isLan) return clean;

  return clean;
}

/**
 * Download only (no installer). Keeps going when you leave the screen or minimize —
 * we do not pause on AppState background. Resume snapshot saved periodically.
 */
export async function downloadUpdateApk(
  onProgress?: (p: DownloadProgress) => void,
  opts?: { bridge?: boolean },
): Promise<{ ok: true; apk: ReadyApk } | { ok: false; error: string }> {
  const base = await getApiUrl();
  if (!base) return { ok: false, error: "Not signed in to a server" };
  const remote = await fetchRemoteVersion();
  if (!remote?.apk && !opts?.bridge) return { ok: false, error: "No APK published on server" };
  if (Platform.OS !== "android") {
    return { ok: false, error: "APK updates are Android-only" };
  }

  let target: RemoteVersion = remote!;
  if (opts?.bridge) {
    if (!remote?.bridge) return { ok: false, error: "No bridge build required for this update" };
    target = {
      version: remote.bridge.version,
      versionCode: remote.bridge.versionCode,
      apk: true,
      apkUrl: remote.bridge.apkUrl,
      apkBytes: remote.bridge.apkBytes != null ? Number(remote.bridge.apkBytes) : undefined,
      channel: remote.channel,
    };
  }

  const ready = await findReadyApk(target);
  if (ready) {
    onProgress?.({ progress: 1, writtenBytes: ready.sizeBytes, totalBytes: ready.sizeBytes });
    return { ok: true, apk: ready };
  }

  const downloadBase = await resolveApkDownloadBase(base);
  let lastError = "Download failed";
  for (let attempt = 1; attempt <= 4; attempt++) {
    const res = await downloadUpdateApkOnce(downloadBase, target, onProgress);
    if (res.ok) return res;
    lastError = res.error;
    await new Promise((r) => setTimeout(r, 800 * attempt));
  }
  return {
    ok: false,
    error: `${lastError} Try setting Server URL to your home LAN address (e.g. http://192.168.1.10:3030) for faster APK downloads.`,
  };
}

async function downloadUpdateApkOnce(
  base: string,
  remote: RemoteVersion,
  onProgress?: (p: DownloadProgress) => void,
): Promise<{ ok: true; apk: ReadyApk } | { ok: false; error: string }> {
  const dest = apkPath(remote.versionCode);
  if (!dest) return { ok: false, error: "No storage available" };

  const path = remote.apkUrl.startsWith("http")
    ? remote.apkUrl
    : `${base.replace(/\/$/, "")}${remote.apkUrl.startsWith("/") ? remote.apkUrl : `/${remote.apkUrl}`}`;
  const url = path.includes("?") ? path : `${path}?v=${remote.versionCode}`;

  const expected = remote.apkBytes && remote.apkBytes > 0 ? remote.apkBytes : null;
  onProgress?.({ progress: 0, writtenBytes: 0, totalBytes: expected });

  const snap = await loadSnapshot();
  if (snap && snap.versionCode !== remote.versionCode) {
    await FileSystem.deleteAsync(snap.fileUri, { idempotent: true }).catch(() => undefined);
    await clearSnapshot();
  }
  const existing = await FileSystem.getInfoAsync(dest);
  if (existing.exists) {
    const size = "size" in existing ? Number(existing.size ?? 0) : 0;
    if ((!snap || snap.versionCode !== remote.versionCode) && size < 64_000) {
      await FileSystem.deleteAsync(dest, { idempotent: true });
    }
  }

  let download!: FileSystem.DownloadResumable;
  let lastSnapAt = 0;
  const progressCb = (evt: FileSystem.DownloadProgressData) => {
    const total = evt.totalBytesExpectedToWrite > 0 ? evt.totalBytesExpectedToWrite : expected;
    const written = evt.totalBytesWritten;
    const progress = total && total > 0 ? Math.min(0.99, written / total) : written > 0 ? 0.5 : 0;
    onProgress?.({ progress, writtenBytes: written, totalBytes: total ?? null });
    const now = Date.now();
    if (now - lastSnapAt < 4000) return;
    lastSnapAt = now;
    try {
      const savable = download.savable();
      if (savable?.resumeData) {
        void saveSnapshot({
          versionCode: remote.versionCode,
          url,
          fileUri: dest,
          resumeData: savable.resumeData,
          expectedBytes: expected ?? undefined,
        });
      }
    } catch {
      /* best-effort */
    }
  };

  const resumeSnap = await loadSnapshot();
  const canResume =
    !!resumeSnap &&
    resumeSnap.versionCode === remote.versionCode &&
    resumeSnap.fileUri === dest &&
    !!resumeSnap.resumeData;
  download = canResume
    ? FileSystem.createDownloadResumable(url, dest, { cache: false }, progressCb, resumeSnap!.resumeData)
    : FileSystem.createDownloadResumable(url, dest, { cache: false }, progressCb);

  try {
    const result = canResume ? await download.resumeAsync() : await download.downloadAsync();

    if (!result || (result.status !== 200 && result.status !== 206 && result.status !== 0 && result.status !== undefined)) {
      try {
        const savable = download.savable();
        if (savable?.resumeData) {
          await saveSnapshot({
            versionCode: remote.versionCode,
            url,
            fileUri: dest,
            resumeData: savable.resumeData,
            expectedBytes: expected ?? undefined,
          });
        }
      } catch {
        /* ignore */
      }
      return { ok: false, error: `Download failed (${result?.status ?? "interrupted"}). Tap Download to resume.` };
    }

    const info = await FileSystem.getInfoAsync(result.uri);
    const size = info.exists && "size" in info ? Number(info.size ?? 0) : 0;
    const check = validateApkSize(size, expected);
    if (!check.ok) {
      try {
        const savable = download.savable();
        if (savable?.resumeData) {
          await saveSnapshot({
            versionCode: remote.versionCode,
            url,
            fileUri: dest,
            resumeData: savable.resumeData,
            expectedBytes: expected ?? undefined,
          });
        }
      } catch {
        /* ignore */
      }
      return check;
    }

    await clearSnapshot();
    onProgress?.({ progress: 1, writtenBytes: size, totalBytes: size });
    return {
      ok: true,
      apk: {
        versionCode: remote.versionCode,
        version: remote.version,
        fileUri: result.uri,
        sizeBytes: size,
      },
    };
  } catch (e) {
    try {
      const savable = download.savable();
      if (savable?.resumeData) {
        await saveSnapshot({
          versionCode: remote.versionCode,
          url,
          fileUri: dest,
          resumeData: savable.resumeData,
          expectedBytes: expected ?? undefined,
        });
      }
    } catch {
      /* ignore */
    }
    const msg = e instanceof Error ? e.message : "Download failed";
    return { ok: false, error: `${msg}. Tap Download to resume when you're back online.` };
  }
}

/** @deprecated Prefer downloadUpdateApk + installDownloadedApk. */
export async function downloadAndInstallUpdate(
  onProgress?: (p: DownloadProgress) => void,
): Promise<{ ok: true; via: "installer" } | { ok: false; error: string }> {
  const dl = await downloadUpdateApk(onProgress);
  if (!dl.ok) return dl;
  const inst = await installDownloadedApk(dl.apk.fileUri);
  if (!inst.ok) return inst;
  return { ok: true, via: "installer" };
}

export async function openInstallUnknownAppsSettings(): Promise<void> {
  if (Platform.OS !== "android") return;
  const pkg = Constants.expoConfig?.android?.package ?? "app.forge.workout";
  try {
    await IntentLauncher.startActivityAsync("android.settings.MANAGE_UNKNOWN_APP_SOURCES", {
      data: `package:${pkg}`,
    });
  } catch {
    try {
      await Linking.openSettings();
    } catch {
      /* ignore */
    }
  }
}
