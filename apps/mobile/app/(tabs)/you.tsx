import { useCallback, useState } from "react";
import { Pressable, ScrollView, StyleSheet, Text, View } from "react-native";
import Constants from "expo-constants";
import { Ionicons } from "@expo/vector-icons";
import { useFocusEffect, useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { UpdateBanner } from "../../src/components/UpdateBanner";
import { ActionButton } from "../../src/components/ActionButton";
import { FlashBanner } from "../../src/components/ScreenChrome";
import { ForgeRefreshControl } from "../../src/components/ForgeRefreshControl";
import { getPreferences, savePreferences } from "../../src/db/local";
import type { Preferences } from "../../src/db/types";
import { apiFetch } from "../../src/lib/api";
import { getApiUrl, getUser, saveSession, getToken } from "../../src/lib/session";
import { pullPreferences, syncNow } from "../../src/lib/sync";
import { colors, spacing } from "../../src/theme/colors";

function hostnameOnly(url: string) {
  try {
    return new URL(url).hostname;
  } catch {
    return "";
  }
}

function appVersionLabel() {
  const extra = Constants.expoConfig?.extra as { forgeVersion?: string; forgeBuild?: number } | undefined;
  const ver = extra?.forgeVersion ?? Constants.expoConfig?.version ?? "0.0.0";
  const build = extra?.forgeBuild ?? Constants.expoConfig?.android?.versionCode;
  return build ? `v${ver} (${build})` : `v${ver}`;
}

export default function YouScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const [name, setName] = useState("");
  const [role, setRole] = useState<string | undefined>();
  const [apiUrl, setApiUrl] = useState("");
  const [gymSummary, setGymSummary] = useState("3 days · equipment");
  const [homeSummary, setHomeSummary] = useState("On · equipment");
  const [favCount, setFavCount] = useState(0);
  const [dislikeCount, setDislikeCount] = useState(0);
  const [accountMeta, setAccountMeta] = useState("Profile · schedule · focus");
  const [msg, setMsg] = useState<string | null>(null);
  const [msgTone, setMsgTone] = useState<"ok" | "warn">("ok");
  const [syncing, setSyncing] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [updateNonce, setUpdateNonce] = useState(0);
  const [syncOn, setSyncOn] = useState(true);
  const [featureBusy, setFeatureBusy] = useState(false);
  const version = appVersionLabel();

  const applyPrefs = useCallback((prefs: Preferences) => {
    setFavCount(prefs.favoriteExerciseIds.length);
    setDislikeCount(prefs.dislikedExerciseIds.length);
    setSyncOn(prefs.features?.sync !== false);
    const gymDays = prefs.gymDaysPerWeek || prefs.gymWeekdays?.length || 3;
    const gymEq = prefs.gymEquipment?.length ?? 0;
    setGymSummary(
      prefs.gymEnabled === false
        ? "Off"
        : `${gymDays} day${gymDays === 1 ? "" : "s"}/wk · ${prefs.gymTargetMinutes ?? 60}m · ${gymEq} gear`,
    );
    const homeEq = prefs.homeEquipment?.length ?? 0;
    setHomeSummary(
      prefs.homeWorkoutsEnabled === false
        ? "Off"
        : `On · ${prefs.homeTargetMinutes ?? 45}m · ${homeEq} gear`,
    );
    const focusN = Array.isArray(prefs.focusMuscleIds) ? prefs.focusMuscleIds.length : 0;
    setAccountMeta(
      `Schedule · rest ${prefs.restTimerSeconds ?? 90}s · ${focusN} focus · ${prefs.energyUnit ?? "kcal"}`,
    );
  }, []);

  const refreshAll = useCallback(async () => {
    const user = await getUser();
    const url = await getApiUrl();
    setName(user?.displayName ?? user?.username ?? "");
    setRole(user?.role);
    setApiUrl(url ?? "");

    applyPrefs(await getPreferences());

    void pullPreferences().then((remote) => {
      if (remote) applyPrefs(remote);
    });

    void apiFetch<{
      user: { id: string; username: string; displayName: string; role: string } | null;
    }>("/me")
      .then(async (me) => {
        if (!me?.user) return;
        setRole(me.user.role);
        setName(me.user.displayName || me.user.username);
        const token = await getToken();
        if (token && url) {
          await saveSession(token, url, {
            id: me.user.id,
            displayName: me.user.displayName,
            username: me.user.username,
            role: me.user.role,
          });
        }
      })
      .catch(() => undefined);
  }, [applyPrefs]);

  useFocusEffect(
    useCallback(() => {
      let alive = true;
      (async () => {
        await refreshAll();
        if (!alive) return;
      })();
      return () => {
        alive = false;
      };
    }, [refreshAll]),
  );

  function flash(message: string, tone: "ok" | "warn" = "ok") {
    setMsgTone(tone);
    setMsg(message);
  }

  async function onSync() {
    if (!syncOn) {
      flash("Sync is off — turn it on in Account → Features", "warn");
      return;
    }
    setSyncing(true);
    flash("Syncing…");
    try {
      const result = await syncNow();
      applyPrefs(await getPreferences());
      setUpdateNonce((n) => n + 1);
      if (result.offline) flash("Offline — nothing pushed", "warn");
      else flash(`Synced ✓  push ${result.pushed} · pull ${result.pulled}`);
    } finally {
      setSyncing(false);
    }
  }

  async function turnOnSync() {
    setFeatureBusy(true);
    try {
      const prefs = await getPreferences();
      const nextFeatures = {
        fuel: prefs.features?.fuel !== false,
        fast: prefs.features?.fast !== false,
        photos: prefs.features?.photos !== false,
        sync: true,
        aiPlan: prefs.features?.aiPlan !== false,
        aiEstimate: prefs.features?.aiEstimate !== false,
        autoTargets: prefs.features?.autoTargets !== false,
      };
      const next = { ...prefs, features: nextFeatures };
      await savePreferences(next);
      await apiFetch("/preferences", { method: "PATCH", body: JSON.stringify({ features: nextFeatures }) });
      setSyncOn(true);
      flash("Sync on");
    } catch (e) {
      flash(e instanceof Error ? e.message : "Could not update", "warn");
    } finally {
      setFeatureBusy(false);
    }
  }

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={styles.content}
      keyboardShouldPersistTaps="handled"
      refreshControl={
        <ForgeRefreshControl
          refreshing={refreshing}
          onRefresh={async () => {
            setRefreshing(true);
            try {
              await syncNow();
              await refreshAll();
              setUpdateNonce((n) => n + 1);
            } finally {
              setRefreshing(false);
            }
          }}
        />
      }
    >
      <View style={{ paddingTop: Math.max(insets.top, 8) }}>
        <Text style={styles.title}>You</Text>
        <Text style={styles.sub}>
          {name || "Athlete"}
          {role === "admin" ? " · admin" : ""}
          {apiUrl ? ` · ${hostnameOnly(apiUrl)}` : " · not signed in"}
        </Text>
      </View>
      <Text style={styles.version}>{version}</Text>

      {msg ? <FlashBanner message={msg} tone={msgTone} /> : null}

      <UpdateBanner checkNonce={updateNonce} />

      {role === "admin" ? (
        <Pressable style={styles.adminCard} onPress={() => router.push("/admin")}>
          <View style={styles.linkRow}>
            <View style={styles.linkTextWrap}>
              <Text style={styles.linkTitle}>Admin panel</Text>
              <Text style={styles.linkMeta}>HA · AI · invites · accounts · server</Text>
            </View>
            <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
          </View>
        </Pressable>
      ) : null}

      <Pressable style={styles.linkCard} onPress={() => router.push("/settings-account")}>
        <View style={styles.linkRow}>
          <View style={styles.linkTextWrap}>
            <Text style={styles.linkTitle}>Account</Text>
            <Text style={styles.linkMeta}>{accountMeta} · features · switcher</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        </View>
      </Pressable>

      <Pressable style={styles.linkCard} onPress={() => router.push("/moves")}>
        <View style={styles.linkRow}>
          <View style={styles.linkTextWrap}>
            <Text style={styles.linkTitle}>Exercise catalog</Text>
            <Text style={styles.linkMeta}>
              {favCount} favorites · {dislikeCount} disliked — shapes your plan
            </Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        </View>
      </Pressable>

      <Pressable style={styles.linkCard} onPress={() => router.push("/settings-gym")}>
        <View style={styles.linkRow}>
          <View style={styles.linkTextWrap}>
            <Text style={styles.linkTitle}>Gym</Text>
            <Text style={styles.linkMeta}>{gymSummary}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        </View>
      </Pressable>

      <Pressable style={styles.linkCard} onPress={() => router.push("/settings-home")}>
        <View style={styles.linkRow}>
          <View style={styles.linkTextWrap}>
            <Text style={styles.linkTitle}>Home</Text>
            <Text style={styles.linkMeta}>{homeSummary}</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        </View>
      </Pressable>

      <Pressable style={styles.linkCard} onPress={() => router.push("/connect-health")}>
        <View style={styles.linkRow}>
          <View style={styles.linkTextWrap}>
            <Text style={styles.linkTitle}>Integrations</Text>
            <Text style={styles.linkMeta}>Health Connect · Garmin/Renpho · metric sources</Text>
          </View>
          <Ionicons name="chevron-forward" size={20} color={colors.textMuted} />
        </View>
      </Pressable>

      {syncOn ? (
        <ActionButton label="Sync now" variant="ghost" loading={syncing} onPress={onSync} />
      ) : (
        <View style={styles.syncOffCard}>
          <Text style={styles.syncOffTitle}>App sync is off</Text>
          <Text style={styles.syncOffDesc}>Enable sync in Account → Features, or turn it on here.</Text>
          <ActionButton label="Turn on sync" loading={featureBusy} onPress={() => void turnOnSync()} />
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.sm, paddingBottom: 48 },
  title: { color: colors.text, fontSize: 28, fontFamily: "SpaceGrotesk_700Bold" },
  sub: { color: colors.textMuted, fontFamily: "Outfit_500Medium", marginBottom: 4 },
  version: { color: colors.accentDim, fontFamily: "Outfit_500Medium", marginBottom: spacing.sm, fontSize: 12 },
  adminCard: {
    backgroundColor: "#1A2A18",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.accent,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  linkCard: {
    backgroundColor: colors.bgElevated,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.md,
    marginBottom: spacing.sm,
  },
  linkRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  linkTextWrap: { flex: 1 },
  linkTitle: { color: colors.accent, fontFamily: "Outfit_700Bold", fontSize: 16 },
  linkMeta: { color: colors.textMuted, fontFamily: "Outfit_500Medium", marginTop: 4 },
  syncOffCard: {
    backgroundColor: colors.bgElevated,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.md,
    gap: 10,
    marginTop: 4,
  },
  syncOffTitle: { color: colors.text, fontFamily: "Outfit_700Bold", fontSize: 14 },
  syncOffDesc: { color: colors.textMuted, fontFamily: "Outfit_500Medium", fontSize: 12 },
});
