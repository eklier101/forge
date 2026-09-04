import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { ActionButton } from "../src/components/ActionButton";
import { apiFetch } from "../src/lib/api";
import type { NutritionPreset } from "../src/types/nutrition";
import { colors, spacing } from "../src/theme/colors";

export default function NutritionPresetsScreen() {
  const router = useRouter();
  const [presets, setPresets] = useState<NutritionPreset[]>([]);
  const [name, setName] = useState("");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await apiFetch<{ presets: NutritionPreset[] }>("/nutrition/presets");
    setPresets(res.presets);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load().catch(() => setMsg("Could not load presets"));
    }, [load]),
  );

  async function create() {
    setBusy(true);
    setMsg(null);
    try {
      await apiFetch("/nutrition/presets", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim() || "Preset",
          calories: Number(calories) || 0,
          protein: Number(protein) || 0,
          carbs: Number(carbs) || 0,
          fat: Number(fat) || 0,
        }),
      });
      setName("");
      setCalories("");
      setProtein("");
      setCarbs("");
      setFat("");
      await load();
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: string) {
    await apiFetch(`/nutrition/presets/${encodeURIComponent(id)}`, { method: "DELETE" });
    await load();
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.top}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={colors.accent} />
        </Pressable>
        <Text style={styles.title}>Presets</Text>
      </View>
      <Text style={styles.sub}>Quick-add meals with fixed macros.</Text>
      {msg ? <Text style={styles.warn}>{msg}</Text> : null}

      <Text style={styles.label}>Name</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Protein shake" placeholderTextColor={colors.textMuted} />
      <Text style={styles.label}>Calories</Text>
      <TextInput style={styles.input} keyboardType="numeric" value={calories} onChangeText={setCalories} />
      <Text style={styles.label}>Protein</Text>
      <TextInput style={styles.input} keyboardType="numeric" value={protein} onChangeText={setProtein} />
      <Text style={styles.label}>Carbs</Text>
      <TextInput style={styles.input} keyboardType="numeric" value={carbs} onChangeText={setCarbs} />
      <Text style={styles.label}>Fat</Text>
      <TextInput style={styles.input} keyboardType="numeric" value={fat} onChangeText={setFat} />
      <ActionButton label="Add preset" loading={busy} onPress={create} />

      {presets.map((p) => (
        <View key={p.id} style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{p.name}</Text>
            <Text style={styles.meta}>
              {p.calories} kcal · P{p.protein} C{p.carbs} F{p.fat}
            </Text>
          </View>
          <Pressable onPress={() => void remove(p.id)}>
            <Ionicons name="trash-outline" size={20} color={colors.danger} />
          </Pressable>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.sm, paddingBottom: 48 },
  top: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { color: colors.text, fontSize: 24, fontFamily: "SpaceGrotesk_700Bold" },
  sub: { color: colors.textMuted, fontFamily: "Outfit_500Medium" },
  warn: { color: colors.warn, fontFamily: "Outfit_700Bold" },
  label: { color: colors.textMuted, fontFamily: "Outfit_500Medium" },
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
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.bgSoft,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.md,
  },
  name: { color: colors.text, fontFamily: "Outfit_700Bold" },
  meta: { color: colors.textMuted, fontFamily: "Outfit_500Medium", fontSize: 12, marginTop: 2 },
});
