import { useCallback, useMemo, useState } from "react";
import {
  ActivityIndicator,
  Modal,
  Platform,
  Pressable,
  RefreshControl,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import { ActionButton } from "../../src/components/ActionButton";
import { apiFetch } from "../../src/lib/api";
import { getPreferences, savePreferences } from "../../src/db/local";
import { localToday } from "../../src/lib/dates";
import { syncHealthConnectToServer } from "../../src/lib/healthConnect";
import { pushPreferences, syncNow } from "../../src/lib/sync";
import type {
  NutritionEstimate,
  NutritionMeal,
  NutritionPreset,
  NutritionRecipe,
  NutritionToday,
} from "../../src/types/nutrition";
import { colors, spacing } from "../../src/theme/colors";

type DraftMeal = {
  name: string;
  calories: string;
  protein: string;
  carbs: string;
  fat: string;
  source: string;
  portion?: string;
  recipeId?: string;
  presetId?: string;
  servingUnit?: "serving" | "g";
  servingsBase?: number;
  notes?: string;
  aiError?: string;
};

function progressPct(value: number, target: number) {
  if (!target) return 0;
  return Math.min(1, value / target);
}

export default function FuelScreen() {
  const router = useRouter();
  const [today, setToday] = useState<NutritionToday | null>(null);
  const [presets, setPresets] = useState<NutritionPreset[]>([]);
  const [recipes, setRecipes] = useState<NutritionRecipe[]>([]);
  const [latestWeight, setLatestWeight] = useState<string | null>(null);
  const [activitySummary, setActivitySummary] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [msgTone, setMsgTone] = useState<"ok" | "warn">("ok");
  const [refreshing, setRefreshing] = useState(false);
  const [hcSyncing, setHcSyncing] = useState(false);
  const [estimating, setEstimating] = useState(false);
  const [saving, setSaving] = useState(false);
  const [draft, setDraft] = useState<DraftMeal | null>(null);
  const [picker, setPicker] = useState<"preset" | "recipe" | null>(null);
  const [describeText, setDescribeText] = useState("");
  const [showDescribe, setShowDescribe] = useState(false);
  const [showTargets, setShowTargets] = useState(false);
  const [calTarget, setCalTarget] = useState("2200");
  const [proTarget, setProTarget] = useState("150");
  const [carbTarget, setCarbTarget] = useState("250");
  const [fatTarget, setFatTarget] = useState("70");

  function flash(message: string, tone: "ok" | "warn" = "ok") {
    setMsgTone(tone);
    setMsg(message);
  }

  const load = useCallback(async () => {
    const date = localToday();
    if (Platform.OS === "android") {
      setHcSyncing(true);
      try {
        await syncHealthConnectToServer();
      } catch {
        /* ignore */
      } finally {
        setHcSyncing(false);
      }
    }

    const [nut, presetRes, recipeRes, metrics, prefs] = await Promise.all([
      apiFetch<NutritionToday>(`/nutrition/today?date=${date}`),
      apiFetch<{ presets: NutritionPreset[] }>("/nutrition/presets"),
      apiFetch<{ recipes: NutritionRecipe[] }>("/nutrition/recipes"),
      apiFetch<{
        garmin: { steps?: number; sleepMinutes?: number; restingHr?: number; source?: string } | null;
        latestWeight: { weight?: number; units?: string; source?: string } | null;
      }>(`/metrics/today?date=${date}`).catch(() => null),
      getPreferences(),
    ]);

    setToday(nut);
    setPresets(presetRes.presets);
    setRecipes(recipeRes.recipes);
    setCalTarget(String(prefs.calorieTarget ?? nut.targets.calories ?? 2200));
    setProTarget(String(prefs.proteinTarget ?? nut.targets.protein ?? 150));
    setCarbTarget(String(prefs.carbTarget ?? nut.targets.carbs ?? 250));
    setFatTarget(String(prefs.fatTarget ?? nut.targets.fat ?? 70));

    if (metrics?.latestWeight?.weight != null) {
      const src = metrics.latestWeight.source ?? "";
      const label =
        src === "health_connect" ? "Health Connect" : src === "renpho" ? "scale" : src || "synced";
      setLatestWeight(`${metrics.latestWeight.weight} ${metrics.latestWeight.units ?? "lb"} (${label})`);
    } else setLatestWeight(null);

    const g = metrics?.garmin;
    if (g && (g.steps != null || g.sleepMinutes != null || g.restingHr != null)) {
      const parts = [];
      if (g.steps != null) parts.push(`${g.steps.toLocaleString()} steps`);
      if (g.sleepMinutes != null) parts.push(`${(g.sleepMinutes / 60).toFixed(1)}h sleep`);
      if (g.restingHr != null) parts.push(`${g.restingHr} bpm`);
      setActivitySummary(parts.join(" · "));
    } else setActivitySummary(null);
  }, []);

  useFocusEffect(
    useCallback(() => {
      void (async () => {
        try {
          await load();
        } catch {
          flash("Could not load nutrition", "warn");
        }
      })();
    }, [load]),
  );

  async function onRefresh() {
    setRefreshing(true);
    try {
      await syncNow();
      await load();
    } finally {
      setRefreshing(false);
    }
  }

  function openManual() {
    setDraft({
      name: "Meal",
      calories: "",
      protein: "",
      carbs: "",
      fat: "",
      source: "manual",
    });
  }

  function openPreset(p: NutritionPreset) {
    setPicker(null);
    setDraft({
      name: p.name,
      calories: String(p.calories),
      protein: String(p.protein),
      carbs: String(p.carbs ?? 0),
      fat: String(p.fat ?? 0),
      source: "preset",
      presetId: p.id,
    });
  }

  function openRecipe(r: NutritionRecipe) {
    setPicker(null);
    setDraft({
      name: r.name,
      calories: String(r.calories),
      protein: String(r.protein),
      carbs: String(r.carbs ?? 0),
      fat: String(r.fat ?? 0),
      source: "recipe",
      recipeId: r.id,
      portion: String(r.servingsBase),
      servingsBase: r.servingsBase,
      servingUnit: r.servingUnit,
    });
  }

  const scaledDraft = useMemo(() => {
    if (!draft || draft.source !== "recipe" || !draft.servingsBase) return draft;
    const portion = Number(draft.portion) || draft.servingsBase;
    const scale = portion / Math.max(0.01, draft.servingsBase);
    // Base macros in draft are for full servingsBase — rescale from recipe base stored in fields
    return draft;
  }, [draft]);

  function recipePreviewMacros(d: DraftMeal) {
    if (d.source !== "recipe" || !d.recipeId) {
      return {
        calories: Number(d.calories) || 0,
        protein: Number(d.protein) || 0,
        carbs: Number(d.carbs) || 0,
        fat: Number(d.fat) || 0,
      };
    }
    const recipe = recipes.find((r) => r.id === d.recipeId);
    if (!recipe) {
      return {
        calories: Number(d.calories) || 0,
        protein: Number(d.protein) || 0,
        carbs: Number(d.carbs) || 0,
        fat: Number(d.fat) || 0,
      };
    }
    const portion = Number(d.portion) || recipe.servingsBase;
    const scale = portion / Math.max(0.01, recipe.servingsBase);
    return {
      calories: Math.round(recipe.calories * scale),
      protein: Math.round(recipe.protein * scale),
      carbs: Math.round(recipe.carbs * scale),
      fat: Math.round(recipe.fat * scale),
    };
  }

  async function pickImage(kind: "food" | "label") {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      flash("Camera permission needed", "warn");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.55,
      base64: true,
      allowsEditing: true,
    });
    if (result.canceled || !result.assets?.[0]?.base64) return;
    setEstimating(true);
    try {
      const res = await apiFetch<{ estimate: NutritionEstimate }>("/nutrition/estimate", {
        method: "POST",
        body: JSON.stringify({
          kind,
          imageBase64: result.assets[0].base64,
        }),
      });
      const e = res.estimate;
      setDraft({
        name: e.name || (kind === "label" ? "From label" : "Meal"),
        calories: String(e.calories || ""),
        protein: String(e.protein || ""),
        carbs: String(e.carbs || ""),
        fat: String(e.fat || ""),
        source: kind === "label" ? "label" : "photo",
        aiError: e.error,
      });
      if (e.error) flash(e.error, "warn");
    } catch (err) {
      flash(err instanceof Error ? err.message : "Estimate failed", "warn");
      setDraft({
        name: kind === "label" ? "From label" : "Meal",
        calories: "",
        protein: "",
        carbs: "",
        fat: "",
        source: kind === "label" ? "label" : "photo",
        aiError: "Enter macros manually",
      });
    } finally {
      setEstimating(false);
    }
  }

  async function estimateFromText() {
    const text = describeText.trim();
    if (!text) {
      flash("Describe what you ate", "warn");
      return;
    }
    setShowDescribe(false);
    setEstimating(true);
    try {
      const res = await apiFetch<{ estimate: NutritionEstimate }>("/nutrition/estimate", {
        method: "POST",
        body: JSON.stringify({ kind: "text", text }),
      });
      const e = res.estimate;
      setDraft({
        name: e.name || text.slice(0, 40),
        calories: String(e.calories || ""),
        protein: String(e.protein || ""),
        carbs: String(e.carbs || ""),
        fat: String(e.fat || ""),
        source: "text",
        notes: text,
        aiError: e.error,
      });
      if (e.error) flash(e.error, "warn");
    } catch (err) {
      setDraft({
        name: text.slice(0, 40),
        calories: "",
        protein: "",
        carbs: "",
        fat: "",
        source: "text",
        notes: text,
        aiError: "Enter macros manually",
      });
      flash(err instanceof Error ? err.message : "Estimate failed", "warn");
    } finally {
      setEstimating(false);
      setDescribeText("");
    }
  }

  async function saveDraft() {
    if (!draft) return;
    setSaving(true);
    try {
      const macros =
        draft.source === "recipe"
          ? recipePreviewMacros(draft)
          : {
              calories: Number(draft.calories) || 0,
              protein: Number(draft.protein) || 0,
              carbs: Number(draft.carbs) || 0,
              fat: Number(draft.fat) || 0,
            };
      if (!macros.calories && !macros.protein) {
        flash("Enter calories or protein", "warn");
        return;
      }
      await apiFetch("/nutrition/meals", {
        method: "POST",
        body: JSON.stringify({
          date: localToday(),
          name: draft.name.trim() || "Meal",
          ...macros,
          source: draft.source,
          portion: draft.portion ? Number(draft.portion) : undefined,
          recipeId: draft.recipeId,
          presetId: draft.presetId,
          notes: draft.notes,
        }),
      });
      setDraft(null);
      flash("Meal logged");
      await load();
    } catch (e) {
      flash(e instanceof Error ? e.message : "Could not save meal", "warn");
    } finally {
      setSaving(false);
    }
  }

  async function deleteMeal(id: string) {
    try {
      await apiFetch(`/nutrition/meals/${encodeURIComponent(id)}`, { method: "DELETE" });
      await load();
    } catch (e) {
      flash(e instanceof Error ? e.message : "Could not delete", "warn");
    }
  }

  async function saveTargets() {
    try {
      const prefs = await getPreferences();
      const next = {
        ...prefs,
        calorieTarget: Number(calTarget) || 2200,
        proteinTarget: Number(proTarget) || 150,
        carbTarget: Number(carbTarget) || 250,
        fatTarget: Number(fatTarget) || 70,
      };
      await savePreferences(next);
      await pushPreferences(next);
      setShowTargets(false);
      flash("Targets saved");
      await load();
    } catch (e) {
      flash(e instanceof Error ? e.message : "Could not save targets", "warn");
    }
  }

  const totals = today?.totals ?? { calories: 0, protein: 0, carbs: 0, fat: 0 };
  const targets = today?.targets ?? {
    calories: Number(calTarget) || 2200,
    protein: Number(proTarget) || 150,
    carbs: Number(carbTarget) || 250,
    fat: Number(fatTarget) || 70,
  };

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.accent} colors={[colors.accent]} />
      }
    >
      <View style={styles.topRow}>
        <View style={{ flex: 1 }}>
          <Text style={styles.title}>Fuel</Text>
          <Text style={styles.sub}>Log meals · presets · recipes · camera</Text>
        </View>
        <Pressable style={styles.iconBtn} onPress={() => void onRefresh()} accessibilityLabel="Refresh">
          {hcSyncing || estimating ? (
            <ActivityIndicator color={colors.accent} size="small" />
          ) : (
            <Ionicons name="refresh" size={20} color={colors.accent} />
          )}
        </Pressable>
      </View>

      {msg ? (
        <View style={[styles.banner, msgTone === "warn" ? styles.bannerWarn : styles.bannerOk]}>
          <Text style={styles.bannerText}>{msg}</Text>
        </View>
      ) : null}

      <View style={styles.totalsCard}>
        <View style={styles.totalsHeader}>
          <Text style={styles.sectionTitle}>Today</Text>
          <Pressable onPress={() => setShowTargets(true)}>
            <Text style={styles.link}>Targets</Text>
          </Pressable>
        </View>
        {(
          [
            ["Calories", totals.calories, targets.calories, ""],
            ["Protein", totals.protein, targets.protein, "g"],
            ["Carbs", totals.carbs, targets.carbs, "g"],
            ["Fat", totals.fat, targets.fat, "g"],
          ] as const
        ).map(([label, value, target, unit]) => (
          <View key={label} style={styles.barBlock}>
            <View style={styles.barLabels}>
              <Text style={styles.barLabel}>{label}</Text>
              <Text style={styles.barValue}>
                {Math.round(value)}
                {unit} / {Math.round(target)}
                {unit}
              </Text>
            </View>
            <View style={styles.barTrack}>
              <View style={[styles.barFill, { width: `${Math.round(progressPct(value, target) * 100)}%` }]} />
            </View>
          </View>
        ))}
      </View>

      {activitySummary ? <Text style={styles.summary}>{activitySummary}</Text> : null}
      {latestWeight ? <Text style={styles.summary}>Weight · {latestWeight}</Text> : null}

      <Text style={styles.sectionTitle}>Log a meal</Text>
      <View style={styles.actionGrid}>
        {(
          [
            { key: "preset", label: "Preset", icon: "flash" as const, onPress: () => setPicker("preset") },
            { key: "recipe", label: "Recipe", icon: "restaurant" as const, onPress: () => setPicker("recipe") },
            { key: "photo", label: "Photo", icon: "camera" as const, onPress: () => void pickImage("food") },
            { key: "label", label: "Label", icon: "barcode" as const, onPress: () => void pickImage("label") },
            { key: "text", label: "Describe", icon: "create" as const, onPress: () => setShowDescribe(true) },
            { key: "manual", label: "Manual", icon: "keypad" as const, onPress: openManual },
          ] as const
        ).map((a) => (
          <Pressable key={a.key} style={styles.actionTile} onPress={a.onPress} disabled={estimating}>
            <Ionicons name={a.icon} size={22} color={colors.accent} />
            <Text style={styles.actionLabel}>{a.label}</Text>
          </Pressable>
        ))}
      </View>

      <View style={styles.manageRow}>
        <Pressable style={styles.manageBtn} onPress={() => router.push("/nutrition-presets")}>
          <Text style={styles.manageText}>Manage presets</Text>
        </Pressable>
        <Pressable style={styles.manageBtn} onPress={() => router.push("/nutrition-recipes")}>
          <Text style={styles.manageText}>Manage recipes</Text>
        </Pressable>
      </View>

      <Pressable style={styles.helpCard} onPress={() => router.push("/connect-health")}>
        <Text style={styles.helpTitle}>Health Connect</Text>
        <Text style={styles.helpMeta}>Weight, steps, sleep sync →</Text>
      </Pressable>

      <Text style={[styles.sectionTitle, { marginTop: spacing.sm }]}>Meals</Text>
      {(today?.meals ?? []).length === 0 ? (
        <Text style={styles.hint}>Nothing logged yet today.</Text>
      ) : (
        today!.meals.map((m: NutritionMeal) => (
          <View key={m.id} style={styles.mealRow}>
            <View style={{ flex: 1 }}>
              <Text style={styles.mealName}>{m.name}</Text>
              <Text style={styles.mealMeta}>
                {Math.round(m.calories)} kcal · P{Math.round(m.protein)} C{Math.round(m.carbs ?? 0)} F
                {Math.round(m.fat ?? 0)} · {m.source}
              </Text>
            </View>
            <Pressable onPress={() => void deleteMeal(m.id)} hitSlop={10}>
              <Ionicons name="trash-outline" size={20} color={colors.danger} />
            </Pressable>
          </View>
        ))
      )}

      {/* Confirm meal modal */}
      <Modal visible={!!draft} animationType="slide" transparent onRequestClose={() => setDraft(null)}>
        <View style={styles.modalWrap}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Confirm meal</Text>
            {draft?.aiError ? <Text style={styles.warnText}>{draft.aiError}</Text> : null}
            <Text style={styles.label}>Name</Text>
            <TextInput
              style={styles.input}
              value={draft?.name ?? ""}
              onChangeText={(t) => setDraft((d) => (d ? { ...d, name: t } : d))}
            />
            {draft?.source === "recipe" ? (
              <>
                <Text style={styles.label}>
                  Amount ({draft.servingUnit === "g" ? "grams" : "servings"})
                </Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  value={draft.portion ?? ""}
                  onChangeText={(t) => setDraft((d) => (d ? { ...d, portion: t } : d))}
                />
                <Text style={styles.hint}>
                  Logs ≈ {recipePreviewMacros(draft).calories} kcal · P{recipePreviewMacros(draft).protein} C
                  {recipePreviewMacros(draft).carbs} F{recipePreviewMacros(draft).fat}
                </Text>
              </>
            ) : (
              <>
                <Text style={styles.label}>Calories</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  value={draft?.calories ?? ""}
                  onChangeText={(t) => setDraft((d) => (d ? { ...d, calories: t } : d))}
                />
                <Text style={styles.label}>Protein (g)</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  value={draft?.protein ?? ""}
                  onChangeText={(t) => setDraft((d) => (d ? { ...d, protein: t } : d))}
                />
                <Text style={styles.label}>Carbs (g)</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  value={draft?.carbs ?? ""}
                  onChangeText={(t) => setDraft((d) => (d ? { ...d, carbs: t } : d))}
                />
                <Text style={styles.label}>Fat (g)</Text>
                <TextInput
                  style={styles.input}
                  keyboardType="numeric"
                  value={draft?.fat ?? ""}
                  onChangeText={(t) => setDraft((d) => (d ? { ...d, fat: t } : d))}
                />
              </>
            )}
            <ActionButton label="Save meal" loading={saving} onPress={saveDraft} />
            <ActionButton label="Cancel" variant="ghost" onPress={() => setDraft(null)} />
          </View>
        </View>
      </Modal>

      {/* Preset / recipe picker */}
      <Modal visible={!!picker} animationType="fade" transparent onRequestClose={() => setPicker(null)}>
        <View style={styles.modalWrap}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>{picker === "preset" ? "Presets" : "Recipes"}</Text>
            <ScrollView style={{ maxHeight: 360 }}>
              {(picker === "preset" ? presets : recipes).map((item) => (
                <Pressable
                  key={item.id}
                  style={styles.pickRow}
                  onPress={() =>
                    picker === "preset"
                      ? openPreset(item as NutritionPreset)
                      : openRecipe(item as NutritionRecipe)
                  }
                >
                  <Text style={styles.mealName}>{item.name}</Text>
                  <Text style={styles.mealMeta}>
                    {item.calories} kcal · P{item.protein}
                    {picker === "recipe"
                      ? ` · per ${(item as NutritionRecipe).servingsBase}${(item as NutritionRecipe).servingUnit === "g" ? "g" : " serving"}`
                      : ""}
                  </Text>
                </Pressable>
              ))}
              {(picker === "preset" ? presets : recipes).length === 0 ? (
                <Text style={styles.hint}>
                  None yet — create some under Manage {picker === "preset" ? "presets" : "recipes"}.
                </Text>
              ) : null}
            </ScrollView>
            <ActionButton label="Close" variant="ghost" onPress={() => setPicker(null)} />
          </View>
        </View>
      </Modal>

      {/* Describe */}
      <Modal visible={showDescribe} animationType="fade" transparent onRequestClose={() => setShowDescribe(false)}>
        <View style={styles.modalWrap}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Describe food</Text>
            <TextInput
              style={[styles.input, { minHeight: 90, textAlignVertical: "top" }]}
              multiline
              value={describeText}
              onChangeText={setDescribeText}
              placeholder="e.g. grilled chicken breast, rice, broccoli"
              placeholderTextColor={colors.textMuted}
            />
            <ActionButton label="Estimate" loading={estimating} onPress={estimateFromText} />
            <ActionButton label="Cancel" variant="ghost" onPress={() => setShowDescribe(false)} />
          </View>
        </View>
      </Modal>

      {/* Targets */}
      <Modal visible={showTargets} animationType="fade" transparent onRequestClose={() => setShowTargets(false)}>
        <View style={styles.modalWrap}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>Daily targets</Text>
            <Text style={styles.label}>Calories</Text>
            <TextInput style={styles.input} keyboardType="numeric" value={calTarget} onChangeText={setCalTarget} />
            <Text style={styles.label}>Protein (g)</Text>
            <TextInput style={styles.input} keyboardType="numeric" value={proTarget} onChangeText={setProTarget} />
            <Text style={styles.label}>Carbs (g)</Text>
            <TextInput style={styles.input} keyboardType="numeric" value={carbTarget} onChangeText={setCarbTarget} />
            <Text style={styles.label}>Fat (g)</Text>
            <TextInput style={styles.input} keyboardType="numeric" value={fatTarget} onChangeText={setFatTarget} />
            <ActionButton label="Save targets" onPress={saveTargets} />
            <ActionButton label="Cancel" variant="ghost" onPress={() => setShowTargets(false)} />
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.sm, paddingBottom: 56 },
  topRow: { flexDirection: "row", alignItems: "flex-start", gap: 10, marginBottom: 4 },
  title: { color: colors.text, fontSize: 28, fontFamily: "SpaceGrotesk_700Bold" },
  sub: { color: colors.textMuted, fontFamily: "Outfit_500Medium", marginTop: 4 },
  iconBtn: {
    width: 42,
    height: 42,
    borderRadius: 21,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.bgElevated,
    alignItems: "center",
    justifyContent: "center",
  },
  sectionTitle: { color: colors.text, fontFamily: "Outfit_700Bold", fontSize: 16, marginTop: 8 },
  link: { color: colors.accent, fontFamily: "Outfit_700Bold", fontSize: 13 },
  totalsCard: {
    backgroundColor: colors.bgElevated,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.md,
    gap: 10,
  },
  totalsHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  barBlock: { gap: 4 },
  barLabels: { flexDirection: "row", justifyContent: "space-between" },
  barLabel: { color: colors.textMuted, fontFamily: "Outfit_500Medium", fontSize: 12 },
  barValue: { color: colors.text, fontFamily: "Outfit_700Bold", fontSize: 12 },
  barTrack: { height: 6, borderRadius: 999, backgroundColor: colors.line, overflow: "hidden" },
  barFill: { height: "100%", backgroundColor: colors.accent, borderRadius: 999 },
  summary: { color: colors.accent, fontFamily: "Outfit_700Bold", fontSize: 13 },
  actionGrid: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  actionTile: {
    width: "31%",
    minWidth: 96,
    flexGrow: 1,
    backgroundColor: colors.bgSoft,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: 14,
    alignItems: "center",
    gap: 6,
  },
  actionLabel: { color: colors.text, fontFamily: "Outfit_700Bold", fontSize: 13 },
  manageRow: { flexDirection: "row", gap: 10 },
  manageBtn: {
    flex: 1,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: 12,
    alignItems: "center",
    backgroundColor: colors.bgElevated,
  },
  manageText: { color: colors.accent, fontFamily: "Outfit_700Bold", fontSize: 13 },
  helpCard: {
    backgroundColor: colors.bgElevated,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.accentDim,
    padding: spacing.md,
  },
  helpTitle: { color: colors.accent, fontFamily: "Outfit_700Bold", fontSize: 14 },
  helpMeta: { color: colors.textMuted, fontFamily: "Outfit_500Medium", marginTop: 4, fontSize: 12 },
  mealRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 10,
    backgroundColor: colors.bgSoft,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.md,
  },
  mealName: { color: colors.text, fontFamily: "Outfit_700Bold", fontSize: 15 },
  mealMeta: { color: colors.textMuted, fontFamily: "Outfit_500Medium", fontSize: 12, marginTop: 2 },
  hint: { color: colors.textMuted, fontSize: 13, fontFamily: "Outfit_500Medium" },
  label: { color: colors.textMuted, fontFamily: "Outfit_500Medium", marginTop: 6 },
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
  banner: {
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
  },
  bannerOk: { backgroundColor: "#15241A", borderColor: colors.accentDim },
  bannerWarn: { backgroundColor: "#2A2218", borderColor: colors.warn },
  bannerText: { color: colors.text, fontFamily: "Outfit_700Bold", fontSize: 14 },
  modalWrap: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: colors.bgElevated,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: spacing.lg,
    gap: 6,
    borderWidth: 1,
    borderColor: colors.line,
  },
  modalTitle: { color: colors.text, fontFamily: "SpaceGrotesk_700Bold", fontSize: 22, marginBottom: 4 },
  warnText: { color: colors.warn, fontFamily: "Outfit_500Medium", fontSize: 13 },
  pickRow: {
    paddingVertical: 12,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
});
