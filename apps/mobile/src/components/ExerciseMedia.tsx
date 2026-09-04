import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useState } from "react";
import { CachedImage } from "./CachedImage";
import { colors, spacing } from "../theme/colors";

type Props = {
  name: string;
  imageStart?: string | null;
  imageEnd?: string | null;
  instructions?: string[] | null;
  compact?: boolean;
  /** Always show start/end photos; keep how-to steps behind toggle when compact. */
  showImages?: boolean;
};

/** Start + end frames show the motion; instructions explain the movement. */
export function ExerciseMedia({
  name,
  imageStart,
  imageEnd,
  instructions,
  compact,
  showImages,
}: Props) {
  const [open, setOpen] = useState(!compact);
  const imgs = [imageStart, imageEnd].filter((u) => typeof u === "string" && u.length > 0) as string[];
  const steps = instructions?.filter((s) => typeof s === "string" && s.trim().length > 0) ?? [];
  const imagesVisible = showImages || open;
  const stepsVisible = open;

  return (
    <View style={styles.wrap}>
      {imgs.length && imagesVisible ? (
        <View style={styles.images}>
          {imgs.map((uri, i) => (
            <View key={`${uri}-${i}`} style={styles.frame}>
              <View style={styles.imgWrap}>
                <CachedImage uri={uri} style={styles.img} recyclingKey={`${name}-${i}`} />
              </View>
              <Text style={styles.caption}>{i === 0 ? "Start" : "Finish"}</Text>
            </View>
          ))}
        </View>
      ) : null}
      {compact ? (
        <Pressable onPress={() => setOpen((v) => !v)} hitSlop={8}>
          <Text style={styles.toggle}>{open ? "Hide how-to" : "Show how-to"}</Text>
        </Pressable>
      ) : null}
      {stepsVisible ? (
        <>
          {!imgs.length && !showImages ? (
            <Text style={styles.missing}>No demo photos for this move yet — follow the steps below.</Text>
          ) : null}
          {steps.length ? (
            <View style={styles.steps}>
              {steps.map((step, i) => (
                <Text key={i} style={styles.step}>
                  {i + 1}. {step}
                </Text>
              ))}
            </View>
          ) : (
            <Text style={styles.step}>Perform {name} with controlled form through the full range.</Text>
          )}
        </>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: 8, marginTop: 8, width: "100%", maxWidth: Platform.OS === "web" ? 720 : undefined },
  toggle: { color: colors.accent, fontFamily: "Outfit_700Bold", fontSize: 13 },
  missing: { color: colors.textMuted, fontFamily: "Outfit_500Medium", fontSize: 12 },
  images: {
    flexDirection: "row",
    flexWrap: "wrap",
    gap: 8,
  },
  frame: {
    width: Platform.OS === "web" ? 280 : ("48%" as `${number}%`),
    maxWidth: "100%",
    flexGrow: 0,
    borderRadius: 12,
    overflow: "hidden",
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.bgSoft,
  },
  imgWrap: {
    width: "100%",
    aspectRatio: 4 / 3,
    backgroundColor: colors.bgSoft,
    position: "relative",
  },
  img: { ...StyleSheet.absoluteFill },
  caption: {
    color: colors.textMuted,
    fontFamily: "Outfit_500Medium",
    fontSize: 11,
    textAlign: "center",
    paddingVertical: 4,
  },
  steps: { gap: 4 },
  step: { color: colors.textMuted, fontFamily: "Outfit_500Medium", fontSize: 12, lineHeight: 18 },
});
