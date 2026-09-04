import bcrypt from "bcryptjs";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../db/client.js";
import { users } from "../db/schema.js";

const strongPassword = z
  .string()
  .min(8)
  .max(128)
  .regex(/[A-Z]/, "Password needs an uppercase letter")
  .regex(/[0-9]/, "Password needs a number")
  .regex(/[^A-Za-z0-9]/, "Password needs a symbol");

const changePasswordBody = z.object({
  currentPassword: z.string().min(1).max(128),
  newPassword: strongPassword,
});

/** Account self-service routes (password change). */
export async function accountRoutes(app: FastifyInstance) {
  app.post("/auth/change-password", { onRequest: [app.authenticate] }, async (request, reply) => {
    const parsed = changePasswordBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid password change", details: parsed.error.flatten() });
    }
    const userId = (request.user as { sub: string }).sub;
    const [user] = await db.select().from(users).where(eq(users.id, userId));
    if (!user) return reply.status(404).send({ error: "User not found" });

    const ok = await bcrypt.compare(parsed.data.currentPassword, user.passwordHash);
    if (!ok) return reply.status(401).send({ error: "Current password is wrong" });

    if (parsed.data.currentPassword === parsed.data.newPassword) {
      return reply.status(400).send({ error: "New password must be different" });
    }

    const passwordHash = await bcrypt.hash(parsed.data.newPassword, 10);
    await db.update(users).set({ passwordHash }).where(eq(users.id, userId));
    return { ok: true };
  });
}
