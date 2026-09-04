import { ActivityIndicator, Pressable, StyleSheet, Text, type PressableProps, type StyleProp, type ViewStyle } from "react-native";
import { colors, spacing } from "../theme/colors";

type Variant = "primary" | "ghost" | "danger";

type Props = PressableProps & {
  label: string;
  loading?: boolean;
  variant?: Variant;
  /** Smaller, quieter control for secondary destructive / rare actions. */
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function ActionButton({ label, loading, variant = "primary", compact, disabled, style, ...rest }: Props) {
  const isDisabled = disabled || loading;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={isDisabled}
      style={({ pressed }) => [
        styles.base,
        compact && styles.baseCompact,
        variant === "primary" && styles.primary,
        variant === "ghost" && styles.ghost,
        variant === "danger" && styles.danger,
        compact && variant === "ghost" && styles.ghostCompact,
        pressed && !isDisabled && styles.pressed,
        isDisabled && styles.disabled,
        style,
      ]}
      android_ripple={{ color: "rgba(255,255,255,0.15)" }}
      {...rest}
    >
      {loading ? (
        <ActivityIndicator color={variant === "ghost" ? colors.accent : colors.bg} />
      ) : (
        <Text
          style={[
            styles.label,
            compact && styles.labelCompact,
            variant === "ghost" && styles.labelGhost,
            variant === "danger" && styles.labelOnColor,
            variant === "primary" && styles.labelOnColor,
            compact && variant === "ghost" && styles.labelGhostCompact,
          ]}
        >
          {label}
        </Text>
      )}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  base: {
    borderRadius: 999,
    paddingVertical: 14,
    paddingHorizontal: spacing.lg,
    alignItems: "center",
    justifyContent: "center",
    minHeight: 48,
    marginTop: spacing.sm,
  },
  baseCompact: {
    minHeight: 30,
    paddingVertical: 4,
    paddingHorizontal: 10,
    marginTop: 4,
    alignSelf: "center",
  },
  primary: { backgroundColor: colors.accent },
  ghost: { backgroundColor: colors.bgSoft, borderWidth: 1, borderColor: colors.line },
  ghostCompact: {
    backgroundColor: "transparent",
    borderWidth: 0,
    opacity: 0.75,
  },
  danger: { backgroundColor: colors.danger },
  pressed: { opacity: 0.75, transform: [{ scale: 0.98 }] },
  disabled: { opacity: 0.55 },
  label: { fontFamily: "Outfit_700Bold", fontSize: 16 },
  labelCompact: { fontSize: 12, fontFamily: "Outfit_500Medium" },
  labelOnColor: { color: colors.bg },
  labelGhost: { color: colors.text },
  labelGhostCompact: { color: colors.textMuted },
});
