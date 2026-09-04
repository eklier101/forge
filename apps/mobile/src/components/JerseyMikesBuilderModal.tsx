import { useCallback, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from "react-native";
import { ActionButton } from "./ActionButton";
import {
  JM_BASES,
  JM_BREADS,
  JM_CONDIMENTS,
  JM_DEFAULT_BUILD,
  resolveJmBuild,
  type JmBuild,
  type JmSize,
} from "../lib/jerseyMikes";
import { colors, spacing } from "../theme/colors";

type Props = {
  visible: boolean;
  onClose: () => void;
  onConfirm: (meal: ReturnType<typeof resolveJmBuild>) => void;
};

export function JerseyMikesBuilderModal({ visible, onClose, onConfirm }: Props) {
  const [build, setBuild] = useState<JmBuild>(JM_DEFAULT_BUILD);
  const resolved = useMemo(() => resolveJmBuild(build), [build]);

  const toggleCondiment = useCallback((id: string) => {
    setBuild((b) => {
      const has = b.condimentIds.includes(id);
      return {
        ...b,
        condimentIds: has ? b.condimentIds.filter((x) => x !== id) : [...b.condimentIds, id],
      };
    });
  }, []);

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.wrap}>
        <View style={styles.card}>
          <Text style={styles.title}>Jersey Mike&apos;s</Text>
          <Text style={styles.sub}>Start from a Regular, then add bread & toppings.</Text>
          <ScrollView keyboardShouldPersistTaps="handled" style={{ maxHeight: 440 }}>
            <Text style={styles.label}>Sandwich</Text>
            <View style={styles.chipRow}>
              {JM_BASES.map((b) => (
                <Pressable
                  key={b.id}
                  style={[styles.chip, build.baseId === b.id && styles.chipOn]}
                  onPress={() => setBuild((x) => ({ ...x, baseId: b.id }))}
                >
                  <Text style={[styles.chipText, build.baseId === b.id && styles.chipTextOn]}>
                    #{b.number}
                  </Text>
                </Pressable>
              ))}
            </View>
            <Text style={styles.hint}>{JM_BASES.find((b) => b.id === build.baseId)?.name}</Text>

            <Text style={styles.label}>Size</Text>
            <View style={styles.chipRow}>
              {(["regular", "mini"] as JmSize[]).map((s) => (
                <Pressable
                  key={s}
                  style={[styles.chip, build.size === s && styles.chipOn]}
                  onPress={() => setBuild((x) => ({ ...x, size: s }))}
                >
                  <Text style={[styles.chipText, build.size === s && styles.chipTextOn]}>
                    {s === "regular" ? "Regular" : "Mini"}
                  </Text>
                </Pressable>
              ))}
            </View>

            <Text style={styles.label}>Bread</Text>
            <View style={styles.chipRow}>
              {JM_BREADS.map((b) => (
                <Pressable
                  key={b.id}
                  style={[styles.chip, build.breadId === b.id && styles.chipOn]}
                  onPress={() => setBuild((x) => ({ ...x, breadId: b.id }))}
                >
                  <Text style={[styles.chipText, build.breadId === b.id && styles.chipTextOn]}>
                    {b.label}
                  </Text>
                </Pressable>
              ))}
            </View>

            <View style={styles.switchRow}>
              <View style={{ flex: 1 }}>
                <Text style={styles.switchTitle}>Mike&apos;s Way</Text>
                <Text style={styles.hint}>Onions, lettuce, tomato, oil, vinegar, oregano</Text>
              </View>
              <Switch
                value={build.mikesWay}
                onValueChange={(v) => setBuild((x) => ({ ...x, mikesWay: v }))}
                trackColor={{ false: colors.line, true: colors.accentDim }}
                thumbColor={build.mikesWay ? colors.accent : colors.textMuted}
              />
            </View>

            <Text style={styles.label}>Extras</Text>
            {JM_CONDIMENTS.filter((c) => c.id !== "oil" && c.id !== "vinegar").map((c) => {
              const on = build.condimentIds.includes(c.id);
              return (
                <Pressable key={c.id} style={styles.checkRow} onPress={() => toggleCondiment(c.id)}>
                  <Text style={styles.checkBox}>{on ? "✓" : "○"}</Text>
                  <Text style={styles.checkLabel}>{c.label}</Text>
                </Pressable>
              );
            })}

            <Text style={styles.preview}>{resolved.name}</Text>
            <Text style={styles.macros}>
              ≈ {resolved.calories} kcal · P{resolved.protein} C{resolved.carbs} F{resolved.fat}
            </Text>
          </ScrollView>
          <ActionButton
            label="Use my usual (#13 rosemary…)"
            variant="ghost"
            onPress={() => setBuild(JM_DEFAULT_BUILD)}
          />
          <ActionButton label="Log this sub" onPress={() => onConfirm(resolved)} />
          <ActionButton label="Cancel" variant="ghost" onPress={onClose} />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: { flex: 1, backgroundColor: "rgba(0,0,0,0.55)", justifyContent: "flex-end" },
  card: {
    backgroundColor: colors.bgElevated,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: spacing.lg,
    gap: 6,
    borderWidth: 1,
    borderColor: colors.line,
  },
  title: { color: colors.text, fontFamily: "SpaceGrotesk_700Bold", fontSize: 22 },
  sub: { color: colors.textMuted, fontFamily: "Outfit_500Medium", fontSize: 13, marginBottom: 4 },
  label: { color: colors.textMuted, fontFamily: "Outfit_500Medium", marginTop: 10 },
  hint: { color: colors.textMuted, fontFamily: "Outfit_500Medium", fontSize: 12 },
  chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 6 },
  chip: {
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    backgroundColor: colors.bgSoft,
  },
  chipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.text, fontFamily: "Outfit_700Bold", fontSize: 13 },
  chipTextOn: { color: colors.bg },
  switchRow: {
    flexDirection: "row",
    alignItems: "center",
    gap: 12,
    marginTop: 14,
    paddingVertical: 8,
  },
  switchTitle: { color: colors.text, fontFamily: "Outfit_700Bold", fontSize: 15 },
  checkRow: { flexDirection: "row", alignItems: "center", gap: 10, paddingVertical: 8 },
  checkBox: { color: colors.accent, fontFamily: "Outfit_700Bold", fontSize: 16, width: 22 },
  checkLabel: { color: colors.text, fontFamily: "Outfit_500Medium", fontSize: 15 },
  preview: { color: colors.text, fontFamily: "Outfit_700Bold", fontSize: 14, marginTop: 14 },
  macros: { color: colors.accent, fontFamily: "Outfit_700Bold", fontSize: 13, marginBottom: 8 },
});
