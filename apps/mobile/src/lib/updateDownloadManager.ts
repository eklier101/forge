/**
 * Global APK update download — survives leaving You / minimizing the app.
 * Auto-starts on Wi‑Fi when an update is available (no cellular auto-pull).
 */
import { AppState, Platform } from "react-native";
import * as Network from "expo-network";
import {
  checkForUpdate,
  downloadUpdateApk,
  findReadyApk,
  type DownloadProgress,
  type ReadyApk,
  type RemoteVersion,
} from "./update";

export type UpdateDownloadState = {
  remote: RemoteVersion | null;
  busy: boolean;
  progress: number | null;
  writtenBytes: number;
  totalBytes: number | null;
  ready: ReadyApk | null;
  msg: string | null;
  autoStarted: boolean;
};

type Listener = (s: UpdateDownloadState) => void;

const listeners = new Set<Listener>();
let state: UpdateDownloadState = {
  remote: null,
  busy: false,
  progress: null,
  writtenBytes: 0,
  totalBytes: null,
  ready: null,
  msg: null,
  autoStarted: false,
};
let inFlight: Promise<void> | null = null;
let started = false;

function setState(patch: Partial<UpdateDownloadState>) {
  state = { ...state, ...patch };
  for (const cb of [...listeners]) {
    try {
      cb(state);
    } catch {
      /* ignore */
    }
  }
}

export function getUpdateDownloadState(): UpdateDownloadState {
  return state;
}

export function subscribeUpdateDownload(cb: Listener): () => void {
  listeners.add(cb);
  cb(state);
  return () => {
    listeners.delete(cb);
  };
}

async function isWifi(): Promise<boolean> {
  try {
    const s = await Network.getNetworkStateAsync();
    return s.type === Network.NetworkStateType.WIFI && s.isConnected !== false;
  } catch {
    return false;
  }
}

export async function startUpdateDownload(opts?: { bridge?: boolean; reason?: string }): Promise<void> {
  if (Platform.OS !== "android") return;
  if (inFlight) return inFlight;

  inFlight = (async () => {
    setState({
      busy: true,
      progress: 0,
      msg:
        opts?.reason === "wifi"
          ? "Downloading on Wi‑Fi in the background…"
          : "Downloading… you can leave this screen; it keeps going.",
    });
    const res = await downloadUpdateApk((p: DownloadProgress) => {
      setState({
        progress: p.progress,
        writtenBytes: p.writtenBytes,
        totalBytes: p.totalBytes,
        msg: `Downloading… ${(p.writtenBytes / 1e6).toFixed(1)}${
          p.totalBytes && p.totalBytes > 0 ? ` / ${(p.totalBytes / 1e6).toFixed(0)}` : ""
        }MB`,
      });
    }, { bridge: opts?.bridge });
    if (!res.ok) {
      setState({ busy: false, msg: res.error });
      return;
    }
    setState({
      busy: false,
      progress: 1,
      ready: res.apk,
      msg: "Download complete — tap Install when ready.",
    });
  })().finally(() => {
    inFlight = null;
  });

  return inFlight;
}

/** Check for updates; auto-download on Wi‑Fi. Safe to call often. */
export async function refreshUpdateAvailability(opts?: { autoWifi?: boolean }): Promise<void> {
  if (Platform.OS !== "android") return;
  const result = await checkForUpdate();
  if (!result.available || !result.remote) {
    setState({ remote: null, ready: null, progress: null, msg: null });
    return;
  }
  setState({ remote: result.remote });
  const existing = await findReadyApk(result.remote);
  if (existing) {
    setState({
      ready: existing,
      progress: 1,
      msg: "Download complete — tap Install when ready.",
      busy: false,
    });
    return;
  }
  if (opts?.autoWifi === false) return;
  if (state.busy || inFlight) return;
  if (result.needsBridge) return; // require explicit bridge step
  if (!(await isWifi())) {
    setState({
      msg: state.msg ?? "Update available — connect to Wi‑Fi to download automatically, or tap Download.",
    });
    return;
  }
  setState({ autoStarted: true });
  void startUpdateDownload({ reason: "wifi" });
}

/** Call once from root layout. */
export function startUpdateDownloadWatcher(): () => void {
  if (Platform.OS !== "android" || started) return () => undefined;
  started = true;

  void refreshUpdateAvailability({ autoWifi: true });

  const appSub = AppState.addEventListener("change", (s) => {
    if (s !== "active") return;
    void (async () => {
      if (state.remote) {
        const existing = await findReadyApk(state.remote);
        if (existing) {
          setState({
            ready: existing,
            progress: 1,
            busy: false,
            msg: "Download complete — tap Install when ready.",
          });
          return;
        }
      }
      void refreshUpdateAvailability({ autoWifi: true });
    })();
  });

  const netSub = Network.addNetworkStateListener((s: Network.NetworkState) => {
    if (s.type === Network.NetworkStateType.WIFI && s.isConnected !== false) {
      void refreshUpdateAvailability({ autoWifi: true });
    }
  });

  const interval = setInterval(() => {
    void refreshUpdateAvailability({ autoWifi: true });
  }, 15 * 60 * 1000);

  return () => {
    started = false;
    appSub.remove();
    netSub.remove();
    clearInterval(interval);
  };
}
