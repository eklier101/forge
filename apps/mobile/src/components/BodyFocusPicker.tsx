import { Pressable, StyleSheet, Text, View } from "react-native";
import Body, { type ExtendedBodyPart, type Slug } from "react-native-body-highlighter";
import { colors, spacing } from "../theme/colors";

/** Focus id → library SVG slug(s). One focus = one tap target group. */
const FOCUS_TO_SLUGS: Record<string, ReadonlyArray<Slug>> = {
  chest: ["chest"],
  shoulders: ["deltoids"],
  traps: ["trapezius"],
  lats: ["upper-back"],
  "lower-back": ["lower-back"],
  biceps: ["biceps"],
  triceps: ["triceps"],
  forearms: ["forearm"],
  abs: ["abs"],
  obliques: ["obliques"],
  legs: ["quadriceps"],
  adductors: ["adductors"],
  hamstrings: ["hamstring"],
  glutes: ["gluteal"],
  calves: ["calves"],
  tibialis: ["tibialis"],
};

/** Library slug → focus id */
const SLUG_TO_FOCUS: Partial<Record<Slug, string>> = {
  chest: "chest",
  deltoids: "shoulders",
  trapezius: "traps",
  "upper-back": "lats",
  "lower-back": "lower-back",
  biceps: "biceps",
  triceps: "triceps",
  forearm: "forearms",
  abs: "abs",
  obliques: "obliques",
  quadriceps: "legs",
  adductors: "adductors",
  hamstring: "hamstrings",
  gluteal: "glutes",
  calves: "calves",
  tibialis: "tibialis",
};

export const FOCUS_MUSCLES: { id: string; label: string }[] = [
  { id: "chest", label: "Chest" },
  { id: "shoulders", label: "Shoulders" },
  { id: "traps", label: "Traps" },
  { id: "lats", label: "Lats" },
  { id: "lower-back", label: "Lower back" },
  { id: "biceps", label: "Biceps" },
  { id: "triceps", label: "Triceps" },
  { id: "forearms", label: "Forearms" },
  { id: "abs", label: "Abs" },
  { id: "obliques", label: "Obliques" },
  { id: "legs", label: "Quads" },
  { id: "adductors", label: "Adductors" },
  { id: "hamstrings", label: "Hams" },
  { id: "glutes", label: "Glutes" },
  { id: "calves", label: "Calves" },
  { id: "tibialis", label: "Tibialis" },
];

const SELECTED = "#E53935";
const BASE_FILL = "#E6E6E6";
const OUTLINE = "#2A2A2A";

type Sex = "male" | "female";

type Props = {
  value: string[];
  onChange: (ids: string[]) => void;
  sex?: Sex | null;
};

/** Expand legacy bundled ids so old prefs still light the right regions. */
export function expandFocusIds(ids: string[]): string[] {
  const out = new Set<string>();
  for (const raw of ids) {
    const id = raw === "quads" ? "legs" : raw;
    if (id === "core" || id === "abs" || id === "obliques") {
      if (id === "core") {
        out.add("abs");
        out.add("obliques");
      } else {
        out.add(id);
      }
      continue;
    }
    if (id === "back") {
      out.add("traps");
      out.add("lats");
      out.add("lower-back");
      continue;
    }
    out.add(id);
  }
  return [...out];
}

function selectedSlugs(focusIds: string[]): ExtendedBodyPart[] {
  const set = new Set(expandFocusIds(focusIds));
  const out: ExtendedBodyPart[] = [];
  for (const id of set) {
    for (const slug of FOCUS_TO_SLUGS[id] ?? []) {
      out.push({ slug, color: SELECTED, intensity: 1 });
    }
  }
  return out;
}

/** Anatomical front+back muscle map. Granular regions; red = selected. */
export function BodyFocusPicker({ value, onChange, sex }: Props) {
  const gender: Sex = sex === "female" ? "female" : "male";
  const selected = expandFocusIds(value);
  const data = selectedSlugs(selected);

  function toggleFocus(id: string) {
    const nextId = id === "quads" ? "legs" : id;
    // Drop legacy bundles when editing granular parts
    const base = selected.filter((x) => x !== "core" && x !== "back");
    onChange(base.includes(nextId) ? base.filter((x) => x !== nextId) : [...base, nextId]);
  }

  function onPartPress(part: ExtendedBodyPart) {
    const focusId = part.slug ? SLUG_TO_FOCUS[part.slug] : undefined;
    if (!focusId) return;
    toggleFocus(focusId);
  }

  return (
    <View style={styles.wrap}>
      <Text style={styles.section}>Focus areas</Text>
      <Text style={styles.hint}>Tap a muscle — abs, obliques, traps, lats, and more are separate.</Text>

      <View style={styles.mapCard}>
        <View style={styles.figures}>
          <View style={styles.figureCol}>
            <Text style={styles.viewLabel}>FRONT</Text>
            <Body
              data={data}
              gender={gender}
              side="front"
              scale={1.15}
              colors={[SELECTED]}
              defaultFill={BASE_FILL}
              defaultStroke={OUTLINE}
              defaultStrokeWidth={0.6}
              border={OUTLINE}
              onBodyPartPress={onPartPress}
              hiddenParts={["hair", "head", "hands", "feet", "ankles", "knees", "neck"]}
            />
          </View>
          <View style={styles.figureCol}>
            <Text style={styles.viewLabel}>BACK</Text>
            <Body
              data={data}
              gender={gender}
              side="back"
              scale={1.15}
              colors={[SELECTED]}
              defaultFill={BASE_FILL}
              defaultStroke={OUTLINE}
              defaultStrokeWidth={0.6}
              border={OUTLINE}
              onBodyPartPress={onPartPress}
              hiddenParts={["hair", "head", "hands", "feet", "ankles", "knees", "neck"]}
            />
          </View>
        </View>
      </View>

      <View style={styles.grid}>
        {FOCUS_MUSCLES.map((m) => {
          const on = selected.includes(m.id);
          return (
            <Pressable key={m.id} onPress={() => toggleFocus(m.id)} style={[styles.chip, on && styles.chipOn]}>
              <Text style={[styles.chipText, on && styles.chipTextOn]}>{m.label}</Text>
            </Pressable>
          );
        })}
      </View>
      {selected.length ? (
        <Text style={styles.hint}>
          Selected: {selected.map((id) => FOCUS_MUSCLES.find((m) => m.id === id)?.label ?? id).join(", ")}
        </Text>
      ) : (
        <Text style={styles.hint}>None selected — plan uses balanced coverage.</Text>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  section: { color: colors.text, fontFamily: "Outfit_700Bold", fontSize: 15 },
  hint: { color: colors.textMuted, fontFamily: "Outfit_500Medium", fontSize: 12 },
  mapCard: {
    backgroundColor: "#8B8B8B",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
    overflow: "hidden",
  },
  figures: {
    flexDirection: "row",
    justifyContent: "space-evenly",
    alignItems: "flex-start",
  },
  figureCol: { alignItems: "center", gap: 6 },
  viewLabel: {
    color: "#1A1A1A",
    fontFamily: "Outfit_700Bold",
    fontSize: 11,
    letterSpacing: 1.2,
  },
  grid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 12,
    paddingVertical: 8,
    backgroundColor: colors.bgSoft,
  },
  chipOn: { backgroundColor: SELECTED, borderColor: SELECTED },
  chipText: { color: colors.text, fontFamily: "Outfit_700Bold", fontSize: 13 },
  chipTextOn: { color: "#fff" },
});
