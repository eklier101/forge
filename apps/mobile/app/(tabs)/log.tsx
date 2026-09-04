import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { listLocalEntities } from "../../src/db/local";
import type { WorkoutSession } from "../../src/types/workout";
import { colors, spacing } from "../../src/theme/colors";

export default function LogScreen() {
  const router = useRouter();
  const [sessions, setSessions] = useState<WorkoutSession[]>([]);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        const rows = await listLocalEntities("workout_session");
        if (!alive) return;
        const parsed = rows
          .map((r) => r.payload as WorkoutSession)
          .filter((s) => s.status === "completed" || s.completedAt)
          .sort((a, b) => (b.completedAt ?? b.startedAt).localeCompare(a.completedAt ?? a.startedAt));
        setSessions(parsed);
      })();
      return () => {
        alive = false;
      };
    }, []),
  );

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content}>
      <Text style={styles.title}>Log</Text>
      <Text style={styles.sub}>Completed sessions with sets, weight, and reps.</Text>
      {sessions.length === 0 ? <Text style={styles.empty}>No sessions yet — start one from Today.</Text> : null}
      {sessions.map((s) => {
        const setLines = s.exercises
          ?.map((ex) => {
            const done = ex.sets?.filter((x) => x.done) ?? [];
            if (!done.length) return null;
            const detail = done.map((d) => `${d.weight}×${d.reps}`).join(", ");
            return `${ex.name}: ${detail}`;
          })
          .filter(Boolean)
          .join("\n");
        return (
          <View key={s.sessionId} style={styles.card}>
            <Text style={styles.kind}>
              {(s.kind ?? "gym").toUpperCase()} · {s.focus ?? "session"}
            </Text>
            <Text style={styles.meta}>
              {s.completedAt ? new Date(s.completedAt).toLocaleString() : s.date}
            </Text>
            {setLines ? <Text style={styles.sets}>{setLines}</Text> : null}
          </View>
        );
      })}
      <Pressable style={styles.link} onPress={() => router.push("/moves")}>
        <Text style={styles.linkText}>Browse moves →</Text>
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.md, paddingBottom: 40 },
  title: { color: colors.text, fontSize: 28, fontFamily: "SpaceGrotesk_700Bold" },
  sub: { color: colors.textMuted, fontFamily: "Outfit_500Medium" },
  empty: { color: colors.textMuted, marginTop: spacing.lg, fontFamily: "Outfit_500Medium" },
  card: {
    backgroundColor: colors.bgElevated,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.md,
    gap: 6,
  },
  kind: { color: colors.accent, fontFamily: "Outfit_700Bold" },
  meta: { color: colors.textMuted, fontFamily: "Outfit_500Medium", fontSize: 12 },
  sets: { color: colors.text, fontFamily: "Outfit_500Medium", marginTop: 4, lineHeight: 20 },
  link: { paddingVertical: spacing.sm },
  linkText: { color: colors.gym, fontFamily: "Outfit_700Bold" },
});
