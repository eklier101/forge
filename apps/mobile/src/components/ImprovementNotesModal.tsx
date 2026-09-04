import { useCallback, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect } from "expo-router";
import { ActionButton } from "./ActionButton";
import {
  fetchChangelog,
  noteBody,
  noteTitle,
  type ChangelogEntry,
  type ChangelogNote,
} from "../lib/changelog";
import { getApiUrl } from "../lib/session";
import { colors, spacing } from "../theme/colors";

type Props = {
  visible: boolean;
  onClose: () => void;
};

type Detail = { version: string; note: ChangelogNote };

/** Browse all published improvement notes (newest first). Tap a note to read it plainly. */
export function ImprovementNotesModal({ visible, onClose }: Props) {
  const [versions, setVersions] = useState<ChangelogEntry[]>([]);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);
  const [err, setErr] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setErr(null);
      const base = await getApiUrl();
      if (!base) {
        setErr("Not connected to a server");
        return;
      }
      const list = await fetchChangelog(base);
      setVersions(list);
      if (list[0]) setExpanded(list[0].version);
    } catch (e) {
      setErr(e instanceof Error ? e.message : "Could not load notes");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      if (visible) void load();
    }, [visible, load]),
  );

  return (
    <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
      <View style={styles.wrap}>
        <View style={styles.card}>
          <Text style={styles.kicker}>IMPROVEMENT NOTES</Text>
          <Text style={styles.title}>What's new history</Text>
          <Text style={styles.sub}>Tap any note to read the full story in plain English.</Text>
          {err ? <Text style={styles.err}>{err}</Text> : null}
          <ScrollView style={{ maxHeight: 440 }} keyboardShouldPersistTaps="handled">
            {versions.map((v) => {
              const open = expanded === v.version;
              return (
                <View key={v.version} style={styles.block}>
                  <Pressable
                    style={styles.head}
                    onPress={() => setExpanded(open ? null : v.version)}
                  >
                    <Text style={styles.ver}>v{v.version}</Text>
                    <Text style={styles.meta}>
                      {v.date ?? ""} {open ? "▲" : "▼"}
                    </Text>
                  </Pressable>
                  {open && v.summary ? <Text style={styles.summary}>{v.summary}</Text> : null}
                  {open
                    ? (v.notes ?? []).map((n, i) => (
                        <Pressable
                          key={`${v.version}-${i}-${noteTitle(n)}`}
                          style={styles.noteRow}
                          onPress={() => setDetail({ version: v.version, note: n })}
                        >
                          <Text style={styles.bullet}>·</Text>
                          <Text style={styles.note}>{noteTitle(n)}</Text>
                          <Text style={styles.chev}>›</Text>
                        </Pressable>
                      ))
                    : null}
                </View>
              );
            })}
            {versions.length === 0 && !err ? (
              <Text style={styles.sub}>No notes published yet.</Text>
            ) : null}
          </ScrollView>
          <ActionButton label="Close" onPress={onClose} />
        </View>
      </View>

      <Modal visible={!!detail} animationType="fade" transparent onRequestClose={() => setDetail(null)}>
        <View style={styles.wrap}>
          <View style={styles.detailCard}>
            <Text style={styles.kicker}>v{detail?.version}</Text>
            <Text style={styles.detailTitle}>{detail ? noteTitle(detail.note) : ""}</Text>
            <ScrollView style={{ maxHeight: 360 }} keyboardShouldPersistTaps="handled">
              <Text style={styles.detailBody}>{detail ? noteBody(detail.note) : ""}</Text>
            </ScrollView>
            <ActionButton label="Back" onPress={() => setDetail(null)} />
          </View>
        </View>
      </Modal>
    </Modal>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    padding: spacing.lg,
  },
  card: {
    backgroundColor: colors.bgElevated,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.lg,
    gap: 8,
  },
  detailCard: {
    backgroundColor: colors.bgElevated,
    borderRadius: 18,
    borderWidth: 1,
    borderColor: colors.accent,
    padding: spacing.lg,
    gap: 10,
  },
  kicker: { color: colors.accent, fontFamily: "Outfit_700Bold", fontSize: 11, letterSpacing: 1.2 },
  title: { color: colors.text, fontFamily: "SpaceGrotesk_700Bold", fontSize: 22 },
  detailTitle: { color: colors.text, fontFamily: "SpaceGrotesk_700Bold", fontSize: 20, lineHeight: 26 },
  sub: { color: colors.textMuted, fontFamily: "Outfit_500Medium", fontSize: 13 },
  summary: {
    color: colors.text,
    fontFamily: "Outfit_500Medium",
    fontSize: 13,
    lineHeight: 18,
    marginTop: 4,
    marginBottom: 2,
  },
  err: { color: colors.warn, fontFamily: "Outfit_500Medium", fontSize: 13 },
  block: {
    borderTopWidth: 1,
    borderTopColor: colors.line,
    paddingTop: 10,
    marginTop: 8,
    gap: 4,
  },
  head: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  ver: { color: colors.text, fontFamily: "Outfit_700Bold", fontSize: 15 },
  meta: { color: colors.textMuted, fontFamily: "Outfit_500Medium", fontSize: 12 },
  noteRow: { flexDirection: "row", gap: 8, marginTop: 8, alignItems: "flex-start", paddingVertical: 4 },
  bullet: { color: colors.accent, fontFamily: "Outfit_700Bold", fontSize: 16 },
  note: { flex: 1, color: colors.text, fontFamily: "Outfit_500Medium", fontSize: 14, lineHeight: 20 },
  chev: { color: colors.textMuted, fontFamily: "Outfit_700Bold", fontSize: 18, lineHeight: 20 },
  detailBody: {
    color: colors.text,
    fontFamily: "Outfit_500Medium",
    fontSize: 16,
    lineHeight: 24,
  },
});
