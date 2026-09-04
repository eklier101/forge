import { useCallback, useState } from "react";
import { ActivityIndicator, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { CachedImage } from "../../src/components/CachedImage";
import { listLocalEntities, upsertLocalEntity } from "../../src/db/local";
import { apiFetch } from "../../src/lib/api";
import { listCachedExercises } from "../../src/lib/workout";
import type { DayPlan, Exercise, PlannedExercise } from "../../src/types/workout";
import { colors, spacing } from "../../src/theme/colors";

const WEEKDAYS = ["Sunday", "Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday"];
const MONTHS = ["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"];

function formatPlanDate(isoDate: string): string {
  const parts = isoDate.slice(0, 10).split("-").map(Number);
  if (parts.length !== 3 || parts.some((n) => !n)) return isoDate;
  const [y, m, d] = parts;
  const dt = new Date(y, m - 1, d);
  if (Number.isNaN(dt.getTime())) return isoDate;
  return `${WEEKDAYS[dt.getDay()]}, ${MONTHS[dt.getMonth()]} ${dt.getDate()}`;
}

export default function PlanScreen() {
  const [days, setDays] = useState<DayPlan[]>([]);
  const [catalog, setCatalog] = useState<Record<string, Exercise>>({});
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [swapping, setSwapping] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);

  const cacheDays = useCallback(async (plan: DayPlan[]) => {
    for (const day of plan) {
      await upsertLocalEntity({
        id: `plan-${day.date}`,
        entityType: "day_plan",
        payload: day,
        updatedAt: new Date().toISOString(),
      });
    }
  }, []);

  const load = useCallback(async () => {
    const cachedEx = await listCachedExercises();
    if (cachedEx.length) {
      const map: Record<string, Exercise> = {};
      for (const e of cachedEx) map[e.id] = e;
      setCatalog(map);
    }

    try {
      const [planRes, exRes] = await Promise.all([
        apiFetch<{ plan: DayPlan[] }>("/plan/week"),
        apiFetch<{ exercises: Exercise[] }>("/exercises").catch(() => null),
      ]);
      if (exRes?.exercises) {
        const map: Record<string, Exercise> = {};
        for (const e of exRes.exercises) map[e.id] = e;
        setCatalog(map);
      }
      setDays(planRes.plan);
      await cacheDays(planRes.plan);
      setMsg(null);
    } catch {
      const cached = await listLocalEntities("day_plan");
      setDays(
        cached
          .map((c) => c.payload as DayPlan)
          .sort((a, b) => a.date.localeCompare(b.date)),
      );
      setMsg("Offline — showing cached week");
    }
  }, [cacheDays]);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function regenerate() {
    setBusy(true);
    setMsg(null);
    try {
      const res = await apiFetch<{ plan: DayPlan[] }>("/plan/regenerate", { method: "POST" });
      setDays(res.plan);
      await cacheDays(res.plan);
      setExpanded(null);
      setMsg("New week generated");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Could not regenerate");
    } finally {
      setBusy(false);
    }
  }

  async function swap(date: string, exerciseId: string) {
    const key = `${date}:${exerciseId}`;
    setSwapping(key);
    setMsg(null);
    try {
      const res = await apiFetch<{ plan: DayPlan[]; day: DayPlan }>("/plan/swap", {
        method: "POST",
        body: JSON.stringify({ date, exerciseId }),
      });
      setDays(res.plan);
      await cacheDays(res.plan);
      setMsg("Exercise swapped");
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "No alternate available");
    } finally {
      setSwapping(null);
    }
  }

  function renderExercise(day: DayPlan, ex: PlannedExercise) {
    const media = catalog[ex.exerciseId];
    const key = `${day.date}:${ex.exerciseId}`;
    const isSwapping = swapping === key;
    return (
      <View key={ex.exerciseId} style={styles.exRow}>
        {media?.imageStart ? (
          <CachedImage uri={media.imageStart} style={styles.thumb} recyclingKey={`plan-${ex.exerciseId}`} />
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
          </Text>
        </View>
        {day.kind !== "rest" ? (
          <Pressable
            style={styles.swapBtn}
            disabled={!!swapping}
            onPress={() => void swap(day.date, ex.exerciseId)}
          >
            {isSwapping ? (
              <ActivityIndicator size="small" color={colors.accent} />
            ) : (
              <Text style={styles.swapText}>Swap</Text>
            )}
          </Pressable>
        ) : null}
      </View>
    );
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Week plan</Text>
      <Text style={styles.sub}>
        Built from your gym days, split, and equipment. Tap a day for details — swap moves or rebuild the week.
      </Text>

      <Pressable style={[styles.regen, busy && styles.regenBusy]} onPress={() => void regenerate()} disabled={busy}>
        {busy ? (
          <ActivityIndicator color={colors.bg} />
        ) : (
          <Text style={styles.regenText}>Regenerate week</Text>
        )}
      </Pressable>

      {msg ? <Text style={styles.msg}>{msg}</Text> : null}

      {days.map((d) => {
        const open = expanded === d.date;
        return (
          <View key={d.date} style={styles.card}>
            <Pressable onPress={() => setExpanded(open ? null : d.date)}>
              <Text style={styles.date}>{formatPlanDate(d.date)}</Text>
              <Text
                style={[
                  styles.kind,
                  {
                    color:
                      d.kind === "gym" ? colors.gym : d.kind === "home" ? colors.home : colors.rest,
                  },
                ]}
              >
                {d.kind.toUpperCase()} · {d.focus}
              </Text>
              {!open ? (
                <Text style={styles.meta} numberOfLines={2}>
                  {d.exercises.length ? d.exercises.map((e) => e.name).join(" · ") : "Rest / blank"}
                </Text>
              ) : null}
            </Pressable>
            {open ? (
              <View style={styles.detail}>
                {d.exercises.length ? (
                  d.exercises.map((ex) => renderExercise(d, ex))
                ) : (
                  <Text style={styles.meta}>Rest day — no programmed work.</Text>
                )}
              </View>
            ) : null}
          </View>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: 40 },
  title: { color: colors.text, fontSize: 28, fontFamily: "SpaceGrotesk_700Bold" },
  sub: { color: colors.textMuted, fontFamily: "Outfit_500Medium", marginBottom: spacing.sm },
  regen: {
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingVertical: 12,
    alignItems: "center",
  },
  regenBusy: { opacity: 0.7 },
  regenText: { color: colors.bg, fontFamily: "Outfit_700Bold", fontSize: 15 },
  msg: { color: colors.textMuted, fontFamily: "Outfit_500Medium", fontSize: 13 },
  card: {
    backgroundColor: colors.bgElevated,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.md,
    gap: 4,
  },
  date: { color: colors.textMuted, fontFamily: "Outfit_500Medium" },
  kind: { fontFamily: "Outfit_700Bold", fontSize: 16 },
  meta: { color: colors.text, fontFamily: "Outfit_500Medium", marginTop: 4 },
  detail: { marginTop: spacing.sm, gap: spacing.sm },
  exRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.bgSoft,
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: colors.line,
  },
  thumb: { width: 48, height: 48, borderRadius: 10, backgroundColor: colors.bgElevated },
  thumbEmpty: { borderWidth: 1, borderColor: colors.line },
  exName: { color: colors.text, fontFamily: "Outfit_700Bold", fontSize: 14 },
  exMeta: { color: colors.textMuted, fontFamily: "Outfit_500Medium", fontSize: 12, marginTop: 2 },
  swapBtn: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    minWidth: 64,
    alignItems: "center",
  },
  swapText: { color: colors.accent, fontFamily: "Outfit_700Bold", fontSize: 12 },
});
