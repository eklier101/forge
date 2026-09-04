import { useCallback, useState } from "react";
import { Platform, Pressable, ScrollView, Share, StyleSheet, Switch, Text, TextInput, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import * as FileSystem from "expo-file-system/legacy";
import * as ImagePicker from "expo-image-picker";
import { ActionButton } from "../src/components/ActionButton";
import { BodyTypePicker } from "../src/components/BodyTypePicker";
import { BodyFocusPicker } from "../src/components/BodyFocusPicker";
import { getPreferences, savePreferences } from "../src/db/local";
import { WEEKDAY_LABELS, type DayKind, type Preferences } from "../src/db/types";
import { apiFetch } from "../src/lib/api";
import { bmiCategory, calcBmi, lbToKg } from "../src/lib/bodyProfile";
import { localToday } from "../src/lib/dates";
import { suggestNutritionTargets } from "../src/lib/nutritionTargets";
import { clearSession, getApiUrl, getToken } from "../src/lib/session";
import { pushPreferences, pullPreferences, syncNow } from "../src/lib/sync";
import { colors, spacing } from "../src/theme/colors";

function passwordMeetsRules(password: string): string | null {
  if (password.length < 8) return "Password must be at least 8 characters";
  if (!/[A-Z]/.test(password)) return "Password needs an uppercase letter";
  if (!/[0-9]/.test(password)) return "Password needs a number";
  if (!/[^A-Za-z0-9]/.test(password)) return "Password needs a symbol";
  return null;
}

const KIND_CYCLE: (DayKind | null)[] = [null, "gym", "home", "rest"];

export default function AccountSettingsScreen() {
  const router = useRouter();
  const [heightCm, setHeightCm] = useState("");
  const [heightFt, setHeightFt] = useState("");
  const [heightIn, setHeightIn] = useState("");
  const [units, setUnits] = useState<"lb" | "kg">("lb");
  const [energyUnit, setEnergyUnit] = useState<"cal" | "kcal">("kcal");
  const [currentType, setCurrentType] = useState<string | null>(null);
  const [goalType, setGoalType] = useState<string | null>(null);
  const [focusMuscles, setFocusMuscles] = useState<string[]>([]);
  const [restTimer, setRestTimer] = useState("90");
  const [focus, setFocus] = useState<"balanced" | "weight" | "reps">("balanced");
  const [scheduleMode, setScheduleMode] = useState<"auto" | "manual">("auto");
  const [overrides, setOverrides] = useState<(DayKind | null)[]>([null, null, null, null, null, null, null]);
  const [gymWeekdays, setGymWeekdays] = useState<number[]>([1, 3, 5]);
  const [lateNight, setLateNight] = useState(false);
  const [weightLb, setWeightLb] = useState<number | null>(null);
  const [exportBusy, setExportBusy] = useState(false);
  const [currentPw, setCurrentPw] = useState("");
  const [newPw, setNewPw] = useState("");
  const [confirmPw, setConfirmPw] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [msgTone, setMsgTone] = useState<"ok" | "warn">("ok");
  const [saving, setSaving] = useState(false);
  const [pwBusy, setPwBusy] = useState(false);
  const [photos, setPhotos] = useState<{ id: string; createdAt: string; note?: string }[]>([]);
  const [photoBusy, setPhotoBusy] = useState(false);

  function flash(message: string, tone: "ok" | "warn" = "ok") {
    setMsgTone(tone);
    setMsg(message);
  }

  const load = useCallback(async () => {
    await pullPreferences();
    const prefs = await getPreferences();
    const cm = prefs.heightCm;
    if (cm) {
      setHeightCm(String(cm));
      const totalIn = cm / 2.54;
      setHeightFt(String(Math.floor(totalIn / 12)));
      setHeightIn(String(Math.round(totalIn % 12)));
    }
    setCurrentType(prefs.bodyTypeCurrent ?? null);
    setGoalType(prefs.bodyTypeGoal ?? null);
    setFocusMuscles(Array.isArray(prefs.focusMuscleIds) ? prefs.focusMuscleIds : []);
    setUnits(prefs.units === "kg" ? "kg" : "lb");
    setEnergyUnit(prefs.energyUnit === "cal" ? "cal" : "kcal");
    setRestTimer(String(prefs.restTimerSeconds ?? 90));
    setFocus((prefs.progressionFocus as "balanced" | "weight" | "reps") || "balanced");
    setScheduleMode(prefs.scheduleMode === "manual" ? "manual" : "auto");
    setOverrides(
      prefs.dayKindOverrides?.length === 7
        ? prefs.dayKindOverrides
        : [null, null, null, null, null, null, null],
    );
    setGymWeekdays(prefs.gymWeekdays?.length ? prefs.gymWeekdays : [1, 3, 5]);
    setLateNight(prefs.lateNightWorkoutWindow === true);

    try {
      const m = await apiFetch<{
        latestWeight: { weight?: number; units?: string } | null;
      }>(`/metrics/today?date=${localToday()}`);
      if (m.latestWeight?.weight != null) {
        const w = m.latestWeight.weight;
        const u = m.latestWeight.units ?? "lb";
        setWeightLb(u === "kg" ? w * 2.20462 : w);
      }
    } catch {
      /* ignore */
    }

    try {
      const ph = await apiFetch<{ photos: { id: string; createdAt: string; note?: string }[] }>(
        "/media/progress-photos",
      );
      setPhotos(ph.photos ?? []);
    } catch {
      setPhotos([]);
    }
  }, []);

  async function addProgressPhoto() {
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      flash("Camera permission needed", "warn");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.5,
      base64: true,
      allowsEditing: true,
    });
    if (result.canceled || !result.assets?.[0]?.base64) return;
    setPhotoBusy(true);
    try {
      await apiFetch("/media/progress-photos", {
        method: "POST",
        body: JSON.stringify({
          imageBase64: result.assets[0].base64,
          note: "Progress",
          weight: weightLb ?? undefined,
          units: "lb",
          weighedAt: new Date().toISOString(),
        }),
      });
      flash("Progress photo saved");
      await load();
    } catch (e) {
      flash(e instanceof Error ? e.message : "Upload failed", "warn");
    } finally {
      setPhotoBusy(false);
    }
  }

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

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

  function cycleOverride(i: number) {
    setOverrides((prev) => {
      const next = [...prev];
      const cur = next[i];
      const idx = KIND_CYCLE.indexOf(cur ?? null);
      next[i] = KIND_CYCLE[(idx + 1) % KIND_CYCLE.length] ?? null;
      return next;
    });
  }

  function toggleGymWeekday(d: number) {
    setGymWeekdays((prev) => {
      const next = prev.includes(d) ? prev.filter((x) => x !== d) : [...prev, d].sort((a, b) => a - b);
      return next.length ? next : [d];
    });
  }

  async function saveProfile() {
    setSaving(true);
    try {
      const cm = resolveHeightCm();
      if (!cm) {
        flash("Enter a valid height", "warn");
        return;
      }
      if (!currentType || !goalType) {
        flash("Pick current and goal body type", "warn");
        return;
      }
      const prefs = await getPreferences();
      const suggested = suggestNutritionTargets({
        heightCm: cm,
        weightLb,
        bodyTypeCurrent: currentType,
        bodyTypeGoal: goalType,
        gymDaysPerWeek: prefs.gymDaysPerWeek,
      });
      const weekdays = gymWeekdays.length ? gymWeekdays : [1, 3, 5];
      const next: Preferences = {
        ...prefs,
        units,
        energyUnit,
        heightCm: cm,
        bodyTypeCurrent: currentType,
        bodyTypeGoal: goalType,
        focusMuscleIds: focusMuscles,
        scheduleMode,
        dayKindOverrides: overrides,
        gymWeekdays: weekdays,
        gymDaysPerWeek: Math.min(7, Math.max(1, weekdays.length)),
        progressionFocus: focus,
        restTimerSeconds: Math.min(600, Math.max(15, Number(restTimer) || 90)),
        lateNightWorkoutWindow: lateNight,
        ...(suggested
          ? {
              calorieTarget: suggested.calories,
              proteinTarget: suggested.protein,
              carbTarget: suggested.carbs,
              fatTarget: suggested.fat,
              fiberTarget: suggested.fiber,
              sugarTarget: suggested.sugar,
              sodiumTarget: suggested.sodium,
            }
          : {}),
      };
      await savePreferences(next);
      try {
        await pushPreferences(next);
        await syncNow();
        flash(suggested ? "Saved · Fuel targets + week plan updated" : "Saved · week plan rebuilt");
      } catch {
        flash("Saved on device — will sync later", "warn");
      }
    } catch (e) {
      flash(e instanceof Error ? e.message : "Save failed", "warn");
    } finally {
      setSaving(false);
    }
  }

  async function changePassword() {
    const err = passwordMeetsRules(newPw);
    if (err) {
      flash(err, "warn");
      return;
    }
    if (newPw !== confirmPw) {
      flash("New passwords do not match", "warn");
      return;
    }
    setPwBusy(true);
    try {
      await apiFetch("/auth/change-password", {
        method: "POST",
        body: JSON.stringify({ currentPassword: currentPw, newPassword: newPw }),
      });
      setCurrentPw("");
      setNewPw("");
      setConfirmPw("");
      flash("Password updated");
    } catch (e) {
      flash(e instanceof Error ? e.message : "Could not change password", "warn");
    } finally {
      setPwBusy(false);
    }
  }

  async function exportData(format: "json" | "csv") {
    setExportBusy(true);
    try {
      const base = await getApiUrl();
      const token = await getToken();
      if (!base || !token) {
        flash("Not signed in", "warn");
        return;
      }
      const url = `${base}/export/me?format=${format}`;
      const res = await fetch(url, { headers: { Authorization: `Bearer ${token}` } });
      if (!res.ok) throw new Error("Export failed");
      const text = await res.text();
      if (Platform.OS === "web" && typeof document !== "undefined") {
        const blob = new Blob([text], { type: format === "csv" ? "text/csv" : "application/json" });
        const a = document.createElement("a");
        a.href = URL.createObjectURL(blob);
        a.download = `forge-export.${format}`;
        a.click();
        URL.revokeObjectURL(a.href);
      } else {
        const path = `${FileSystem.cacheDirectory}forge-export.${format}`;
        await FileSystem.writeAsStringAsync(path, text, { encoding: FileSystem.EncodingType.UTF8 });
        await Share.share({ url: path, message: `Forge export (${format})`, title: "Forge export" });
      }
      flash("Export ready");
    } catch (e) {
      flash(e instanceof Error ? e.message : "Export failed", "warn");
    } finally {
      setExportBusy(false);
    }
  }

  async function signOut() {
    await clearSession();
    router.replace("/pair");
  }

  const cm = resolveHeightCm();
  const bmi = weightLb != null && cm ? calcBmi(lbToKg(weightLb), cm) : null;
  const weightDisplay =
    weightLb == null
      ? null
      : units === "kg"
        ? `${(weightLb / 2.20462).toFixed(1)} kg`
        : `${Math.round(weightLb)} lb`;

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <View style={styles.top}>
        <Pressable onPress={() => router.back()} hitSlop={12}>
          <Ionicons name="chevron-back" size={24} color={colors.accent} />
        </Pressable>
        <Text style={styles.title}>Account</Text>
      </View>
      <Text style={styles.sub}>Profile, training prefs, schedule, password, and sign out.</Text>

      {msg ? (
        <View style={[styles.banner, msgTone === "warn" ? styles.bannerWarn : styles.bannerOk]}>
          <Text style={styles.bannerText}>{msg}</Text>
        </View>
      ) : null}

      <Text style={styles.section}>Units</Text>
      <Text style={styles.hint}>Used for weight display in workouts and height entry.</Text>
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

      {units === "lb" ? (
        <>
          <Text style={styles.label}>Energy label (display)</Text>
          <View style={styles.chips}>
            {(["kcal", "cal"] as const).map((u) => (
              <Pressable
                key={u}
                style={[styles.chip, energyUnit === u && styles.chipOn]}
                onPress={() => setEnergyUnit(u)}
              >
                <Text style={[styles.chipText, energyUnit === u && styles.chipTextOn]}>{u}</Text>
              </Pressable>
            ))}
          </View>
          <Text style={styles.hint}>Storage stays in kcal — this only changes labels on Home / Fuel.</Text>
        </>
      ) : null}

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

      {bmi != null ? (
        <Text style={styles.bmi}>
          BMI {bmi} · {bmiCategory(bmi)}
          {weightDisplay ? ` · from ${weightDisplay}` : ""}
        </Text>
      ) : (
        <Text style={styles.hint}>BMI appears once height and a weight reading are set.</Text>
      )}

      <BodyTypePicker title="Where you are now" value={currentType} onChange={setCurrentType} />
      <BodyTypePicker title="Where you want to be" value={goalType} onChange={setGoalType} />
      <BodyFocusPicker value={focusMuscles} onChange={setFocusMuscles} />

      <Text style={styles.section}>Schedule</Text>
      <View style={styles.row}>
        <Text style={styles.label}>Manual day kinds</Text>
        <Switch
          value={scheduleMode === "manual"}
          onValueChange={(v) => setScheduleMode(v ? "manual" : "auto")}
          trackColor={{ false: colors.line, true: colors.accentDim }}
          thumbColor={scheduleMode === "manual" ? colors.accent : colors.textMuted}
        />
      </View>
      <Text style={styles.hint}>
        {scheduleMode === "manual"
          ? "Tap each weekday to cycle auto → gym → home → rest."
          : "Pick gym weekdays below. Other days use Home settings (home workout or rest)."}
      </Text>

      {scheduleMode === "manual" ? (
        <View style={styles.chips}>
          {WEEKDAY_LABELS.map((label, i) => (
            <Pressable key={label} style={styles.dayChip} onPress={() => cycleOverride(i)}>
              <Text style={styles.dayLabel}>{label}</Text>
              <Text style={styles.dayKind}>{overrides[i] ?? "auto"}</Text>
            </Pressable>
          ))}
        </View>
      ) : (
        <>
          <Text style={styles.label}>Gym weekdays</Text>
          <View style={styles.chips}>
            {WEEKDAY_LABELS.map((label, i) => {
              const on = gymWeekdays.includes(i);
              return (
                <Pressable key={label} style={[styles.chip, on && styles.chipOn]} onPress={() => toggleGymWeekday(i)}>
                  <Text style={[styles.chipText, on && styles.chipTextOn]}>{label}</Text>
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.hint}>
            {gymWeekdays.length} gym day{gymWeekdays.length === 1 ? "" : "s"} selected — also updates Gym day count.
          </Text>
        </>
      )}

      <Text style={styles.label}>Rest timer (seconds)</Text>
      <TextInput style={styles.input} keyboardType="numeric" value={restTimer} onChangeText={setRestTimer} />

      <View style={styles.row}>
        <View style={{ flex: 1, paddingRight: 12 }}>
          <Text style={styles.label}>Late workouts until 2 AM</Text>
          <Text style={styles.hint}>
            Before 2:00 AM, Home and Plan still use yesterday so a late finish counts for that day.
          </Text>
        </View>
        <Switch
          value={lateNight}
          onValueChange={setLateNight}
          trackColor={{ false: colors.line, true: colors.accentDim }}
          thumbColor={lateNight ? colors.accent : colors.textMuted}
        />
      </View>

      <Text style={styles.label}>Progression focus</Text>
      <View style={styles.chips}>
        {(["balanced", "weight", "reps"] as const).map((f) => (
          <Pressable key={f} style={[styles.chip, focus === f && styles.chipOn]} onPress={() => setFocus(f)}>
            <Text style={[styles.chipText, focus === f && styles.chipTextOn]}>{f}</Text>
          </Pressable>
        ))}
      </View>

      <ActionButton label="Save account & prefs" loading={saving} onPress={saveProfile} />

      <Text style={styles.section}>Progress photos</Text>
      <Text style={styles.hint}>Vault under your account — attach context to weigh-ins.</Text>
      <ActionButton label="Add progress photo" loading={photoBusy} onPress={() => void addProgressPhoto()} />
      {photos.length === 0 ? (
        <Text style={styles.hint}>No photos yet.</Text>
      ) : (
        photos.slice(0, 8).map((p) => (
          <Text key={p.id} style={styles.hint}>
            {p.createdAt.slice(0, 10)}
            {p.note ? ` · ${p.note}` : ""}
          </Text>
        ))
      )}

      <Text style={styles.section}>Export data</Text>
      <Text style={styles.hint}>Download workouts, fasting, nutrition, and health metrics.</Text>
      <ActionButton label="Export JSON" variant="ghost" loading={exportBusy} onPress={() => void exportData("json")} />
      <ActionButton label="Export CSV" variant="ghost" loading={exportBusy} onPress={() => void exportData("csv")} />

      <Text style={styles.section}>Change password</Text>
      <Text style={styles.label}>Current password</Text>
      <TextInput style={styles.input} secureTextEntry value={currentPw} onChangeText={setCurrentPw} autoCapitalize="none" />
      <Text style={styles.label}>New password</Text>
      <TextInput style={styles.input} secureTextEntry value={newPw} onChangeText={setNewPw} autoCapitalize="none" />
      <Text style={styles.label}>Confirm new password</Text>
      <TextInput style={styles.input} secureTextEntry value={confirmPw} onChangeText={setConfirmPw} autoCapitalize="none" />
      <ActionButton label="Update password" variant="ghost" loading={pwBusy} onPress={changePassword} />

      <ActionButton label="Sign out" variant="danger" onPress={signOut} />
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.sm, paddingBottom: 56 },
  top: { flexDirection: "row", alignItems: "center", gap: 8 },
  title: { color: colors.text, fontSize: 24, fontFamily: "SpaceGrotesk_700Bold" },
  sub: { color: colors.textMuted, fontFamily: "Outfit_500Medium" },
  section: {
    color: colors.text,
    fontFamily: "Outfit_700Bold",
    fontSize: 15,
    marginTop: spacing.md,
  },
  label: { color: colors.textMuted, fontFamily: "Outfit_500Medium" },
  hint: { color: colors.textMuted, fontSize: 12, fontFamily: "Outfit_500Medium" },
  bmi: { color: colors.accent, fontFamily: "Outfit_700Bold", fontSize: 14 },
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
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
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
  chipText: { color: colors.text, fontFamily: "Outfit_700Bold", fontSize: 13, textTransform: "capitalize" },
  chipTextOn: { color: colors.bg },
  dayChip: {
    width: "13%",
    minWidth: 44,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: 8,
    alignItems: "center",
    backgroundColor: colors.bgElevated,
  },
  dayLabel: { color: colors.textMuted, fontFamily: "Outfit_700Bold", fontSize: 11 },
  dayKind: { color: colors.accent, fontFamily: "Outfit_500Medium", fontSize: 10, textTransform: "uppercase" },
  banner: { borderRadius: 12, padding: 10, borderWidth: 1 },
  bannerOk: { backgroundColor: "#15241A", borderColor: colors.accentDim },
  bannerWarn: { backgroundColor: "#2A2218", borderColor: colors.warn },
  bannerText: { color: colors.text, fontFamily: "Outfit_700Bold" },
});
