import * as SecureStore from "expo-secure-store";
import { Platform } from "react-native";
import AsyncStorage from "@react-native-async-storage/async-storage";

const TOKEN_KEY = "forge_token";
const API_URL_KEY = "forge_api_url";
const USER_KEY = "forge_user";
/** Admin multi-account slots (tokens stay on device in SecureStore / web storage). */
const SAVED_ACCOUNTS_KEY = "forge_saved_accounts";

type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribeSession(listener: Listener) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

function notifySession() {
  for (const listener of listeners) {
    try {
      listener();
    } catch {
      /* ignore listener errors */
    }
  }
}

async function setItem(key: string, value: string) {
  if (Platform.OS === "web") {
    await AsyncStorage.setItem(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value);
}

async function getItem(key: string) {
  if (Platform.OS === "web") {
    return AsyncStorage.getItem(key);
  }
  return SecureStore.getItemAsync(key);
}

async function deleteItem(key: string) {
  if (Platform.OS === "web") {
    await AsyncStorage.removeItem(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

export type SessionUser = {
  id: string;
  displayName: string;
  username?: string;
  role?: string;
};

export type SavedAccount = {
  token: string;
  apiUrl: string;
  user: SessionUser;
  savedAt: string;
};

export async function saveSession(token: string, apiUrl: string, user: SessionUser) {
  const cleanUrl = apiUrl.replace(/\/$/, "");
  await setItem(TOKEN_KEY, token);
  await setItem(API_URL_KEY, cleanUrl);
  await setItem(USER_KEY, JSON.stringify(user));
  if (user.role === "admin" || user.username) {
    await upsertSavedAccount({ token, apiUrl: cleanUrl, user, savedAt: new Date().toISOString() });
  }
  notifySession();
}

export async function listSavedAccounts(): Promise<SavedAccount[]> {
  try {
    const raw = await getItem(SAVED_ACCOUNTS_KEY);
    if (!raw) return [];
    const list = JSON.parse(raw) as SavedAccount[];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
}

async function upsertSavedAccount(account: SavedAccount) {
  const list = await listSavedAccounts();
  const next = [account, ...list.filter((a) => a.user.id !== account.user.id)].slice(0, 8);
  await setItem(SAVED_ACCOUNTS_KEY, JSON.stringify(next));
}

export async function removeSavedAccount(userId: string) {
  const list = await listSavedAccounts();
  await setItem(SAVED_ACCOUNTS_KEY, JSON.stringify(list.filter((a) => a.user.id !== userId)));
}

/** Swap active session to a previously saved account (admin account switcher). */
export async function switchToSavedAccount(userId: string): Promise<SavedAccount | null> {
  const list = await listSavedAccounts();
  const hit = list.find((a) => a.user.id === userId);
  if (!hit) return null;
  await setItem(TOKEN_KEY, hit.token);
  await setItem(API_URL_KEY, hit.apiUrl);
  await setItem(USER_KEY, JSON.stringify(hit.user));
  notifySession();
  return hit;
}

export async function clearSession() {
  try {
    const { revokePushToken } = await import("./pushRegister");
    await revokePushToken();
  } catch {
    /* ignore */
  }
  await deleteItem(TOKEN_KEY);
  await deleteItem(API_URL_KEY);
  await deleteItem(USER_KEY);
  const { setPairedFlag } = await import("./authFlag");
  setPairedFlag(false);
  notifySession();
}

export async function getToken() {
  return getItem(TOKEN_KEY);
}

export async function getApiUrl() {
  return getItem(API_URL_KEY);
}

export async function getUser(): Promise<SessionUser | null> {
  const raw = await getItem(USER_KEY);
  if (!raw) return null;
  try {
    return JSON.parse(raw) as SessionUser;
  } catch {
    return null;
  }
}
