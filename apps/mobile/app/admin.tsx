import { useCallback, useState } from "react";
import {
  Pressable,
  ScrollView,
  Share,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  View,
} from "react-native";
import { useFocusEffect, useRouter } from "expo-router";
import { ActionButton } from "../src/components/ActionButton";
import { apiFetch } from "../src/lib/api";
import { colors, spacing } from "../src/theme/colors";

type Settings = {
  publicBaseUrl: string | null;
  haEnabled: boolean;
  haMqttUrl: string | null;
  haMqttUsername: string | null;
  haMqttPasswordSet: boolean;
  haRestUrl: string | null;
  haRestTokenSet: boolean;
  aiEnabled: boolean;
  ollamaUrl: string | null;
};

type InviteRow = {
  code: string;
  note: string | null;
  expiresAt: string;
  status: "ok" | "used" | "expired";
  url: string;
};

type UserRow = {
  id: string;
  username: string;
  displayName: string;
  role: string;
  createdAt: string;
};

export default function AdminScreen() {
  const router = useRouter();
  const [settings, setSettings] = useState<Settings | null>(null);
  const [publicBaseUrl, setPublicBaseUrl] = useState("");
  const [haEnabled, setHaEnabled] = useState(false);
  const [haMqttUrl, setHaMqttUrl] = useState("");
  const [haMqttUsername, setHaMqttUsername] = useState("");
  const [haMqttPassword, setHaMqttPassword] = useState("");
  const [haRestUrl, setHaRestUrl] = useState("");
  const [haRestToken, setHaRestToken] = useState("");
  const [aiEnabled, setAiEnabled] = useState(false);
  const [ollamaUrl, setOllamaUrl] = useState("");
  const [invites, setInvites] = useState<InviteRow[]>([]);
  const [users, setUsers] = useState<UserRow[]>([]);
  const [inviteNote, setInviteNote] = useState("");
  const [msg, setMsg] = useState<string | null>(null);
  const [msgTone, setMsgTone] = useState<"ok" | "warn">("ok");
  const [saving, setSaving] = useState(false);
  const [testingHa, setTestingHa] = useState(false);
  const [inviteBusy, setInviteBusy] = useState(false);

  const flash = (message: string, tone: "ok" | "warn" = "ok") => {
    setMsgTone(tone);
    setMsg(message);
  };

  const load = useCallback(async () => {
    try {
      const [s, inv, u] = await Promise.all([
        apiFetch<{ settings: Settings }>("/admin/settings"),
        apiFetch<{ invites: InviteRow[] }>("/admin/invites"),
        apiFetch<{ users: UserRow[] }>("/admin/users"),
      ]);
      const st = s.settings;
      setSettings(st);
      setPublicBaseUrl(st.publicBaseUrl ?? "");
      setHaEnabled(st.haEnabled);
      setHaMqttUrl(st.haMqttUrl ?? "");
      setHaMqttUsername(st.haMqttUsername ?? "");
      setHaMqttPassword("");
      setHaRestUrl(st.haRestUrl ?? "");
      setHaRestToken("");
      setAiEnabled(st.aiEnabled);
      setOllamaUrl(st.ollamaUrl ?? "");
      setInvites(inv.invites);
      setUsers(u.users);
    } catch (e) {
      flash(e instanceof Error ? e.message : "Failed to load admin data", "warn");
    }
  }, []);

  useFocusEffect(
    useCallback(() => {
      void load();
    }, [load]),
  );

  async function saveSettings() {
    setSaving(true);
    try {
      const body: Record<string, unknown> = {
        publicBaseUrl: publicBaseUrl.trim() || null,
        haEnabled,
        haMqttUrl: haMqttUrl.trim() || null,
        haMqttUsername: haMqttUsername.trim() || null,
        haRestUrl: haRestUrl.trim() || null,
        aiEnabled,
        ollamaUrl: ollamaUrl.trim() || null,
      };
      if (haMqttPassword.trim()) body.haMqttPassword = haMqttPassword.trim();
      if (haRestToken.trim()) body.haRestToken = haRestToken.trim();

      const res = await apiFetch<{ settings: Settings }>("/admin/settings", {
        method: "PATCH",
        body: JSON.stringify(body),
      });
      setSettings(res.settings);
      setHaMqttPassword("");
      setHaRestToken("");
      flash("Settings saved ✓");
    } catch (e) {
      flash(e instanceof Error ? e.message : "Save failed", "warn");
    } finally {
      setSaving(false);
    }
  }

  async function testHa() {
    setTestingHa(true);
    try {
      const res = await apiFetch<{ ok: boolean; via?: string }>("/admin/ha/test", { method: "POST" });
      flash(`HA test OK via ${res.via ?? "unknown"}`);
    } catch (e) {
      flash(e instanceof Error ? e.message : "HA test failed", "warn");
    } finally {
      setTestingHa(false);
    }
  }

  async function createInvite() {
    setInviteBusy(true);
    try {
      const res = await apiFetch<{ invite: InviteRow }>("/admin/invites", {
        method: "POST",
        body: JSON.stringify({ note: inviteNote || undefined }),
      });
      setInviteNote("");
      flash("Invite link ready");
      await load();
      try {
        await Share.share({
          message: `You're invited to Forge (1 use, expires in 24h):\n${res.invite.url}`,
          url: res.invite.url,
          title: "Forge invite",
        });
      } catch {
        /* dismissed */
      }
    } catch (e) {
      flash(e instanceof Error ? e.message : "Could not create invite", "warn");
    } finally {
      setInviteBusy(false);
    }
  }

  return (
    <ScrollView style={styles.root} contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
      <Pressable onPress={() => router.back()}>
        <Text style={styles.back}>← You</Text>
      </Pressable>
      <Text style={styles.title}>Admin</Text>
      <Text style={styles.sub}>Server settings for Forge. Only admins see this.</Text>

      {msg ? (
        <View style={[styles.banner, msgTone === "warn" ? styles.bannerWarn : styles.bannerOk]}>
          <Text style={styles.bannerText}>{msg}</Text>
        </View>
      ) : null}

      <Text style={styles.section}>Public URL</Text>
      <Text style={styles.hint}>Used in invite links (Cloudflare hostname). Example: https://forge.yourdomain.com</Text>
      <TextInput
        style={styles.input}
        autoCapitalize="none"
        autoCorrect={false}
        placeholder="https://forge.example.com"
        placeholderTextColor={colors.textMuted}
        value={publicBaseUrl}
        onChangeText={setPublicBaseUrl}
      />

      <Text style={styles.section}>Home Assistant</Text>
      <View style={styles.row}>
        <Text style={styles.label}>Publish events to HA</Text>
        <Switch
          value={haEnabled}
          onValueChange={setHaEnabled}
          trackColor={{ false: colors.line, true: colors.accentDim }}
          thumbColor={haEnabled ? colors.accent : colors.textMuted}
        />
      </View>
      <Text style={styles.label}>MQTT URL</Text>
      <TextInput
        style={styles.input}
        autoCapitalize="none"
        value={haMqttUrl}
        onChangeText={setHaMqttUrl}
        placeholder="mqtt://10.x.x.x:1883"
        placeholderTextColor={colors.textMuted}
      />
      <Text style={styles.label}>MQTT username</Text>
      <TextInput style={styles.input} autoCapitalize="none" value={haMqttUsername} onChangeText={setHaMqttUsername} />
      <Text style={styles.label}>MQTT password {settings?.haMqttPasswordSet ? "(set — leave blank to keep)" : ""}</Text>
      <TextInput
        style={styles.input}
        autoCapitalize="none"
        secureTextEntry
        value={haMqttPassword}
        onChangeText={setHaMqttPassword}
        placeholder={settings?.haMqttPasswordSet ? "••••••••" : "optional"}
        placeholderTextColor={colors.textMuted}
      />
      <Text style={styles.label}>REST URL</Text>
      <TextInput
        style={styles.input}
        autoCapitalize="none"
        value={haRestUrl}
        onChangeText={setHaRestUrl}
        placeholder="http://homeassistant.local:8123"
        placeholderTextColor={colors.textMuted}
      />
      <Text style={styles.label}>REST long-lived token {settings?.haRestTokenSet ? "(set — leave blank to keep)" : ""}</Text>
      <TextInput
        style={styles.input}
        autoCapitalize="none"
        secureTextEntry
        value={haRestToken}
        onChangeText={setHaRestToken}
        placeholder={settings?.haRestTokenSet ? "••••••••" : "optional"}
        placeholderTextColor={colors.textMuted}
      />
      <ActionButton label="Test Home Assistant" variant="ghost" loading={testingHa} onPress={testHa} />

      <Text style={styles.section}>AI planner (Ollama)</Text>
      <View style={styles.row}>
        <Text style={styles.label}>Enable AI enhancer</Text>
        <Switch
          value={aiEnabled}
          onValueChange={setAiEnabled}
          trackColor={{ false: colors.line, true: colors.accentDim }}
          thumbColor={aiEnabled ? colors.accent : colors.textMuted}
        />
      </View>
      <Text style={styles.label}>Ollama URL</Text>
      <TextInput
        style={styles.input}
        autoCapitalize="none"
        value={ollamaUrl}
        onChangeText={setOllamaUrl}
        placeholder="http://127.0.0.1:11434"
        placeholderTextColor={colors.textMuted}
      />

      <ActionButton label="Save settings" loading={saving} onPress={saveSettings} />

      <Text style={styles.section}>Invite links</Text>
      <Text style={styles.hint}>One-time · expires in 24 hours. Uses public URL above when set.</Text>
      <TextInput
        style={styles.input}
        placeholder="Optional note"
        placeholderTextColor={colors.textMuted}
        value={inviteNote}
        onChangeText={setInviteNote}
      />
      <ActionButton label="Create invite link" loading={inviteBusy} onPress={createInvite} />
      {invites.map((inv) => (
        <Pressable
          key={inv.code}
          style={({ pressed }) => [styles.card, pressed && styles.pressed]}
          onPress={() =>
            Share.share({
              message: `You're invited to Forge:\n${inv.url}`,
              url: inv.url,
            }).catch(() => flash(inv.url))
          }
        >
          <Text style={styles.link} numberOfLines={2}>
            {inv.url}
          </Text>
          <Text style={styles.hint}>
            {inv.status} · expires {new Date(inv.expiresAt).toLocaleString()}
            {inv.note ? ` · ${inv.note}` : ""}
          </Text>
        </Pressable>
      ))}

      <Text style={styles.section}>Users</Text>
      {users.map((u) => (
        <View key={u.id} style={styles.card}>
          <Text style={styles.userName}>
            {u.displayName} ({u.username}){u.role === "admin" ? " · admin" : ""}
          </Text>
          <Text style={styles.hint}>Joined {new Date(u.createdAt).toLocaleDateString()}</Text>
        </View>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.bg },
  content: { padding: spacing.lg, gap: spacing.sm, paddingBottom: 56 },
  back: { color: colors.accent, fontFamily: "Outfit_700Bold", marginBottom: 4 },
  title: { color: colors.text, fontSize: 28, fontFamily: "SpaceGrotesk_700Bold" },
  sub: { color: colors.textMuted, fontFamily: "Outfit_500Medium", marginBottom: spacing.sm },
  section: {
    color: colors.accent,
    fontFamily: "Outfit_700Bold",
    fontSize: 16,
    marginTop: spacing.md,
  },
  label: { color: colors.textMuted, fontFamily: "Outfit_500Medium" },
  hint: { color: colors.textMuted, fontSize: 12, fontFamily: "Outfit_500Medium" },
  input: {
    backgroundColor: colors.bgElevated,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontFamily: "Outfit_500Medium",
  },
  row: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  banner: {
    borderRadius: 12,
    paddingVertical: 10,
    paddingHorizontal: 12,
    borderWidth: 1,
  },
  bannerOk: { backgroundColor: "#15241A", borderColor: colors.accentDim },
  bannerWarn: { backgroundColor: "#2A2218", borderColor: colors.warn },
  bannerText: { color: colors.text, fontFamily: "Outfit_700Bold", fontSize: 14 },
  card: {
    backgroundColor: colors.bgElevated,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: colors.line,
    padding: 12,
    gap: 4,
  },
  pressed: { opacity: 0.8 },
  link: { color: colors.accent, fontFamily: "Outfit_500Medium", fontSize: 12 },
  userName: { color: colors.text, fontFamily: "Outfit_700Bold" },
});
