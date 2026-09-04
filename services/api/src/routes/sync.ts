import { and, eq, gt } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../db/client.js";
import { syncEntities } from "../db/schema.js";

const pushBody = z.object({
  entities: z.array(
    z.object({
      id: z.string().min(1),
      entityType: z.string().min(1),
      payload: z.unknown(),
      updatedAt: z.string().datetime(),
      deleted: z.boolean().optional().default(false),
    }),
  ),
});

export async function syncRoutes(app: FastifyInstance) {
  app.get("/sync", { onRequest: [app.authenticate] }, async (request) => {
    const userId = (request.user as { sub: string }).sub;
    const since = (request.query as { since?: string }).since;
    const sinceDate = since ? new Date(since) : new Date(0);

    const rows = await db
      .select()
      .from(syncEntities)
      .where(and(eq(syncEntities.userId, userId), gt(syncEntities.updatedAt, sinceDate)));

    return {
      serverTime: new Date().toISOString(),
      entities: rows.map((r) => ({
        id: r.id,
        entityType: r.entityType,
        payload: r.payload,
        updatedAt: r.updatedAt.toISOString(),
        deleted: r.deleted,
      })),
    };
  });

  app.post("/sync", { onRequest: [app.authenticate] }, async (request, reply) => {
    const userId = (request.user as { sub: string }).sub;
    const parsed = pushBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid sync payload", details: parsed.error.flatten() });
    }

    let applied = 0;
    for (const entity of parsed.data.entities) {
      const updatedAt = new Date(entity.updatedAt);
      const existing = await db.query.syncEntities.findFirst({
        where: eq(syncEntities.id, entity.id),
      });

      if (existing && existing.updatedAt >= updatedAt) {
        continue;
      }

      await db
        .insert(syncEntities)
        .values({
          id: entity.id,
          userId,
          entityType: entity.entityType,
          payload: entity.payload as object,
          updatedAt,
          deleted: entity.deleted ?? false,
        })
        .onConflictDoUpdate({
          target: syncEntities.id,
          set: {
            payload: entity.payload as object,
            updatedAt,
            deleted: entity.deleted ?? false,
            entityType: entity.entityType,
          },
        });
      applied += 1;
    }

    return { applied, serverTime: new Date().toISOString() };
  });
}
