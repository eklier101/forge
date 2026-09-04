import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { ActionButton } from "./ActionButton";
import { colors, spacing } from "../theme/colors";

export type FeatureFlags = {
  /** Gym sessions on Home / Plan */
  gym: boolean;
  /** At-home sessions on Home / Plan */
  home: boolean;
  fuel: boolean;
  fast: boolean;
  photos: boolean;
  sync: boolean;
  aiPlan: boolean;
  aiEstimate: boolean;
  autoTargets: boolean;
  /** Show Home Assistant setup in Admin and allow HA-related surfaces */
  homeAssistant: boolean;
};

export const FEATURE_ROWS = [
  {
    key: "gym" as const,
    label: "Gym workouts",
    desc: "Gym days, Plan gym sessions, and the Home workout card on gym days",
  },
  {
    key: "home" as const,
    label: "Home workouts",
    desc: "At-home sessions and the Home workout card on home days. Plan tab hides if gym and home are both off",
  },
  { key: "fuel" as const, label: "Fuel / nutrition", desc: "Meals, presets, recipes, macros" },
  { key: "fast" as const, label: "Fasting", desc: "Intermittent fasts and timers" },
  { key: "photos" as const, label: "Progress photos", desc: "Vault, prompts, post-workout reminders — hides everywhere when off" },
  {
    key: "homeAssistant" as const,
    label: "Home Assistant",
    desc: "Admin HA setup + workout/fuel/fast events to HA. Off hides Admin HA and disables publish.",
  },
  {
    key: "sync" as const,
    label: "App sync",
    desc: "Keeps this phone in sync with the Forge server. Offline logging still works; APK updates still use the server URL.",
  },
  { key: "aiPlan" as const, label: "Smart workout plans", desc: "ML polish on daily plans (Ollama)" },
  { key: "aiEstimate" as const, label: "AI food estimates", desc: "Photo / describe calorie guesses (needs Fuel on)" },
  { key: "autoTargets" as const, label: "Auto nutrition targets", desc: "Suggest calories from profile + goal (needs Fuel on)" },
] as const;

type Props = {
  visible: boolean;
  features: FeatureFlags;
  busyKey?: keyof FeatureFlags | null;
  /** Home Assistant only matters for admins */
  isAdmin?: boolean;
  onClose: () => void;
  onToggle: (key: keyof FeatureFlags, value: boolean) => void;
};

export function FeaturesModal({ visible, features, busyKey, isAdmin, onClose, onToggle }: Props) {
  const fuelOn = features.fuel !== false;
  const rows = FEATURE_ROWS.filter((f) => {
    if (f.key === "homeAssistant" && !isAdmin) return false;
    if ((f.key === "aiEstimate" || f.key === "autoTargets") && !fuelOn) return false;
    return true;
  });
  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityRole="button" />
        <View style={styles.card}>
          <Text style={styles.title}>Features</Text>
          <Text style={styles.hint}>
            Off hides that area everywhere. Fuel off also turns off AI food estimates and auto nutrition targets.
          </Text>
          <ScrollView
            style={styles.scroll}
            contentContainerStyle={{ gap: 14, paddingBottom: 8 }}
            keyboardShouldPersistTaps="handled"
          >
            {rows.map((f) => {
              const on = features[f.key] !== false;
              const rowBusy = busyKey === f.key;
              return (
                <View key={f.key} style={styles.row}>
                  <View style={{ flex: 1, paddingRight: 8 }}>
                    <Text style={styles.label}>{f.label}</Text>
                    <Text style={styles.desc}>{f.desc}</Text>
                  </View>
                  <Switch
                    value={on}
                    disabled={rowBusy}
                    onValueChange={(v) => onToggle(f.key, v)}
                    trackColor={{ false: colors.line, true: colors.accentDim }}
                    thumbColor={on ? colors.accent : colors.textMuted}
                    ios_backgroundColor={colors.line}
                    style={styles.switch}
                  />
                </View>
              );
            })}
          </ScrollView>
          <ActionButton label="Done" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.6)",
    justifyContent: "center",
    padding: spacing.lg,
  },
  card: {
    backgroundColor: colors.bgElevated,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.lg,
    gap: 12,
    maxHeight: "88%",
  },
  scroll: { flexGrow: 0 },
  title: { color: colors.text, fontFamily: "Outfit_700Bold", fontSize: 18 },
  hint: { color: colors.textMuted, fontFamily: "Outfit_500Medium", fontSize: 13, marginBottom: 4 },
  row: { flexDirection: "row", alignItems: "center", gap: 10, minHeight: 48 },
  label: { color: colors.text, fontFamily: "Outfit_700Bold", fontSize: 14 },
  desc: { color: colors.textMuted, fontFamily: "Outfit_500Medium", fontSize: 12, marginTop: 2, lineHeight: 16 },
  switch: { transform: [{ scaleX: 1.05 }, { scaleY: 1.05 }] },
});
