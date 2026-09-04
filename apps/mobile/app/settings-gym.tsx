import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { ActionButton } from "../src/components/ActionButton";
import { EquipmentGrid } from "../src/components/EquipmentGrid";
import { WeightInventoryPicker } from "../src/components/WeightInventoryPicker";
import { getPreferences, savePreferences } from "../src/db/local";
import {
  DEFAULT_GYM_WEIGHTS,
  defaultWeekdaysForCount,
  type Preferences,
  type WeightInventory,
} from "../src/db/types";
import { apiFetch } from "../src/lib/api";
import { pullPreferences, pushPreferences, syncNow } from "../src/lib/sync";
import { colors, spacing } from "../src/theme/colors";

type SplitRow = { id: string; days: number; label: string; focuses: string[] };

export default function SettingsGymScreen() {
  const router = useRouter();
  const [gymEnabled, setGymEnabled] = useState(true);
  const [days, setDays] = useState(3);
  const [splitId, setSplitId] = useState("ppl_3");
  const [splitMode, setSplitMode] = useState<"auto" | "manual">("auto");
  const [equipment, setEquipment] = useState<string[]>([]);
  const [weights, setWeights] = useState<WeightInventory>({ ...DEFAULT_GYM_WEIGHTS });
  const [units, setUnits] = useState("lb");
  const [splits, setSplits] = useState<SplitRow[]>([]);
  const [suggested, setSuggested] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const load = useCallback(async () => {
    await pullPreferences();
    const prefs = await getPreferences();
    setGymEnabled(prefs.gymEnabled !== false);
    setDays(Math.min(7, Math.max(1, prefs.gymDaysPerWeek || 3)));
    setSplitId(prefs.splitId || "ppl_3");
    setSplitMode(prefs.splitMode === "manual" ? "manual" : "auto");
    setEquipment(prefs.gymEquipment?.length ? prefs.gymEquipment : prefs.ownedEquipment ?? []);
    setWeights(prefs.gymWeights ?? { ...DEFAULT_GYM_WEIGHTS });
    setUnits(prefs.units || "lb");
    try {
      const [splitRes, suggestRes] = await Promise.all([
        apiFetch<{ splits: SplitRow[] }>("/splits"),
        apiFetch<{ suggestedSplitId: string }>("/splits/suggest").catch(() => null),
      ]);
      setSplits(splitRes.splits);
      if (suggestRes) setSuggested(suggestRes.suggestedSplitId);
    } catch {
      /* offline */
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  function setDayCount(n: number) {
    setDays(Math.min(7, Math.max(1, n)));
  }

  function toggleEquipment(id: string) {
    setEquipment((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));
  }

  async function save() {
    setSaving(true);
    setMsg("Saving…");
    try {
      const current = await getPreferences();
      const gymDaysPerWeek = Math.min(7, Math.max(1, days));
      const gymEquipment = equipment.length ? equipment : ["bodyweight"];
      // Keep weekday pins if count matches; otherwise redistribute from count
      const gymWeekdays =
        current.gymWeekdays?.length === gymDaysPerWeek
          ? current.gymWeekdays
          : defaultWeekdaysForCount(gymDaysPerWeek);
      const prefs: Preferences = {
        ...current,
        gymEnabled,
        gymDaysPerWeek,
        gymWeekdays,
        splitId: splitMode === "auto" && suggested ? suggested : splitId,
        splitMode,
        gymEquipment,
        ownedEquipment: gymEquipment,
        gymWeights: weights,
      };
      if (splitMode === "auto" && suggested) setSplitId(suggested);
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

  const matchingSplits = splits.filter((s) => s.days === Math.min(7, Math.max(1, days)));

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Pressable onPress={() => router.back()}>
        <Text style={styles.back}>← Back</Text>
      </Pressable>
      <Text style={styles.title}>Gym</Text>
      <Text style={styles.sub}>Days per week, split, equipment, and weights</Text>
      {msg ? <Text style={styles.msg}>{msg}</Text> : null}

      <View style={styles.row}>
        <Text style={styles.label}>Gym workouts enabled</Text>
        <Switch
          value={gymEnabled}
          onValueChange={setGymEnabled}
          trackColor={{ false: colors.line, true: colors.accentDim }}
          thumbColor={gymEnabled ? colors.accent : colors.textMuted}
        />
      </View>
      <Text style={styles.hint}>Off = plan home or rest only. Pick which weekdays under You → Schedule.</Text>

      {gymEnabled ? (
        <>
          <Text style={styles.section}>Gym days per week</Text>
          <View style={styles.chips}>
            {[1, 2, 3, 4, 5, 6, 7].map((n) => (
              <Pressable key={n} style={[styles.chip, days === n && styles.chipOn]} onPress={() => setDayCount(n)}>
                <Text style={[styles.chipText, days === n && styles.chipTextOn]}>{n}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.hint}>
            {days} gym day{days === 1 ? "" : "s"} — auto-split follows this count. Pin exact weekdays in Schedule.
          </Text>

          <Text style={styles.section}>Training split</Text>
          <View style={styles.row}>
            <Text style={styles.label}>Auto-pick split</Text>
            <Switch
              value={splitMode === "auto"}
              onValueChange={(v) => setSplitMode(v ? "auto" : "manual")}
              trackColor={{ false: colors.line, true: colors.accentDim }}
              thumbColor={splitMode === "auto" ? colors.accent : colors.textMuted}
            />
          </View>
          <Text style={styles.hint}>
            Auto rotates PPL, upper/lower, bro, arms/delts, etc. from day count + favorites
            {suggested ? ` (now: ${suggested})` : ""}.
          </Text>
          {splitMode === "manual" ? (
            <View style={styles.chips}>
              {(matchingSplits.length ? matchingSplits : splits).map((s) => (
                <Pressable
                  key={s.id}
                  style={[styles.chip, splitId === s.id && styles.chipOn]}
                  onPress={() => setSplitId(s.id)}
                >
                  <Text style={[styles.chipText, splitId === s.id && styles.chipTextOn]}>{s.label}</Text>
                </Pressable>
              ))}
            </View>
          ) : null}

          <Text style={styles.section}>Gym equipment</Text>
          <Text style={styles.hint}>Only exercises that need this gear will be planned for gym days.</Text>
          <EquipmentGrid scope="gym" selected={equipment} onToggle={toggleEquipment} />
          <WeightInventoryPicker
            equipment={equipment}
            inventory={weights}
            units={units}
            includeBarbell
            onChange={setWeights}
          />
        </>
      ) : null}

      <ActionButton label="Save gym settings" loading={saving} onPress={save} />
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
  chips: { flexDirection: "row", gap: 8, flexWrap: "wrap" },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: colors.bgElevated,
  },
  chipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.text, fontFamily: "Outfit_700Bold", textTransform: "capitalize" },
  chipTextOn: { color: colors.bg },
});
