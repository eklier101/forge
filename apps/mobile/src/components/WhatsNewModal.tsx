import { useEffect, useState } from "react";
import { Modal, Platform, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";
import Constants from "expo-constants";
import { ActionButton } from "./ActionButton";
import {
  entriesSince,
  fetchChangelog,
  noteBody,
  noteTitle,
  type ChangelogEntry,
  type ChangelogNote,
} from "../lib/changelog";
import { getApiUrl } from "../lib/session";
import { colors, spacing } from "../theme/colors";

export const WHATS_NEW_SEEN_KEY = "forge.whatsNew.seenVersion";

function currentAppVersion(): string {
  const extra = Constants.expoConfig?.extra as { forgeVersion?: string } | undefined;
  return extra?.forgeVersion ?? Constants.expoConfig?.version ?? "0.0.0";
}

type Bundle = {
  version: string;
  entries: ChangelogEntry[];
};

type Detail = { version: string; note: ChangelogNote };

/**
 * Shows improvement notes after update — every missed version since last dismiss, not only exact match.
 * Tap a note for the full plain-English explanation.
 */
export function WhatsNewModal() {
  const [bundle, setBundle] = useState<Bundle | null>(null);
  const [detail, setDetail] = useState<Detail | null>(null);

  useEffect(() => {
    let alive = true;
    (async () => {
      const ver = currentAppVersion();
      const seen = await AsyncStorage.getItem(WHATS_NEW_SEEN_KEY);
      if (seen === ver) return;

      try {
        const base = await getApiUrl();
        if (!base) return; // offline — retry next launch; do NOT mark seen
        const versions = await fetchChangelog(base);
        const entries = entriesSince(versions, seen, ver);
        if (!alive) return;
        if (entries.length === 0) {
          // No notes published yet for this jump — don't burn the popup forever
          return;
        }
        setBundle({ version: ver, entries });
      } catch {
        /* offline — leave unseen so notes can appear when back online */
      }
    })();
    return () => {
      alive = false;
    };
  }, []);

  async function dismiss() {
    if (bundle) await AsyncStorage.setItem(WHATS_NEW_SEEN_KEY, bundle.version);
    setDetail(null);
    setBundle(null);
  }

  if (!bundle) return null;

  const multi = bundle.entries.length > 1;

  return (
    <>
      <Modal visible={!detail} animationType="fade" transparent onRequestClose={() => void dismiss()}>
        <View style={styles.wrap}>
          <View style={styles.card}>
            <Text style={styles.kicker}>WHAT'S NEW</Text>
            <Text style={styles.title}>
              {multi
                ? `Catch up · Forge v${bundle.version}`
                : `Forge v${bundle.entries[0]?.version ?? bundle.version}`}
            </Text>
            {multi ? (
              <Text style={styles.date}>
                Notes since your last update ({bundle.entries.length} versions) — tap any for details
              </Text>
            ) : bundle.entries[0]?.date ? (
              <Text style={styles.date}>{bundle.entries[0].date} · tap a note to read more</Text>
            ) : (
              <Text style={styles.date}>Tap a note to read more</Text>
            )}
            <ScrollView style={{ maxHeight: 360 }} keyboardShouldPersistTaps="handled">
              {bundle.entries.map((e) => (
                <View key={e.version} style={styles.block}>
                  {multi ? (
                    <Text style={styles.verHead}>
                      v{e.version}
                      {e.date ? ` · ${e.date}` : ""}
                    </Text>
                  ) : null}
                  {e.summary ? <Text style={styles.summary}>{e.summary}</Text> : null}
                  {e.notes.map((n, i) => (
                    <Pressable
                      key={`${e.version}-${i}`}
                      style={styles.noteRow}
                      onPress={() => setDetail({ version: e.version, note: n })}
                    >
                      <Text style={styles.bullet}>·</Text>
                      <Text style={styles.note}>{noteTitle(n)}</Text>
                      <Text style={styles.chev}>›</Text>
                    </Pressable>
                  ))}
                </View>
              ))}
            </ScrollView>
            {Platform.OS === "web" ? (
              <Text style={styles.hint}>
                On iPhone: updates are the web page itself — pull to refresh after a publish. Add to Home
                Screen keeps the icon; open Safari if the shell looks stale.
              </Text>
            ) : null}
            <ActionButton label="Got it" onPress={() => void dismiss()} />
            <Pressable onPress={() => void dismiss()} hitSlop={8}>
              <Text style={styles.dismiss}>Dismiss</Text>
            </Pressable>
          </View>
        </View>
      </Modal>

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
    </>
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
    borderColor: colors.accent,
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
  date: { color: colors.textMuted, fontFamily: "Outfit_500Medium", fontSize: 12 },
  summary: {
    color: colors.textMuted,
    fontFamily: "Outfit_500Medium",
    fontSize: 13,
    lineHeight: 18,
    marginBottom: 4,
  },
  block: { marginTop: 10, gap: 4 },
  verHead: { color: colors.accent, fontFamily: "Outfit_700Bold", fontSize: 13, marginBottom: 2 },
  noteRow: { flexDirection: "row", gap: 8, marginTop: 6, alignItems: "flex-start", paddingVertical: 4 },
  bullet: { color: colors.accent, fontFamily: "Outfit_700Bold", fontSize: 16 },
  note: { flex: 1, color: colors.text, fontFamily: "Outfit_500Medium", fontSize: 14, lineHeight: 20 },
  chev: { color: colors.textMuted, fontFamily: "Outfit_700Bold", fontSize: 18, lineHeight: 20 },
  detailBody: {
    color: colors.text,
    fontFamily: "Outfit_500Medium",
    fontSize: 16,
    lineHeight: 24,
  },
  hint: { color: colors.textMuted, fontFamily: "Outfit_500Medium", fontSize: 12, marginTop: 8 },
  dismiss: {
    color: colors.textMuted,
    fontFamily: "Outfit_700Bold",
    textAlign: "center",
    paddingVertical: 8,
  },
});
