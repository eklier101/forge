import { and, eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { syncEntities } from "../db/schema.js";
import { publishHaEvent } from "./homeAssistant.js";

export type NutritionMacros = {
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
};

export type NutritionPreset = NutritionMacros & {
  id: string;
  name: string;
  notes?: string;
};

export type NutritionRecipe = NutritionMacros & {
  id: string;
  name: string;
  servingsBase: number;
  servingUnit: "serving" | "g";
  ingredients?: string[];
  notes?: string;
};

export type NutritionMeal = NutritionMacros & {
  id: string;
  date: string;
  loggedAt: string;
  source: string;
  name: string;
  portion?: number;
  recipeId?: string;
  presetId?: string;
  notes?: string;
  aiRaw?: unknown;
};

export const DEFAULT_PRESETS: Omit<NutritionPreset, "id">[] = [
  { name: "Protein shake", calories: 200, protein: 30, carbs: 5, fat: 3 },
  { name: "Eggs (3)", calories: 210, protein: 18, carbs: 1, fat: 15 },
  { name: "Chicken + rice", calories: 450, protein: 40, carbs: 45, fat: 8 },
  { name: "Greek yogurt", calories: 150, protein: 20, carbs: 8, fat: 2 },
];

export async function upsertEntity(
  userId: string,
  id: string,
  entityType: string,
  payload: object,
) {
  const now = new Date();
  await db
    .insert(syncEntities)
    .values({
      id,
      userId,
      entityType,
      payload,
      updatedAt: now,
      deleted: false,
    })
    .onConflictDoUpdate({
      target: syncEntities.id,
      set: {
        payload,
        updatedAt: now,
        deleted: false,
        entityType,
        userId,
      },
    });
}

export async function softDeleteEntity(userId: string, id: string) {
  const now = new Date();
  await db
    .update(syncEntities)
    .set({ deleted: true, updatedAt: now })
    .where(and(eq(syncEntities.userId, userId), eq(syncEntities.id, id)));
}

export async function listEntities<T extends { id?: string }>(
  userId: string,
  entityType: string,
): Promise<(T & { id: string })[]> {
  const rows = await db
    .select()
    .from(syncEntities)
    .where(and(eq(syncEntities.userId, userId), eq(syncEntities.entityType, entityType)));
  return rows
    .filter((r) => !r.deleted)
    .map((r) => ({ id: r.id, ...(r.payload as object) }) as T & { id: string });
}

export function scaleRecipeMacros(
  recipe: NutritionMacros & { servingsBase: number },
  portion: number,
): NutritionMacros {
  const base = Math.max(0.01, recipe.servingsBase || 1);
  const scale = portion / base;
  return {
    calories: Math.round(recipe.calories * scale),
    protein: Math.round(recipe.protein * scale),
    carbs: Math.round(recipe.carbs * scale),
    fat: Math.round(recipe.fat * scale),
  };
}

export async function recomputeDayTotals(userId: string, date: string) {
  const meals = await listEntities<NutritionMeal>(userId, "nutrition_meal");
  const dayMeals = meals.filter((m) => m.date === date);
  const totals = dayMeals.reduce(
    (acc, m) => ({
      calories: acc.calories + (Number(m.calories) || 0),
      protein: acc.protein + (Number(m.protein) || 0),
      carbs: acc.carbs + (Number(m.carbs) || 0),
      fat: acc.fat + (Number(m.fat) || 0),
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 },
  );
  const payload = { date, ...totals };
  await upsertEntity(userId, `nutrition-${date}`, "nutrition", payload);
  const ha = await publishHaEvent("nutrition", payload);
  return { totals: payload, meals: dayMeals, homeAssistant: ha };
}

export async function ensureDefaultPresets(userId: string) {
  const existing = await listEntities(userId, "nutrition_preset");
  if (existing.length) return existing;
  const created: NutritionPreset[] = [];
  for (const p of DEFAULT_PRESETS) {
    const id = `preset-${crypto.randomUUID()}`;
    const payload = { id, ...p };
    await upsertEntity(userId, id, "nutrition_preset", payload);
    created.push(payload);
  }
  return created;
}
