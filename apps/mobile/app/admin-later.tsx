import { useCallback, useMemo, useState } from "react";
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { ActionButton } from "../src/components/ActionButton";
import { BackLink, FlashBanner } from "../src/components/ScreenChrome";
import { ForgeRefreshControl } from "../src/components/ForgeRefreshControl";
import { apiFetch } from "../src/lib/api";
import { safeGoBack } from "../src/lib/navigation";
import { getUser } from "../src/lib/session";
import { colors, spacing } from "../src/theme/colors";

type Note = {
  id: string;
  title: string;
  body: string;
  kind?: "note" | "header";
  status?: "open" | "waiting" | "done";
  done?: boolean;
  sortOrder?: number;
};

function isHeader(n: Note): boolean {
  if (n.kind === "header") return true;
  return /^toward\s+v\d/i.test(n.title.trim());
}

function plainTitle(n: Note): string {
  if (isHeader(n)) return n.title.replace(/^toward\s+/i, "").trim() || n.title;
  return n.title.trim();
}

function plainBody(n: Note): string {
  const b = (n.body ?? "").trim();
  if (b) return b;
  if (isHeader(n)) {
    return "This marks a release target on the roadmap. Items under it are what we’re aiming to finish before that version feels done.";
  }
  return "No longer write-up yet — this is a checklist title for agents. When there’s more to say, it’ll show up here in plain English.";
}

