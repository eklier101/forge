import AsyncStorage from "@react-native-async-storage/async-storage";

export type UpdateChannel = "stable" | "early" | "developer";

const CHANNEL_KEY = "forge.update.channel";
const DEBUG_KEY = "forge.debugMode";
const WIFI_AUTO_KEY = "forge.update.wifiAutoDownload";

export const CHANNEL_LABELS: Record<UpdateChannel, string> = {
  stable: "Stable",
  early: "Early access",
  developer: "Developer",
};

export async function getUpdateChannel(): Promise<UpdateChannel> {
  const raw = await AsyncStorage.getItem(CHANNEL_KEY);
  if (raw === "early" || raw === "developer" || raw === "stable") return raw;
  return "stable";
}

export async function setUpdateChannel(channel: UpdateChannel): Promise<void> {
  await AsyncStorage.setItem(CHANNEL_KEY, channel);
}

export async function getDebugMode(): Promise<boolean> {
  return (await AsyncStorage.getItem(DEBUG_KEY)) === "1";
}

export async function setDebugMode(on: boolean): Promise<void> {
  await AsyncStorage.setItem(DEBUG_KEY, on ? "1" : "0");
  if (!on) {
    const ch = await getUpdateChannel();
    if (ch === "developer") await setUpdateChannel("early");
  }
}

/** Default on — auto-pull APK when on Wi‑Fi. */
export async function getWifiAutoDownload(): Promise<boolean> {
  const raw = await AsyncStorage.getItem(WIFI_AUTO_KEY);
  if (raw === null) return true;
  return raw === "1";
}

export async function setWifiAutoDownload(on: boolean): Promise<void> {
  await AsyncStorage.setItem(WIFI_AUTO_KEY, on ? "1" : "0");
}
