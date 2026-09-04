import { useMemo, useState } from "react";
import {
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import type { Exercise } from "../types/workout";
import { colors, spacing } from "../theme/colors";

const MAX_CIRCUIT = 24;

function isHomeMove(ex: Exercise) {
  const loc = String(ex.location ?? "").toLowerCase();
  return loc === "home" || loc === "both" || loc === "";
}

function capIds(ids: string[]) {
  const out: string[] = [];
  const seen = new Set<string>();
  for (const id of ids) {
    const s = String(id ?? "").trim();
    if (!s || seen.has(s)) continue;
    seen.add(s);
    out.push(s);
    if (out.length >= MAX_CIRCUIT) break;
  }
  return out;
}

function moveItem(ids: string[], index: number, dir: -1 | 1) {
  const j = index + dir;
  if (j < 0 || j >= ids.length) return ids;
  const next = [...ids];
  const a = next[index];
  const b = next[j];
  if (a == null || b == null) return ids;
  next[index] = b;
  next[j] = a;
  return next;
}

type PickerTarget = "core" | "extra";

type Props = {
  catalog: Exercise[];
  coreIds: string[];
  extraIds: string[];
  targetMinutes: number;
  onChange: (coreIds: string[], extraIds: string[]) => void;
};

export function HomeCircuitEditor({ catalog, coreIds, extraIds, targetMinutes, onChange }: Props) {
  const [picker, setPicker] = useState<PickerTarget | null>(null);
  const [query, setQuery] = useState("");

  const names = useMemo(() => {
    const map = new Map<string, string>();
    for (const ex of catalog) map.set(ex.id, ex.name);
    return map;
  }, [catalog]);

  const used = useMemo(() => new Set([...coreIds, ...extraIds]), [coreIds, extraIds]);

  const candidates = useMemo(() => {
    const q = query.trim().toLowerCase();
    return catalog
      .filter(isHomeMove)
      .filter((e) => !used.has(e.id))
      .filter(
        (e) =>
          !q ||
          e.name.toLowerCase().includes(q) ||
          e.muscleGroup.toLowerCase().includes(q),
      )
      .slice(0, 50);
  }, [catalog, used, query]);

  function labelFor(id: string) {
    return names.get(id) ?? id.replace(/_/g, " ");
  }

  function setCore(next: string[]) {
    const core = capIds(next);
    onChange(
      core,
      capIds(extraIds).filter((id) => !core.includes(id)),
    );
  }

  function setExtra(next: string[]) {
    const core = capIds(coreIds);
    onChange(
      core,
      capIds(next).filter((id) => !core.includes(id)),
    );
  }

  function addId(target: PickerTarget, id: string) {
    if (target === "core") setCore([...coreIds, id]);
    else setExtra([...extraIds, id]);
    setPicker(null);
    setQuery("");
  }

  function renderRow(
    id: string,
    index: number,
    list: string[],
    kind: PickerTarget,
  ) {
    const other: PickerTarget = kind === "core" ? "extra" : "core";
    return (
      <View key={`${kind}-${id}`} style={styles.row}>
        <View style={{ flex: 1 }}>
          <Text style={styles.name}>{labelFor(id)}</Text>
          <Text style={styles.meta}>{index + 1} in order</Text>
        </View>
        <Pressable
          style={styles.iconBtn}
          onPress={() => (kind === "core" ? setCore(moveItem(list, index, -1)) : setExtra(moveItem(list, index, -1)))}
        >
          <Text style={styles.iconBtnText}>↑</Text>
        </Pressable>
        <Pressable
          style={styles.iconBtn}
          onPress={() => (kind === "core" ? setCore(moveItem(list, index, 1)) : setExtra(moveItem(list, index, 1)))}
        >
          <Text style={styles.iconBtnText}>↓</Text>
        </Pressable>
        <Pressable
          style={styles.chip}
          onPress={() => {
            if (kind === "core") {
              setCore(list.filter((x) => x !== id));
              setExtra([...extraIds, id]);
            } else {
              setExtra(list.filter((x) => x !== id));
              setCore([...coreIds, id]);
            }
          }}
        >
          <Text style={styles.chipText}>{other === "core" ? "Always" : "If time"}</Text>
        </Pressable>
        <Pressable
          style={styles.chipDanger}
          onPress={() => (kind === "core" ? setCore(list.filter((x) => x !== id)) : setExtra(list.filter((x) => x !== id)))}
        >
          <Text style={styles.chipDangerText}>Remove</Text>
        </Pressable>
      </View>
    );
  }

  const empty = !coreIds.length && !extraIds.length;

  return (
    <View style={styles.wrap}>
      <Text style={styles.section}>Your usual circuit</Text>
      <Text style={styles.hint}>
        Always-in moves show up every home day, in this order. Time extras fill in after those until you
        hit {targetMinutes} minutes. Leave both empty for a random mix each day.
      </Text>

      <Text style={styles.subhead}>Always in the circuit</Text>
      <Text style={styles.hint}>These stay even on a short day — push-ups and sit-ups, for example.</Text>
      {coreIds.length ? coreIds.map((id, i) => renderRow(id, i, coreIds, "core")) : (
        <Text style={styles.empty}>None yet — add the ones you want every home day.</Text>
      )}
      <Pressable
        style={styles.addBtn}
        onPress={() => {
          setQuery("");
          setPicker("core");
        }}
        disabled={coreIds.length >= MAX_CIRCUIT}
      >
        <Text style={styles.addBtnText}>+ Always include</Text>
      </Pressable>

      <Text style={styles.subhead}>If I have time</Text>
      <Text style={styles.hint}>
        Added after your always-in moves when the day’s length has room — squats you can drop on a busy day.
      </Text>
      {extraIds.length ? extraIds.map((id, i) => renderRow(id, i, extraIds, "extra")) : (
        <Text style={styles.empty}>None yet — extras only show when there’s time left.</Text>
      )}
      <Pressable
        style={styles.addBtn}
        onPress={() => {
          setQuery("");
          setPicker("extra");
        }}
        disabled={extraIds.length >= MAX_CIRCUIT}
      >
        <Text style={styles.addBtnText}>+ Time extra</Text>
      </Pressable>

      {!empty ? (
        <Pressable style={styles.clearBtn} onPress={() => onChange([], [])}>
          <Text style={styles.clearText}>Use a random mix instead</Text>
        </Pressable>
      ) : null}

      <Modal
        visible={picker != null}
        animationType="slide"
        transparent
        onRequestClose={() => setPicker(null)}
      >
        <View style={styles.modalBackdrop}>
          <View style={styles.modalCard}>
            <Text style={styles.name}>
              {picker === "core" ? "Always include" : "If I have time"}
            </Text>
            <TextInput
              style={styles.search}
              placeholder="Search home moves…"
              placeholderTextColor={colors.textMuted}
              value={query}
              onChangeText={setQuery}
              autoFocus
            />
            <ScrollView style={{ maxHeight: 360 }} keyboardShouldPersistTaps="handled">
              {candidates.map((ex) => (
                <Pressable key={ex.id} style={styles.addRow} onPress={() => picker && addId(picker, ex.id)}>
                  <Text style={styles.name}>{ex.name}</Text>
                  <Text style={styles.meta}>{ex.muscleGroup}</Text>
                </Pressable>
              ))}
              {!candidates.length ? (
                <Text style={styles.empty}>No matching home moves left to add.</Text>
              ) : null}
            </ScrollView>
            <Pressable style={styles.addBtn} onPress={() => setPicker(null)}>
              <Text style={styles.addBtnText}>Close</Text>
            </Pressable>
          </View>
        </View>
      </Modal>
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: { gap: spacing.sm },
  section: { color: colors.text, fontFamily: "SpaceGrotesk_700Bold", fontSize: 18, marginTop: spacing.md },
  subhead: { color: colors.text, fontFamily: "Outfit_700Bold", fontSize: 15, marginTop: spacing.sm },
  hint: { color: colors.textMuted, fontSize: 12, fontFamily: "Outfit_500Medium" },
  empty: { color: colors.textMuted, fontFamily: "Outfit_500Medium", fontSize: 13 },
  row: {
    flexDirection: "row",
    alignItems: "center",
    gap: 6,
    backgroundColor: colors.bgElevated,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 10,
    paddingVertical: 8,
  },
  name: { color: colors.text, fontFamily: "Outfit_700Bold", fontSize: 15 },
  meta: { color: colors.textMuted, fontFamily: "Outfit_500Medium", fontSize: 12, marginTop: 2 },
  iconBtn: {
    minWidth: 32,
    minHeight: 32,
    alignItems: "center",
    justifyContent: "center",
    borderRadius: 8,
    backgroundColor: colors.bgSoft,
  },
  iconBtnText: { color: colors.text, fontFamily: "Outfit_700Bold", fontSize: 14 },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 8,
    paddingVertical: 6,
    backgroundColor: colors.bgSoft,
  },
  chipText: { color: colors.text, fontFamily: "Outfit_700Bold", fontSize: 11 },
  chipDanger: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.danger,
    paddingHorizontal: 8,
    paddingVertical: 6,
  },
  chipDangerText: { color: colors.danger, fontFamily: "Outfit_700Bold", fontSize: 11 },
  addBtn: {
    alignSelf: "flex-start",
    backgroundColor: colors.bgSoft,
    borderRadius: 999,
    paddingHorizontal: 12,
    paddingVertical: 8,
    borderWidth: 1,
    borderColor: colors.line,
  },
  addBtnText: { color: colors.text, fontFamily: "Outfit_700Bold", fontSize: 12 },
  clearBtn: { alignSelf: "flex-start", paddingVertical: 8 },
  clearText: { color: colors.textMuted, fontFamily: "Outfit_700Bold", fontSize: 12 },
  modalBackdrop: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "flex-end",
  },
  modalCard: {
    backgroundColor: colors.bgElevated,
    borderTopLeftRadius: 20,
    borderTopRightRadius: 20,
    padding: spacing.lg,
    gap: spacing.sm,
    maxHeight: "85%",
  },
  search: {
    backgroundColor: colors.bgSoft,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    color: colors.text,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontFamily: "Outfit_500Medium",
  },
  addRow: {
    paddingVertical: 10,
    borderBottomWidth: 1,
    borderBottomColor: colors.line,
  },
});
