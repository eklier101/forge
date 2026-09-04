import { useCallback, useEffect, useRef, useState } from "react";
import {
  Modal,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ActionButton } from "../../src/components/ActionButton";
import { FeatureOffCard } from "../../src/components/FeatureOffCard";
import { FlashBanner } from "../../src/components/ScreenChrome";
import { MetabolicStageBar } from "../../src/components/MetabolicStageBar";
import { apiFetch } from "../../src/lib/api";
import { getPreferences, listLocalEntities, savePreferences, upsertLocalEntity } from "../../src/db/local";
import { formatFastWhen } from "../../src/lib/dates";
import { METABOLIC_STAGES } from "../../src/lib/fastingStages";
import {
  NOTIF_IDS,
  remindersSupported,
  startStickyNotification,
  stopStickyNotification,
  updateStickyNotification,
} from "../../src/lib/notifications";
import { pushPreferences, syncNow } from "../../src/lib/sync";
import { colors, spacing } from "../../src/theme/colors";

type FastSession = {
  id: string;
  startedAt: string;
  endedAt?: string;
  targetHours?: number;
  status: "active" | "completed" | "cancelled";
  durationHours?: number;
  notes?: string;
};

type HistorySort = "recent" | "longest";

/** Default eating window before auto-starting the next fast after a target hit. */
const EATING_WINDOW_HOURS = 1;
/** Hours into a fast that counts toward the fat-burn streak. */
const FAT_BURN_HOURS = 12;
const FAST_STICKY_MS = 7 * 24 * 60 * 60 * 1000;
const FAST_NOTIF_INTERVAL_MS = 30 * 60 * 1000;

