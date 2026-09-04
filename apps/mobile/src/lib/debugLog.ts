/** Ring-buffer debug log for when Developer debug mode is on. */

import AsyncStorage from "@react-native-async-storage/async-storage";
import { getDebugMode } from "./updateChannel";

const KEY = "forge.debugLog";
const MAX = 120;

export type DebugLogEntry = {
  at: string;
  tag: string;
  message: string;
};

let memory: DebugLogEntry[] = [];
const listeners = new Set<() => void>();

function notify() {
  for (const cb of [...listeners]) {
    try {
      cb();
    } catch {
      /* ignore */
    }
  }
}

export function subscribeDebugLog(cb: () => void): () => void {
  listeners.add(cb);
  return () => {
    listeners.delete(cb);
  };
}

export function getDebugLog(): DebugLogEntry[] {
  return memory.slice();
}

export async function loadDebugLog(): Promise<DebugLogEntry[]> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) memory = JSON.parse(raw) as DebugLogEntry[];
  } catch {
    memory = [];
  }
  return memory.slice();
}

export async function clearDebugLog(): Promise<void> {
  memory = [];
  await AsyncStorage.removeItem(KEY);
  notify();
}

export async function debugLog(tag: string, message: string, data?: unknown): Promise<void> {
  const on = await getDebugMode();
  if (!on) return;
  const line =
    data === undefined
      ? message
      : `${message} ${typeof data === "string" ? data : JSON.stringify(data)}`;
  const entry: DebugLogEntry = {
    at: new Date().toISOString(),
    tag,
    message: line.slice(0, 500),
  };
  memory = [entry, ...memory].slice(0, MAX);
  notify();
  try {
    await AsyncStorage.setItem(KEY, JSON.stringify(memory));
  } catch {
    /* quota */
  }
  if (__DEV__) {
    // eslint-disable-next-line no-console
    console.log(`[Forge/${tag}]`, line);
  }
}
