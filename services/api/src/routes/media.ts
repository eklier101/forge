import type { FastifyInstance } from "fastify";
import { and, eq } from "drizzle-orm";
import { z } from "zod";
import { db } from "../db/client.js";
import { syncEntities } from "../db/schema.js";

const uploadBody = z.object({
  imageBase64: z.string().min(20).max(8_000_000),
  note: z.string().max(200).optional(),
  weighedAt: z.string().optional(),
  weight: z.number().optional(),
  units: z.enum(["lb", "kg"]).optional(),
});

type ProgressPhoto = {
  id: string;
  createdAt: string;
  note?: string;
  weighedAt?: string;
  weight?: number;
  units?: string;
  /** data URL or raw base64 jpeg/png */
  imageBase64: string;
};

export async function mediaRoutes(app: FastifyInstance) {
  app.get("/media/progress-photos", { onRequest: [app.authenticate] }, async (request) => {
    const userId = (request.user as { sub: string }).sub;
    const rows = await db
      .select()
      .from(syncEntities)
      .where(and(eq(syncEntities.userId, userId), eq(syncEntities.entityType, "progress_photo")));
    const photos = rows
      .filter((r) => !r.deleted)
      .map((r) => {
        const p = r.payload as ProgressPhoto;
        return {
          id: r.id,
          createdAt: p.createdAt ?? r.updatedAt.toISOString(),
          note: p.note,
          weighedAt: p.weighedAt,
          weight: p.weight,
          units: p.units,
          // Keep list light — thumb only first chars flag; full on detail
          hasImage: Boolean(p.imageBase64),
        };
      })
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
    return { photos };
  });

  app.get("/media/progress-photos/:id", { onRequest: [app.authenticate] }, async (request, reply) => {
    const userId = (request.user as { sub: string }).sub;
    const { id } = request.params as { id: string };
    const [row] = await db
      .select()
      .from(syncEntities)
      .where(and(eq(syncEntities.id, id), eq(syncEntities.userId, userId)));
    if (!row || row.deleted || row.entityType !== "progress_photo") {
      return reply.status(404).send({ error: "Not found" });
    }
    return { photo: row.payload as ProgressPhoto };
  });

  app.post("/media/progress-photos", { onRequest: [app.authenticate] }, async (request, reply) => {
    const parsed = uploadBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid payload", details: parsed.error.flatten() });
    }
    const userId = (request.user as { sub: string }).sub;
    const id = `progress-${userId}-${Date.now()}`;
    const createdAt = new Date().toISOString();
    let imageBase64 = parsed.data.imageBase64;
    if (!imageBase64.startsWith("data:")) {
      imageBase64 = `data:image/jpeg;base64,${imageBase64}`;
    }
    const payload: ProgressPhoto = {
      id,
      createdAt,
      note: parsed.data.note,
      weighedAt: parsed.data.weighedAt,
      weight: parsed.data.weight,
      units: parsed.data.units,
      imageBase64,
    };
    await db.insert(syncEntities).values({
      id,
      userId,
      entityType: "progress_photo",
      payload,
      updatedAt: new Date(),
      deleted: false,
    });
    return { photo: { id, createdAt, note: payload.note, hasImage: true } };
  });

  app.delete("/media/progress-photos/:id", { onRequest: [app.authenticate] }, async (request, reply) => {
    const userId = (request.user as { sub: string }).sub;
    const { id } = request.params as { id: string };
    const [row] = await db
      .select()
      .from(syncEntities)
      .where(and(eq(syncEntities.id, id), eq(syncEntities.userId, userId)));
    if (!row) return reply.status(404).send({ error: "Not found" });
    await db
      .update(syncEntities)
      .set({ deleted: true, updatedAt: new Date() })
      .where(eq(syncEntities.id, id));
    return { ok: true };
  });
}
