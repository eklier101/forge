import { useCallback, useMemo, useState } from "react";
import { FlatList, Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { CachedImage } from "../src/components/CachedImage";
import { ExerciseMedia } from "../src/components/ExerciseMedia";
import { BackLink } from "../src/components/ScreenChrome";
import { getPreferences } from "../src/db/local";
import { apiFetch } from "../src/lib/api";
import { safeGoBack } from "../src/lib/navigation";
import {
  cacheExercises,
  listCachedExercises,
  toggleDislike,
  toggleFavorite,
} from "../src/lib/workout";
import type { Exercise } from "../src/types/workout";
import { colors, spacing } from "../src/theme/colors";

export default function MovesScreen() {
  const router = useRouter();
  const [exercises, setExercises] = useState<Exercise[]>([]);
  const [query, setQuery] = useState("");
  const [favorites, setFavorites] = useState<string[]>([]);
  const [disliked, setDisliked] = useState<string[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        const prefs = await getPreferences();
        if (!alive) return;
        setFavorites(prefs.favoriteExerciseIds);
        setDisliked(prefs.dislikedExerciseIds);

        const cached = await listCachedExercises();
        if (alive && cached.length) setExercises(cached);

        try {
          const res = await apiFetch<{ exercises: Exercise[] }>("/exercises");
          if (!alive) return;
          setExercises(res.exercises);
          await cacheExercises(res.exercises);
        } catch {
          if (alive && !cached.length) {
            const again = await listCachedExercises();
            setExercises(again);
          }
        }
      })();
      return () => {
        alive = false;
      };
    }, []),
  );

  const visible = useMemo(() => {
    const q = query.trim().toLowerCase();
    return exercises
      .filter((e) => {
        if (!q) return true;
        return (
          e.name.toLowerCase().includes(q) ||
          e.muscleGroup.toLowerCase().includes(q) ||
          e.equipment.toLowerCase().includes(q) ||
          e.location.toLowerCase().includes(q)
        );
      })
      .sort((a, b) => {
        const af = favorites.includes(a.id) ? 1 : 0;
        const bf = favorites.includes(b.id) ? 1 : 0;
        if (af !== bf) return bf - af;
        return a.name.localeCompare(b.name);
      });
  }, [exercises, query, favorites]);

  async function syncPrefs(nextFav: string[], nextDis: string[]) {
    setFavorites(nextFav);
    setDisliked(nextDis);
    try {
      await apiFetch("/preferences", {
        method: "PATCH",
        body: JSON.stringify({
          favoriteExerciseIds: nextFav,
          dislikedExerciseIds: nextDis,
        }),
      });
    } catch {
      /* offline */
    }
  }

  async function onFav(id: string) {
    const prefs = await toggleFavorite(id);
    await syncPrefs(prefs.favoriteExerciseIds, prefs.dislikedExerciseIds);
  }

  async function onDislike(id: string) {
    const prefs = await toggleDislike(id);
    await syncPrefs(prefs.favoriteExerciseIds, prefs.dislikedExerciseIds);
  }

  const renderItem = useCallback(
    ({ item: ex }: { item: Exercise }) => {
      const fav = favorites.includes(ex.id);
      const bad = disliked.includes(ex.id);
      const isOpen = expanded === ex.id;
      return (
        <View style={[styles.card, bad && styles.rowBad]}>
          <Pressable style={styles.row} onPress={() => setExpanded(isOpen ? null : ex.id)}>
            {ex.imageStart ? (
              <CachedImage uri={ex.imageStart} style={styles.thumb} recyclingKey={`thumb-${ex.id}`} />
            ) : (
              <View style={[styles.thumb, styles.thumbEmpty]} />
            )}
            <View style={{ flex: 1 }}>
              <Text style={styles.name}>{ex.name}</Text>
              <Text style={styles.meta}>
                {ex.muscleGroup} · {ex.equipment}
              </Text>
            </View>
            <Pressable style={styles.iconBtn} onPress={() => void onFav(ex.id)}>
              <Text style={{ color: fav ? colors.accent : colors.textMuted, fontSize: 20 }}>{fav ? "★" : "☆"}</Text>
            </Pressable>
            <Pressable style={styles.iconBtn} onPress={() => void onDislike(ex.id)}>
              <Text style={{ color: bad ? colors.danger : colors.textMuted, fontSize: 16 }}>✕</Text>
            </Pressable>
          </Pressable>
          {isOpen ? (
            <ExerciseMedia
              name={ex.name}
              imageStart={ex.imageStart}
              imageEnd={ex.imageEnd}
              instructions={ex.instructions}
            />
          ) : null}
        </View>
      );
    },
    [favorites, disliked, expanded],
  );

  return (
    <FlatList
      style={styles.root}
      contentContainerStyle={styles.content}
      data={visible}
      keyExtractor={(ex) => ex.id}
      renderItem={renderItem}
      initialNumToRender={12}
      maxToRenderPerBatch={8}
      windowSize={7}
      removeClippedSubviews
      keyboardShouldPersistTaps="handled"
      ListHeaderComponent={
        <View style={styles.header}>
          <BackLink label="You" onPress={() => safeGoBack(router)} />
          <Text style={styles.title}>Moves</Text>
          <Text style={styles.sub}>Search the catalog. Favorite or dislike to shape plans.</Text>
          <TextInput
            style={styles.search}
            value={query}
            onChangeText={setQuery}
            placeholder="Search name, muscle, equipment…"
            placeholderTextColor={colors.textMuted}
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="while-editing"
          />
          {query.trim() ? (
            <Text style={styles.count}>
              {visible.length} match{visible.length === 1 ? "" : "es"}
            </Text>
          ) : null}
        </View>
      }
    />
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.sm, paddingBottom: 40 },
  header: { gap: spacing.sm, marginBottom: spacing.sm },
  title: { color: colors.text, fontSize: 28, fontFamily: "SpaceGrotesk_700Bold" },
  sub: { color: colors.textMuted, fontFamily: "Outfit_500Medium" },
  search: {
    backgroundColor: colors.bgElevated,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontFamily: "Outfit_500Medium",
    fontSize: 16,
  },
  count: { color: colors.textMuted, fontFamily: "Outfit_500Medium", fontSize: 12 },
  card: {
    backgroundColor: colors.bgElevated,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  thumb: { width: 56, height: 56, borderRadius: 10, backgroundColor: colors.bgSoft },
  thumbEmpty: { borderWidth: 1, borderColor: colors.line },
  rowBad: { opacity: 0.55 },
  name: { color: colors.text, fontFamily: "Outfit_700Bold" },
  meta: { color: colors.textMuted, fontFamily: "Outfit_500Medium", marginTop: 2, fontSize: 12 },
  iconBtn: { padding: 8 },
});
