import { useEffect, useState } from "react";
import { Image, Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { Ionicons } from "@expo/vector-icons";
import { BODY_TYPE_OPTIONS, bodyTypeOption } from "../lib/bodyProfile";
import { colors, spacing } from "../theme/colors";

type Props = {
  title: string;
  value: string | null;
  onChange: (id: string) => void;
  /** Start collapsed when a value is already chosen */
  collapseWhenSet?: boolean;
};

/** Collapsed summary row; tap to expand picture grid and pick a body type. */
export function BodyTypePicker({ title, value, onChange, collapseWhenSet = true }: Props) {
  const [expanded, setExpanded] = useState(!(collapseWhenSet && value));

  useEffect(() => {
    if (collapseWhenSet && value) setExpanded(false);
  }, [value, collapseWhenSet]);

  const selected = bodyTypeOption(value);

  return (
    <View style={styles.wrap}>
      <Text style={styles.section}>{title}</Text>
      {!expanded && selected ? (
        <Pressable style={styles.summary} onPress={() => setExpanded(true)}>
          <View style={styles.summaryImgWrap}>
            <Image source={selected.image} style={styles.summaryImg} resizeMode="cover" />
          </View>
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={styles.summaryLabel}>{selected.label}</Text>
            <Text style={styles.summaryBlurb}>{selected.blurb}</Text>
            <Text style={styles.tapHint}>Tap to change</Text>
          </View>
          <Ionicons name="chevron-down" size={18} color={colors.accent} />
        </Pressable>
      ) : (
        <>
          {selected && collapseWhenSet ? (
            <Pressable style={styles.collapseLink} onPress={() => setExpanded(false)}>
              <Text style={styles.tapHint}>Collapse</Text>
              <Ionicons name="chevron-up" size={16} color={colors.accent} />
            </Pressable>
          ) : null}
          <View style={styles.typeGrid}>
            {BODY_TYPE_OPTIONS.map((b) => {
              const on = value === b.id;
              return (
                <Pressable
                  key={b.id}
                  onPress={() => {
                    onChange(b.id);
                    if (collapseWhenSet) setExpanded(false);
                  }}
                  style={[styles.typeCard, on && { borderColor: b.tone }]}
                >
                  <View style={styles.typeImgWrap}>
                    <Image source={b.image} style={styles.typeImg} resizeMode="cover" />
                  </View>
                  <Text style={styles.typeLabel}>{b.label}</Text>
                  <Text style={styles.typeBlurb}>{b.blurb}</Text>
                </Pressable>
              );
            })}
          </View>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    gap: spacing.sm,
    width: "100%",
    ...(Platform.OS === "web" ? { maxWidth: 720, alignSelf: "flex-start" as const } : null),
  },
  section: { color: colors.text, fontFamily: "Outfit_700Bold", fontSize: 15, marginTop: spacing.md },
  summary: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    backgroundColor: colors.bgElevated,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.accentDim,
    padding: 10,
    width: "100%",
  },
  summaryImgWrap: {
    width: 56,
    height: 72,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: colors.bgSoft,
    flexShrink: 0,
  },
  summaryImg: { width: "100%", height: "100%" },
  summaryLabel: { color: colors.text, fontFamily: "Outfit_700Bold", fontSize: 16 },
  summaryBlurb: { color: colors.textMuted, fontFamily: "Outfit_500Medium", fontSize: 12, marginTop: 2 },
  tapHint: { color: colors.accent, fontFamily: "Outfit_700Bold", fontSize: 12, marginTop: 4 },
  collapseLink: { flexDirection: "row", alignItems: "center", gap: 4, alignSelf: "flex-end" },
  typeGrid: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 10,
    width: "100%",
  },
  typeCard: {
    width: Platform.OS === "web" ? 160 : ("47%" as `${number}%`),
    maxWidth: Platform.OS === "web" ? 180 : ("48%" as `${number}%`),
    flexGrow: Platform.OS === "web" ? 0 : 1,
    minWidth: Platform.OS === "web" ? 140 : 140,
    borderRadius: 14,
    borderWidth: 1.5,
    borderColor: colors.line,
    backgroundColor: colors.bgElevated,
    padding: 10,
    gap: 6,
    alignItems: "stretch",
  },
  typeImgWrap: {
    width: "100%",
    aspectRatio: 3 / 4,
    borderRadius: 10,
    overflow: "hidden",
    backgroundColor: colors.bgSoft,
    ...(Platform.OS === "web" ? { maxHeight: 200 } : null),
  },
  typeImg: {
    width: "100%",
    height: "100%",
    ...(Platform.OS === "web" ? ({ objectFit: "cover", maxWidth: "100%" } as object) : null),
  },
  typeLabel: { color: colors.text, fontFamily: "Outfit_700Bold", fontSize: 15 },
  typeBlurb: { color: colors.textMuted, fontFamily: "Outfit_500Medium", fontSize: 11 },
});
