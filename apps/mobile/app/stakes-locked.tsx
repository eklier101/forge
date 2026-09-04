import { useEffect, useMemo, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useLocalSearchParams, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ActionButton } from "../src/components/ActionButton";
import { catalogLabel, syncAppStakesLock } from "../src/lib/appStakes";
import { colors, spacing } from "../src/theme/colors";

export default function StakesLockedScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const params = useLocalSearchParams<{ app?: string }>();
  const [busy, setBusy] = useState(false);
  const [statusHint, setStatusHint] = useState<string | null>(null);

  const appLabel = useMemo(() => {
    const pkg = typeof params.app === "string" ? params.app : "";
    if (!pkg) return "that app";
    return catalogLabel(pkg);
  }, [params.app]);

  useEffect(() => {
    void syncAppStakesLock().then((r) => {
      if (r?.reason === "workout_done") {
        setStatusHint("Today’s workout is done — you’re unlocked. Head home.");
      } else if (r?.reason === "rest_day") {
        setStatusHint("Rest day — apps aren’t locked. Head home.");
      } else if (r && !r.locked) {
        setStatusHint("You’re unlocked right now.");
      }
    });
  }, []);

  if (Platform.OS !== "android") {
    return (
      <View style={[styles.root, { paddingTop: insets.top + spacing.lg }]}>
        <Text style={styles.title}>App stakes</Text>
        <Text style={styles.body}>Phone app locks are Android-only for now.</Text>
        <ActionButton label="Back" onPress={() => router.replace("/(tabs)/today")} />
      </View>
    );
  }

  return (
    <View style={[styles.root, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.lg }]}>
      <Text style={styles.kicker}>WORKOUT STAKES</Text>
      <Text style={styles.title}>{appLabel} can wait</Text>
      <Text style={styles.body}>
        Finish today’s Forge workout first. Apps you locked stay blocked until you train. Rest days stay unlocked
        automatically.
      </Text>
      {statusHint ? <Text style={styles.hint}>{statusHint}</Text> : null}
      <ActionButton
        label={busy ? "Opening…" : "Start workout"}
        loading={busy}
        onPress={() => {
          setBusy(true);
          router.replace("/(tabs)/today");
        }}
      />
      <Pressable
        onPress={() => router.replace("/(tabs)/today")}
        style={styles.secondary}
        accessibilityRole="button"
      >
        <Text style={styles.secondaryText}>Back to Home</Text>
      </Pressable>
      <Text style={styles.hint}>
        Grace minutes start when the lock turns on for the day — not as a usage timer. Digital Wellbeing still applies
        after unlock.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.bg,
    paddingHorizontal: spacing.lg,
    gap: spacing.md,
    justifyContent: "center",
  },
  kicker: {
    color: colors.warn,
    fontFamily: "Outfit_700Bold",
    letterSpacing: 1.2,
    fontSize: 12,
  },
  title: {
    color: colors.text,
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 32,
    lineHeight: 38,
  },
  body: {
    color: colors.textMuted,
    fontFamily: "Outfit_500Medium",
    fontSize: 16,
    lineHeight: 24,
    marginBottom: spacing.sm,
  },
  secondary: { paddingVertical: 12, alignItems: "center" },
  secondaryText: { color: colors.accent, fontFamily: "Outfit_700Bold", fontSize: 15 },
  hint: {
    color: colors.textMuted,
    fontFamily: "Outfit_500Medium",
    fontSize: 12,
    lineHeight: 17,
    marginTop: spacing.md,
  },
});
