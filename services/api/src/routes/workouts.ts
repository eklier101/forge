import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../db/client.js";
import { exercises, preferences } from "../db/schema.js";
import { EQUIPMENT_OPTIONS } from "../db/seed.js";
import { publishHaEvent } from "../services/homeAssistant.js";
import {
  enhancePlan,
  generateWeekPlan,
  listSwapAlternatives,
  swapExercise,
  weekDates,
} from "../services/planner.js";
import { loadLastWeights, loadWeekPlan, saveDayPlan, saveWeekPlan } from "../services/planStore.js";

const prefsBody = z.object({
  gymDaysPerWeek: z.number().int().min(1).max(6).optional(),
  gymWeekdays: z.array(z.number().int().min(0).max(6)).optional(),
  splitId: z.string().optional(),
  homeWorkoutsEnabled: z.boolean().optional(),
  progressionFocus: z.enum(["weight", "reps", "balanced"]).optional(),
  units: z.enum(["lb", "kg"]).optional(),
  restTimerSeconds: z.number().int().min(15).max(600).optional(),
  favoriteExerciseIds: z.array(z.string()).optional(),
  dislikedExerciseIds: z.array(z.string()).optional(),
  ownedEquipment: z.array(z.string()).optional(),
  calorieTarget: z.number().int().optional(),
  proteinTarget: z.number().int().optional(),
});

const completeBody = z.object({
  sessionId: z.string(),
  kind: z.enum(["gym", "home"]),
  completedAt: z.string().datetime(),
  notes: z.string().optional(),
});

const nutritionBody = z.object({
  date: z.string(),
  calories: z.number(),
  protein: z.number().optional(),
  carbs: z.number().optional(),
  fat: z.number().optional(),
  notes: z.string().optional(),
});

const weightBody = z.object({
  weighedAt: z.string().datetime(),
  weight: z.number().positive(),
  units: z.enum(["lb", "kg"]).default("lb"),
});

const swapBody = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/),
  exerciseId: z.string().min(1),
  replacementId: z.string().min(1).optional(),
});

async function buildFreshPlan(userId: string, seed?: string) {
  const [prefs] = await db.select().from(preferences).where(eq(preferences.userId, userId));
  const catalog = await db.select().from(exercises);
  const lastWeights = await loadLastWeights(userId);
  const base = generateWeekPlan(prefs, catalog, { seed, lastWeights });
  return enhancePlan(base);
}

