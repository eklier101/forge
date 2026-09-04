import { Pressable, StyleSheet, Text, View } from "react-native";
import { colors, spacing } from "../theme/colors";
import {
  BAND_LEVELS,
  DUMBBELL_WEIGHTS_KG,
  DUMBBELL_WEIGHTS_LB,
  KETTLEBELL_WEIGHTS_KG,
  KETTLEBELL_WEIGHTS_LB,
  type WeightInventory,
} from "../db/types";

type Props = {
  equipment: string[];
  inventory: WeightInventory;
  units: string;
  onChange: (next: WeightInventory) => void;
  /** Show barbell plate-style loads (gym) */
  includeBarbell?: boolean;
};

function toggleNum(list: number[], n: number): number[] {
  return list.includes(n) ? list.filter((x) => x !== n).sort((a, b) => a - b) : [...list, n].sort((a, b) => a - b);
}

function toggleStr(list: string[], s: string): string[] {
  return list.includes(s) ? list.filter((x) => x !== s) : [...list, s];
}

/** Pick which dumbbell / kettlebell / band loads you actually own. */
export function WeightInventoryPicker({ equipment, inventory, units, onChange, includeBarbell }: Props) {
  const lb = units !== "kg";
  const dbList = lb ? DUMBBELL_WEIGHTS_LB : DUMBBELL_WEIGHTS_KG;
  const kbList = lb ? KETTLEBELL_WEIGHTS_LB : KETTLEBELL_WEIGHTS_KG;
  const unit = lb ? "lb" : "kg";

  const sections: { key: keyof WeightInventory; label: string; show: boolean; kind: "num" | "band"; nums?: number[] }[] =
    [
      {
        key: "dumbbell",
        label: `Dumbbells (${unit})`,
        show: equipment.includes("dumbbell"),
        kind: "num",
        nums: dbList,
      },
      {
        key: "kettlebell",
        label: `Kettlebells (${unit})`,
        show: equipment.includes("kettlebell"),
        kind: "num",
        nums: kbList,
      },
      {
        key: "band",
        label: "Resistance bands",
        show: equipment.includes("band"),
        kind: "band",
      },
      {
        key: "barbell",
        label: `Barbell loads you use (${unit})`,
        show: !!includeBarbell && equipment.includes("barbell"),
        kind: "num",
        nums: lb ? [45, 65, 95, 135, 185, 225, 275, 315] : [20, 30, 40, 60, 80, 100, 120, 140],
      },
    ];

  const visible = sections.filter((s) => s.show);
  if (!visible.length) return null;

  return (
    <View style={styles.wrap}>
      <Text style={styles.title}>Weights you have</Text>
      <Text style={styles.hint}>Suggested loads snap to what you own.</Text>
      {visible.map((sec) => (
        <View key={sec.key} style={styles.block}>
          <Text style={styles.label}>{sec.label}</Text>
          <View style={styles.chips}>
            {sec.kind === "band"
              ? BAND_LEVELS.map((b) => {
                  const on = (inventory.band ?? []).includes(b);
                  return (
                    <Pressable
                      key={b}
                      style={[styles.chip, on && styles.chipOn]}
                      onPress={() =>
                        onChange({ ...inventory, band: toggleStr(inventory.band ?? [], b) })
                      }
                    >
                      <Text style={[styles.chipText, on && styles.chipTextOn]}>{b}</Text>
                    </Pressable>
                  );
                })
              : (sec.nums ?? []).map((n) => {
                  const list = (inventory[sec.key] as number[]) ?? [];
                  const on = list.includes(n);
                  return (
                    <Pressable
                      key={n}
                      style={[styles.chip, on && styles.chipOn]}
                      onPress={() =>
                        onChange({
                          ...inventory,
                          [sec.key]: toggleNum(list, n),
                        })
                      }
                    >
                      <Text style={[styles.chipText, on && styles.chipTextOn]}>{n}</Text>
                    </Pressable>
                  );
                })}
          </View>
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm, marginTop: spacing.sm },
  title: { color: colors.text, fontFamily: "SpaceGrotesk_700Bold", fontSize: 16 },
  hint: { color: colors.textMuted, fontSize: 12, fontFamily: "Outfit_500Medium" },
  block: { gap: 6 },
  label: { color: colors.textMuted, fontFamily: "Outfit_500Medium" },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 12,
    paddingVertical: 7,
    backgroundColor: colors.bgElevated,
  },
  chipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.text, fontFamily: "Outfit_700Bold", fontSize: 13 },
  chipTextOn: { color: colors.bg },
});
