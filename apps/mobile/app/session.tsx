import { useCallback, useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect, useLocalSearchParams, useRouter } from "expo-router";
import { RestTimer } from "../src/components/RestTimer";
import { ExerciseMedia } from "../src/components/ExerciseMedia";
import { BackLink } from "../src/components/ScreenChrome";
import { apiFetch } from "../src/lib/api";
import { defaultLoadUnit, loadUnitLabel, type LoadUnit } from "../src/lib/loadUnit";
import { NOTIF_IDS, startStickyNotification, stopStickyNotification } from "../src/lib/notifications";
import { syncNow } from "../src/lib/sync";
import {
  getActiveSession,
  getSession,
  lastWeightFor,
  listCachedExercises,
  saveSession,
  setActiveSessionId,
  toggleDislike,
  toggleFavorite,
} from "../src/lib/workout";
import { getPreferences } from "../src/db/local";
import { classifyEquipment, warmupLine, warmupSteps } from "../src/lib/warmupPlates";
import type { Exercise, SessionExercise, WorkoutSession } from "../src/types/workout";
import { colors, spacing } from "../src/theme/colors";

type Difficulty = NonNullable<SessionExercise["difficulty"]>;

type CircuitStep = { exIndex: number; setIndex: number };

function buildCircuitSteps(session: WorkoutSession): CircuitStep[] {
  const maxSets = Math.max(0, ...session.exercises.map((e) => e.sets.length));
  const steps: CircuitStep[] = [];
  for (let s = 0; s < maxSets; s++) {
    for (let e = 0; e < session.exercises.length; e++) {
      if (session.exercises[e]?.sets[s]) steps.push({ exIndex: e, setIndex: s });
    }
  }
  return steps;
}

function isEndOfCircuitRound(steps: CircuitStep[], exIndex: number, setIndex: number) {
  const inRound = steps.filter((s) => s.setIndex === setIndex);
  if (!inRound.length) return false;
  const last = inRound[inRound.length - 1];
  return last.exIndex === exIndex && last.setIndex === setIndex;
}

function nextOpenSetIndex(ex: SessionExercise): number {
  return ex.sets.findIndex((s) => !s.done);
}

