import { useCallback, useEffect, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { CachedImage, prefetchExerciseImages } from "../../src/components/CachedImage";
import { ExerciseMedia } from "../../src/components/ExerciseMedia";
import { listLocalEntities, upsertLocalEntity } from "../../src/db/local";
import { apiFetch } from "../../src/lib/api";
import { localToday } from "../../src/lib/dates";
import { syncHealthConnectToServer } from "../../src/lib/healthConnect";
import { syncNow } from "../../src/lib/sync";
import {
  cacheExercises,
  getActiveSession,
  listCachedExercises,
  saveSession,
  setActiveSessionId,
} from "../../src/lib/workout";
import { createSessionFromPlan as buildSession } from "../../src/types/workout";
import type { DayPlan, Exercise, WorkoutSession } from "../../src/types/workout";
import { colors, spacing } from "../../src/theme/colors";

type ActivityDaily = {
  steps?: number;
  sleepMinutes?: number;
  calories?: number;
  restingHr?: number;
  bodyBattery?: number;
  source?: string;
};

type FastSession = {
  id: string;
  startedAt: string;
  endedAt?: string;
  targetHours?: number;
  status: "active" | "completed" | "cancelled";
  durationHours?: number;
};

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatSleep(minutes: number) {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${h}h ${m}m`;
}

function formatFastElapsed(startedAt: string, now: number) {
  const totalMin = Math.max(0, Math.floor((now - new Date(startedAt).getTime()) / 60000));
  const h = Math.floor(totalMin / 60);
  const m = totalMin % 60;
  return `${h}h ${String(m).padStart(2, "0")}m`;
}

export default function HomeScreen() {
  const router = useRouter();
  const [plan, setPlan] = useState<DayPlan | null>(null);
  const [active, setActive] = useState<WorkoutSession | null>(null);
  const [catalog, setCatalog] = useState<Record<string, Exercise>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [showMoves, setShowMoves] = useState(false);
  const [status, setStatus] = useState("Ready");
  const [offline, setOffline] = useState(false);
  const [activity, setActivity] = useState<ActivityDaily | null>(null);
  const [weightLabel, setWeightLabel] = useState<string | null>(null);
  const [fast, setFast] = useState<FastSession | null>(null);
  const [now, setNow] = useState(Date.now());
  const [refreshing, setRefreshing] = useState(false);
  const [hcSyncing, setHcSyncing] = useState(false);
  const [flipping, setFlipping] = useState(false);

  const dateLabel = useMemo(() => {
    const d = new Date();
    return `${WEEKDAYS[d.getDay()]} · ${MONTHS[d.getMonth()]} ${d.getDate()}`;
  }, []);

  const load = useCallback(async (opts?: { health?: boolean }) => {
    const existing = await getActiveSession();
    setActive(existing);

    const cachedEx = await listCachedExercises();
    if (cachedEx.length) {
      const map: Record<string, Exercise> = {};
      for (const e of cachedEx) map[e.id] = e;
      setCatalog(map);
    }

    const sync = await syncNow();
    setOffline(!!sync.offline);

    if (opts?.health !== false) {
      setHcSyncing(true);
      try {
        await syncHealthConnectToServer();
      } catch {
        /* ignore */
      } finally {
        setHcSyncing(false);
      }
    }

    try {
      const today = localToday();
      const [planRes, exRes, metrics, fastRes] = await Promise.all([
        apiFetch<{ plan: DayPlan[] }>(`/plan/week?from=${today}`),
        apiFetch<{ exercises: Exercise[] }>("/exercises").catch(() => null),
        apiFetch<{
          garmin: ActivityDaily | null;
          latestWeight: { weight?: number; units?: string; source?: string } | null;
        }>(`/metrics/today?date=${today}`).catch(() => null),
        apiFetch<{ active: FastSession | null }>("/fasting/active").catch(() => null),
      ]);

      if (metrics?.garmin) setActivity(metrics.garmin);
      else setActivity(null);

      if (metrics?.latestWeight?.weight != null) {
        const src = metrics.latestWeight.source;
        setWeightLabel(
          `${metrics.latestWeight.weight} ${metrics.latestWeight.units ?? "lb"}${
            src && src !== "manual" ? "" : ""
          }`,
        );
      } else {
        setWeightLabel(null);
      }

      setFast(fastRes?.active?.status === "active" ? fastRes.active : null);

      if (exRes?.exercises) {
        await cacheExercises(exRes.exercises);
        const map: Record<string, Exercise> = {};
        for (const e of exRes.exercises) map[e.id] = e;
        setCatalog(map);
      }

      const day = planRes.plan.find((d) => d.date === today) ?? planRes.plan[0] ?? null;
      if (day?.exercises?.length && exRes?.exercises) {
        const ids = new Set(day.exercises.map((e) => e.exerciseId));
        prefetchExerciseImages(
          exRes.exercises.filter((e) => ids.has(e.id)),
          40,
        );
      }
      setPlan(day);
      if (day) {
        await upsertLocalEntity({
          id: `plan-${day.date}`,
          entityType: "day_plan",
          payload: day,
          updatedAt: new Date().toISOString(),
        });
      }
      setStatus(sync.offline ? "Offline cache" : "Synced");
    } catch {
      const cached = await listLocalEntities("day_plan");
      const today = localToday();
      const hit = cached.find((c) => (c.payload as DayPlan).date === today) ?? cached[0];
      setPlan(hit ? (hit.payload as DayPlan) : null);
      setOffline(true);
      setStatus("Offline");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      void (async () => {
        await load();
        if (!alive) return;
      })();
      return () => {
        alive = false;
      };
    }, [load]),
  );

  // Health Connect poll every 15 minutes while Home is mounted
  useEffect(() => {
    const id = setInterval(() => {
      void (async () => {
        try {
          await syncHealthConnectToServer();
          const today = localToday();
          const metrics = await apiFetch<{
            garmin: ActivityDaily | null;
            latestWeight: { weight?: number; units?: string; source?: string } | null;
          }>(`/metrics/today?date=${today}`);
          if (metrics.garmin) setActivity(metrics.garmin);
          if (metrics.latestWeight?.weight != null) {
            setWeightLabel(`${metrics.latestWeight.weight} ${metrics.latestWeight.units ?? "lb"}`);
          }
        } catch {
          /* ignore */
        }
      })();
    }, 15 * 60 * 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (!fast || fast.status !== "active") return;
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, [fast]);

  async function onRefresh() {
    setRefreshing(true);
    try {
      await load({ health: true });
    } finally {
      setRefreshing(false);
    }
  }

  async function refreshHealth() {
    setHcSyncing(true);
    try {
      await syncHealthConnectToServer();
      const today = localToday();
      const metrics = await apiFetch<{
        garmin: ActivityDaily | null;
        latestWeight: { weight?: number; units?: string; source?: string } | null;
      }>(`/metrics/today?date=${today}`);
      if (metrics.garmin) setActivity(metrics.garmin);
      if (metrics.latestWeight?.weight != null) {
        setWeightLabel(`${metrics.latestWeight.weight} ${metrics.latestWeight.units ?? "lb"}`);
      }
      setStatus("Health refreshed");
    } catch {
      setStatus("Could not refresh health");
    } finally {
      setHcSyncing(false);
    }
  }

  async function flipLocation() {
    if (!plan || plan.kind === "rest") return;
    if (active?.status === "active") {
      setStatus("Finish or abandon the active workout first");
      return;
    }
    const nextKind = plan.kind === "gym" ? "home" : "gym";
    setFlipping(true);
    try {
      const today = localToday();
      const res = await apiFetch<{ day: DayPlan; plan?: DayPlan[] }>("/plan/set-kind", {
        method: "POST",
        body: JSON.stringify({ date: plan.date || today, kind: nextKind, from: today }),
      });
      setPlan(res.day);
      await upsertLocalEntity({
        id: `plan-${res.day.date}`,
        entityType: "day_plan",
        payload: res.day,
        updatedAt: new Date().toISOString(),
      });
      if (res.plan?.length) {
        for (const d of res.plan) {
          await upsertLocalEntity({
            id: `plan-${d.date}`,
            entityType: "day_plan",
            payload: d,
            updatedAt: new Date().toISOString(),
          });
        }
      }
      setShowMoves(true);
      setStatus(nextKind === "home" ? "Switched to home" : "Switched to gym");
    } catch (e) {
      setStatus(e instanceof Error ? e.message : "Could not switch");
    } finally {
      setFlipping(false);
    }
  }

  async function startWorkout() {
    if (!plan || plan.kind === "rest") return;
    if (active?.status === "active") {
      router.push({ pathname: "/session", params: { id: active.sessionId } });
      return;
    }
    const session = buildSession(plan);
    await saveSession(session);
    await setActiveSessionId(session.sessionId);
    router.push({ pathname: "/session", params: { id: session.sessionId } });
  }

  const kindColor =
    plan?.kind === "gym" ? colors.gym : plan?.kind === "home" ? colors.home : colors.rest;
  const kindTitle =
    plan?.kind === "gym" ? "Gym day" : plan?.kind === "home" ? "Home day" : plan?.kind === "rest" ? "Rest day" : "Loading…";
  const kindSub =
    plan?.kind === "rest"
      ? "Recovery — keep steps and sleep on track"
      : plan
        ? `${plan.focus === "home" ? "Full body" : plan.focus} · ${plan.exercises?.length ?? 0} moves · ~${
            plan.estimatedMinutes ?? plan.targetMinutes ?? "—"
          } min`
        : "Pulling today’s session";

  const flipLabel =
    plan?.kind === "gym" ? "Do home instead" : plan?.kind === "home" ? "Go to gym instead" : null;

  const fastProgress =
    fast?.status === "active" && fast.targetHours
      ? Math.min(1, (now - new Date(fast.startedAt).getTime()) / (fast.targetHours * 3600000))
      : 0;

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} colors={[colors.accent]} />
      }
    >
      <View style={styles.topRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.brand}>FORGE</Text>
          <Text style={styles.dateLine}>{dateLabel}</Text>
          <Text style={styles.meta}>
            {status}
            {offline ? " · offline" : ""}
          </Text>
        </View>
        <Pressable
          style={styles.iconBtn}
          onPress={() => void refreshHealth()}
          accessibilityLabel="Refresh Health Connect"
        >
          {hcSyncing ? (
            <ActivityIndicator color={colors.accent} size="small" />
          ) : (
            <Ionicons name="refresh" size={20} color={colors.accent} />
          )}
        </Pressable>
        <Pressable style={styles.logBtn} onPress={() => router.push("/log")} accessibilityLabel="Workout log">
          <Ionicons name="list" size={20} color={colors.bg} />
        </Pressable>
      </View>

      <View style={styles.metricRow}>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Steps</Text>
          <Text style={styles.metricValue}>
            {activity?.steps != null ? activity.steps.toLocaleString() : "—"}
          </Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Last night</Text>
          <Text style={styles.metricValue}>
            {activity?.sleepMinutes != null ? formatSleep(activity.sleepMinutes) : "—"}
          </Text>
        </View>
      </View>

      <View style={styles.metricRow}>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Weight</Text>
          <Text style={styles.metricValueSm}>{weightLabel ?? "—"}</Text>
        </View>
        <View style={styles.metricCard}>
          <Text style={styles.metricLabel}>Resting HR</Text>
          <Text style={styles.metricValueSm}>
            {activity?.restingHr != null ? `${activity.restingHr} bpm` : "—"}
          </Text>
        </View>
      </View>

      <View style={[styles.workoutCard, { borderColor: kindColor }]}>
        <Text style={[styles.kindPill, { color: kindColor }]}>{plan?.kind?.toUpperCase() ?? "…"}</Text>
        <Text style={styles.workoutTitle}>{kindTitle}</Text>
        <Text style={styles.workoutSub}>{kindSub}</Text>

        {plan && plan.kind !== "rest" ? (
          <View style={styles.workoutActions}>
            <Pressable style={styles.primaryBtn} onPress={startWorkout}>
              <Text style={styles.primaryBtnText}>
                {active?.status === "active" ? "Resume workout" : "Start workout"}
              </Text>
            </Pressable>
            <Pressable
              style={styles.secondaryBtn}
              onPress={() => setShowMoves((v) => !v)}
            >
              <Text style={styles.secondaryBtnText}>{showMoves ? "Hide moves" : "View moves"}</Text>
              <Ionicons name={showMoves ? "chevron-up" : "chevron-down"} size={16} color={colors.accent} />
            </Pressable>
          </View>
        ) : plan?.kind === "rest" ? (
          <View style={styles.workoutActions}>
            <Pressable style={styles.secondaryBtn} onPress={() => void flipLocation()} disabled={flipping}>
              {flipping ? (
                <ActivityIndicator color={colors.accent} />
              ) : (
                <Text style={styles.secondaryBtnText}>Train at home anyway</Text>
              )}
            </Pressable>
            <Pressable
              style={styles.secondaryBtn}
              onPress={async () => {
                setFlipping(true);
                try {
                  const today = localToday();
                  const res = await apiFetch<{ day: DayPlan }>("/plan/set-kind", {
                    method: "POST",
                    body: JSON.stringify({ date: plan.date || today, kind: "gym", from: today }),
                  });
                  setPlan(res.day);
                  setShowMoves(true);
                } finally {
                  setFlipping(false);
                }
              }}
            >
              <Text style={styles.secondaryBtnText}>Go to gym</Text>
            </Pressable>
          </View>
        ) : null}

        {flipLabel && plan?.kind !== "rest" ? (
          <Pressable style={styles.flipLink} onPress={() => void flipLocation()} disabled={flipping}>
            {flipping ? (
              <ActivityIndicator color={colors.accent} />
            ) : (
              <Text style={styles.flipText}>{flipLabel}</Text>
            )}
          </Pressable>
        ) : null}
      </View>

      <Pressable style={styles.fastCard} onPress={() => router.push("/fast")}>
        <View style={styles.fastTop}>
          <Text style={styles.fastTitle}>Fast</Text>
          <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
        </View>
        {fast?.status === "active" ? (
          <>
            <Text style={styles.fastValue}>
              {formatFastElapsed(fast.startedAt, now)}
              {fast.targetHours ? ` / ${fast.targetHours}h` : ""}
            </Text>
            <View style={styles.progressTrack}>
              <View style={[styles.progressFill, { width: `${Math.round(fastProgress * 100)}%` }]} />
            </View>
            <Text style={styles.fastHint}>In progress — tap to manage</Text>
          </>
        ) : (
          <>
            <Text style={styles.fastValue}>Not fasting</Text>
            <Text style={styles.fastHint}>Tap to start a fast</Text>
          </>
        )}
      </Pressable>

      {showMoves && plan?.exercises?.length ? (
        <View style={styles.movesBlock}>
          <Text style={styles.movesHeading}>Today’s moves</Text>
          {plan.exercises.map((ex) => {
            const media = catalog[ex.exerciseId];
            const isOpen = expanded === ex.exerciseId;
            return (
              <Pressable
                key={ex.exerciseId}
                style={styles.row}
                onPress={() => setExpanded(isOpen ? null : ex.exerciseId)}
              >
                <View style={styles.rowTop}>
                  {media?.imageStart ? (
                    <CachedImage
                      uri={media.imageStart}
                      style={styles.thumb}
                      recyclingKey={`today-${ex.exerciseId}`}
                    />
                  ) : (
                    <View style={[styles.thumb, styles.thumbEmpty]} />
                  )}
                  <View style={{ flex: 1 }}>
                    <Text style={styles.exName}>{ex.name}</Text>
                    <Text style={styles.exMeta}>
                      {ex.sets} × {ex.reps}
                      {ex.suggestedWeight != null && ex.suggestedWeight > 0
                        ? ` · suggest ${ex.suggestedWeight}`
                        : ""}
                      {media?.imageStart ? " · tap for how-to" : ""}
                    </Text>
                  </View>
                </View>
                {isOpen ? (
                  <ExerciseMedia
                    name={ex.name}
                    imageStart={media?.imageStart}
                    imageEnd={media?.imageEnd}
                    instructions={media?.instructions}
                  />
                ) : null}
              </Pressable>
            );
          })}
          {plan.kind !== "rest" ? (
            <Pressable style={styles.primaryBtn} onPress={startWorkout}>
              <Text style={styles.primaryBtnText}>
                {active?.status === "active" ? "Resume workout" : "Start workout"}
              </Text>
            </Pressable>
          ) : null}
        </View>
      ) : null}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: 48 },
  topRow: { flexDirection: "row", alignItems: "flex-start", gap: 10 },
  brand: {
    color: colors.accent,
    fontSize: 34,
    fontFamily: "SpaceGrotesk_700Bold",
    letterSpacing: 1,
  },
  dateLine: { color: colors.text, fontFamily: "Outfit_700Bold", fontSize: 15, marginTop: 2 },
  meta: { color: colors.textMuted, fontFamily: "Outfit_500Medium", fontSize: 12, marginTop: 2 },
  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.bgElevated,
    alignItems: "center",
    justifyContent: "center",
  },
  logBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    backgroundColor: colors.accent,
    alignItems: "center",
    justifyContent: "center",
  },
  metricRow: { flexDirection: "row", gap: 10 },
  metricCard: {
    flex: 1,
    backgroundColor: colors.bgElevated,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: 14,
    paddingHorizontal: 14,
    minHeight: 78,
  },
  metricLabel: {
    color: colors.textMuted,
    fontFamily: "Outfit_500Medium",
    fontSize: 12,
    letterSpacing: 0.4,
    textTransform: "uppercase",
  },
  metricValue: {
    color: colors.text,
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 26,
    marginTop: 6,
  },
  metricValueSm: {
    color: colors.text,
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 20,
    marginTop: 8,
  },
  workoutCard: {
    backgroundColor: colors.bgSoft,
    borderRadius: 20,
    borderWidth: 1.5,
    padding: spacing.lg,
    gap: 8,
  },
  kindPill: {
    fontFamily: "Outfit_700Bold",
    fontSize: 12,
    letterSpacing: 2,
  },
  workoutTitle: {
    color: colors.text,
    fontSize: 28,
    fontFamily: "SpaceGrotesk_700Bold",
  },
  workoutSub: {
    color: colors.textMuted,
    fontFamily: "Outfit_500Medium",
    marginBottom: 4,
  },
  workoutActions: { gap: 10, marginTop: 6 },
  primaryBtn: {
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: "center",
  },
  primaryBtnText: { color: colors.bg, fontFamily: "Outfit_700Bold", fontSize: 16 },
  secondaryBtn: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: 12,
    paddingHorizontal: 16,
    alignItems: "center",
    justifyContent: "center",
    flexDirection: "row",
    gap: 6,
    backgroundColor: colors.bgElevated,
  },
  secondaryBtnText: { color: colors.accent, fontFamily: "Outfit_700Bold", fontSize: 14 },
  flipLink: { alignSelf: "flex-start", paddingVertical: 4 },
  flipText: { color: colors.textMuted, fontFamily: "Outfit_500Medium", fontSize: 13 },
  fastCard: {
    backgroundColor: colors.bgElevated,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.md,
    gap: 6,
  },
  fastTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  fastTitle: { color: colors.textMuted, fontFamily: "Outfit_700Bold", fontSize: 12, letterSpacing: 1 },
  fastValue: { color: colors.text, fontFamily: "SpaceGrotesk_700Bold", fontSize: 24 },
  fastHint: { color: colors.textMuted, fontFamily: "Outfit_500Medium", fontSize: 13 },
  progressTrack: {
    height: 6,
    borderRadius: 999,
    backgroundColor: colors.line,
    overflow: "hidden",
    marginTop: 4,
  },
  progressFill: {
    height: "100%",
    backgroundColor: colors.accent,
    borderRadius: 999,
  },
  movesBlock: { gap: spacing.sm, marginTop: 4 },
  movesHeading: {
    color: colors.text,
    fontFamily: "Outfit_700Bold",
    fontSize: 16,
  },
  row: {
    backgroundColor: colors.bgSoft,
    borderRadius: 14,
    padding: spacing.md,
    borderWidth: 1,
    borderColor: colors.line,
  },
  rowTop: { flexDirection: "row", alignItems: "center", gap: 12 },
  thumb: { width: 64, height: 64, borderRadius: 12, backgroundColor: colors.bgElevated },
  thumbEmpty: { borderWidth: 1, borderColor: colors.line },
  exName: { color: colors.text, fontFamily: "Outfit_700Bold", fontSize: 16 },
  exMeta: { color: colors.textMuted, marginTop: 4, fontFamily: "Outfit_500Medium" },
});
