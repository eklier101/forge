import { Pressable, StyleSheet, Text, View } from "react-native";
import { METABOLIC_STAGES, stageForHours } from "../lib/fastingStages";
import { colors, spacing } from "../theme/colors";

type Props = {
  elapsedHours: number;
  /** Compact for Home card */
  compact?: boolean;
};

/** Metabolic fasting stage progress: 0–4 / 4–12 / 12–18 / 18–24. */
export function MetabolicStageBar({ elapsedHours, compact }: Props) {
  const { index, stage, progress } = stageForHours(elapsedHours);

  return (
    <View style={styles.wrap}>
      {!compact ? (
        <>
          <Text style={styles.title}>Metabolic stage</Text>
          <Text style={styles.label}>
            {stage.label} · {stage.hint}
          </Text>
        </>
      ) : (
        <Text style={styles.labelCompact}>
          {stage.short} · {stage.from}–{stage.to}h
        </Text>
      )}
      <View style={styles.row}>
        {METABOLIC_STAGES.map((s, i) => (
          <View key={s.id} style={styles.cell}>
            <View
              style={[
                styles.track,
                compact && styles.trackCompact,
                i < index && styles.done,
                i === index && styles.active,
              ]}
            >
              {i === index ? <View style={[styles.fill, { width: `${progress * 100}%` }]} /> : null}
            </View>
            {!compact ? (
              <>
                <Text style={[styles.cap, i === index && styles.capOn]}>{s.short}</Text>
                <Text style={[styles.range, i === index && styles.capOn]}>
                  {s.from}–{s.to}h
                </Text>
              </>
            ) : (
              <Text style={[styles.range, i === index && styles.capOn]}>{s.from}</Text>
            )}
          </View>
        ))}
      </View>
      {!compact ? (
        <Text style={styles.detail}>
          {stage.from}–{stage.to} hours: {stage.hint}
        </Text>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 6, marginVertical: 4 },
  title: {
    color: colors.textMuted,
    fontFamily: "Outfit_700Bold",
    fontSize: 11,
    letterSpacing: 0.8,
  },
  label: { color: colors.text, fontFamily: "Outfit_500Medium", fontSize: 13 },
  labelCompact: { color: colors.accent, fontFamily: "Outfit_700Bold", fontSize: 12 },
  row: { flexDirection: "row", gap: 6 },
  cell: { flex: 1, gap: 3 },
  track: {
    height: 10,
    borderRadius: 999,
    backgroundColor: colors.line,
    overflow: "hidden",
  },
  trackCompact: { height: 6 },
  done: { backgroundColor: colors.accentDim },
  active: { backgroundColor: colors.line },
  fill: { height: "100%", backgroundColor: colors.accent },
  cap: {
    color: colors.textMuted,
    fontFamily: "Outfit_700Bold",
    fontSize: 10,
    textAlign: "center",
  },
  range: {
    color: colors.textMuted,
    fontFamily: "Outfit_500Medium",
    fontSize: 9,
    textAlign: "center",
  },
  capOn: { color: colors.accent },
  detail: { color: colors.textMuted, fontFamily: "Outfit_500Medium", fontSize: 11, marginTop: 2 },
});
