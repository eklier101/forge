import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { ActionButton } from "../src/components/ActionButton";
import { apiFetch } from "../src/lib/api";
import type { NutritionRecipe } from "../src/types/nutrition";
import { colors, spacing } from "../src/theme/colors";

export default function NutritionRecipesScreen() {
  const router = useRouter();
  const [recipes, setRecipes] = useState<NutritionRecipe[]>([]);
  const [name, setName] = useState("");
  const [ingredients, setIngredients] = useState("");
  const [servingsBase, setServingsBase] = useState("1");
  const [servingUnit, setServingUnit] = useState<"serving" | "g">("serving");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");
  const [busy, setBusy] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);

  const load = useCallback(async () => {
    const res = await apiFetch<{ recipes: NutritionRecipe[] }>("/nutrition/recipes");
    setRecipes(res.recipes);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load().catch(() => setMsg("Could not load recipes"));
    }, [load]),
  );

  async function create() {
    setBusy(true);
    setMsg(null);
    try {
      await apiFetch("/nutrition/recipes", {
        method: "POST",
        body: JSON.stringify({
          name: name.trim() || "Recipe",
          servingsBase: Number(servingsBase) || 1,
          servingUnit,
          calories: Number(calories) || 0,
          protein: Number(protein) || 0,
          carbs: Number(carbs) || 0,
          fat: Number(fat) || 0,
          ingredients: ingredients
            .split(/[\n,]/)
            .map((s) => s.trim())
            .filter(Boolean),
        }),
      });
      setName("");
      setIngredients("");
      setServingsBase("1");
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
    await apiFetch(`/nutrition/recipes/${encodeURIComponent(id)}`, { method: "DELETE" });
    await load();
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.top}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={colors.accent} />
        </Pressable>
        <Text style={styles.title}>Recipes</Text>
      </View>
      <Text style={styles.sub}>
        Save a meal once, then log how much you ate by servings or grams — macros scale automatically.
      </Text>
      {msg ? <Text style={styles.warn}>{msg}</Text> : null}

      <Text style={styles.label}>Name</Text>
      <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Meal prep bowl" placeholderTextColor={colors.textMuted} />
      <Text style={styles.label}>Ingredients (optional)</Text>
      <TextInput
        style={[styles.input, { minHeight: 70, textAlignVertical: "top" }]}
        multiline
        value={ingredients}
        onChangeText={setIngredients}
        placeholder="chicken, rice, broccoli"
        placeholderTextColor={colors.textMuted}
      />
      <Text style={styles.label}>Base amount</Text>
      <TextInput style={styles.input} keyboardType="numeric" value={servingsBase} onChangeText={setServingsBase} />
      <View style={styles.chips}>
        {(["serving", "g"] as const).map((u) => (
          <Pressable key={u} onPress={() => setServingUnit(u)} style={[styles.chip, servingUnit === u && styles.chipOn]}>
            <Text style={[styles.chipText, servingUnit === u && styles.chipTextOn]}>
              {u === "g" ? "Grams" : "Servings"}
            </Text>
          </Pressable>
        ))}
      </View>
      <Text style={styles.hint}>Macros below are for the full base amount.</Text>
      <Text style={styles.label}>Calories</Text>
      <TextInput style={styles.input} keyboardType="numeric" value={calories} onChangeText={setCalories} />
      <Text style={styles.label}>Protein</Text>
      <TextInput style={styles.input} keyboardType="numeric" value={protein} onChangeText={setProtein} />
      <Text style={styles.label}>Carbs</Text>
      <TextInput style={styles.input} keyboardType="numeric" value={carbs} onChangeText={setCarbs} />
      <Text style={styles.label}>Fat</Text>
      <TextInput style={styles.input} keyboardType="numeric" value={fat} onChangeText={setFat} />
      <ActionButton label="Add recipe" loading={busy} onPress={create} />

      {recipes.map((r) => (
        <View key={r.id} style={styles.row}>
          <View style={{ flex: 1 }}>
            <Text style={styles.name}>{r.name}</Text>
            <Text style={styles.meta}>
              {r.calories} kcal · P{r.protein} · per {r.servingsBase}
              {r.servingUnit === "g" ? "g" : " serving"}
            </Text>
            {r.ingredients?.length ? (
              <Text style={styles.meta}>{r.ingredients.join(", ")}</Text>
            ) : null}
          </View>
          <Pressable onPress={() => void remove(r.id)}>
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
  hint: { color: colors.textMuted, fontSize: 12, fontFamily: "Outfit_500Medium" },
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
  chips: { flexDirection: "row", gap: 8 },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 14,
    paddingVertical: 8,
    backgroundColor: colors.bgElevated,
  },
  chipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.text, fontFamily: "Outfit_700Bold" },
  chipTextOn: { color: colors.bg },
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
