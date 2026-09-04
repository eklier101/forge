import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { ActionButton } from "../src/components/ActionButton";
import { EquipmentGrid } from "../src/components/EquipmentGrid";
import { WeightInventoryPicker } from "../src/components/WeightInventoryPicker";
import { getPreferences, savePreferences } from "../src/db/local";
import { DEFAULT_HOME_WEIGHTS, type Preferences, type WeightInventory } from "../src/db/types";
import { pullPreferences, pushPreferences, syncNow } from "../src/lib/sync";
import { colors, spacing } from "../src/theme/colors";

export default function SettingsHomeScreen() {
  const router = useRouter();
  const [homeEnabled, setHomeEnabled] = useState(true);
  const [equipment, setEquipment] = useState<string[]>([]);
  const [weights, setWeights] = useState<WeightInventory>({ ...DEFAULT_HOME_WEIGHTS });
  const [units, setUnits] = useState("lb");
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    await pullPreferences();
    const prefs = await getPreferences();
    setHomeEnabled(prefs.homeWorkoutsEnabled !== false);
    setEquipment(prefs.homeEquipment?.length ? prefs.homeEquipment : ["bodyweight"]);
    setWeights(prefs.homeWeights ?? { ...DEFAULT_HOME_WEIGHTS });
    setUnits(prefs.units || "lb");
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  function toggleEquipment(id: string) {
    setEquipment((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function save() {
    setSaving(true);
    setMsg("Saving…");
    try {
      const current = await getPreferences();
      const homeEquipment = equipment.length ? equipment : ["bodyweight"];
      const prefs: Preferences = {
        ...current,
        homeWorkoutsEnabled: homeEnabled,
        homeEquipment,
        homeWeights: weights,
      };
      await savePreferences(prefs);
      try {
        await pushPreferences(prefs);
        setMsg("Saved — plan rebuilt ✓");
      } catch {
        setMsg("Saved on device — will sync later");
      }
      await syncNow();
      await load();
    } finally {
      setSaving(false);
    }
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Pressable onPress={() => router.back()}>
        <Text style={styles.back}>← Back</Text>
      </Pressable>
      <Text style={styles.title}>Home</Text>
      <Text style={styles.sub}>Off-day workouts, gear, and the weights you own</Text>
      {msg ? <Text style={styles.msg}>{msg}</Text> : null}

      <View style={styles.row}>
        <Text style={styles.label}>Home workouts enabled</Text>
        <Switch
          value={homeEnabled}
          onValueChange={setHomeEnabled}
          trackColor={{ false: colors.line, true: colors.accentDim }}
          thumbColor={homeEnabled ? colors.accent : colors.textMuted}
        />
      </View>
      <Text style={styles.hint}>
        When on, non-gym days become home sessions. When off, those days are rest.
      </Text>

      {homeEnabled ? (
        <>
          <Text style={styles.section}>Home equipment</Text>
          <Text style={styles.hint}>Turn on what you actually have — plans stick to this list.</Text>
          <EquipmentGrid scope="home" selected={equipment} onToggle={toggleEquipment} />
          <WeightInventoryPicker
            equipment={equipment}
            inventory={weights}
            units={units}
            onChange={setWeights}
          />
        </>
      ) : null}

      <ActionButton label="Save home settings" loading={saving} onPress={save} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.sm, paddingBottom: 48 },
  back: { color: colors.accent, fontFamily: "Outfit_700Bold", marginBottom: spacing.sm },
  title: { color: colors.text, fontSize: 28, fontFamily: "SpaceGrotesk_700Bold" },
  sub: { color: colors.textMuted, fontFamily: "Outfit_500Medium", marginBottom: spacing.sm },
  msg: { color: colors.accent, fontFamily: "Outfit_700Bold" },
  section: { color: colors.text, fontFamily: "SpaceGrotesk_700Bold", fontSize: 18, marginTop: spacing.md },
  label: { color: colors.textMuted, fontFamily: "Outfit_500Medium" },
  hint: { color: colors.textMuted, fontSize: 12, fontFamily: "Outfit_500Medium" },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
});
