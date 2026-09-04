import { AppState, Platform } from "react-native";
import * as Notifications from "expo-notifications";
import { getMeta, setMeta } from "../db/local";
import {
  cancelRestAlarm as cancelNativeRestAlarm,
  playRestAlarm as playNativeRestAlarm,
  scheduleRestAlarm as scheduleNativeRestAlarm,
  stopRestAlarm as stopNativeRestAlarm,
} from "../../modules/forge-app-stakes";

const LEASES_KEY = "notif_leases_v1";
/** Quiet sticky updates (timers / fasting progress) — no buzz. */
const CHANNEL_PROGRESS = "forge-progress";
/** Ongoing presence (workout / fast) — sticky, quiet. */
const CHANNEL_STICKY = "forge-sticky";
/** One-shot alerts (rest done) — buzz once. */
const CHANNEL_ALERT = "forge-alert";

export type NotifLease = {
  id: string;
  title: string;
  body: string;
  firedAt: number;
  stickyUntil: number;
  data?: Record<string, string>;
  /** When true, present on alert channel (rare). */
  alert?: boolean;
};

Notifications.setNotificationHandler({
  handleNotification: async (notification: Notifications.Notification) => {
    const alert = notification.request.content.data?.alert === true || notification.request.content.data?.alert === "1";
    return {
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: alert,
      shouldSetBadge: false,
    };
  },
});

async function readLeases(): Promise<NotifLease[]> {
  const raw = await getMeta(LEASES_KEY);
  if (!raw) return [];
  try {
    return JSON.parse(raw) as NotifLease[];
  } catch {
    return [];
  }
}

async function writeLeases(leases: NotifLease[]) {
  await setMeta(LEASES_KEY, JSON.stringify(leases));
}

export async function ensureNotificationSetup(): Promise<boolean> {
  if (Platform.OS === "web") return false;

  if (Platform.OS === "android") {
    await Notifications.setNotificationChannelAsync(CHANNEL_PROGRESS, {
      name: "Forge progress",
      importance: Notifications.AndroidImportance.LOW,
      vibrationPattern: [0],
      sound: undefined,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      bypassDnd: false,
      showBadge: false,
      enableVibrate: false,
    });
    await Notifications.setNotificationChannelAsync(CHANNEL_STICKY, {
      name: "Forge active",
      importance: Notifications.AndroidImportance.DEFAULT,
      vibrationPattern: [0],
      sound: undefined,
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      bypassDnd: false,
      showBadge: false,
      enableVibrate: false,
    });
    await Notifications.setNotificationChannelAsync(CHANNEL_ALERT, {
      name: "Forge alerts",
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 400, 200, 400],
      lockscreenVisibility: Notifications.AndroidNotificationVisibility.PUBLIC,
      enableVibrate: true,
    });
  }

  const current = await Notifications.getPermissionsAsync();
  let status = current.status;
  if (status !== "granted") {
    const req = await Notifications.requestPermissionsAsync();
    status = req.status;
  }
  return status === "granted";
}

async function presentSticky(lease: NotifLease, opts?: { quiet?: boolean }) {
  const quiet = opts?.quiet !== false && !lease.alert;
  await Notifications.scheduleNotificationAsync({
    identifier: lease.id,
    content: {
      title: lease.title,
      body: lease.body,
      data: {
        ...(lease.data ?? {}),
        leaseId: lease.id,
        stickyUntil: String(lease.stickyUntil),
        alert: lease.alert ? "1" : "0",
      },
      sticky: true,
      autoDismiss: false,
      sound: quiet ? false : true,
      ...(Platform.OS === "android"
        ? {
            channelId: quiet ? CHANNEL_STICKY : CHANNEL_ALERT,
            priority: quiet
              ? Notifications.AndroidNotificationPriority.DEFAULT
              : Notifications.AndroidNotificationPriority.HIGH,
          }
        : {}),
    },
    trigger: null,
  });
}

/** Quiet update path for countdown / elapsed — never buzzes. */
async function presentProgress(id: string, title: string, body: string, data?: Record<string, string>) {
  await Notifications.scheduleNotificationAsync({
    identifier: id,
    content: {
      title,
      body,
      data: { ...(data ?? {}), leaseId: id, alert: "0" },
      sticky: true,
      autoDismiss: false,
      sound: false,
      ...(Platform.OS === "android"
        ? {
            channelId: CHANNEL_PROGRESS,
            priority: Notifications.AndroidNotificationPriority.LOW,
          }
        : {}),
    },
    trigger: null,
  });
}

