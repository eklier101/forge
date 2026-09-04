import { useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useRouter } from "expo-router";
import { ActionButton } from "../src/components/ActionButton";
import { BodyTypePicker } from "../src/components/BodyTypePicker";
import { getPreferences, savePreferences } from "../src/db/local";
import { pushPreferences } from "../src/lib/sync";
import { colors, spacing } from "../src/theme/colors";

/**
 * First-run profile: units, height + current/goal body type after account creation.
 */
export default function SetupProfileScreen() {
  const router = useRouter();
  const [units, setUnits] = useState<"lb" | "kg">("lb");
  const [heightCm, setHeightCm] = useState("");
  const [heightFt, setHeightFt] = useState("5");
  const [heightIn, setHeightIn] = useState("10");
  const [currentType, setCurrentType] = useState<string | null>(null);
  const [goalType, setGoalType] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  function resolveHeightCm(): number | null {
    if (units === "kg") {
      const cm = Number(heightCm);
      return cm >= 100 && cm <= 250 ? Math.round(cm) : null;
    }
    const ft = Number(heightFt) || 0;
    const inch = Number(heightIn) || 0;
    const cm = Math.round((ft * 12 + inch) * 2.54);
    return cm >= 100 && cm <= 250 ? cm : null;
  }

  async function finish() {
    setError(null);
    const cm = resolveHeightCm();
    if (!cm) {
      setError("Enter a valid height");
      return;
    }
    if (!currentType || !goalType) {
      setError("Select where you are and where you want to be");
      return;
    }
    setBusy(true);
    try {
      const prefs = await getPreferences();
      const next = {
        ...prefs,
        units,
        heightCm: cm,
        bodyTypeCurrent: currentType,
        bodyTypeGoal: goalType,
      };
      await savePreferences(next);
      try {
        await pushPreferences(next);
      } catch {
        /* offline — local prefs still set */
      }
      router.replace("/(tabs)/today");
    } catch (e) {
      setError(e instanceof Error ? e.message : "Could not save");
      setBusy(false);
    }
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Text style={styles.brand}>FORGE</Text>
      <Text style={styles.title}>Quick setup</Text>
      <Text style={styles.sub}>
        Units, height, and body type. You can change these anytime in Account.
      </Text>

      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Text style={styles.section}>Units</Text>
      <View style={styles.chips}>
        {(
          [
            { id: "lb" as const, label: "Imperial (lb / ft)" },
            { id: "kg" as const, label: "Metric (kg / cm)" },
          ] as const
        ).map((u) => (
          <Pressable key={u.id} onPress={() => setUnits(u.id)} style={[styles.chip, units === u.id && styles.chipOn]}>
            <Text style={[styles.chipText, units === u.id && styles.chipTextOn]}>{u.label}</Text>
          </Pressable>
        ))}
      </View>

      <Text style={styles.section}>Height</Text>
      {units === "kg" ? (
        <TextInput
          style={styles.input}
          keyboardType="numeric"
          value={heightCm}
          onChangeText={setHeightCm}
          placeholder="175 cm"
          placeholderTextColor={colors.textMuted}
        />
      ) : (
        <View style={styles.row2}>
          <TextInput
            style={[styles.input, { flex: 1 }]}
            keyboardType="numeric"
            value={heightFt}
            onChangeText={setHeightFt}
            placeholder="ft"
            placeholderTextColor={colors.textMuted}
          />
          <TextInput
            style={[styles.input, { flex: 1 }]}
            keyboardType="numeric"
            value={heightIn}
            onChangeText={setHeightIn}
            placeholder="in"
            placeholderTextColor={colors.textMuted}
          />
        </View>
      )}

      <BodyTypePicker
        title="Where you are now"
        value={currentType}
        onChange={setCurrentType}
        collapseWhenSet={false}
      />
      <BodyTypePicker
        title="Where you want to be"
        value={goalType}
        onChange={setGoalType}
        collapseWhenSet={false}
      />

      <ActionButton label="Continue" loading={busy} onPress={finish} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.sm, paddingBottom: 56 },
  brand: { color: colors.accent, fontFamily: "SpaceGrotesk_700Bold", fontSize: 28, letterSpacing: 1 },
  title: { color: colors.text, fontSize: 26, fontFamily: "SpaceGrotesk_700Bold" },
  sub: { color: colors.textMuted, fontFamily: "Outfit_500Medium", marginBottom: 8 },
  error: { color: colors.danger, fontFamily: "Outfit_700Bold" },
  section: { color: colors.text, fontFamily: "Outfit_700Bold", fontSize: 15, marginTop: spacing.md },
  input: {
    backgroundColor: colors.bgElevated,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontFamily: "Outfit_500Medium",
  },
  row2: { flexDirection: "row", gap: 10 },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: colors.bgElevated,
  },
  chipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.text, fontFamily: "Outfit_700Bold", fontSize: 13 },
  chipTextOn: { color: colors.bg },
});
