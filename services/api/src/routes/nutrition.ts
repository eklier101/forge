import { and, eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { z } from "zod";
import { db } from "../db/client.js";
import { preferences } from "../db/schema.js";
import { estimateNutrition } from "../services/estimateNutrition.js";
import {
  ensureDefaultPresets,
  listEntities,
  recomputeDayTotals,
  scaleRecipeMacros,
  softDeleteEntity,
  upsertEntity,
  type NutritionMeal,
  type NutritionPreset,
  type NutritionRecipe,
} from "../services/nutritionStore.js";

const macrosShape = {
  calories: z.number().nonnegative(),
  protein: z.number().nonnegative().default(0),
  carbs: z.number().nonnegative().default(0),
  fat: z.number().nonnegative().default(0),
};

const presetBody = z.object({
  name: z.string().min(1).max(120),
  ...macrosShape,
  notes: z.string().max(500).optional(),
});

const recipeBody = z.object({
  name: z.string().min(1).max(120),
  servingsBase: z.number().positive().default(1),
  servingUnit: z.enum(["serving", "g"]).default("serving"),
  ...macrosShape,
  ingredients: z.array(z.string()).optional(),
  notes: z.string().max(500).optional(),
});

const mealBody = z.object({
  date: z.string().regex(/^\d{4}-\d{2}-\d{2}$/).optional(),
  name: z.string().min(1).max(120),
  ...macrosShape,
  source: z
    .enum(["preset", "recipe", "photo", "label", "text", "manual"])
    .default("manual"),
  portion: z.number().positive().optional(),
  recipeId: z.string().optional(),
  presetId: z.string().optional(),
  notes: z.string().max(500).optional(),
  aiRaw: z.unknown().optional(),
});

const estimateBody = z.object({
  kind: z.enum(["food", "label", "text"]),
  text: z.string().max(2000).optional(),
  imageBase64: z.string().max(12_000_000).optional(),
});

function todayLocalIso() {
  const d = new Date();
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

export async function nutritionRoutes(app: FastifyInstance) {
  app.get("/nutrition/today", { onRequest: [app.authenticate] }, async (request) => {
    const userId = (request.user as { sub: string }).sub;
    const q = request.query as { date?: string };
    const date =
      q.date && /^\d{4}-\d{2}-\d{2}$/.test(q.date) ? q.date : todayLocalIso();

    const [prefs] = await db.select().from(preferences).where(eq(preferences.userId, userId));
    const meals = (await listEntities<NutritionMeal>(userId, "nutrition_meal"))
      .filter((m) => m.date === date)
      .sort((a, b) => String(b.loggedAt).localeCompare(String(a.loggedAt)));

    const totals = meals.reduce(
      (acc, m) => ({
        calories: acc.calories + (Number(m.calories) || 0),
        protein: acc.protein + (Number(m.protein) || 0),
        carbs: acc.carbs + (Number(m.carbs) || 0),
        fat: acc.fat + (Number(m.fat) || 0),
      }),
      { calories: 0, protein: 0, carbs: 0, fat: 0 },
    );

    return {
      date,
      meals,
      totals,
      targets: {
        calories: prefs?.calorieTarget ?? 2200,
        protein: prefs?.proteinTarget ?? 150,
        carbs: (prefs as { carbTarget?: number | null })?.carbTarget ?? 250,
        fat: (prefs as { fatTarget?: number | null })?.fatTarget ?? 70,
      },
    };
  });

  app.post("/nutrition/meals", { onRequest: [app.authenticate] }, async (request, reply) => {
    const userId = (request.user as { sub: string }).sub;
    const parsed = mealBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid meal", details: parsed.error.flatten() });
    }

    let macros = {
      calories: parsed.data.calories,
      protein: parsed.data.protein,
      carbs: parsed.data.carbs,
      fat: parsed.data.fat,
    };
    let name = parsed.data.name;
    let portion = parsed.data.portion;

    if (parsed.data.recipeId) {
      const recipes = await listEntities<NutritionRecipe>(userId, "nutrition_recipe");
      const recipe = recipes.find((r) => r.id === parsed.data.recipeId);
      if (!recipe) return reply.status(404).send({ error: "Recipe not found" });
      const p = portion ?? recipe.servingsBase;
      portion = p;
      macros = scaleRecipeMacros(recipe, p);
      if (!name || name === recipe.name) name = recipe.name;
    }

    const date = parsed.data.date ?? todayLocalIso();
    const id = `meal-${crypto.randomUUID()}`;
    const meal: NutritionMeal = {
      id,
      date,
      loggedAt: new Date().toISOString(),
      source: parsed.data.source,
      name,
      ...macros,
      portion,
      recipeId: parsed.data.recipeId,
      presetId: parsed.data.presetId,
      notes: parsed.data.notes,
      aiRaw: parsed.data.aiRaw,
    };
    await upsertEntity(userId, id, "nutrition_meal", meal);
    const day = await recomputeDayTotals(userId, date);
    return { meal, totals: day.totals, homeAssistant: day.homeAssistant };
  });

  app.delete("/nutrition/meals/:id", { onRequest: [app.authenticate] }, async (request, reply) => {
    const userId = (request.user as { sub: string }).sub;
    const { id } = request.params as { id: string };
    const [row] = await db
      .select()
      .from((await import("../db/schema.js")).syncEntities)
      .where(and(eq((await import("../db/schema.js")).syncEntities.userId, userId), eq((await import("../db/schema.js")).syncEntities.id, id)));
    if (!row || row.deleted) return reply.status(404).send({ error: "Meal not found" });
    const prev = row.payload as NutritionMeal;
    await softDeleteEntity(userId, id);
    const day = await recomputeDayTotals(userId, prev.date);
    return { ok: true, totals: day.totals, homeAssistant: day.homeAssistant };
  });

  app.get("/nutrition/presets", { onRequest: [app.authenticate] }, async (request) => {
    const userId = (request.user as { sub: string }).sub;
    const presets = await ensureDefaultPresets(userId);
    return { presets };
  });

  app.post("/nutrition/presets", { onRequest: [app.authenticate] }, async (request, reply) => {
    const userId = (request.user as { sub: string }).sub;
    const parsed = presetBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid preset", details: parsed.error.flatten() });
    }
    const id = `preset-${crypto.randomUUID()}`;
    const payload: NutritionPreset = { id, ...parsed.data };
    await upsertEntity(userId, id, "nutrition_preset", payload);
    return { preset: payload };
  });

  app.patch("/nutrition/presets/:id", { onRequest: [app.authenticate] }, async (request, reply) => {
    const userId = (request.user as { sub: string }).sub;
    const { id } = request.params as { id: string };
    const parsed = presetBody.partial().safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid preset", details: parsed.error.flatten() });
    }
    const presets = await listEntities<NutritionPreset>(userId, "nutrition_preset");
    const prev = presets.find((p) => p.id === id);
    if (!prev) return reply.status(404).send({ error: "Preset not found" });
    const payload = { ...prev, ...parsed.data, id };
    await upsertEntity(userId, id, "nutrition_preset", payload);
    return { preset: payload };
  });

  app.delete("/nutrition/presets/:id", { onRequest: [app.authenticate] }, async (request, reply) => {
    const userId = (request.user as { sub: string }).sub;
    const { id } = request.params as { id: string };
    await softDeleteEntity(userId, id);
    return { ok: true };
  });

  app.get("/nutrition/recipes", { onRequest: [app.authenticate] }, async (request) => {
    const userId = (request.user as { sub: string }).sub;
    const recipes = await listEntities<NutritionRecipe>(userId, "nutrition_recipe");
    return { recipes };
  });

  app.post("/nutrition/recipes", { onRequest: [app.authenticate] }, async (request, reply) => {
    const userId = (request.user as { sub: string }).sub;
    const parsed = recipeBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid recipe", details: parsed.error.flatten() });
    }
    const id = `recipe-${crypto.randomUUID()}`;
    const payload: NutritionRecipe = { id, ...parsed.data };
    await upsertEntity(userId, id, "nutrition_recipe", payload);
    return { recipe: payload };
  });

  app.patch("/nutrition/recipes/:id", { onRequest: [app.authenticate] }, async (request, reply) => {
    const userId = (request.user as { sub: string }).sub;
    const { id } = request.params as { id: string };
    const parsed = recipeBody.partial().safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid recipe", details: parsed.error.flatten() });
    }
    const recipes = await listEntities<NutritionRecipe>(userId, "nutrition_recipe");
    const prev = recipes.find((r) => r.id === id);
    if (!prev) return reply.status(404).send({ error: "Recipe not found" });
    const payload = { ...prev, ...parsed.data, id };
    await upsertEntity(userId, id, "nutrition_recipe", payload);
    return { recipe: payload };
  });

  app.delete("/nutrition/recipes/:id", { onRequest: [app.authenticate] }, async (request, reply) => {
    const userId = (request.user as { sub: string }).sub;
    const { id } = request.params as { id: string };
    await softDeleteEntity(userId, id);
    return { ok: true };
  });

  app.post("/nutrition/estimate", { onRequest: [app.authenticate] }, async (request, reply) => {
    const parsed = estimateBody.safeParse(request.body);
    if (!parsed.success) {
      return reply.status(400).send({ error: "Invalid estimate request", details: parsed.error.flatten() });
    }
    if (parsed.data.kind !== "text" && !parsed.data.imageBase64 && !parsed.data.text) {
      return reply.status(400).send({ error: "Provide an image or text" });
    }
    const estimate = await estimateNutrition(parsed.data);
    return { estimate };
  });
}