/** Start or refresh a sticky notification that reappears if dismissed. */
export async function startStickyNotification(input: {
  id: string;
  title: string;
  body: string;
  data?: Record<string, string>;
  stickyMs?: number;
  /** If true, vibrate/sound once on present (avoid for ongoing stickies). */
  alert?: boolean;
}) {
  if (Platform.OS === "web") return;
  const ok = await ensureNotificationSetup();
  if (!ok) return;

  const now = Date.now();
  const stickyMs = input.stickyMs ?? 24 * 60 * 60 * 1000;
  const existing = (await readLeases()).find((l) => l.id === input.id);
  const lease: NotifLease = {
    id: input.id,
    title: input.title,
    body: input.body,
    firedAt: existing?.firedAt ?? now,
    stickyUntil: now + stickyMs,
    data: input.data,
    alert: input.alert,
  };

  const leases = (await readLeases()).filter((l) => l.id !== lease.id && l.stickyUntil > now);
  leases.push(lease);
  await writeLeases(leases);
  await presentSticky(lease, { quiet: !input.alert });
}

export async function updateStickyNotification(
  id: string,
  patch: { title?: string; body?: string },
) {
  if (Platform.OS === "web") return;
  const leases = await readLeases();
  const idx = leases.findIndex((l) => l.id === id);
  if (idx < 0) return;
  const next = {
    ...leases[idx],
    title: patch.title ?? leases[idx].title,
    body: patch.body ?? leases[idx].body,
  };
  leases[idx] = next;
  await writeLeases(leases);
  // Progress updates stay silent (no buzz every tick).
  await presentProgress(next.id, next.title, next.body, next.data);
}

/** One-shot buzz alert — not sticky, not re-enforced by watchdog. */
export async function notifyOnce(input: {
  id: string;
  title: string;
  body: string;
  data?: Record<string, string>;
}) {
  if (Platform.OS === "web") return;
  const ok = await ensureNotificationSetup();
  if (!ok) return;
  // Drop any sticky lease on this id so watchdog won't revive it.
  const leases = (await readLeases()).filter((l) => l.id !== input.id);
  await writeLeases(leases);
  await Notifications.dismissNotificationAsync(input.id).catch(() => undefined);
  await Notifications.scheduleNotificationAsync({
    identifier: input.id,
    content: {
      title: input.title,
      body: input.body,
      data: { ...(input.data ?? {}), alert: "1" },
      sticky: false,
      autoDismiss: true,
      sound: true,
      ...(Platform.OS === "android"
        ? {
            channelId: CHANNEL_ALERT,
            priority: Notifications.AndroidNotificationPriority.HIGH,
          }
        : {}),
    },
    trigger: null,
  });
}

export async function stopStickyNotification(id: string) {
  if (Platform.OS === "web") return;
  const leases = (await readLeases()).filter((l) => l.id !== id);
  await writeLeases(leases);
  await Notifications.dismissNotificationAsync(id).catch(() => undefined);
  await Notifications.cancelScheduledNotificationAsync(id).catch(() => undefined);
}

export async function enforceStickyNotifications() {
  if (Platform.OS === "web") return;
  const now = Date.now();
  let leases = await readLeases();
  leases = leases.filter((l) => l.stickyUntil > now);
  await writeLeases(leases);
  if (!leases.length) return;

  const presented = await Notifications.getPresentedNotificationsAsync();
  const presentIds = new Set(
    presented.map((n: Notifications.Notification) => n.request.identifier).filter(Boolean) as string[],
  );

  for (const lease of leases) {
    if (!presentIds.has(lease.id)) {
      await presentSticky(lease, { quiet: true });
    }
  }
}

let watchdogStarted = false;

export function startStickyNotificationWatchdog() {
  if (watchdogStarted || Platform.OS === "web") return () => undefined;
  watchdogStarted = true;

  void ensureNotificationSetup().then(() => enforceStickyNotifications());

  const interval = setInterval(() => {
    void enforceStickyNotifications();
  }, 1500);

  const sub = AppState.addEventListener("change", (state) => {
    if (state === "active") void enforceStickyNotifications();
  });

  const resp = Notifications.addNotificationResponseReceivedListener(() => {
    void enforceStickyNotifications();
  });

  return () => {
    watchdogStarted = false;
    clearInterval(interval);
    sub.remove();
    resp.remove();
  };
}

export const NOTIF_IDS = {
  fasting: "forge-fasting-active",
  rest: "forge-rest-timer",
  workout: "forge-workout-active",
  hcAlert: "forge-hc-alert",
  integrationAlert: "forge-integration-alert",
} as const;

/** Sticky/scheduled reminders are native-only; the web build has no equivalent. */
export function remindersSupported(): boolean {
  return Platform.OS !== "web";
}

let restArmed = false;

/** Schedule native rest alarm (Android) or no-op on web. */
export async function armRestAlarm(seconds: number): Promise<void> {
  if (Platform.OS === "web") return;
  restArmed = true;
  scheduleNativeRestAlarm(Math.max(0, Math.floor(seconds * 1000)));
}

export async function disarmRestAlarm(): Promise<void> {
  if (Platform.OS === "web") return;
  restArmed = false;
  cancelNativeRestAlarm();
  stopNativeRestAlarm();
}

export async function fireRestAlarm(): Promise<void> {
  if (Platform.OS === "web") return;
  if (!restArmed) return;
  restArmed = false;
  playNativeRestAlarm();
}

export async function cancelPostWorkoutPhotoReminder(): Promise<void> {
  await stopStickyNotification("forge-post-workout-photo");
}
