import { useCallback, useEffect, useState } from "react";
import {
  KeyboardAvoidingView,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import * as ImagePicker from "expo-image-picker";
import { ActionButton } from "./ActionButton";
import { InAppCameraModal } from "./InAppCameraModal";
import { apiFetch } from "../lib/api";
import type { NutritionEstimate, NutritionRecipe } from "../types/nutrition";
import { colors, spacing } from "../theme/colors";

type Props = {
  visible: boolean;
  mode: "select" | "add";
  recipes: NutritionRecipe[];
  onClose: () => void;
  onSelect: (recipe: NutritionRecipe) => void;
  onCreated: (recipe: NutritionRecipe) => void;
  energyUnit: string;
};

/**
 * One place to pick a recipe or add one (manual, photo, gallery, website URL).
 */
export function RecipeHubModal({
  visible,
  mode: initialMode,
  recipes,
  onClose,
  onSelect,
  onCreated,
  energyUnit,
}: Props) {
  const [mode, setMode] = useState<"select" | "add">(initialMode);
  const [query, setQuery] = useState("");
  const [camOpen, setCamOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState<string | null>(null);

  const [name, setName] = useState("");
  const [url, setUrl] = useState("");
  const [ingredients, setIngredients] = useState("");
  const [servingsBase, setServingsBase] = useState("1");
  const [servingUnit, setServingUnit] = useState<"serving" | "g">("serving");
  const [calories, setCalories] = useState("");
  const [protein, setProtein] = useState("");
  const [carbs, setCarbs] = useState("");
  const [fat, setFat] = useState("");

  useEffect(() => {
    if (visible) {
      setMode(initialMode);
      setQuery("");
      setErr(null);
    }
  }, [visible, initialMode]);

  const filtered = recipes.filter((r) => {
    const q = query.trim().toLowerCase();
    if (!q) return true;
    return r.name.toLowerCase().includes(q) || (r.ingredients ?? []).join(" ").toLowerCase().includes(q);
  });

  async function createRecipe(payload: Record<string, unknown>) {
    setBusy(true);
    setErr(null);
    try {
      const res = await apiFetch<{ recipe: NutritionRecipe }>("/nutrition/recipes", {
        method: "POST",
        body: JSON.stringify(payload),
      });
      onCreated(res.recipe);
      onClose();
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not save recipe");
    } finally {
      setBusy(false);
    }
  }

  async function saveManual() {
    await createRecipe({
      name: name.trim() || "Recipe",
      servingsBase: Number(servingsBase) || 1,
      servingUnit,
      calories: Number(calories) || 0,
      protein: Number(protein) || 0,
      carbs: Number(carbs) || 0,
      fat: Number(fat) || 0,
      ingredients: [
        ...ingredients
          .split(/[\n,]/)
          .map((s) => s.trim())
          .filter(Boolean),
        ...(url.trim() ? [`Source: ${url.trim()}`] : []),
      ],
      notes: url.trim() || undefined,
    });
  }

  async function estimateFromImage(base64: string) {
    setBusy(true);
    setErr(null);
    try {
      const est = await apiFetch<NutritionEstimate>("/nutrition/estimate", {
        method: "POST",
        body: JSON.stringify({ kind: "label", intent: "recipe", imageBase64: base64 }),
      });
      setName(est.name || name || "Recipe from photo");
      setCalories(String(Math.round(est.calories || 0)));
      setProtein(String(Math.round(est.protein || 0)));
      setCarbs(String(Math.round(est.carbs || 0)));
      setFat(String(Math.round(est.fat || 0)));
      setMode("add");
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not read recipe photo");
    } finally {
      setBusy(false);
    }
  }

  const pickGallery = useCallback(async () => {
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      setErr("Photo library permission needed");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      quality: 0.6,
      base64: true,
    });
    if (result.canceled || !result.assets?.[0]?.base64) return;
    await estimateFromImage(result.assets[0].base64);
  }, []);

  return (
    <>
      <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
        <KeyboardAvoidingView
          style={styles.wrap}
          behavior={Platform.OS === "ios" ? "padding" : "height"}
        >
          <View style={styles.card}>
            <Text style={styles.title}>Recipes</Text>
            <View style={styles.tabs}>
              <Pressable
                style={[styles.tab, mode === "select" && styles.tabOn]}
                onPress={() => setMode("select")}
              >
                <Text style={[styles.tabText, mode === "select" && styles.tabTextOn]}>Select</Text>
              </Pressable>
              <Pressable style={[styles.tab, mode === "add" && styles.tabOn]} onPress={() => setMode("add")}>
                <Text style={[styles.tabText, mode === "add" && styles.tabTextOn]}>Add</Text>
              </Pressable>
            </View>

            {err ? <Text style={styles.err}>{err}</Text> : null}

            {mode === "select" ? (
              <>
                <TextInput
                  style={styles.input}
                  value={query}
                  onChangeText={setQuery}
                  placeholder="Search your recipes…"
                  placeholderTextColor={colors.textMuted}
                  autoFocus
                />
                <ScrollView style={{ maxHeight: 360 }} keyboardShouldPersistTaps="handled">
                  {filtered.length === 0 ? (
                    <Text style={styles.hint}>No recipes yet — switch to Add.</Text>
                  ) : (
                    filtered.map((r) => (
                      <Pressable key={r.id} style={styles.row} onPress={() => onSelect(r)}>
                        <Text style={styles.rowTitle}>{r.name}</Text>
                        <Text style={styles.rowMeta}>
                          {r.calories} {energyUnit} · P{r.protein} · per {r.servingsBase}
                          {r.servingUnit === "g" ? "g" : " serving"}
                        </Text>
                      </Pressable>
                    ))
                  )}
                </ScrollView>
              </>
            ) : (
              <ScrollView style={{ maxHeight: 420 }} keyboardShouldPersistTaps="handled">
                <Text style={styles.hint}>Photo the full card, pick from gallery, paste a URL, or enter macros.</Text>
                <View style={styles.actions}>
                  <ActionButton label="Photograph card" variant="ghost" onPress={() => setCamOpen(true)} />
                  <ActionButton label="Upload photo" variant="ghost" onPress={() => void pickGallery()} />
                </View>
                <Text style={styles.label}>Website (optional)</Text>
                <TextInput
                  style={styles.input}
                  value={url}
                  onChangeText={setUrl}
                  placeholder="https://…"
                  placeholderTextColor={colors.textMuted}
                  autoCapitalize="none"
                  keyboardType="url"
                />
                <Text style={styles.label}>Name</Text>
                <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Recipe name" placeholderTextColor={colors.textMuted} />
                <Text style={styles.label}>Ingredients</Text>
                <TextInput
                  style={[styles.input, { minHeight: 64, textAlignVertical: "top" }]}
                  value={ingredients}
                  onChangeText={setIngredients}
                  multiline
                  placeholder="Comma or line separated"
                  placeholderTextColor={colors.textMuted}
                />
                <Text style={styles.label}>Base amount</Text>
                <View style={styles.unitRow}>
                  <TextInput
                    style={[styles.input, { flex: 1 }]}
                    keyboardType="decimal-pad"
                    value={servingsBase}
                    onChangeText={setServingsBase}
                  />
                  {(["serving", "g"] as const).map((u) => (
                    <Pressable
                      key={u}
                      style={[styles.chip, servingUnit === u && styles.chipOn]}
                      onPress={() => setServingUnit(u)}
                    >
                      <Text style={[styles.chipText, servingUnit === u && styles.chipTextOn]}>
                        {u === "g" ? "grams" : "servings"}
                      </Text>
                    </Pressable>
                  ))}
                </View>
                <Text style={styles.label}>Calories</Text>
                <TextInput style={styles.input} keyboardType="numeric" value={calories} onChangeText={setCalories} />
                <Text style={styles.label}>Protein</Text>
                <TextInput style={styles.input} keyboardType="numeric" value={protein} onChangeText={setProtein} />
                <Text style={styles.label}>Carbs</Text>
                <TextInput style={styles.input} keyboardType="numeric" value={carbs} onChangeText={setCarbs} />
                <Text style={styles.label}>Fat</Text>
                <TextInput style={styles.input} keyboardType="numeric" value={fat} onChangeText={setFat} />
                <ActionButton label="Save recipe" loading={busy} onPress={() => void saveManual()} />
              </ScrollView>
            )}

            <ActionButton label="Close" variant="ghost" onPress={onClose} />
          </View>
        </KeyboardAvoidingView>
      </Modal>

      <InAppCameraModal
        visible={camOpen}
        initialMode="food"
        modes={["food"]}
        title="Photograph the full recipe card"
        onClose={() => setCamOpen(false)}
        onCapture={({ base64 }) => {
          setCamOpen(false);
          void estimateFromImage(base64);
        }}
      />
    </>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  card: {
    backgroundColor: colors.bgElevated,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: spacing.lg,
    gap: 8,
    borderWidth: 1,
    borderColor: colors.line,
  },
  title: { color: colors.text, fontFamily: "SpaceGrotesk_700Bold", fontSize: 22 },
  tabs: { flexDirection: "row", gap: 8, marginBottom: 4 },
  tab: {
    flex: 1,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    alignItems: "center",
    backgroundColor: colors.bgSoft,
  },
  tabOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  tabText: { color: colors.text, fontFamily: "Outfit_700Bold" },
  tabTextOn: { color: colors.bg },
  input: {
    backgroundColor: colors.bg,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontFamily: "Outfit_500Medium",
  },
  label: { color: colors.textMuted, fontFamily: "Outfit_500Medium", marginTop: 6 },
  hint: { color: colors.textMuted, fontFamily: "Outfit_500Medium", fontSize: 13 },
  err: { color: colors.warn, fontFamily: "Outfit_500Medium", fontSize: 13 },
  row: {
    paddingVertical: 12,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  rowTitle: { color: colors.text, fontFamily: "Outfit_700Bold", fontSize: 15 },
  rowMeta: { color: colors.textMuted, fontFamily: "Outfit_500Medium", fontSize: 12, marginTop: 2 },
  actions: { gap: 4, marginVertical: 6 },
  unitRow: { flexDirection: "row", gap: 8, alignItems: "center" },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 10,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.bgSoft,
  },
  chipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.text, fontFamily: "Outfit_700Bold", fontSize: 12 },
  chipTextOn: { color: colors.bg },
});
