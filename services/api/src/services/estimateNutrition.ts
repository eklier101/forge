import { getAppSettings } from "./settings.js";

export type NutritionEstimate = {
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber?: number;
  sugar?: number;
  sodium?: number;
  confidence?: number;
  source: "ai" | "fallback";
  error?: string;
};

type OllamaGenerate = {
  response?: string;
};

type OllamaTags = {
  models?: { name?: string; model?: string }[];
};

function stripDataUrl(b64: string) {
  const i = b64.indexOf("base64,");
  return i >= 0 ? b64.slice(i + 7) : b64;
}

function parseEstimateJson(raw: string): Omit<NutritionEstimate, "source"> | null {
  try {
    const cleaned = raw.replace(/^```json\s*/i, "").replace(/```$/i, "").trim();
    const parsed = JSON.parse(cleaned) as Record<string, unknown>;
    const calories = Number(parsed.calories ?? 0);
    const protein = Number(parsed.protein ?? 0);
    const carbs = Number(parsed.carbs ?? 0);
    const fat = Number(parsed.fat ?? 0);
    const fiber = Number(parsed.fiber ?? 0);
    const sugar = Number(parsed.sugar ?? 0);
    const sodium = Number(parsed.sodium ?? 0);
    if (!Number.isFinite(calories) || calories < 0) return null;
    return {
      name: String(parsed.name ?? "Meal").slice(0, 120),
      calories: Math.round(calories),
      protein: Math.round(protein),
      carbs: Math.round(carbs),
      fat: Math.round(fat),
      fiber: Math.round(Number.isFinite(fiber) ? fiber : 0),
      sugar: Math.round(Number.isFinite(sugar) ? sugar : 0),
      sodium: Math.round(Number.isFinite(sodium) ? sodium : 0),
      confidence:
        parsed.confidence != null && Number.isFinite(Number(parsed.confidence))
          ? Math.min(1, Math.max(0, Number(parsed.confidence)))
          : undefined,
    };
  } catch {
    return null;
  }
}

async function listOllamaModels(base: string): Promise<string[]> {
  try {
    const res = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(5000) });
    if (!res.ok) return [];
    const data = (await res.json()) as OllamaTags;
    return (data.models ?? [])
      .map((m) => m.name || m.model || "")
      .filter(Boolean);
  } catch {
    return [];
  }
}

function pickModel(available: string[], preferred: string, vision: boolean): string | null {
  if (!available.length) return null;
  const pref = preferred.toLowerCase();
  const exact = available.find((n) => n.toLowerCase() === pref || n.toLowerCase().startsWith(`${pref}:`));
  if (exact) return exact;
  if (vision) {
    const v = available.find((n) => /llava|vision|bakllava|moondream|minicpm-v/i.test(n));
    if (v) return v;
  }
  const text = available.find((n) => /llama|mistral|qwen|phi|gemma|deepseek/i.test(n));
  return text ?? available[0] ?? null;
}

/**
 * Estimate macros from a food photo, nutrition label, or text description via Ollama.
 * Falls back with a soft error when AI is off or unreachable — client always edits before save.
 */
export async function estimateNutrition(input: {
  kind: "food" | "label" | "text";
  text?: string;
  imageBase64?: string;
  intent?: "meal" | "workout" | "recipe" | "auto";
}): Promise<NutritionEstimate> {
  const settings = await getAppSettings();
  if (!settings.aiEnabled) {
    return {
      name: input.kind === "label" ? "From label" : input.text?.slice(0, 80) || "Meal",
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      source: "fallback",
      error: "AI is off — enter macros manually",
    };
  }

  const base = (settings.ollamaUrl ?? "http://127.0.0.1:11434").replace(/\/$/, "");
  const hasImage = Boolean(input.imageBase64);
  const preferred = hasImage
    ? process.env.OLLAMA_VISION_MODEL || "llava"
    : process.env.OLLAMA_MODEL || "llama3.2";

  const available = await listOllamaModels(base);
  const model = pickModel(available, preferred, hasImage);
  if (!model) {
    return {
      name: input.kind === "label" ? "From label" : input.text?.slice(0, 80) || "Meal",
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      source: "fallback",
      error: `Ollama has no models — on the Ollama host run: ollama pull ${preferred}`,
    };
  }

  const kindHint =
    input.intent === "recipe"
      ? "This is a recipe card or cookbook page. Extract dish name and per-serving calories, protein, carbs, fat, fiber, sugar, sodium."
      : input.kind === "label"
        ? "This is a photo of a nutrition facts label. Read serving size and per-serving calories, protein, carbs, fat, fiber, sugar, sodium."
        : input.kind === "food"
          ? "This is a photo of a meal/plate. Estimate total calories and macros for everything visible including fiber, sugar, sodium when possible."
          : "Estimate nutrition for this food description including fiber, sugar, sodium when possible.";

  const prompt = `${kindHint}
Return ONLY JSON: {"name":"short name","calories":number,"protein":number,"carbs":number,"fat":number,"fiber":number,"sugar":number,"sodium":number,"confidence":0-1}
Units: kcal, grams for macros/fiber/sugar, milligrams for sodium. Be realistic. ${input.text ? `User notes: ${input.text}` : ""}`;

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 45000);
    const body: Record<string, unknown> = {
      model,
      prompt,
      stream: false,
      format: "json",
      options: { temperature: 0.2 },
    };
    if (hasImage && input.imageBase64) {
      body.images = [stripDataUrl(input.imageBase64)];
    }

    const res = await fetch(`${base}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) {
      const errText = await res.text().catch(() => "");
      const hint =
        res.status === 404
          ? ` model "${model}" missing — ollama pull ${model}`
          : errText.slice(0, 120);
      return {
        name: input.text?.slice(0, 80) || "Meal",
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
        source: "fallback",
        error: `Ollama HTTP ${res.status}${hint ? `:${hint}` : ""}`,
      };
    }

    const data = (await res.json()) as OllamaGenerate;
    const parsed = parseEstimateJson(data.response ?? "");
    if (!parsed) {
      return {
        name: input.text?.slice(0, 80) || "Meal",
        calories: 0,
        protein: 0,
        carbs: 0,
        fat: 0,
        source: "fallback",
        error: "Could not parse AI response",
      };
    }
    return { ...parsed, source: "ai" };
  } catch (e) {
    return {
      name: input.text?.slice(0, 80) || "Meal",
      calories: 0,
      protein: 0,
      carbs: 0,
      fat: 0,
      source: "fallback",
      error: e instanceof Error ? e.message : "Ollama unreachable",
    };
  }
}
