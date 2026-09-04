import { StyleSheet, Text, View } from "react-native";
import { ActionButton } from "./ActionButton";
import { colors, spacing } from "../theme/colors";

type Props = {
  title: string;
  description: string;
  onEnable: () => void;
  busy?: boolean;
};

/** Shown when a feature is turned off — only title, description, and Turn on. */
export function FeatureOffCard({ title, description, onEnable, busy }: Props) {
  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>{title}</Text>
      <Text style={styles.desc}>{description}</Text>
      <ActionButton label="Turn on" loading={busy} onPress={onEnable} />
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    justifyContent: "center",
    padding: spacing.lg,
    gap: spacing.md,
    backgroundColor: colors.bg,
  },
  title: { color: colors.text, fontFamily: "SpaceGrotesk_700Bold", fontSize: 26 },
  desc: { color: colors.textMuted, fontFamily: "Outfit_500Medium", fontSize: 15, lineHeight: 22 },
});
