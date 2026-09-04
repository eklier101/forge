import { Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { colors, spacing } from "../theme/colors";

type BackProps = {
  label?: string;
  onPress: () => void;
};

/** Consistent back link: accent chevron + destination label. */
export function BackLink({ label = "Back", onPress }: BackProps) {
  return (
    <Pressable onPress={onPress} hitSlop={12} style={styles.backRow} accessibilityRole="button">
      <Ionicons name="chevron-back" size={22} color={colors.accent} />
      <Text style={styles.backText}>{label}</Text>
    </Pressable>
  );
}

type HeaderProps = {
  title: string;
  subtitle?: string;
  backLabel?: string;
  onBack?: () => void;
};

/** Title block with optional back link and safe-area top padding. */
export function ScreenHeader({ title, subtitle, backLabel, onBack }: HeaderProps) {
  const insets = useSafeAreaInsets();
  return (
    <View style={{ paddingTop: Math.max(insets.top, 8), gap: spacing.sm }}>
      {onBack ? <BackLink label={backLabel} onPress={onBack} /> : null}
      <Text style={styles.title}>{title}</Text>
      {subtitle ? <Text style={styles.sub}>{subtitle}</Text> : null}
    </View>
  );
}

type BannerProps = {
  message: string;
  tone?: "ok" | "warn";
};

export function FlashBanner({ message, tone = "ok" }: BannerProps) {
  return (
    <View style={[styles.banner, tone === "warn" ? styles.bannerWarn : styles.bannerOk]}>
      <Text style={styles.bannerText}>{message}</Text>
    </View>
  );
}

/** Shared card chrome for settings / hub screens. */
export function SettingsCard({
  kicker,
  title,
  children,
}: {
  kicker?: string;
  title?: string;
  children: React.ReactNode;
}) {
  return (
    <View style={styles.card}>
      {kicker ? <Text style={styles.cardKicker}>{kicker}</Text> : null}
      {title ? <Text style={styles.cardTitle}>{title}</Text> : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  backRow: { flexDirection: "row", alignItems: "center", gap: 2, alignSelf: "flex-start" },
  backText: { color: colors.accent, fontFamily: "Outfit_700Bold", fontSize: 15 },
  title: { color: colors.text, fontFamily: "SpaceGrotesk_700Bold", fontSize: 28 },
  sub: { color: colors.textMuted, fontFamily: "Outfit_500Medium", fontSize: 14, marginTop: -4 },
  banner: { borderRadius: 12, padding: 12, borderWidth: 1 },
  bannerOk: { backgroundColor: "#15241A", borderColor: colors.accentDim },
  bannerWarn: { backgroundColor: "#2A2218", borderColor: colors.warn },
  bannerText: { color: colors.text, fontFamily: "Outfit_700Bold", fontSize: 13 },
  card: {
    backgroundColor: colors.bgElevated,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardKicker: {
    color: colors.accent,
    fontFamily: "Outfit_700Bold",
    fontSize: 11,
    letterSpacing: 1,
  },
  cardTitle: { color: colors.text, fontFamily: "Outfit_700Bold", fontSize: 17 },
});