function formatElapsed(ms: number) {
  const totalMin = Math.max(0, Math.floor(ms / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

function dayKeyLocal(iso: string) {
  const d = new Date(iso);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}-${String(d.getDate()).padStart(2, "0")}`;
}

/** Consecutive calendar days (ending today or yesterday) with a completed fast ≥ fat-burn hours. */
function fatBurnStreak(sessions: FastSession[], nowMs: number): number {
  const fatDays = new Set(
    sessions
      .filter((s) => s.status === "completed" && (s.durationHours ?? 0) >= FAT_BURN_HOURS)
      .map((s) => dayKeyLocal(s.endedAt ?? s.startedAt)),
  );
  if (fatDays.size === 0) return 0;
  let streak = 0;
  const cursor = new Date(nowMs);
  cursor.setHours(12, 0, 0, 0);
  // Allow streak to continue if today's fast hasn't finished yet but yesterday counted.
  for (let i = 0; i < 400; i++) {
    const key = dayKeyLocal(cursor.toISOString());
    if (fatDays.has(key)) {
      streak += 1;
      cursor.setDate(cursor.getDate() - 1);
      continue;
    }
    if (i === 0) {
      // Today not yet — check from yesterday.
      cursor.setDate(cursor.getDate() - 1);
      continue;
    }
    break;
  }
  return streak;
}

function fastingNotifBody(session: FastSession, nowMs: number) {
  const elapsedMs = nowMs - new Date(session.startedAt).getTime();
  const hours = (elapsedMs / 3600000).toFixed(1);
  const target = session.targetHours ?? 16;
  const endAt = new Date(new Date(session.startedAt).getTime() + target * 3600000).toISOString();
  return `${hours}h in · target ${target}h · ends ${formatFastWhen(endAt, nowMs)}`;
}

export default function FastScreen() {
  const insets = useSafeAreaInsets();
  const [active, setActive] = useState<FastSession | null>(null);
  const [history, setHistory] = useState<FastSession[]>([]);
  const [historySort, setHistorySort] = useState<HistorySort>("recent");
  const [targetHours, setTargetHours] = useState("16");
  const [startHoursAgo, setStartHoursAgo] = useState(0);
  const [now, setNow] = useState(Date.now());
  const [msg, setMsg] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [showAllowed, setShowAllowed] = useState(false);
  const [featureFast, setFeatureFast] = useState(true);
  const [featureBusy, setFeatureBusy] = useState(false);
  /** After hitting target: wait this long then auto-start next fast. */
  const [nextStartAt, setNextStartAt] = useState<string | null>(null);
  const lastNotifUpdate = useRef(0);
  const autoEnding = useRef(false);
  const autoStarting = useRef(false);
  const endingRef = useRef<(opts?: { silent?: boolean; reason?: string }) => Promise<void>>(async () => {});
  const startingRef = useRef<() => Promise<void>>(async () => {});

  useEffect(() => {
    if (!active || active.status !== "active") {
      void stopStickyNotification(NOTIF_IDS.fasting);
      return;
    }
    const t = setInterval(() => setNow(Date.now()), 30000);
    const stamp = Date.now();
    void startStickyNotification({
      id: NOTIF_IDS.fasting,
      title: "Fasting in progress",
      body: fastingNotifBody(active, stamp),
      data: { kind: "fasting", sessionId: active.id },
      stickyMs: FAST_STICKY_MS,
    });
    lastNotifUpdate.current = stamp;
    return () => {
      clearInterval(t);
    };
  }, [active?.id, active?.status, active?.startedAt, active?.targetHours]);

  useEffect(() => {
    if (!active || active.status !== "active") return;
    if (now - lastNotifUpdate.current < FAST_NOTIF_INTERVAL_MS) return;
    lastNotifUpdate.current = now;
    void updateStickyNotification(NOTIF_IDS.fasting, {
      body: fastingNotifBody(active, now),
    });
  }, [now, active]);

  const load = useCallback(async (sort: HistorySort = historySort) => {
    const prefs = await getPreferences();
    setTargetHours(String(prefs.defaultFastHours ?? 16));
    setFeatureFast(prefs.features?.fast !== false);

    try {
      const [a, h] = await Promise.all([
        apiFetch<{ active: FastSession | null }>("/fasting/active"),
        apiFetch<{ sessions: FastSession[] }>(`/fasting/history?sort=${sort}`),
      ]);
      setActive(a.active);
      setHistory(
        h.sessions.filter((s) => s.status === "completed" && (s.durationHours ?? 0) >= 1).slice(0, 40),
      );
    } catch {
      const rows = await listLocalEntities("fasting_session");
      const sessions = rows.map((r) => ({ ...(r.payload as FastSession), id: r.id }));
      setActive(sessions.find((s) => s.status === "active") ?? null);
      const completed = sessions.filter((s) => s.status === "completed" && (s.durationHours ?? 0) >= 1);
      completed.sort((a, b) => {
        if (sort === "longest") return (b.durationHours ?? 0) - (a.durationHours ?? 0);
        return String(b.startedAt ?? "").localeCompare(String(a.startedAt ?? ""));
      });
      setHistory(completed.slice(0, 40));
    }
  }, [historySort]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function startFast() {
    setBusy(true);
    setMsg(null);
    setNextStartAt(null);
    try {
      const hours = Math.min(72, Math.max(1, Number(targetHours) || 16));
      const ago = Math.min(6, Math.max(0, startHoursAgo));
      const startedAt = new Date(Date.now() - ago * 3600000).toISOString();
      const res = await apiFetch<{ session: FastSession }>("/fasting/start", {
        method: "POST",
        body: JSON.stringify({ targetHours: hours, startedAt }),
      });
      await upsertLocalEntity({
        id: res.session.id,
        entityType: "fasting_session",
        payload: res.session,
        updatedAt: new Date().toISOString(),
      });
      setActive(res.session);
      const prefs = await getPreferences();
      if (prefs.defaultFastHours !== hours) {
        const nextPrefs = { ...prefs, defaultFastHours: hours };
        await savePreferences(nextPrefs);
        void pushPreferences(nextPrefs);
      }
      await syncNow();
      setMsg("Fast started");
      const stamp = Date.now();
      lastNotifUpdate.current = stamp;
      void startStickyNotification({
        id: NOTIF_IDS.fasting,
        title: "Fasting in progress",
        body: fastingNotifBody(res.session, stamp),
        data: { kind: "fasting", sessionId: res.session.id },
        stickyMs: FAST_STICKY_MS,
      });
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not start fast");
    } finally {
      setBusy(false);
    }
  }

  async function endFast(opts?: { silent?: boolean; reason?: string }) {
    if (!active && !opts?.silent) return;
    setBusy(true);
    if (!opts?.silent) setMsg(null);
    try {
      const body: { id?: string } = {};
      if (active?.id) body.id = active.id;
      const res = await apiFetch<{ session: FastSession }>("/fasting/end", {
        method: "POST",
        body: JSON.stringify(body),
      });
      await upsertLocalEntity({
        id: res.session.id,
        entityType: "fasting_session",
        payload: res.session,
        updatedAt: new Date().toISOString(),
      });
      setActive(null);
      await load();
      await syncNow();
      void stopStickyNotification(NOTIF_IDS.fasting);

      const hitTarget =
        res.session.status === "completed" &&
        (res.session.durationHours ?? 0) >= ((res.session.targetHours ?? Number(targetHours)) || 16) * 0.98;

      if (res.session.status === "cancelled") {
        setMsg("Fast ended under 1h — not counted");
        setNextStartAt(null);
      } else if (hitTarget || opts?.reason === "target") {
        const restartAt = new Date(
          new Date(res.session.endedAt ?? Date.now()).getTime() + EATING_WINDOW_HOURS * 3600000,
        ).toISOString();
        setNextStartAt(restartAt);
        setMsg(
          opts?.reason === "target"
            ? `Target reached — eating window until ${formatFastWhen(restartAt)}. Next fast starts automatically.`
            : `Fast completed — next fast at ${formatFastWhen(restartAt)} (${EATING_WINDOW_HOURS}h eating window).`,
        );
      } else {
        setMsg("Fast completed");
        setNextStartAt(null);
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not end fast");
    } finally {
      setBusy(false);
      autoEnding.current = false;
    }
  }

  endingRef.current = endFast;
  startingRef.current = startFast;

  // Auto-end when target time is reached.
  useEffect(() => {
    if (!active || active.status !== "active" || busy || autoEnding.current) return;
    const targetH = active.targetHours ?? (Number(targetHours) || 16);
    const elapsedH = (now - new Date(active.startedAt).getTime()) / 3600000;
    if (elapsedH < targetH) return;
    autoEnding.current = true;
    void endingRef.current({ silent: true, reason: "target" });
  }, [active, now, busy, targetHours]);

  // After eating window, auto-start the next fast.
  useEffect(() => {
    if (active || !nextStartAt || busy || autoStarting.current) return;
    if (now < new Date(nextStartAt).getTime()) return;
    autoStarting.current = true;
    void (async () => {
      try {
        await startingRef.current();
        setMsg("New fast started — fat-burn streak continues when you hit 12h.");
      } finally {
        autoStarting.current = false;
      }
    })();
  }, [active, nextStartAt, now, busy]);

  // Keep eating-window countdown ticking.
  useEffect(() => {
    if (!nextStartAt || active) return;
    const t = setInterval(() => setNow(Date.now()), 15000);
    return () => clearInterval(t);
  }, [nextStartAt, active]);

  const elapsed =
    active?.status === "active" ? now - new Date(active.startedAt).getTime() : 0;
  const elapsedHours = elapsed / 3600000;
  const targetMs = (active?.targetHours ?? (Number(targetHours) || 16)) * 3600000;
  const progress = active ? Math.min(1, elapsed / targetMs) : 0;
  const endIso =
    active?.status === "active"
      ? new Date(new Date(active.startedAt).getTime() + targetMs).toISOString()
      : null;
  const streak = fatBurnStreak(history, now);
  const eatingMsLeft = nextStartAt && !active ? Math.max(0, new Date(nextStartAt).getTime() - now) : 0;

  if (!featureFast) {
    return (
      <FeatureOffCard
        title="Fasting is off"
        description="Turn on fasting to track intermittent fasts and sticky timers."
        busy={featureBusy}
        onEnable={() => {
          void (async () => {
            setFeatureBusy(true);
            try {
              const prefs = await getPreferences();
              const features = {
                fuel: prefs.features?.fuel !== false,
                fast: true,
                photos: prefs.features?.photos !== false,
                sync: prefs.features?.sync !== false,
                aiPlan: prefs.features?.aiPlan !== false,
                aiEstimate: prefs.features?.aiEstimate !== false,
                autoTargets: prefs.features?.autoTargets !== false,
              };
              const next = { ...prefs, features };
              await savePreferences(next);
              await apiFetch("/preferences", { method: "PATCH", body: JSON.stringify({ features }) });
              setFeatureFast(true);
            } finally {
              setFeatureBusy(false);
            }
          })();
        }}
      />
    );
  }

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.content, { paddingTop: spacing.lg + Math.max(insets.top, 0) }]}
      refreshControl={
        <RefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            try {
              await load();
            } finally {
              setRefreshing(false);
            }
          }}
          tintColor={colors.accent}
          colors={[colors.accent]}
        />
      }
    >
      <Text style={styles.title}>Fasting</Text>
      <Text style={styles.sub}>Track intermittent fasts — plan a window, start, and log when you break.</Text>

      {streak > 0 ? (
        <Text style={styles.streak}>Fat-burn streak · {streak} day{streak === 1 ? "" : "s"} (≥{FAT_BURN_HOURS}h)</Text>
      ) : null}

      {msg ? <FlashBanner message={msg} /> : null}

      <Pressable style={styles.allowedBtn} onPress={() => setShowAllowed(true)}>
        <Text style={styles.allowedBtnText}>What’s allowed while fasting?</Text>
      </Pressable>

      {active?.status === "active" ? (
        <View style={styles.hero}>
          <Text style={styles.kicker}>ACTIVE FAST</Text>
          <Text style={styles.clock}>{formatElapsed(elapsed)}</Text>
          <Text style={styles.meta}>
            Target {active.targetHours ?? 16}h · {Math.round(progress * 100)}%
          </Text>
          <Text style={styles.when}>
            Started: {formatFastWhen(active.startedAt, now)}
            {endIso ? ` | Ends: ${formatFastWhen(endIso, now)}` : ""}
          </Text>
          <View style={styles.barTrack}>
            <View style={[styles.barFill, { width: `${progress * 100}%` }]} />
          </View>

          <MetabolicStageBar elapsedHours={elapsedHours} />

          {remindersSupported() ? null : (
            <Text style={styles.hintSmall}>
              Your fast keeps running, but this browser can’t show the ongoing notification — install
              the Android app for reminders.
            </Text>
          )}

          <ActionButton label="End fast" variant="danger" loading={busy} onPress={() => void endFast()} />
        </View>
      ) : nextStartAt && eatingMsLeft > 0 ? (
        <View style={styles.hero}>
          <Text style={styles.kicker}>EATING WINDOW</Text>
          <Text style={styles.clock}>{formatElapsed(eatingMsLeft)}</Text>
          <Text style={styles.meta}>Next fast starts {formatFastWhen(nextStartAt, now)}</Text>
          <ActionButton
            label="Start next fast now"
            loading={busy}
            onPress={() => {
              setNextStartAt(null);
              void startFast();
            }}
          />
          <ActionButton
            label="Skip auto-start"
            variant="ghost"
            onPress={() => {
              setNextStartAt(null);
              setMsg(null);
            }}
          />
        </View>
      ) : (
        <View style={styles.card}>
          <Text style={styles.cardTitle}>Start a fast</Text>
          <Text style={styles.label}>Target hours</Text>
          <TextInput
            style={styles.input}
            keyboardType="numeric"
            value={targetHours}
            onChangeText={setTargetHours}
          />
          <Text style={styles.label}>Started</Text>
          <View style={styles.agoRow}>
            {[0, 1, 2, 3, 4, 5, 6].map((h) => (
              <Pressable
                key={h}
                style={[styles.agoChip, startHoursAgo === h && styles.agoChipOn]}
                onPress={() => setStartHoursAgo(h)}
              >
                <Text style={[styles.agoChipText, startHoursAgo === h && styles.agoChipTextOn]}>
                  {h === 0 ? "Now" : `${h}h ago`}
                </Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.hintSmall}>
            {startHoursAgo === 0
              ? "Starts right now"
              : `Backdate up to 6h · started ${formatFastWhen(new Date(Date.now() - startHoursAgo * 3600000).toISOString(), now)}`}
          </Text>
          <ActionButton label="Begin fasting" loading={busy} onPress={() => void startFast()} />
          <Text style={styles.stageLegendTitle}>Metabolic stages</Text>
          {METABOLIC_STAGES.map((s) => (
            <Text key={s.id} style={styles.stageLegend}>
              {s.from}–{s.to}h · {s.label} — {s.hint}
            </Text>
          ))}
        </View>
      )}

      <View style={styles.sectionRow}>
        <Text style={styles.section}>Completed</Text>
        <View style={styles.sortRow}>
          {(["recent", "longest"] as const).map((s) => (
            <Pressable
              key={s}
              style={[styles.sortChip, historySort === s && styles.sortChipOn]}
              onPress={() => {
                setHistorySort(s);
                void load(s);
              }}
            >
              <Text style={[styles.sortChipText, historySort === s && styles.sortChipTextOn]}>
                {s === "recent" ? "Most recent" : "Longest"}
              </Text>
            </Pressable>
          ))}
        </View>
      </View>
      {history.length === 0 ? (
        <Text style={styles.hint}>No completed fasts yet (under 1h doesn’t count).</Text>
      ) : (
        history.map((s) => (
          <View key={s.id} style={styles.histRow}>
            <Text style={styles.histTitle}>{s.durationHours?.toFixed(1) ?? "—"}h</Text>
            <Text style={styles.histMeta}>
              {formatFastWhen(s.startedAt)}
              {s.endedAt ? ` → ${formatFastWhen(s.endedAt)}` : ""}
              {(s.durationHours ?? 0) >= FAT_BURN_HOURS ? " · fat burn" : ""}
            </Text>
          </View>
        ))
      )}

      <Modal visible={showAllowed} transparent animationType="fade" onRequestClose={() => setShowAllowed(false)}>
        <Pressable style={styles.modalBackdrop} onPress={() => setShowAllowed(false)}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Allowed while fasting</Text>
            <Text style={styles.modalOk}>Water · Lemon water · Unsweetened tea · Sugar-free gum</Text>
            <Text style={styles.modalWarn}>
              Avoid milk, cream, juice, soda, and anything with calories — they break the fast.
            </Text>
            <ActionButton label="Got it" onPress={() => setShowAllowed(false)} />
          </View>
        </Pressable>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: 48 },
  title: { color: colors.text, fontSize: 28, fontFamily: "SpaceGrotesk_700Bold" },
  sub: { color: colors.textMuted, fontFamily: "Outfit_500Medium" },
  streak: {
    color: colors.accent,
    fontFamily: "Outfit_700Bold",
    fontSize: 14,
  },
  hero: {
    backgroundColor: colors.bgElevated,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.accentDim,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  kicker: {
    color: colors.accent,
    fontFamily: "Outfit_700Bold",
    letterSpacing: 1.2,
    fontSize: 12,
  },
  clock: { color: colors.text, fontSize: 42, fontFamily: "SpaceGrotesk_700Bold" },
  meta: { color: colors.textMuted, fontFamily: "Outfit_500Medium" },
  when: { color: colors.text, fontFamily: "Outfit_500Medium", fontSize: 13 },
  barTrack: { height: 8, borderRadius: 999, backgroundColor: colors.line, overflow: "hidden", marginVertical: 8 },
  barFill: { height: "100%", backgroundColor: colors.accent },
  allowedBtn: { paddingVertical: 4 },
  allowedBtnText: { color: colors.accent, fontFamily: "Outfit_700Bold", fontSize: 13 },
  stageLegendTitle: {
    color: colors.textMuted,
    fontFamily: "Outfit_700Bold",
    fontSize: 12,
    marginTop: spacing.sm,
  },
  stageLegend: { color: colors.textMuted, fontFamily: "Outfit_500Medium", fontSize: 12, lineHeight: 18 },
  agoRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  agoChip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.bgSoft,
  },
  agoChipOn: { borderColor: colors.accent, backgroundColor: colors.accentDim },
  agoChipText: { color: colors.textMuted, fontFamily: "Outfit_700Bold", fontSize: 12 },
  agoChipTextOn: { color: colors.accent },
  hintSmall: { color: colors.textMuted, fontFamily: "Outfit_500Medium", fontSize: 12 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    padding: spacing.lg,
  },
  modalCard: {
    backgroundColor: colors.bgElevated,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.lg,
    gap: spacing.sm,
  },
  modalTitle: { color: colors.text, fontFamily: "Outfit_700Bold", fontSize: 18 },
  modalOk: { color: colors.accent, fontFamily: "Outfit_500Medium", lineHeight: 22 },
  modalWarn: { color: colors.warn, fontFamily: "Outfit_500Medium", lineHeight: 20, marginBottom: 8 },
  card: {
    backgroundColor: colors.bgElevated,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardTitle: { color: colors.text, fontFamily: "Outfit_700Bold", fontSize: 16 },
  label: { color: colors.textMuted, fontFamily: "Outfit_500Medium" },
  input: {
    backgroundColor: colors.bgSoft,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
  },
  sectionRow: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    flexWrap: "wrap",
    gap: 8,
    marginTop: spacing.sm,
  },
  section: { color: colors.text, fontFamily: "Outfit_700Bold", fontSize: 16 },
  sortRow: { flexDirection: "row", gap: 8 },
  sortChip: {
    paddingHorizontal: 10,
    paddingVertical: 6,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.bgSoft,
  },
  sortChipOn: { borderColor: colors.accent, backgroundColor: colors.accentDim },
  sortChipText: { color: colors.textMuted, fontFamily: "Outfit_700Bold", fontSize: 12 },
  sortChipTextOn: { color: colors.accent },
  hint: { color: colors.textMuted, fontFamily: "Outfit_500Medium" },
  histRow: {
    backgroundColor: colors.bgElevated,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.md,
    gap: 4,
  },
  histTitle: { color: colors.text, fontFamily: "Outfit_700Bold" },
  histMeta: { color: colors.textMuted, fontFamily: "Outfit_500Medium", fontSize: 12 },
});
