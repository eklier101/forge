import { useEffect, useMemo, useState } from "react";
import {
  KeyboardAvoidingView,
  Platform,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  View,
} from "react-native";
import { LinearGradient } from "expo-linear-gradient";
import { Ionicons } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { authStatus, loginAccount, registerAccount, validateInvite } from "../src/lib/api";
import { setPairedFlag } from "../src/lib/authFlag";
import { passwordMeetsRules } from "../src/lib/password";
import { saveSession, getApiUrl } from "../src/lib/session";
import { syncNow } from "../src/lib/sync";
import { colors, spacing } from "../src/theme/colors";

function defaultApiUrl() {
  if (Platform.OS === "web" && typeof window !== "undefined" && window.location?.origin) {
    return window.location.origin;
  }
  return "http://localhost:3030";
}

function firstParam(value: string | string[] | undefined): string {
  if (Array.isArray(value)) return value[0] ?? "";
  return value ?? "";
}

export default function AuthScreen() {
  const router = useRouter();
  const params = useLocalSearchParams<{ invite?: string | string[] }>();
  const inviteFromLink = firstParam(params.invite).trim().toLowerCase();

  const initialUrl = useMemo(() => defaultApiUrl(), []);
  const [apiUrl, setApiUrl] = useState(initialUrl);
  const [needsBootstrap, setNeedsBootstrap] = useState(false);
  const [inviteValid, setInviteValid] = useState(false);
  const [inviteHint, setInviteHint] = useState<string | null>(null);
  const [username, setUsername] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [displayName, setDisplayName] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [showConfirmPassword, setShowConfirmPassword] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      const saved = await getApiUrl();
      if (saved) setApiUrl(saved);
    })();
  }, []);

  const isRegister = needsBootstrap || (Boolean(inviteFromLink) && inviteValid);
  const passwordsMatch = !isRegister || password === confirmPassword;
  const canSubmit =
    !busy &&
    Boolean(username.trim()) &&
    Boolean(password) &&
    passwordsMatch &&
    !(Boolean(inviteFromLink) && !needsBootstrap && !inviteValid) &&
    !(isRegister && !confirmPassword);

  useEffect(() => {
    let alive = true;
    (async () => {
      try {
        const status = await authStatus(apiUrl);
        if (!alive) return;
        setNeedsBootstrap(status.needsBootstrap);
      } catch {
        /* server may be offline — keep login UI */
      }
    })();
    return () => {
      alive = false;
    };
  }, [apiUrl]);

  useEffect(() => {
    let alive = true;
    (async () => {
      if (!inviteFromLink) {
        setInviteValid(false);
        setInviteHint(null);
        return;
      }
      try {
        const res = await validateInvite(apiUrl, inviteFromLink);
        if (!alive) return;
        setInviteValid(res.valid);
        setInviteHint(
          res.valid
            ? `Invite OK · expires ${res.expiresAt ? new Date(res.expiresAt).toLocaleString() : "soon"}`
            : res.error || "Invite is not valid",
        );
      } catch (e) {
        if (!alive) return;
        setInviteValid(false);
        setInviteHint(e instanceof Error ? e.message : "Could not check invite");
      }
    })();
    return () => {
      alive = false;
    };
  }, [apiUrl, inviteFromLink]);

  async function onSubmit() {
    if (!canSubmit) return;
    if (isRegister) {
      if (password !== confirmPassword) {
        setError("Passwords don’t match");
        return;
      }
      const pwdErr = passwordMeetsRules(password);
      if (pwdErr) {
        setError(pwdErr);
        return;
      }
    }
    setBusy(true);
    setError(null);
    try {
      const deviceName = Platform.OS;
      const result = isRegister
        ? await registerAccount({
            apiUrl,
            username,
            password,
            displayName: displayName || username,
            inviteCode: needsBootstrap ? undefined : inviteFromLink,
            deviceName,
          })
        : await loginAccount({ apiUrl, username, password, deviceName });
      await saveSession(result.token, apiUrl, result.user);
      setPairedFlag(true);
      void syncNow();
      if (isRegister) {
        router.replace("/setup-profile");
      } else {
        router.replace("/(tabs)/today");
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : "Auth failed");
      setBusy(false);
    }
  }

  const subtitle = needsBootstrap
    ? "First install — create the admin account. After this, only login is available."
    : isRegister
      ? "Create your account with this invite. Link is one-time and expires in 24 hours."
      : "Sign in with your username and password. New accounts need an invite link from the admin.";

  return (
    <LinearGradient colors={["#0B1210", "#132019", "#0B1210"]} style={styles.root}>
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : undefined} style={styles.inner}>
        <Text style={styles.brand}>FORGE</Text>
        <Text style={styles.sub}>{subtitle}</Text>

        <View style={styles.card}>
          {inviteFromLink && !needsBootstrap ? (
            <Text style={[styles.inviteBanner, !inviteValid && styles.inviteBad]}>
              {inviteHint ?? "Checking invite…"}
            </Text>
          ) : null}

          <Field label="Server URL" value={apiUrl} onChangeText={setApiUrl} autoCapitalize="none" />
          <Field
            label="Username"
            value={username}
            onChangeText={setUsername}
            autoCapitalize="none"
            returnKeyType="next"
          />
          <Field
            label="Password"
            value={password}
            onChangeText={setPassword}
            autoCapitalize="none"
            secureTextEntry={!showPassword}
            showToggle
            revealed={showPassword}
            onToggleReveal={() => setShowPassword((v) => !v)}
            returnKeyType={isRegister ? "next" : "go"}
            onSubmitEditing={() => {
              if (!isRegister && canSubmit) void onSubmit();
            }}
          />
          {isRegister ? (
            <>
              <Field
                label="Confirm password"
                value={confirmPassword}
                onChangeText={setConfirmPassword}
                autoCapitalize="none"
                secureTextEntry={!showConfirmPassword}
                showToggle
                revealed={showConfirmPassword}
                onToggleReveal={() => setShowConfirmPassword((v) => !v)}
                returnKeyType="next"
              />
              {confirmPassword.length > 0 && !passwordsMatch ? (
                <Text style={styles.error}>Passwords don’t match</Text>
              ) : null}
              <Field
                label="Display name"
                value={displayName}
                onChangeText={setDisplayName}
                returnKeyType="go"
                onSubmitEditing={() => {
                  if (canSubmit) void onSubmit();
                }}
              />
              <Text style={styles.hint}>Password: 8+ chars, 1 uppercase, 1 number, 1 symbol</Text>
            </>
          ) : null}

          {error ? <Text style={styles.error}>{error}</Text> : null}
          <Pressable
            style={[styles.cta, !canSubmit && styles.ctaDisabled]}
            onPress={onSubmit}
            disabled={!canSubmit}
          >
            <Text style={styles.ctaText}>
              {busy
                ? "Working…"
                : needsBootstrap
                  ? "Create admin account"
                  : isRegister
                    ? "Create account"
                    : "Log in"}
            </Text>
          </Pressable>
        </View>
      </KeyboardAvoidingView>
    </LinearGradient>
  );
}