/** Read-only agent backlog for Ethan — tap a note for the full plain-English write-up. */
export default function AdminLaterScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [notes, setNotes] = useState<Note[]>([]);
  const [msg, setMsg] = useState<string | null>(null);
  const [allowed, setAllowed] = useState<boolean | null>(null);
  const [refreshing, setRefreshing] = useState(false);
  const [detail, setDetail] = useState<Note | null>(null);

  const load = useCallback(async () => {
    try {
      const me = await getUser();
      if (me?.role !== "admin") {
        setAllowed(false);
        return;
      }
      setAllowed(true);
      const res = await apiFetch<{ notes: Note[] }>("/admin/later-notes");
      setNotes(
        (res.notes ?? []).filter((n) => (n.status ?? (n.done ? "done" : "open")) !== "done"),
      );
      setMsg(null);
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Failed to load");
      // Keep prior allow state if we already know admin; only lock out on first auth failure
      setAllowed((prev) => (prev === true ? true : false));
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  const waiting = useMemo(
    () => notes.filter((n) => !isHeader(n) && n.status === "waiting"),
    [notes],
  );
  const roadmap = useMemo(
    () =>
      notes
        .filter((n) => isHeader(n) || n.status !== "waiting")
        .slice()
        .sort((a, b) => (a.sortOrder ?? 0) - (b.sortOrder ?? 0)),
    [notes],
  );

  async function onRefresh() {
    setRefreshing(true);
    try {
      await load();
    } finally {
      setRefreshing(false);
    }
  }

  if (allowed === false) {
    return (
      <ScrollView
        style={styles.root}
        contentContainerStyle={[styles.content, { paddingTop: spacing.lg + Math.max(insets.top, 0) }]}
      >
        <BackLink label="Admin" onPress={() => safeGoBack(router, "/admin")} />
        <Text style={styles.title}>For later</Text>
        <Text style={styles.sub}>Admin only.</Text>
        {msg ? <FlashBanner message={msg} tone="warn" /> : null}
        <ActionButton label="Back" onPress={() => safeGoBack(router, "/(tabs)/you")} />
      </ScrollView>
    );
  }

  if (allowed === null) {
    return (
      <ScrollView
        style={styles.root}
        contentContainerStyle={[styles.content, { paddingTop: spacing.lg + Math.max(insets.top, 0) }]}
      >
        <BackLink label="Admin" onPress={() => safeGoBack(router, "/admin")} />
        <Text style={styles.title}>For later</Text>
        <Text style={styles.sub}>Loading…</Text>
      </ScrollView>
    );
  }

  return (
    <>
      <ScrollView
        style={styles.root}
        contentContainerStyle={[styles.content, { paddingTop: spacing.lg + Math.max(insets.top, 0) }]}
        keyboardShouldPersistTaps="handled"
        refreshControl={
          <ForgeRefreshControl refreshing={refreshing} onRefresh={() => void onRefresh()} topInset={insets.top} />
        }
      >
        <BackLink label="Admin" onPress={() => safeGoBack(router, "/admin")} />
        <Text style={styles.title}>For later</Text>
        <Text style={styles.sub}>
          Version guide + agent checklist. Tap any item to read the full plain-English note. Waiting = shipped,
          confirming. Done items are removed.
        </Text>
        {msg ? <FlashBanner message={msg} tone="warn" /> : null}

        {notes.length === 0 ? <Text style={styles.empty}>Nothing queued.</Text> : null}

        {waiting.length > 0 ? <Text style={styles.section}>Waiting</Text> : null}
        {waiting.map((n) => (
          <Pressable
            key={n.id}
            style={[styles.card, styles.cardWaiting]}
            onPress={() => setDetail(n)}
            accessibilityRole="button"
            accessibilityLabel={`Open note: ${n.title}`}
          >
            <View style={styles.titleRow}>
              <Text style={styles.badge}>WAITING</Text>
              <Text style={styles.cardTitle}>{n.title}</Text>
              <Text style={styles.chev}>›</Text>
            </View>
            {n.body ? (
              <Text style={styles.bodyPreview} numberOfLines={2}>
                {n.body}
              </Text>
            ) : (
              <Text style={styles.bodyPreview}>Tap to read</Text>
            )}
          </Pressable>
        ))}

        {roadmap.length > 0 ? <Text style={styles.section}>Version guide</Text> : null}
        {roadmap.map((n) =>
          isHeader(n) ? (
            <Pressable
              key={n.id}
              style={styles.headerBlock}
              onPress={() => setDetail(n)}
              accessibilityRole="button"
              accessibilityLabel={`Open section: ${plainTitle(n)}`}
            >
              <Text style={styles.headerEyebrow}>TOWARD</Text>
              <View style={styles.titleRow}>
                <Text style={[styles.headerTitle, { flex: 1 }]}>{plainTitle(n)}</Text>
                <Text style={styles.chev}>›</Text>
              </View>
              {n.body ? (
                <Text style={styles.headerSub} numberOfLines={2}>
                  {n.body}
                </Text>
              ) : null}
            </Pressable>
          ) : (
            <Pressable
              key={n.id}
              style={styles.card}
              onPress={() => setDetail(n)}
              accessibilityRole="button"
              accessibilityLabel={`Open note: ${n.title}`}
            >
              <View style={styles.titleRow}>
                <Text style={[styles.cardTitle, { flex: 1 }]}>{n.title}</Text>
                <Text style={styles.chev}>›</Text>
              </View>
              {n.body ? (
                <Text style={styles.bodyPreview} numberOfLines={2}>
                  {n.body}
                </Text>
              ) : (
                <Text style={styles.bodyPreview}>Tap to read</Text>
              )}
            </Pressable>
          ),
        )}
      </ScrollView>

      <Modal visible={!!detail} animationType="fade" transparent onRequestClose={() => setDetail(null)}>
        <View style={styles.modalWrap}>
          <View style={styles.detailCard}>
            {detail?.status === "waiting" ? <Text style={styles.badge}>WAITING</Text> : null}
            {detail && isHeader(detail) ? <Text style={styles.kicker}>TOWARD</Text> : null}
            <Text style={styles.detailTitle}>{detail ? plainTitle(detail) : ""}</Text>
            <ScrollView style={{ maxHeight: 360 }} keyboardShouldPersistTaps="handled">
              <Text style={styles.detailBody}>{detail ? plainBody(detail) : ""}</Text>
            </ScrollView>
            <ActionButton label="Close" onPress={() => setDetail(null)} />
          </View>
        </View>
      </Modal>
    </>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.sm, paddingBottom: 48 },
  title: { color: colors.text, fontSize: 28, fontFamily: "SpaceGrotesk_700Bold" },
  sub: { color: colors.textMuted, fontFamily: "Outfit_500Medium", marginBottom: spacing.sm },
  section: {
    color: colors.accent,
    fontFamily: "Outfit_700Bold",
    fontSize: 12,
    letterSpacing: 1,
    marginTop: spacing.sm,
  },
  empty: { color: colors.textMuted, fontFamily: "Outfit_500Medium" },
  headerBlock: {
    marginTop: spacing.md,
    paddingTop: spacing.md,
    paddingBottom: spacing.xs,
    borderTopWidth: 2,
    borderTopColor: colors.accent,
    gap: 4,
  },
  headerEyebrow: {
    color: colors.accent,
    fontFamily: "Outfit_700Bold",
    fontSize: 11,
    letterSpacing: 1.4,
  },
  headerTitle: {
    color: colors.text,
    fontFamily: "SpaceGrotesk_700Bold",
    fontSize: 22,
    letterSpacing: 0.3,
  },
  headerSub: {
    color: colors.textMuted,
    fontFamily: "Outfit_500Medium",
    fontSize: 13,
  },
  card: {
    backgroundColor: colors.bgElevated,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.md,
    gap: 6,
  },
  cardWaiting: { borderColor: colors.warn },
  titleRow: { flexDirection: "row", flexWrap: "wrap", alignItems: "center", gap: 8 },
  badge: {
    color: colors.bg,
    backgroundColor: colors.warn,
    overflow: "hidden",
    borderRadius: 6,
    paddingHorizontal: 8,
    paddingVertical: 2,
    fontFamily: "Outfit_700Bold",
    fontSize: 10,
    letterSpacing: 0.6,
    alignSelf: "flex-start",
  },
  cardTitle: { color: colors.text, fontFamily: "Outfit_700Bold", fontSize: 15, flexShrink: 1 },
  bodyPreview: { color: colors.textMuted, fontFamily: "Outfit_500Medium", fontSize: 13, lineHeight: 18 },
  chev: { color: colors.textMuted, fontFamily: "Outfit_700Bold", fontSize: 18, marginLeft: "auto" },
  modalWrap: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.55)",
    justifyContent: "center",
    padding: spacing.lg,
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
  detailTitle: { color: colors.text, fontFamily: "SpaceGrotesk_700Bold", fontSize: 22, lineHeight: 28 },
  detailBody: {
    color: colors.text,
    fontFamily: "Outfit_500Medium",
    fontSize: 16,
    lineHeight: 24,
  },
});
