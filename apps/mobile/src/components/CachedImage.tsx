import { Platform, StyleSheet, View, type StyleProp, type ImageStyle, type ViewStyle } from "react-native";
import { Image, type ImageContentFit } from "expo-image";
import { useMemo, useState } from "react";
import { normalizeExerciseImageUrl } from "../lib/exerciseImages";
import { colors } from "../theme/colors";

type Props = {
  uri?: string | null;
  style?: StyleProp<ImageStyle>;
  contentFit?: ImageContentFit;
  recyclingKey?: string;
};

/** Disk-cached remote image — avoids re-downloading GitHub exercise frames on every scroll. */
export function CachedImage({ uri, style, contentFit = "cover", recyclingKey }: Props) {
  const primary = useMemo(() => normalizeExerciseImageUrl(uri), [uri]);
  const [failed, setFailed] = useState(false);

  if (!primary || failed) {
    return <View style={[styles.empty, style as ViewStyle]} />;
  }

  return (
    <Image
      source={{ uri: primary }}
      style={[styles.base, style]}
      contentFit={contentFit}
      cachePolicy="memory-disk"
      recyclingKey={recyclingKey ?? primary}
      transition={120}
      onError={() => setFailed(true)}
      {...(Platform.OS === "web" ? ({ className: "forge-cached-img" } as object) : {})}
    />
  );
}

/** Fire-and-forget prefetch so catalog thumbs are warm before the user scrolls. */
export function prefetchExerciseImages(
  exercises: { imageStart?: string | null; imageEnd?: string | null }[],
  limit = 80,
) {
  const urls: string[] = [];
  for (const ex of exercises) {
    const a = normalizeExerciseImageUrl(ex.imageStart);
    const b = normalizeExerciseImageUrl(ex.imageEnd);
    if (a) urls.push(a);
    if (b && b !== a) urls.push(b);
    if (urls.length >= limit) break;
  }
  if (urls.length) {
    void Image.prefetch(urls, "memory-disk");
  }
}

const styles = StyleSheet.create({
  base: {
    backgroundColor: colors.bgSoft,
    ...(Platform.OS === "web" ? { maxWidth: "100%" as unknown as number } : null),
  },
  empty: { backgroundColor: colors.bgSoft },
});
