import { Platform, Pressable, StyleSheet, Text, useWindowDimensions, View } from "react-native";
import { CachedImage } from "./CachedImage";
import { EQUIPMENT_OPTIONS, type EquipmentOption } from "../db/types";
import { colors, spacing } from "../theme/colors";

type Props = {
  scope: "gym" | "home";
  selected: string[];
  onToggle: (id: string) => void;
};

export function EquipmentGrid({ scope, selected, onToggle }: Props) {
  const { width } = useWindowDimensions();
  const options = EQUIPMENT_OPTIONS.filter((e) => e.scopes.includes(scope));
  // Cap tile width on PC so % widths don't stretch into giant cards
  const cols = width >= 900 ? 4 : width >= 600 ? 3 : 2;
  const gap = spacing.sm;
  const horizontalPad = spacing.lg * 2;
  const tileWidth = Math.min(220, Math.floor((Math.min(width, 960) - horizontalPad - gap * (cols - 1)) / cols));

  return (
    <View style={styles.grid}>
      {options.map((eq) => (
        <EquipmentTile
          key={eq.id}
          option={eq}
          on={selected.includes(eq.id)}
          onPress={() => onToggle(eq.id)}
          width={tileWidth}
        />
      ))}
    </View>
  );
}

function EquipmentTile({
  option,
  on,
  onPress,
  width,
}: {
  option: EquipmentOption;
  on: boolean;
  onPress: () => void;
  width: number;
}) {
  return (
    <Pressable style={[styles.tile, { width }, on && styles.tileOn]} onPress={onPress}>
      <View style={styles.imgWrap}>
        <CachedImage uri={option.image} style={styles.img} recyclingKey={`eq-${option.id}`} />
      </View>
      <Text style={[styles.label, on && styles.labelOn]} numberOfLines={2}>
        {option.label}
      </Text>
      <Text style={[styles.badge, on && styles.badgeOn]}>{on ? "On" : "Off"}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  grid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: spacing.sm,
    ...(Platform.OS === "web" ? { maxWidth: 960, alignSelf: "flex-start" as const } : null),
  },
  tile: {
    backgroundColor: colors.bgElevated,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    overflow: "hidden",
    paddingBottom: 10,
  },
  tileOn: {
    borderColor: colors.accent,
    backgroundColor: "#15241A",
  },
  imgWrap: {
    width: "100%",
    aspectRatio: 4 / 3,
    backgroundColor: colors.line,
    overflow: "hidden",
  },
  img: {
    width: "100%",
    height: "100%",
  },
  label: {
    color: colors.text,
    fontFamily: "Outfit_700Bold",
    fontSize: 13,
    paddingHorizontal: 10,
    paddingTop: 8,
  },
  labelOn: { color: colors.accent },
  badge: {
    color: colors.textMuted,
    fontFamily: "Outfit_500Medium",
    fontSize: 11,
    paddingHorizontal: 10,
    marginTop: 2,
  },
  badgeOn: { color: colors.accentDim },
});
