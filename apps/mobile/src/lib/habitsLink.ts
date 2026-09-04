import { Platform } from "react-native";
import { debugLog } from "./debugLog";
import { pingHabitsComplete } from "../../modules/forge-app-stakes";

/**
 * Ticks every Habits habit whose linked app is this source, for today.
 * Habits is the Loop fork at C:\Apps\Habits (package org.isoron.uhabits).
 */
export async function notifyHabitsComplete(source: "forge" | "bible" | "flowforge") {
  if (Platform.OS !== "android") return;
  try {
    const r = pingHabitsComplete(source);
    if (!r.ok) {
      void debugLog("habits", "check-in failed", { source, error: r.error ?? "unknown" });
      return;
    }
    void debugLog("habits", "check-in sent", { source });
  } catch (e) {
    void debugLog("habits", "check-in failed", { source, error: String(e) });
  }
}