function Field(props: {
  label: string;
  value: string;
  onChangeText: (v: string) => void;
  autoCapitalize?: "none" | "sentences";
  secureTextEntry?: boolean;
  showToggle?: boolean;
  revealed?: boolean;
  onToggleReveal?: () => void;
  returnKeyType?: "next" | "go" | "done";
  onSubmitEditing?: () => void;
}) {
  return (
    <View style={styles.field}>
      <Text style={styles.label}>{props.label}</Text>
      <View style={styles.inputRow}>
        <TextInput
          value={props.value}
          onChangeText={props.onChangeText}
          autoCapitalize={props.autoCapitalize ?? "sentences"}
          autoCorrect={false}
          secureTextEntry={props.secureTextEntry}
          returnKeyType={props.returnKeyType}
          onSubmitEditing={props.onSubmitEditing}
          blurOnSubmit={props.returnKeyType !== "next"}
          placeholderTextColor={colors.textMuted}
          style={[styles.input, props.showToggle ? styles.inputWithToggle : null]}
        />
        {props.showToggle ? (
          <Pressable
            onPress={props.onToggleReveal}
            hitSlop={10}
            style={styles.eyeBtn}
            accessibilityRole="button"
            accessibilityLabel={props.revealed ? "Hide password" : "Show password"}
          >
            <Ionicons
              name={props.revealed ? "eye-off-outline" : "eye-outline"}
              size={22}
              color={colors.textMuted}
            />
          </Pressable>
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  inner: { flex: 1, justifyContent: "center", padding: spacing.lg, gap: spacing.lg },
  brand: {
    color: colors.accent,
    fontSize: 56,
    fontFamily: "SpaceGrotesk_700Bold",
    letterSpacing: 4,
  },
  sub: { color: colors.textMuted, fontSize: 16, fontFamily: "Outfit_500Medium", maxWidth: 340 },
  card: {
    backgroundColor: colors.bgElevated,
    borderRadius: 22,
    borderWidth: 1,
    borderColor: colors.line,
    padding: spacing.lg,
    gap: spacing.md,
  },
  inviteBanner: {
    color: colors.accent,
    fontFamily: "Outfit_500Medium",
    fontSize: 13,
    backgroundColor: "#15241A",
    borderRadius: 12,
    padding: 10,
    borderWidth: 1,
    borderColor: colors.accentDim,
  },
  inviteBad: {
    color: colors.danger,
    backgroundColor: "#2A1818",
    borderColor: colors.danger,
  },
  field: { gap: 6 },
  label: { color: colors.textMuted, fontSize: 12, textTransform: "uppercase", letterSpacing: 1 },
  hint: { color: colors.textMuted, fontSize: 12, fontFamily: "Outfit_500Medium" },
  inputRow: { position: "relative", justifyContent: "center" },
  input: {
    backgroundColor: colors.bgSoft,
    borderRadius: 12,
    color: colors.text,
    paddingHorizontal: spacing.md,
    paddingVertical: 12,
    fontFamily: "Outfit_500Medium",
  },
  inputWithToggle: { paddingRight: 48 },
  eyeBtn: {
    position: "absolute",
    right: 12,
    height: 44,
    justifyContent: "center",
    alignItems: "center",
  },
  cta: {
    backgroundColor: colors.accent,
    borderRadius: 999,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: spacing.sm,
  },
  ctaDisabled: { opacity: 0.6 },
  ctaText: { color: colors.bg, fontFamily: "Outfit_700Bold", fontSize: 16 },
  error: { color: colors.danger, fontFamily: "Outfit_500Medium" },
});