export default function SessionScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ id?: string }>();
  const [session, setSession] = useState<WorkoutSession | null>(null);
  const [favorites, setFavorites] = useState<string[]>([]);
  const [disliked, setDisliked] = useState<string[]>([]);
  const [units, setUnits] = useState("lb");
  const [restToken, setRestToken] = useState(0);
  const [restSeconds, setRestSeconds] = useState(90);
  const [baseRestSeconds, setBaseRestSeconds] = useState(90);
  const [roundRestSeconds, setRoundRestSeconds] = useState(180);
  const [restLabel, setRestLabel] = useState("Rest timer");
  const [msg, setMsg] = useState("");
  const [exerciseMedia, setExerciseMedia] = useState<Record<string, Exercise>>({});
  const [catalog, setCatalog] = useState<Exercise[]>([]);
  const [progressionFocus, setProgressionFocus] = useState("balanced");
  const [ratingEx, setRatingEx] = useState<number | null>(null);
  const [editing, setEditing] = useState(false);
  const [addOpen, setAddOpen] = useState(false);
  const [addQuery, setAddQuery] = useState("");

  const circuitMode = Boolean(session?.circuitMode);

  const circuitSteps = useMemo(
    () => (session && circuitMode ? buildCircuitSteps(session) : []),
    [session, circuitMode],
  );

  const activeCircuitIndex = useMemo(() => {
    if (!session || !circuitMode) return 0;
    const idx = circuitSteps.findIndex(({ exIndex, setIndex }) => !session.exercises[exIndex]?.sets[setIndex]?.done);
    return idx === -1 ? Math.max(0, circuitSteps.length - 1) : idx;
  }, [session, circuitMode, circuitSteps]);

  const activeExerciseIndex = useMemo(() => {
    if (!session) return 0;
    if (circuitMode) {
      return circuitSteps[activeCircuitIndex]?.exIndex ?? 0;
    }
    const idx = session.exercises.findIndex((ex) => ex.started && ex.sets.some((s) => !s.done));
    if (idx >= 0) return idx;
    const anyOpen = session.exercises.findIndex((ex) => ex.sets.some((s) => !s.done));
    return anyOpen === -1 ? Math.max(0, session.exercises.length - 1) : anyOpen;
  }, [session, circuitMode, circuitSteps, activeCircuitIndex]);

  const load = useCallback(async () => {
    const prefs = await getPreferences();
    setFavorites(prefs.favoriteExerciseIds);
    setDisliked(prefs.dislikedExerciseIds);
    setUnits(prefs.units);
    setProgressionFocus(prefs.progressionFocus || "balanced");
    const base = prefs.restTimerSeconds || 90;
    setBaseRestSeconds(base);
    setRestSeconds(base);
    setRoundRestSeconds(Math.min(600, Math.max(base * 2, 120)));

    try {
      const res = await apiFetch<{ exercises: Exercise[] }>("/exercises");
      const map: Record<string, Exercise> = {};
      for (const ex of res.exercises) map[ex.id] = ex;
      setExerciseMedia(map);
      setCatalog(res.exercises);
      const { cacheExercises } = await import("../src/lib/workout");
      await cacheExercises(res.exercises);
    } catch {
      const cached = await listCachedExercises();
      const map: Record<string, Exercise> = {};
      for (const ex of cached) map[ex.id] = ex;
      setExerciseMedia(map);
      setCatalog(cached);
    }

    let current =
      (params.id ? await getSession(params.id) : null) ?? (await getActiveSession());
    if (!current) {
      setSession(null);
      return;
    }

    const next = { ...current, exercises: [...current.exercises] };
    for (let i = 0; i < next.exercises.length; i++) {
      const ex = { ...next.exercises[i], sets: next.exercises[i].sets.map((s) => ({ ...s })) };
      if (!ex.loadUnit) ex.loadUnit = defaultLoadUnit(ex.exerciseId);
      if (ex.sets.every((s) => !s.done && s.weight === 0)) {
        const last = await lastWeightFor(ex.exerciseId);
        if (last != null) {
          ex.sets = ex.sets.map((s) => ({ ...s, weight: last }));
        }
      }
      next.exercises[i] = ex;
    }
    setSession(next);
  }, [params.id]);

  useFocusEffect(
    useCallback(() => {
      load();
      return () => {
        /* keep sticky while navigating away mid-workout */
      };
    }, [load]),
  );

  useFocusEffect(
    useCallback(() => {
      if (session?.status === "active") {
        void startStickyNotification({
          id: NOTIF_IDS.workout,
          title: "Workout in progress",
          body: `${session.focus} · ${session.kind}${session.circuitMode ? " circuit" : ""} — swipe won’t clear for 24h`,
          data: { kind: "workout", sessionId: session.sessionId },
        });
      }
    }, [session?.sessionId, session?.status, session?.focus, session?.kind, session?.circuitMode]),
  );

  async function persist(next: WorkoutSession) {
    setSession(next);
    await saveSession(next);
  }

  function updateSet(exIndex: number, setIndex: number, patch: Partial<{ reps: number; weight: number }>) {
    if (!session) return;
    const next: WorkoutSession = {
      ...session,
      exercises: session.exercises.map((ex, i) => {
        if (i !== exIndex) return ex;
        return {
          ...ex,
          sets: ex.sets.map((s, j) => (j === setIndex ? { ...s, ...patch } : s)),
        };
      }),
    };
    void persist(next);
  }

  async function startExercise(exIndex: number) {
    if (!session) return;
    const next: WorkoutSession = {
      ...session,
      exercises: session.exercises.map((e, i) => (i === exIndex ? { ...e, started: true } : e)),
    };
    await persist(next);
  }

  function setLoadUnit(exIndex: number, loadUnit: LoadUnit) {
    if (!session) return;
    void persist({
      ...session,
      exercises: session.exercises.map((e, i) => (i === exIndex ? { ...e, loadUnit } : e)),
    });
  }

  async function removeExercise(exIndex: number) {
    if (!session || session.exercises.length <= 1) {
      setMsg("Keep at least one exercise");
      return;
    }
    const next: WorkoutSession = {
      ...session,
      exercises: session.exercises.filter((_, i) => i !== exIndex),
    };
    await persist(next);
  }

  async function addExercise(ex: Exercise) {
    if (!session) return;
    if (session.exercises.some((e) => e.exerciseId === ex.id)) {
      setMsg("Already in this workout");
      return;
    }
    const sets = 3;
    const reps = 10;
    const last = await lastWeightFor(ex.id);
    const added: SessionExercise = {
      exerciseId: ex.id,
      name: ex.name,
      targetSets: sets,
      targetReps: reps,
      restSeconds: baseRestSeconds,
      started: false,
      loadUnit: defaultLoadUnit(ex.id),
      sets: Array.from({ length: sets }, (_, i) => ({
        setIndex: i + 1,
        reps,
        weight: last ?? 0,
        done: false,
      })),
    };
    await persist({ ...session, exercises: [...session.exercises, added] });
    setAddOpen(false);
    setAddQuery("");
    setMsg(`Added ${ex.name}`);
  }

  async function addSet(exIndex: number) {
    if (!session) return;
    const ex = session.exercises[exIndex];
    const last = ex.sets[ex.sets.length - 1];
    const nextSet = {
      setIndex: ex.sets.length + 1,
      reps: last?.reps ?? ex.targetReps,
      weight: last?.weight ?? 0,
      done: false,
    };
    await persist({
      ...session,
      exercises: session.exercises.map((e, i) =>
        i === exIndex
          ? { ...e, targetSets: e.sets.length + 1, sets: [...e.sets, nextSet] }
          : e,
      ),
    });
  }

  async function removeLastOpenSet(exIndex: number) {
    if (!session) return;
    const ex = session.exercises[exIndex];
    if (ex.sets.length <= 1) return;
    const last = ex.sets[ex.sets.length - 1];
    if (last.done) return;
    await persist({
      ...session,
      exercises: session.exercises.map((e, i) =>
        i === exIndex
          ? { ...e, targetSets: e.sets.length - 1, sets: e.sets.slice(0, -1) }
          : e,
      ),
    });
  }

  async function completeSet(exIndex: number, setIndex: number) {
    if (!session) return;
    const ex = session.exercises[exIndex];
    const endOfRound = circuitMode && isEndOfCircuitRound(circuitSteps, exIndex, setIndex);
    const rest = endOfRound
      ? roundRestSeconds
      : ex.restSeconds && ex.restSeconds > 0
        ? Math.max(ex.restSeconds, baseRestSeconds)
        : baseRestSeconds;
    const next: WorkoutSession = {
      ...session,
      exercises: session.exercises.map((e, i) => {
        if (i !== exIndex) return e;
        return {
          ...e,
          started: true,
          sets: e.sets.map((s, j) =>
            j === setIndex
              ? { ...s, done: true, completedAt: new Date().toISOString() }
              : s,
          ),
        };
      }),
    };
    await persist(next);

    const remaining = next.exercises.some((e) => e.sets.some((s) => !s.done));
    const exerciseDone = next.exercises[exIndex].sets.every((s) => s.done);
    if (exerciseDone && !next.exercises[exIndex].difficulty) {
      setRatingEx(exIndex);
    }
    if (remaining) {
      setRestLabel(endOfRound ? "Round rest" : "Rest timer");
      setRestSeconds(rest);
      setRestToken((t) => t + 1);
    }
  }

  async function rateExercise(exIndex: number, difficulty: Difficulty) {
    if (!session) return;
    const next: WorkoutSession = {
      ...session,
      exercises: session.exercises.map((e, i) => (i === exIndex ? { ...e, difficulty } : e)),
    };
    await persist(next);
    setRatingEx(null);
  }

  async function finishWorkout() {
    if (!session) return;
    const needsRating = session.exercises.findIndex((e) => {
      const allDone = e.sets.every((s) => s.done);
      return allDone && e.sets.length > 0 && !e.difficulty;
    });
    if (needsRating >= 0) {
      setRatingEx(needsRating);
      setMsg("Rate each finished exercise before ending");
      return;
    }
    const completedAt = new Date().toISOString();
    const next: WorkoutSession = { ...session, status: "completed", completedAt };
    await persist(next);
    await setActiveSessionId(null);
    void stopStickyNotification(NOTIF_IDS.workout);
    void stopStickyNotification(NOTIF_IDS.rest);

    const payload = {
      sessionId: next.sessionId,
      kind: next.kind,
      completedAt,
      focus: next.focus,
      exercises: next.exercises.map((e) => ({
        exerciseId: e.exerciseId,
        difficulty: e.difficulty,
        sets: e.sets.filter((s) => s.done).map((s) => ({ reps: s.reps, weight: s.weight })),
      })),
    };
    try {
      await apiFetch("/events/workout-completed", { method: "POST", body: JSON.stringify(payload) });
      setMsg("Saved + synced");
    } catch {
      setMsg("Saved offline");
    }
    await syncNow();
    router.replace("/(tabs)/today");
  }

  async function onFav(exerciseId: string) {
    const prefs = await toggleFavorite(exerciseId);
    setFavorites(prefs.favoriteExerciseIds);
    setDisliked(prefs.dislikedExerciseIds);
    try {
      await apiFetch("/preferences", {
        method: "PATCH",
        body: JSON.stringify({
          favoriteExerciseIds: prefs.favoriteExerciseIds,
          dislikedExerciseIds: prefs.dislikedExerciseIds,
        }),
      });
    } catch {
      /* offline ok */
    }
  }

  async function onDislike(exerciseId: string) {
    const prefs = await toggleDislike(exerciseId);
    setFavorites(prefs.favoriteExerciseIds);
    setDisliked(prefs.dislikedExerciseIds);
    try {
      await apiFetch("/preferences", {
        method: "PATCH",
        body: JSON.stringify({
          favoriteExerciseIds: prefs.favoriteExerciseIds,
          dislikedExerciseIds: prefs.dislikedExerciseIds,
        }),
      });
    } catch {
      /* offline ok */
    }
  }

  const addCandidates = useMemo(() => {
    const q = addQuery.trim().toLowerCase();
    const inSession = new Set(session?.exercises.map((e) => e.exerciseId) ?? []);
    return catalog
      .filter((e) => !inSession.has(e.id))
      .filter((e) => !q || e.name.toLowerCase().includes(q) || e.muscleGroup.toLowerCase().includes(q))
      .slice(0, 40);
  }, [catalog, addQuery, session]);

  if (!session) {
    return (
      <View style={styles.root}>
        <Text style={styles.title}>No active session</Text>
        <Pressable style={styles.cta} onPress={() => router.back()}>
          <Text style={styles.ctaText}>Back</Text>
        </Pressable>
      </View>
    );
  }

  const doneCount = session.exercises.reduce((n, e) => n + e.sets.filter((s) => s.done).length, 0);
  const totalSets = session.exercises.reduce((n, e) => n + e.sets.length, 0);

  function renderSetRow(exIndex: number, setIndex: number, highlight: boolean) {
    if (!session) return null;
    const ex = session.exercises[exIndex];
    const s = ex?.sets[setIndex];
    if (!ex || !s) return null;
    const loadUnit = ex.loadUnit ?? defaultLoadUnit(ex.exerciseId);
    const eqKind = classifyEquipment(exerciseMedia[ex.exerciseId]?.equipment);
    const weightHint =
      loadUnit === "level"
        ? "lvl"
        : eqKind === "dumbbell"
          ? `${units}/ea`
          : eqKind === "barbell"
            ? `${units} tot`
            : units;
    return (
      <View key={`${ex.exerciseId}-${s.setIndex}`} style={[styles.setRow, s.done && styles.setDone, highlight && styles.setActive]}>
        <View style={{ flex: 1 }}>
          <Text style={styles.setLabel}>
            {circuitMode ? `${ex.name} · Set ${s.setIndex}` : `Set ${s.setIndex}${s.label ? ` · ${s.label}` : ""}`}
          </Text>
        </View>
        {!circuitMode || loadUnit === "level" || true ? (
          <>
            <TextInput
              style={styles.setInput}
              keyboardType="numeric"
              editable={!s.done}
              value={String(s.weight)}
              onChangeText={(v) => updateSet(exIndex, setIndex, { weight: Number(v) || 0 })}
            />
            <Text style={styles.unit}>{weightHint}</Text>
          </>
        ) : null}
        <TextInput
          style={styles.setInput}
          keyboardType="numeric"
          editable={!s.done}
          value={String(s.reps)}
          onChangeText={(v) => updateSet(exIndex, setIndex, { reps: Number(v) || 0 })}
        />
        <Text style={styles.unit}>reps</Text>
        {s.done ? (
          <Text style={styles.doneMark}>✓</Text>
        ) : (
          <Pressable style={styles.doneBtn} onPress={() => completeSet(exIndex, setIndex)}>
            <Text style={styles.doneBtnText}>Save</Text>
          </Pressable>
        )}
      </View>
    );
  }

  function renderExerciseCard(ex: SessionExercise, exIndex: number) {
    if (!session) return null;
    const isActive = exIndex === activeExerciseIndex;
    const fav = favorites.includes(ex.exerciseId);
    const bad = disliked.includes(ex.exerciseId);
    const loadUnit = ex.loadUnit ?? defaultLoadUnit(ex.exerciseId);
    const openIdx = nextOpenSetIndex(ex);
    const started = Boolean(ex.started) || ex.sets.some((s) => s.done);

    return (
      <View key={`${ex.exerciseId}-${exIndex}`} style={[styles.card, isActive && styles.cardActive]}>
        <View style={styles.cardHead}>
          <View style={{ flex: 1 }}>
            <Text style={styles.exName}>{ex.name}</Text>
            <Text style={styles.exMeta}>
              Target {ex.targetSets} × {ex.targetReps}
              {loadUnit === "level" ? " · pin level" : ""}
            </Text>
          </View>
          <Pressable style={styles.iconBtn} onPress={() => onFav(ex.exerciseId)}>
            <Text style={{ color: fav ? colors.accent : colors.textMuted }}>{fav ? "★" : "☆"}</Text>
          </Pressable>
          <Pressable style={styles.iconBtn} onPress={() => onDislike(ex.exerciseId)}>
            <Text style={{ color: bad ? colors.danger : colors.textMuted }}>✕</Text>
          </Pressable>
        </View>

        <ExerciseMedia
          compact
          showImages
          name={ex.name}
          imageStart={exerciseMedia[ex.exerciseId]?.imageStart}
          imageEnd={exerciseMedia[ex.exerciseId]?.imageEnd}
          instructions={exerciseMedia[ex.exerciseId]?.instructions}
        />

        <View style={styles.unitRow}>
          <Text style={styles.unitRowLabel}>Load as</Text>
          <Pressable
            style={[styles.chip, loadUnit === "level" && styles.chipOn]}
            onPress={() => setLoadUnit(exIndex, "level")}
          >
            <Text style={[styles.chipText, loadUnit === "level" && styles.chipTextOn]}>Level</Text>
          </Pressable>
          <Pressable
            style={[styles.chip, loadUnit === "weight" && styles.chipOn]}
            onPress={() => setLoadUnit(exIndex, "weight")}
          >
            <Text style={[styles.chipText, loadUnit === "weight" && styles.chipTextOn]}>
              {units.toUpperCase()}
            </Text>
          </Pressable>
        </View>

        {editing ? (
          <View style={styles.editRow}>
            <Pressable style={styles.ghostBtn} onPress={() => void addSet(exIndex)}>
              <Text style={styles.ghostBtnText}>+ Set</Text>
            </Pressable>
            <Pressable style={styles.ghostBtn} onPress={() => void removeLastOpenSet(exIndex)}>
              <Text style={styles.ghostBtnText}>− Set</Text>
            </Pressable>
            <Pressable style={[styles.ghostBtn, styles.dangerGhost]} onPress={() => void removeExercise(exIndex)}>
              <Text style={[styles.ghostBtnText, { color: colors.danger }]}>Remove</Text>
            </Pressable>
          </View>
        ) : null}

        {!started ? (
          <Pressable style={styles.startBtn} onPress={() => void startExercise(exIndex)}>
            <Text style={styles.startBtnText}>Start</Text>
          </Pressable>
        ) : (
          <>
            {ex.sets.map((s, setIndex) => {
              if (s.done) return renderSetRow(exIndex, setIndex, false);
              if (setIndex === openIdx) return renderSetRow(exIndex, setIndex, true);
              return null;
            })}
            {openIdx < 0 ? (
              <Text style={styles.exMeta}>All sets saved{ex.difficulty ? ` · ${ex.difficulty.replace("_", " ")}` : ""}</Text>
            ) : null}
          </>
        )}
      </View>
    );
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <BackLink label="Home" onPress={() => router.back()} />
      <Text style={styles.kicker}>
        {session.kind.toUpperCase()} · {session.focus}
        {circuitMode ? " · CIRCUIT" : ""}
      </Text>
      <Text style={styles.title}>In session</Text>
      <Text style={styles.meta}>
        {doneCount}/{totalSets} sets · {session.date}
        {circuitMode ? " · round-robin sets" : ""}
      </Text>

      <View style={styles.toolbar}>
        <Pressable style={[styles.ghostBtn, editing && styles.chipOn]} onPress={() => setEditing((v) => !v)}>
          <Text style={[styles.ghostBtnText, editing && styles.chipTextOn]}>
            {editing ? "Done editing" : "Edit workout"}
          </Text>
        </Pressable>
        {editing ? (
          <Pressable style={styles.ghostBtn} onPress={() => setAddOpen(true)}>
            <Text style={styles.ghostBtnText}>+ Exercise</Text>
          </Pressable>
        ) : null}
      </View>

      <RestTimer
        seconds={restSeconds}
        restartToken={restToken}
        autoStart={restToken > 0}
        label={restLabel}
        onDurationChange={(sec) => {
          setRestSeconds(sec);
          if (restLabel === "Round rest") setRoundRestSeconds(sec);
          else setBaseRestSeconds(sec);
        }}
      />

      {progressionFocus === "weight" &&
      session.exercises[activeExerciseIndex]?.started &&
      (session.exercises[activeExerciseIndex].loadUnit ??
        defaultLoadUnit(session.exercises[activeExerciseIndex].exerciseId)) === "weight" ? (
        <View style={styles.card}>
          <Text style={styles.exName}>
            Warmup
            {classifyEquipment(exerciseMedia[session.exercises[activeExerciseIndex].exerciseId]?.equipment) ===
            "dumbbell"
              ? " (each dumbbell)"
              : classifyEquipment(exerciseMedia[session.exercises[activeExerciseIndex].exerciseId]?.equipment) ===
                  "barbell"
                ? " (bar total)"
                : ""}
          </Text>
          {warmupSteps(
            session.exercises[activeExerciseIndex].sets[0]?.weight ?? 0,
            units === "kg" ? "kg" : "lb",
            exerciseMedia[session.exercises[activeExerciseIndex].exerciseId]?.equipment,
          ).map((w, i) => (
            <Text key={i} style={styles.exMeta}>
              {warmupLine(
                w,
                units === "kg" ? "kg" : "lb",
                exerciseMedia[session.exercises[activeExerciseIndex].exerciseId]?.equipment,
              )}
            </Text>
          ))}
        </View>
      ) : null}

      {ratingEx != null ? (
        <View style={styles.card}>
          <Text style={styles.exName}>How was {session.exercises[ratingEx]?.name}?</Text>
          <View style={styles.rateRow}>
            {(
              [
                ["too_easy", "Too easy"],
                ["normal", "Normal"],
                ["too_hard", "Too hard"],
                ["failed", "Failed"],
              ] as const
            ).map(([id, label]) => (
              <Pressable key={id} style={styles.rateBtn} onPress={() => void rateExercise(ratingEx, id)}>
                <Text style={styles.rateBtnText}>{label}</Text>
              </Pressable>
            ))}
          </View>
        </View>
      ) : null}

      {circuitMode ? (
        <View style={styles.card}>
          <Text style={styles.exName}>Circuit order</Text>
          <Text style={styles.exMeta}>
            Step {Math.min(activeCircuitIndex + 1, circuitSteps.length)} of {circuitSteps.length}
          </Text>
          {circuitSteps.map((step, i) => {
            const ex = session.exercises[step.exIndex];
            const isActive = i === activeCircuitIndex;
            const done = session.exercises[step.exIndex]?.sets[step.setIndex]?.done;
            if (!isActive && !done) return null;
            return (
              <View key={`c-${i}`} style={isActive ? styles.circuitActiveWrap : undefined}>
                {isActive ? (
                  <ExerciseMedia
                    compact
                    showImages
                    name={ex.name}
                    imageStart={exerciseMedia[ex.exerciseId]?.imageStart}
                    imageEnd={exerciseMedia[ex.exerciseId]?.imageEnd}
                    instructions={exerciseMedia[ex.exerciseId]?.instructions}
                  />
                ) : null}
                {done || isActive ? renderSetRow(step.exIndex, step.setIndex, isActive) : null}
              </View>
            );
          })}
        </View>
      ) : (
        session.exercises.map((ex, exIndex) => renderExerciseCard(ex, exIndex))
      )}

      <Pressable style={styles.cta} onPress={finishWorkout}>
        <Text style={styles.ctaText}>Finish workout</Text>
      </Pressable>
      {msg ? <Text style={styles.msg}>{msg}</Text> : null}

      <Modal visible={addOpen} animationType="slide" transparent onRequestClose={() => setAddOpen(false)}>
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.exName}>Add exercise</Text>
            <TextInput
              style={styles.search}
              placeholder="Search moves…"
              placeholderTextColor={colors.textMuted}
              value={addQuery}
              onChangeText={setAddQuery}
              autoFocus
            />
            <ScrollView style={{ maxHeight: 360 }}>
              {addCandidates.map((ex) => (
                <Pressable key={ex.id} style={styles.addRow} onPress={() => void addExercise(ex)}>
                  <Text style={styles.addName}>{ex.name}</Text>
                  <Text style={styles.exMeta}>
                    {ex.muscleGroup} · {loadUnitLabel(defaultLoadUnit(ex.id), units)}
                  </Text>
                </Pressable>
              ))}
            </ScrollView>
            <Pressable style={styles.ghostBtn} onPress={() => setAddOpen(false)}>
              <Text style={styles.ghostBtnText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: 48 },
  kicker: { color: colors.gym, letterSpacing: 2, fontFamily: "Outfit_700Bold", fontSize: 12 },
  title: { color: colors.text, fontSize: 28, fontFamily: "SpaceGrotesk_700Bold" },
  meta: { color: colors.textMuted, fontFamily: "Outfit_500Medium" },
  toolbar: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  card: {
    backgroundColor: colors.bgElevated,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardActive: { borderColor: colors.accentDim },
  cardHead: { flexDirection: "row", alignItems: "center", gap: 8 },
  exName: { color: colors.text, fontFamily: "Outfit_700Bold", fontSize: 17 },
  exMeta: { color: colors.textMuted, fontFamily: "Outfit_500Medium", marginTop: 2 },
  iconBtn: { padding: 8 },
  unitRow: { flexDirection: "row", alignItems: "center", gap: 8, flexWrap: "wrap" },
  unitRowLabel: { color: colors.textMuted, fontFamily: "Outfit_500Medium", fontSize: 12 },
  chip: {
    backgroundColor: colors.bgSoft,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderWidth: 1,
    borderColor: colors.line,
  },
  chipOn: { borderColor: colors.accent, backgroundColor: colors.bg },
  chipText: { color: colors.textMuted, fontFamily: "Outfit_700Bold", fontSize: 12 },
  chipTextOn: { color: colors.accent },
  editRow: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  ghostBtn: {
    backgroundColor: colors.bgSoft,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.line,
  },
  dangerGhost: { borderColor: colors.danger },
  ghostBtnText: { color: colors.text, fontFamily: "Outfit_700Bold", fontSize: 12 },
  startBtn: {
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: "center",
    marginTop: 4,
  },
  startBtnText: { color: colors.bg, fontFamily: "Outfit_700Bold", fontSize: 15 },
  circuitActiveWrap: {
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.accentDim,
    padding: 8,
    gap: 8,
    backgroundColor: colors.bgSoft,
  },
  setRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.bgSoft,
    borderRadius: 12,
    padding: 8,
  },
  setActive: { borderWidth: 1, borderColor: colors.accent },
  setDone: { opacity: 0.65 },
  setLabel: { color: colors.textMuted, fontFamily: "Outfit_500Medium", fontSize: 12, flexShrink: 1 },
  setInput: {
    minWidth: 52,
    backgroundColor: colors.bg,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: colors.line,
    color: colors.text,
    paddingHorizontal: 8,
    paddingVertical: 6,
    textAlign: "center",
    fontFamily: "Outfit_700Bold",
  },
  unit: { color: colors.textMuted, fontSize: 11, fontFamily: "Outfit_500Medium" },
  doneBtn: {
    marginLeft: "auto",
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  doneBtnText: { color: colors.bg, fontFamily: "Outfit_700Bold", fontSize: 12 },
  doneMark: { marginLeft: "auto", color: colors.accent, fontFamily: "Outfit_700Bold", fontSize: 18 },
  cta: {
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: "center",
  },
  ctaText: { color: colors.bg, fontFamily: "Outfit_700Bold", fontSize: 16 },
  msg: { color: colors.textMuted, textAlign: "center", fontFamily: "Outfit_500Medium" },
  rateRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 8 },
  rateBtn: {
    backgroundColor: colors.bgSoft,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
  },
  rateBtnText: { color: colors.text, fontFamily: "Outfit_700Bold", fontSize: 12 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: colors.bgElevated,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: spacing.lg,
    gap: spacing.sm,
    maxHeight: "85%",
  },
  search: {
    backgroundColor: colors.bgSoft,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: "Outfit_500Medium",
  },
  addRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
  addName: { color: colors.text, fontFamily: "Outfit_700Bold" },
});
