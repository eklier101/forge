import {
  Linking,
  Modal,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { useCallback, useState } from "react";
import { useFocusEffect, useRouter } from "expo-router";
import { ActionButton } from "../src/components/ActionButton";
import { getPreferences, savePreferences } from "../src/db/local";
import { apiFetch } from "../src/lib/api";
import { syncHealthConnectToServer, type HealthSnapshot } from "../src/lib/healthConnect";
import { NOTIF_IDS, startStickyNotification, stopStickyNotification } from "../src/lib/notifications";
import { pushPreferences } from "../src/lib/sync";
import { colors, spacing } from "../src/theme/colors";

function openUrl(url: string) {
  void Linking.openURL(url).catch(() => undefined);
}

type AccountRow = {
  provider: string;
  enabled: boolean;
  lastSuccessAt?: string | null;
  lastError?: string | null;
  needsReauth?: boolean;
  hasCredentials?: boolean;
  credentialsEncrypted?: boolean;
  emailMasked?: string | null;
  syncPending?: boolean;
};

type AlertRow = { provider: string; message: string; needsReauth: boolean };

const METRICS = [
  { key: "steps", label: "Steps", defaultSource: "health_connect" },
  { key: "sleep", label: "Sleep", defaultSource: "health_connect" },
  { key: "calories", label: "Calories burned", defaultSource: "health_connect" },
  { key: "hr", label: "Resting HR", defaultSource: "health_connect" },
  { key: "bodyBattery", label: "Body battery", defaultSource: "garmin" },
  { key: "stress", label: "Stress", defaultSource: "garmin" },
  { key: "weight", label: "Weight", defaultSource: "renpho" },
  { key: "bodyFat", label: "Body fat %", defaultSource: "renpho" },
  { key: "muscle", label: "Muscle mass", defaultSource: "renpho" },
  { key: "bmi", label: "BMI", defaultSource: "renpho" },
  { key: "workouts", label: "Workouts", defaultSource: "forge" },
] as const;

const SOURCES = [
  { id: "health_connect", label: "Health Connect", enabled: true },
  { id: "garmin", label: "Garmin", enabled: true },
  { id: "renpho", label: "Renpho", enabled: true },
  { id: "forge", label: "Forge", enabled: true },
  { id: "strava", label: "Strava (soon)", enabled: false },
  { id: "oura", label: "Oura (soon)", enabled: false },
  { id: "whoop", label: "Whoop (soon)", enabled: false },
  { id: "apple_health", label: "Apple Health (soon)", enabled: false },
];

/** Fresh if last success within 36 hours and no active error. */
function isSynced(a?: AccountRow) {
  if (!a?.hasCredentials || !a.enabled || a.needsReauth || a.lastError) return false;
  if (a.syncPending) return false;
  if (!a.lastSuccessAt) return false;
  const t = new Date(a.lastSuccessAt).getTime();
  if (Number.isNaN(t)) return false;
  return Date.now() - t < 36 * 60 * 60 * 1000;
}

function formatWhen(iso?: string | null) {
  if (!iso) return null;
  try {
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    return d.toLocaleString();
  } catch {
    return null;
  }
}

function SyncBadge({ account }: { account?: AccountRow }) {
  if (!account?.hasCredentials) {
    return (
      <View style={[styles.badge, styles.badgeOff]}>
        <Text style={styles.badgeTextOff}>Not signed in</Text>
      </View>
    );
  }
  if (account.syncPending) {
    return (
      <View style={[styles.badge, styles.badgeWarn]}>
        <Text style={styles.badgeTextWarn}>Syncing…</Text>
      </View>
    );
  }
  if (isSynced(account)) {
    return (
      <View style={[styles.badge, styles.badgeOk]}>
        <Text style={styles.badgeTextOk}>Synced</Text>
      </View>
    );
  }
  if (account.needsReauth || account.lastError) {
    return (
      <View style={[styles.badge, styles.badgeBad]}>
        <Text style={styles.badgeTextBad}>Not synced</Text>
      </View>
    );
  }
  return (
    <View style={[styles.badge, styles.badgeWarn]}>
      <Text style={styles.badgeTextWarn}>Waiting for sync</Text>
    </View>
  );
}

function sourcesForMetric(key: string) {
  return SOURCES.filter((s) => {
    if (key === "workouts") return s.id === "forge" || s.id === "garmin" || !s.enabled;
    if (key === "weight" || key === "bodyFat" || key === "muscle" || key === "bmi")
      return s.id === "renpho" || s.id === "health_connect" || s.id === "garmin" || !s.enabled;
    if (key === "bodyBattery" || key === "stress")
      return s.id === "garmin" || s.id === "health_connect" || !s.enabled;
    if (key === "steps" || key === "sleep" || key === "hr" || key === "calories")
      return s.id !== "renpho";
    return true;
  });
}

export default function ConnectHealthScreen() {
  const router = useRouter();
  const [busy, setBusy] = useState(false);
  const [snap, setSnap] = useState<HealthSnapshot | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [accounts, setAccounts] = useState<AccountRow[]>([]);
  const [alerts, setAlerts] = useState<AlertRow[]>([]);
  const [sources, setSources] = useState<Record<string, string>>({});
  const [signInFor, setSignInFor] = useState<"garmin" | "renpho" | null>(null);
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const loadIntegrations = useCallback(async () => {
    try {
      const [acct, al, prefs] = await Promise.all([
        apiFetch<{ accounts: AccountRow[] }>("/integrations/accounts"),
        apiFetch<{ alerts: AlertRow[] }>("/alerts/active"),
        getPreferences(),
      ]);
      setAccounts(acct.accounts);
      setAlerts(al.alerts as AlertRow[]);
      setSources((prefs.metricSources as Record<string, string>) ?? {});
      for (const a of al.alerts) {
        void startStickyNotification({
          id: NOTIF_IDS.integrationAlert,
          title: "Integration needs attention",
          body: a.message,
          data: { kind: "integration-alert", provider: a.provider },
        });
      }
      if (!al.alerts.length) void stopStickyNotification(NOTIF_IDS.integrationAlert);
    } catch {
      /* offline */
    }
  }, []);

  const refresh = useCallback(async () => {
    setBusy(true);
    setMsg(null);
    try {
      const result = await syncHealthConnectToServer();
      setSnap(result);
      if (!result.available) setMsg(result.error ?? "Not connected");
      else setMsg("Synced from Health Connect ✓");
      await loadIntegrations();
    } finally {
      setBusy(false);
    }
  }, [loadIntegrations]);

  useFocusEffect(
    useCallback(() => {
      void loadIntegrations();
      if (Platform.OS === "android") void refresh();
    }, [loadIntegrations, refresh]),
  );

  function openSignIn(provider: "garmin" | "renpho") {
    setEmail("");
    setPassword("");
    setSignInFor(provider);
  }

  async function saveSignIn() {
    if (!signInFor) return;
    const e = email.trim();
    if (!e || !password) {
      setMsg("Enter email and password");
      return;
    }
    if (signInFor === "renpho") {
      if (password.length < 6 || password.length > 16 || /[^a-zA-Z0-9]/.test(password)) {
        setMsg(
          "Renpho Health passwords are usually 6–16 letters/numbers only. Use the Renpho Health app password.",
        );
        return;
      }
    }
    setBusy(true);
    try {
      await apiFetch("/integrations/accounts", {
        method: "PATCH",
        body: JSON.stringify({ provider: signInFor, email: e, password, enabled: true }),
      });
      setSignInFor(null);
      setEmail("");
      setPassword("");
      setMsg(`${signInFor} signed in — sync queued`);
      await loadIntegrations();
    } catch (err) {
      setMsg(err instanceof Error ? err.message : "Save failed");
    } finally {
      setBusy(false);
    }
  }

  async function syncNow(provider: "garmin" | "renpho") {
    setBusy(true);
    setMsg(null);
    try {
      const res = await apiFetch<{ message?: string }>("/integrations/accounts/sync-now", {
        method: "POST",
        body: JSON.stringify({ provider }),
      });
      setMsg(res.message ?? "Sync queued");
      await loadIntegrations();
      for (let i = 0; i < 8; i++) {
        await new Promise((r) => setTimeout(r, 4000));
        const fresh = await apiFetch<{ accounts: AccountRow[] }>("/integrations/accounts");
        setAccounts(fresh.accounts);
        const row = fresh.accounts.find((x) => x.provider === provider);
        if (row && !row.syncPending && (row.lastSuccessAt || row.lastError)) {
          setMsg(
            row.lastError
              ? `${provider} failed: ${row.lastError}`
              : isSynced(row)
                ? `${provider} Synced ✓`
                : `${provider} updated`,
          );
          break;
        }
      }
    } catch (e) {
      setMsg(e instanceof Error ? e.message : "Sync failed");
    } finally {
      setBusy(false);
    }
  }

  async function saveSources(next: Record<string, string>) {
    setSources(next);
    const prefs = await getPreferences();
    const updated = { ...prefs, metricSources: next };
    await savePreferences(updated);
    try {
      await pushPreferences(updated);
    } catch {
      /* offline */
    }
  }

  const garmin = accounts.find((a) => a.provider === "garmin");
  const renpho = accounts.find((a) => a.provider === "renpho");

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Pressable onPress={() => router.back()}>
        <Text style={styles.back}>← Back</Text>
      </Pressable>
      <Text style={styles.title}>Integrations</Text>
      <Text style={styles.sub}>Connect sources, then map which one owns each metric.</Text>

      {alerts.length ? (
        <View style={styles.alertCard}>
          <Text style={styles.cardTitle}>Needs attention</Text>
          {alerts.map((a) => (
            <Text key={a.provider} style={styles.alertText}>
              {a.provider}: {a.message}
            </Text>
          ))}
        </View>
      ) : null}

      {msg ? <Text style={styles.msg}>{msg}</Text> : null}

      <View style={styles.card}>
        <Text style={styles.cardTitle}>Health Connect</Text>
        {Platform.OS !== "android" ? (
          <Text style={styles.body}>Android-only.</Text>
        ) : (
          <>
            <ActionButton label="Sync now" loading={busy} onPress={refresh} />
            {snap?.available ? (
              <Text style={styles.meta}>
                {snap.steps != null ? `${snap.steps.toLocaleString()} steps` : "— steps"}
                {" · "}
                {snap.sleepMinutes != null ? `${(snap.sleepMinutes / 60).toFixed(1)}h sleep` : "— sleep"}
              </Text>
            ) : null}
          </>
        )}
      </View>

      <View style={styles.card}>
        <View style={styles.cardHead}>
          <Text style={styles.cardTitle}>Garmin</Text>
          <SyncBadge account={garmin} />
        </View>
        <Text style={styles.meta}>
          {garmin?.emailMasked ?? "Sign in to connect"}
          {garmin?.lastSuccessAt ? ` · last ${formatWhen(garmin.lastSuccessAt)}` : ""}
        </Text>
        {garmin?.lastError ? <Text style={styles.err}>{garmin.lastError}</Text> : null}
        <Text style={styles.body}>Steps, sleep, HR, calories, stress, body battery.</Text>
        <View style={styles.rowBtns}>
          <ActionButton
            label={garmin?.hasCredentials ? "Re-sign in" : "Sign in"}
            variant="ghost"
            loading={busy}
            onPress={() => openSignIn("garmin")}
          />
          {garmin?.hasCredentials ? (
            <ActionButton label="Sync now" loading={busy} onPress={() => void syncNow("garmin")} />
          ) : null}
        </View>
      </View>

      <View style={styles.card}>
        <View style={styles.cardHead}>
          <Text style={styles.cardTitle}>Renpho</Text>
          <SyncBadge account={renpho} />
        </View>
        <Text style={styles.meta}>
          {renpho?.emailMasked ?? "Sign in to connect"}
          {renpho?.lastSuccessAt ? ` · last ${formatWhen(renpho.lastSuccessAt)}` : ""}
        </Text>
        {renpho?.lastError ? <Text style={styles.err}>{renpho.lastError}</Text> : null}
        <Text style={styles.body}>Weight + body composition (fat, muscle, BMI, visceral, BMR…).</Text>
        <View style={styles.rowBtns}>
          <ActionButton
            label={renpho?.hasCredentials ? "Re-sign in" : "Sign in"}
            variant="ghost"
            loading={busy}
            onPress={() => openSignIn("renpho")}
          />
          {renpho?.hasCredentials ? (
            <ActionButton label="Sync now" loading={busy} onPress={() => void syncNow("renpho")} />
          ) : null}
        </View>

        <Text style={[styles.cardTitle, { marginTop: spacing.md }]}>Metric sources</Text>
        <Text style={styles.body}>Pick the preferred source for each metric Forge displays.</Text>
        {METRICS.map((m) => (
          <View key={m.key} style={styles.metricBlock}>
            <Text style={styles.metricLabel}>{m.label}</Text>
            <View style={styles.chips}>
              {sourcesForMetric(m.key).map((s) => {
                const on = (sources[m.key] ?? m.defaultSource) === s.id;
                return (
                  <Pressable
                    key={s.id}
                    style={[styles.chip, on && styles.chipOn, !s.enabled && { opacity: 0.35 }]}
                    disabled={!s.enabled}
                    onPress={() => void saveSources({ ...sources, [m.key]: s.id })}
                  >
                    <Text style={[styles.chipText, on && styles.chipTextOn]}>{s.label}</Text>
                  </Pressable>
                );
              })}
            </View>
          </View>
        ))}
      </View>

      <Modal visible={!!signInFor} animationType="fade" transparent onRequestClose={() => setSignInFor(null)}>
        <View style={styles.modalWrap}>
          <View style={styles.modalCard}>
            <Text style={styles.modalTitle}>
              Sign in to {signInFor === "garmin" ? "Garmin" : "Renpho"}
            </Text>
            <Text style={styles.body}>
              Credentials are encrypted on the server and never shown on this screen again.
            </Text>
            {signInFor === "renpho" ? (
              <Text style={styles.body}>
                Use Renpho Health app email + password (6–16 letters/numbers). Not the website account.
              </Text>
            ) : null}
            <TextInput
              style={styles.input}
              placeholder="Email"
              placeholderTextColor={colors.textMuted}
              autoCapitalize="none"
              autoCorrect={false}
              keyboardType="email-address"
              value={email}
              onChangeText={setEmail}
            />
            <TextInput
              style={styles.input}
              placeholder="Password"
              placeholderTextColor={colors.textMuted}
              secureTextEntry
              value={password}
              onChangeText={setPassword}
            />
            <ActionButton label="Save & enable" loading={busy} onPress={() => void saveSignIn()} />
            <ActionButton
              label="Cancel"
              variant="ghost"
              onPress={() => {
                setSignInFor(null);
                setEmail("");
                setPassword("");
              }}
            />
          </View>
        </View>
      </Modal>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.sm, paddingBottom: 48 },
  back: { color: colors.accent, fontFamily: "Outfit_700Bold", marginBottom: spacing.sm },
  title: { color: colors.text, fontSize: 28, fontFamily: "SpaceGrotesk_700Bold" },
  sub: { color: colors.textMuted, fontFamily: "Outfit_500Medium", marginBottom: spacing.sm },
  card: {
    backgroundColor: colors.bgElevated,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.md,
    gap: spacing.sm,
  },
  cardHead: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", gap: 8 },
  alertCard: {
    backgroundColor: "#2A2218",
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.warn,
    padding: spacing.md,
    gap: 6,
  },
  cardTitle: { color: colors.text, fontFamily: "Outfit_700Bold", fontSize: 16 },
  body: { color: colors.textMuted, fontFamily: "Outfit_500Medium", fontSize: 13, lineHeight: 20 },
  msg: { color: colors.accent, fontFamily: "Outfit_700Bold" },
  meta: { color: colors.textMuted, fontFamily: "Outfit_500Medium", fontSize: 12 },
  err: { color: colors.warn, fontFamily: "Outfit_500Medium", fontSize: 12 },
  alertText: { color: colors.warn, fontFamily: "Outfit_500Medium", fontSize: 13 },
  input: {
    backgroundColor: colors.bgSoft,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
  },
  chips: { flexDirection: "row", flexWrap: "wrap", gap: 6 },
  chip: {
    borderRadius: 999,
    borderWidth: 1,
    borderColor: colors.line,
    paddingHorizontal: 10,
    paddingVertical: 6,
    backgroundColor: colors.bgSoft,
  },
  chipOn: { backgroundColor: colors.accent, borderColor: colors.accent },
  chipText: { color: colors.text, fontFamily: "Outfit_700Bold", fontSize: 11 },
  chipTextOn: { color: colors.bg },
  metricBlock: { gap: 6, marginTop: 6 },
  metricLabel: { color: colors.text, fontFamily: "Outfit_700Bold", fontSize: 12 },
  rowBtns: { gap: spacing.sm },
  badge: { borderRadius: 999, paddingHorizontal: 10, paddingVertical: 4 },
  badgeOk: { backgroundColor: "rgba(196,245,66,0.18)", borderWidth: 1, borderColor: colors.accent },
  badgeWarn: { backgroundColor: "rgba(240,163,90,0.15)", borderWidth: 1, borderColor: colors.warn },
  badgeBad: { backgroundColor: "rgba(232,106,92,0.15)", borderWidth: 1, borderColor: colors.danger },
  badgeOff: { backgroundColor: colors.bgSoft, borderWidth: 1, borderColor: colors.line },
  badgeTextOk: { color: colors.accent, fontFamily: "Outfit_700Bold", fontSize: 11 },
  badgeTextWarn: { color: colors.warn, fontFamily: "Outfit_700Bold", fontSize: 11 },
  badgeTextBad: { color: colors.danger, fontFamily: "Outfit_700Bold", fontSize: 11 },
  badgeTextOff: { color: colors.textMuted, fontFamily: "Outfit_700Bold", fontSize: 11 },
  modalWrap: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.72)",
    justifyContent: "center",
    padding: spacing.lg,
  },
  modalCard: {
    backgroundColor: colors.bgElevated,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.md,
    gap: spacing.sm,
  },
  modalTitle: { color: colors.text, fontFamily: "SpaceGrotesk_700Bold", fontSize: 20 },
});
