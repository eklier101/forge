import { Platform } from "react-native";
import Constants from "expo-constants";
import * as Notifications from "expo-notifications";
import * as SecureStore from "expo-secure-store";
import { apiFetch } from "./api";
import { ensureNotificationSetup } from "./notifications";

const TOKEN_KEY = "forge_expo_push_token";

function resolveProjectId(): string | undefined {
  return (
    Constants.easConfig?.projectId ??
    (Constants.expoConfig?.extra as { eas?: { projectId?: string } } | undefined)?.eas?.projectId ??
    process.env.EXPO_PUBLIC_PROJECT_ID
  );
}

/** Register Expo push token with API for the signed-in user. */
export async function registerPushToken(): Promise<string | null> {
  if (Platform.OS === "web") return null;
  try {
    const ok = await ensureNotificationSetup();
    if (!ok) return null;
    const projectId = resolveProjectId();
    if (!projectId) {
      console.warn("Forge push: no EAS projectId — set extra.eas.projectId in app.json");
    }
    const tokenRes = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );
    const token = tokenRes.data;
    if (!token) return null;

    const prev = await SecureStore.getItemAsync(TOKEN_KEY).catch(() => null);
    await SecureStore.setItemAsync(TOKEN_KEY, token).catch(() => undefined);

    if (token === prev) {
      // Still refresh lastSeen on server periodically
    }
    await apiFetch("/devices/push-token", {
      method: "POST",
      body: JSON.stringify({
        expoPushToken: token,
        platform: Platform.OS,
        deviceName: Constants.deviceName ?? Platform.OS,
      }),
    });
    return token;
  } catch (e) {
    console.warn("Forge push register failed", e);
    return null;
  }
}

export async function revokePushToken(): Promise<void> {
  if (Platform.OS === "web") return;
  let token: string | null = null;
  try {
    token = await SecureStore.getItemAsync(TOKEN_KEY);
  } catch {
    /* ignore */
  }
  if (!token) return;
  try {
    await apiFetch("/devices/push-token", {
      method: "DELETE",
      body: JSON.stringify({ expoPushToken: token }),
    });
  } catch {
    /* ignore */
  }
  try {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
  } catch {
    /* ignore */
  }
}
