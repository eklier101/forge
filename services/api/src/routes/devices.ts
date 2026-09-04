import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../db/client.js";
import { devicePushTokens, integrationAlerts } from "../db/schema.js";
import { sendUserPush } from "../services/push.js";

const tokenBody = z.object({
  expoPushToken: z.string().min(8).max(255),
  platform: z.enum(["android", "ios", "web"]).default("android"),
  deviceName: z.string().max(120).optional(),
});

const clientAlertBody = z.object({
  provider: z.string().min(1).max(40).default("health_connect"),
  message: z.string().min(1).max(500),
  needsReauth: z.boolean().optional(),
  clear: z.boolean().optional(),
});

export async function deviceRoutes(app: FastifyInstance) {
  app.post("/devices/push-token", { onRequest: [app.authenticate] }, async (request, reply) => {
    const userId = (request.user as { sub: string }).sub;
    const parsed = tokenBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid token", details: parsed.error.flatten() });
    }
    const { expoPushToken, platform, deviceName } = parsed.data;
    const now = new Date();

    const existing = await db
      .select()
      .from(devicePushTokens)
      .where(eq(devicePushTokens.expoPushToken, expoPushToken));

    if (existing[0]) {
      await db
        .update(devicePushTokens)
        .set({
          userId,
          platform,
          deviceName: deviceName ?? existing[0].deviceName,
          lastSeenAt: now,
          revoked: false,
        })
        .where(eq(devicePushTokens.id, existing[0].id));
      return { ok: true, id: existing[0].id };
    }

    const [row] = await db
      .insert(devicePushTokens)
      .values({
        userId,
        expoPushToken,
        platform,
        deviceName: deviceName ?? null,
        createdAt: now,
        lastSeenAt: now,
        revoked: false,
      })
      .returning();
    return { ok: true, id: row.id };
  });

  app.delete("/devices/push-token", { onRequest: [app.authenticate] }, async (request, reply) => {
    const userId = (request.user as { sub: string }).sub;
    const body = request.body as { expoPushToken?: string };
    if (!body?.expoPushToken) {
      return reply.status(400).send({ error: "expoPushToken required" });
    }
    await db
      .update(devicePushTokens)
      .set({ revoked: true, lastSeenAt: new Date() })
      .where(
        and(eq(devicePushTokens.userId, userId), eq(devicePushTokens.expoPushToken, body.expoPushToken)),
      );
    return { ok: true };
  });

  app.get("/alerts/active", { onRequest: [app.authenticate] }, async (request) => {
    const userId = (request.user as { sub: string }).sub;
    const rows = await db
      .select()
      .from(integrationAlerts)
      .where(and(eq(integrationAlerts.userId, userId), eq(integrationAlerts.active, true)));
    return { alerts: rows };
  });

  app.post("/alerts/client", { onRequest: [app.authenticate] }, async (request, reply) => {
    const userId = (request.user as { sub: string }).sub;
    const parsed = clientAlertBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid alert", details: parsed.error.flatten() });
    }
    const { provider, message, needsReauth, clear } = parsed.data;
    const now = new Date();

    const existing = await db
      .select()
      .from(integrationAlerts)
      .where(and(eq(integrationAlerts.userId, userId), eq(integrationAlerts.provider, provider)));

    if (clear) {
      if (existing[0]) {
        await db
          .update(integrationAlerts)
          .set({ active: false, updatedAt: now, message: "cleared" })
          .where(eq(integrationAlerts.id, existing[0].id));
      }
      return { ok: true, cleared: true };
    }

    if (existing[0]) {
      await db
        .update(integrationAlerts)
        .set({
          active: true,
          message,
          needsReauth: needsReauth ?? false,
          severity: "warn",
          updatedAt: now,
        })
        .where(eq(integrationAlerts.id, existing[0].id));
    } else {
      await db.insert(integrationAlerts).values({
        userId,
        provider,
        message,
        needsReauth: needsReauth ?? false,
        severity: "warn",
        active: true,
        updatedAt: now,
      });
    }

    await sendUserPush(userId, {
      title: "Forge sync issue",
      body: message,
      data: { kind: "integration-alert", provider },
      stickyHint: true,
    });

    return { ok: true };
  });
}