export async function workoutRoutes(app: FastifyInstance) {
  app.get("/exercises", { onRequest: [app.authenticate] }, async () => {
    const rows = await db.select().from(exercises);
    return { exercises: rows };
  });

  app.get("/preferences", { onRequest: [app.authenticate] }, async (request) => {
    const userId = (request.user as { sub: string }).sub;
    const [prefs] = await db.select().from(preferences).where(eq(preferences.userId, userId));
    return prefs;
  });

  app.patch("/preferences", { onRequest: [app.authenticate] }, async (request, reply) => {
    const userId = (request.user as { sub: string }).sub;
    const parsed = prefsBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid preferences", details: parsed.error.flatten() });
    }
    const [updated] = await db
      .update(preferences)
      .set(parsed.data)
      .where(eq(preferences.userId, userId))
      .returning();
    return updated;
  });

  app.get("/plan/week", { onRequest: [app.authenticate] }, async (request) => {
    const userId = (request.user as { sub: string }).sub;
    const dates = weekDates();
    const stored = await loadWeekPlan(userId, dates);
    const { getAppSettings } = await import("../services/settings.js");
    const settings = await getAppSettings();

    if (stored) {
      return { plan: stored, cached: true, aiEnabled: settings.aiEnabled };
    }

    const plan = await buildFreshPlan(userId);
    await saveWeekPlan(userId, plan);
    return { plan, cached: false, aiEnabled: settings.aiEnabled };
  });

  app.post("/plan/regenerate", { onRequest: [app.authenticate] }, async (request) => {
    const userId = (request.user as { sub: string }).sub;
    const seed = `regen-${Date.now()}`;
    const plan = await buildFreshPlan(userId, seed);
    await saveWeekPlan(userId, plan);
    const { getAppSettings } = await import("../services/settings.js");
    const settings = await getAppSettings();
    return { plan, cached: false, aiEnabled: settings.aiEnabled };
  });

  app.post("/plan/swap", { onRequest: [app.authenticate] }, async (request, reply) => {
    const userId = (request.user as { sub: string }).sub;
    const parsed = swapBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid swap payload", details: parsed.error.flatten() });
    }

    const dates = weekDates();
    let week = await loadWeekPlan(userId, dates);
    if (!week) {
      week = await buildFreshPlan(userId);
      await saveWeekPlan(userId, week);
    }

    const dayIdx = week.findIndex((d) => d.date === parsed.data.date);
    if (dayIdx < 0) {
      return reply.status(404).send({ error: "Day not in this week’s plan" });
    }

    const [prefs] = await db.select().from(preferences).where(eq(preferences.userId, userId));
    const catalog = await db.select().from(exercises);
    const lastWeights = await loadLastWeights(userId);
    const nextDay = swapExercise(
      week[dayIdx],
      parsed.data.exerciseId,
      prefs,
      catalog,
      lastWeights,
      parsed.data.replacementId,
    );
    if (!nextDay) {
      return reply.status(400).send({ error: "No alternate exercises available for that slot" });
    }

    week = [...week];
    week[dayIdx] = nextDay;
    await saveDayPlan(userId, nextDay);
    return { day: nextDay, plan: week };
  });

  app.get("/plan/alternatives", { onRequest: [app.authenticate] }, async (request, reply) => {
    const userId = (request.user as { sub: string }).sub;
    const q = request.query as { date?: string; exerciseId?: string };
    if (!q.date || !q.exerciseId) {
      return reply.status(400).send({ error: "date and exerciseId required" });
    }
    const dates = weekDates();
    let week = await loadWeekPlan(userId, dates);
    if (!week) {
      week = await buildFreshPlan(userId);
      await saveWeekPlan(userId, week);
    }
    const day = week.find((d) => d.date === q.date);
    if (!day) return reply.status(404).send({ error: "Day not found" });
    const [prefs] = await db.select().from(preferences).where(eq(preferences.userId, userId));
    const catalog = await db.select().from(exercises);
    const alts = listSwapAlternatives(day, q.exerciseId, prefs, catalog).slice(0, 12);
    return {
      alternatives: alts.map((a) => ({
        id: a.id,
        name: a.name,
        muscleGroup: a.muscleGroup,
        equipment: a.equipment,
      })),
    };
  });

  app.get("/splits", async () => {
    return {
      splits: [
        { id: "full_body_3", days: 3, label: "Full Body ×3" },
        { id: "upper_lower_4", days: 4, label: "Upper / Lower ×4" },
        { id: "ppl_3", days: 3, label: "Push / Pull / Legs ×3" },
        { id: "ppl_6", days: 6, label: "Push / Pull / Legs ×6" },
        { id: "bro_5", days: 5, label: "Bro Split ×5" },
      ],
    };
  });

  app.get("/equipment", async () => ({ equipment: EQUIPMENT_OPTIONS }));

  app.post("/events/workout-completed", { onRequest: [app.authenticate] }, async (request, reply) => {
    const parsed = completeBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid payload", details: parsed.error.flatten() });
    }
    const ha = await publishHaEvent("workout_completed", parsed.data);
    return { ok: true, homeAssistant: ha };
  });

  app.post("/events/nutrition", { onRequest: [app.authenticate] }, async (request, reply) => {
    const parsed = nutritionBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid payload", details: parsed.error.flatten() });
    }
    const ha = await publishHaEvent("nutrition", parsed.data);
    return { ok: true, homeAssistant: ha };
  });

  app.post("/events/weight", { onRequest: [app.authenticate] }, async (request, reply) => {
    const parsed = weightBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid payload", details: parsed.error.flatten() });
    }
    const ha = await publishHaEvent("weight", parsed.data);
    return { ok: true, homeAssistant: ha };
  });
}
