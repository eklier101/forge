import { and, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { devicePushTokens } from "../db/schema.js";

export type PushPayload = {
  title: string;
  body: string;
  data?: Record<string, string>;
  /** Hint for clients to show a sticky local notification */
  stickyHint?: boolean;
};

/** Send Expo push messages to all active tokens for a user. */
export async function sendUserPush(userId: string, payload: PushPayload): Promise<{ sent: number }> {
  const rows = await db
    .select()
    .from(devicePushTokens)
    .where(and(eq(devicePushTokens.userId, userId), eq(devicePushTokens.revoked, false)));

  if (!rows.length) return { sent: 0 };

  const messages = rows.map((r) => ({
    to: r.expoPushToken,
    title: payload.title,
    body: payload.body,
    data: {
      ...(payload.data ?? {}),
      stickyHint: payload.stickyHint ? "1" : "0",
    },
    sound: "default" as const,
    priority: "high" as const,
    channelId: "forge-alert",
  }));

  try {
    const res = await fetch("https://exp.host/--/api/v2/push/send", {
      method: "POST",
      headers: {
        Accept: "application/json",
        "Content-Type": "application/json",
      },
      body: JSON.stringify(messages),
    });
    if (!res.ok) {
      console.warn("Expo push failed", res.status, await res.text().catch(() => ""));
      return { sent: 0 };
    }
    return { sent: messages.length };
  } catch (e) {
    console.warn("Expo push error", e);
    return { sent: 0 };
  }
}
