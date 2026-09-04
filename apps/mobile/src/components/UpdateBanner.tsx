import { useEffect, useState } from "react";
import { AppState, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { ActionButton } from "./ActionButton";
import { entriesSince, fetchChangelog, flattenNotes } from "../lib/changelog";
import {
  installDownloadedApk,
  localBuild,
  openInstallUnknownAppsSettings,
  type ReadyApk,
  type UpdateBridge,
} from "../lib/update";
import {
  getUpdateDownloadState,
  startUpdateDownload,
  subscribeUpdateDownload,
  refreshUpdateAvailability,
} from "../lib/updateDownloadManager";
import { getApiUrl } from "../lib/session";
import { CHANNEL_LABELS, getUpdateChannel, type UpdateChannel } from "../lib/updateChannel";
import { colors, spacing } from "../theme/colors";

type Props = {
  checkNonce?: number;
};

/**
 * Update UI — download runs in a global manager so leaving You / minimizing keeps it going.
 * On Wi‑Fi, download starts automatically when an update is available.
 */
export function UpdateBanner({ checkNonce = 0 }: Props) {
  const [remoteVersion, setRemoteVersion] = useState<string | null>(null);
  const [channel, setChannel] = useState<UpdateChannel>("stable");
  const [notes, setNotes] = useState<string[]>([]);
  const [bridge, setBridge] = useState<UpdateBridge | null>(null);
  const [needsBridge, setNeedsBridge] = useState(false);
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [dismissed, setDismissed] = useState(false);
  const [progress, setProgress] = useState<number | null>(null);
  const [ready, setReady] = useState<ReadyApk | null>(null);
  const [needsInstallPermission, setNeedsInstallPermission] = useState(false);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    return subscribeUpdateDownload((s) => {
      setBusy(s.busy);
      setProgress(s.progress);
      setReady(s.ready);
      setMsg(s.msg);
      if (s.remote) {
        setRemoteVersion(s.remote.version);
        setBridge(s.remote.bridge ?? null);
      }
    });
  }, []);

  useEffect(() => {
    if (Platform.OS !== "android") return;
    let alive = true;
    setDismissed(false);
    setNotes([]);
    (async () => {
      const ch = await getUpdateChannel();
      if (alive) setChannel(ch);
      await refreshUpdateAvailability({ autoWifi: true });
      const s = getUpdateDownloadState();
      if (!alive || !s.remote) return;
      setRemoteVersion(s.remote.version);
      setBridge(s.remote.bridge ?? null);
      setNeedsBridge(Boolean(s.remote.bridge));
      try {
        const base = await getApiUrl();
        if (!base) return;
        const versions = await fetchChangelog(base);
        const local = localBuild();
        const missed = entriesSince(versions, local.version, s.remote.version);
        const flat = flattenNotes(missed);
        if (alive) {
          setNotes(flat.length ? flat : s.remote.notes ?? []);
        }
      } catch {
        if (alive && s.remote.notes?.length) setNotes(s.remote.notes);
      }
    })();
    return () => {
      alive = false;
    };
  }, [checkNonce]);

  // After user returns from Install unknown apps, offer a clear retry path
  useEffect(() => {
    if (Platform.OS !== "android" || !needsInstallPermission || !ready) return;
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") {
        setMsg("Permission updated? Tap Install latest again.");
      }
    });
    return () => sub.remove();
  }, [needsInstallPermission, ready]);

  if (Platform.OS !== "android" || dismissed || !remoteVersion) return null;

  async function onDownload(asBridge = false) {
    await startUpdateDownload({ bridge: asBridge });
  }

  async function onInstall() {
    if (!ready) return;
    setBusy(true);
    setMsg("Opening installer…");
    setNeedsInstallPermission(false);
    const res = await installDownloadedApk(ready.fileUri);
    setBusy(false);
    if (!res.ok) {
      setMsg(res.error);
      if (res.needsInstallPermission) setNeedsInstallPermission(true);
      return;
    }
    setNeedsInstallPermission(false);
    setMsg("Installer opened — tap Install on the system prompt. That’s the only confirm each update.");
  }

  return (
    <View style={styles.box}>
      <View style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Update available</Text>
          <Text style={styles.sub}>
            v{remoteVersion} · {CHANNEL_LABELS[channel]} channel · downloads on Wi‑Fi in the background
          </Text>
        </View>
        <Pressable onPress={() => setDismissed(true)} hitSlop={12}>
          <Text style={styles.dismiss}>✕</Text>
        </Pressable>
      </View>
      {notes.length > 0 ? (
        <View style={styles.notes}>
          <Text style={styles.notesTitle}>Improvements (since your build)</Text>
          {notes.slice(0, 12).map((n) => (
            <Text key={n} style={styles.note}>
              · {n}
            </Text>
          ))}
          {notes.length > 12 ? (
            <Text style={styles.note}>· …and {notes.length - 12} more — tap the version on You</Text>
          ) : null}
        </View>
      ) : null}
      {needsBridge && bridge ? (
        <View style={styles.bridgeBox}>
          <Text style={styles.bridgeTitle}>Required first step</Text>
          <Text style={styles.bridgeBody}>
            {bridge.reason} Install bridge v{bridge.version}, then come back for latest.
          </Text>
          <ActionButton
            label={busy ? "Downloading…" : `Download bridge v${bridge.version}`}
            loading={busy}
            variant="ghost"
            onPress={() => void onDownload(true)}
          />
        </View>
      ) : null}
      {progress != null ? (
        <View style={styles.track}>
          <View style={[styles.fill, { width: `${Math.round(progress * 100)}%` }]} />
        </View>
      ) : null}
      {msg ? (
        <Text style={[styles.msg, ready && !needsInstallPermission ? styles.msgOk : null]}>{msg}</Text>
      ) : null}
      {needsInstallPermission ? (
        <View style={styles.permBox}>
          <Text style={styles.permTitle}>Allow Forge to install updates</Text>
          <Text style={styles.permBody}>
            This is for Forge only — you don’t need to turn off auto-blocker for the whole phone. Allow once, then
            each update just asks Install.
          </Text>
          <ActionButton
            label="Open Install unknown apps"
            onPress={() => void openInstallUnknownAppsSettings()}
          />
          <ActionButton
            label={busy ? "Opening…" : "Try Install again"}
            variant="ghost"
            loading={busy}
            onPress={() => void onInstall()}
          />
        </View>
      ) : null}
      {!ready ? (
        <ActionButton
          label={busy ? "Downloading…" : `Download latest v${remoteVersion}`}
          loading={busy}
          onPress={() => void onDownload(false)}
        />
      ) : !needsInstallPermission ? (
        <>
          <ActionButton
            label={busy ? "Opening…" : "Install latest"}
            loading={busy}
            onPress={() => void onInstall()}
          />
          <ActionButton
            label="Re-download latest"
            variant="ghost"
            disabled={busy}
            onPress={() => {
              setReady(null);
              setProgress(null);
              void onDownload(false);
            }}
          />
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    backgroundColor: "#1A2A18",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.accent,
    padding: spacing.md,
    marginBottom: spacing.sm,
    gap: 4,
  },
  row: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  title: { color: colors.accent, fontFamily: "Outfit_700Bold", fontSize: 16 },
  sub: { color: colors.textMuted, fontFamily: "Outfit_500Medium", fontSize: 13, marginTop: 2 },
  dismiss: { color: colors.textMuted, fontSize: 18, paddingHorizontal: 4 },
  notes: { marginTop: 8, gap: 4 },
  notesTitle: { color: colors.text, fontFamily: "Outfit_700Bold", fontSize: 13 },
  note: { color: colors.textMuted, fontFamily: "Outfit_500Medium", fontSize: 12, lineHeight: 17 },
  bridgeBox: {
    marginTop: 8,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.warn,
    gap: 6,
  },
  bridgeTitle: { color: colors.warn, fontFamily: "Outfit_700Bold", fontSize: 13 },
  bridgeBody: { color: colors.textMuted, fontFamily: "Outfit_500Medium", fontSize: 12, lineHeight: 17 },
  permBox: {
    marginTop: 8,
    padding: 10,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.warn,
    gap: 8,
  },
  permTitle: { color: colors.warn, fontFamily: "Outfit_700Bold", fontSize: 14 },
  permBody: { color: colors.textMuted, fontFamily: "Outfit_500Medium", fontSize: 12, lineHeight: 17 },
  msg: { color: colors.warn, fontFamily: "Outfit_500Medium", fontSize: 12, marginTop: 4 },
  msgOk: { color: colors.accent },
  track: {
    height: 6,
    borderRadius: 999,
    backgroundColor: colors.line,
    overflow: "hidden",
    marginTop: 8,
  },
  fill: { height: "100%", backgroundColor: colors.accent },
});
