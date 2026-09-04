import type { DayPlan, ExerciseLike, PreferenceLike } from "./planner.js";

type OllamaGenerate = {
  response?: string;
};

/**
 * Optional Ollama pass: reorders gym-day exercises toward favorites / focus muscles /
 * recovery and difficulty feedback. Falls back silently if AI is off or unreachable.
 */
export async function enhancePlan(
  plan: DayPlan[],
  prefs: PreferenceLike,
  catalog: ExerciseLike[],
): Promise<DayPlan[]> {
  const { getAppSettings } = await import("./settings.js");
  const settings = await getAppSettings();
  if (!settings.aiEnabled) return plan;

  const base = (settings.ollamaUrl ?? "http://127.0.0.1:11434").replace(/\/$/, "");
  // Resolve an installed model (404 = empty model list on Ollama host)
  let model = process.env.OLLAMA_MODEL || "llama3.2";
  try {
    const tags = await fetch(`${base}/api/tags`, { signal: AbortSignal.timeout(4000) });
    if (tags.ok) {
      const data = (await tags.json()) as { models?: { name?: string }[] };
      const names = (data.models ?? []).map((m) => m.name).filter(Boolean) as string[];
      if (!names.length) return plan;
      const pref = model.toLowerCase();
      model =
        names.find((n) => n.toLowerCase() === pref || n.toLowerCase().startsWith(`${pref}:`)) ??
        names.find((n) => /llama|mistral|qwen|phi|gemma/i.test(n)) ??
        names[0]!;
    }
  } catch {
    /* use default; generate may fail soft */
  }
  const favorites = new Set(
    Array.isArray(prefs?.favoriteExerciseIds)
      ? prefs!.favoriteExerciseIds.filter((v): v is string => typeof v === "string")
      : [],
  );
  const disliked = new Set(
    Array.isArray(prefs?.dislikedExerciseIds)
      ? prefs!.dislikedExerciseIds.filter((v): v is string => typeof v === "string")
      : [],
  );
  const focusMuscles = Array.isArray(prefs?.focusMuscleIds)
    ? (prefs!.focusMuscleIds as string[]).filter((v) => typeof v === "string")
    : [];
  const recovery = prefs?.muscleRecovery ?? {};
  const fatigued = Object.entries(recovery)
    .filter(([, pct]) => typeof pct === "number" && pct < 55)
    .map(([m]) => m);
  const difficultyHints = prefs?.lastDifficulties ?? {};

  try {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 25000);

    const summary = plan
      .filter((d) => d.kind === "gym")
      .map((d) => ({
        date: d.date,
        focus: d.focus,
        exercises: d.exercises.map((e) => e.exerciseId),
      }));

    const poolByFocus: Record<string, string[]> = {};
    for (const day of plan) {
      if (day.kind !== "gym") continue;
      if (poolByFocus[day.focus]) continue;
      poolByFocus[day.focus] = catalog
        .filter((e) => !disliked.has(e.id) && (e.location === "gym" || e.location === "both"))
        .filter((e) => !fatigued.includes(e.muscleGroup))
        .slice(0, 40)
        .map((e) => e.id);
    }

    const prompt = `You are a strength coach. Return ONLY JSON matching this schema:
{"days":[{"date":"YYYY-MM-DD","exerciseIds":["id",...],"rationale":"short"}]}
Rules:
- Keep the same dates. Each gym day: 4-6 exercise ids from that focus pool.
- Prefer favorites: ${[...favorites].slice(0, 20).join(", ") || "none"}.
- Prefer focus muscles: ${focusMuscles.join(", ") || "none"}.
- Athlete sex context: ${prefs?.sex === "female" ? "female" : prefs?.sex === "male" ? "male" : "unspecified"}.
- Avoid fatigued muscles (<55% recovered): ${fatigued.join(", ") || "none"}.
- Recent difficulty (bump load for too_easy, ease for too_hard/failed): ${JSON.stringify(difficultyHints)}.
Plan: ${JSON.stringify(summary)}
Pools: ${JSON.stringify(poolByFocus)}`;

    const res = await fetch(`${base}/api/generate`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        format: "json",
        options: { temperature: 0.4 },
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);
    if (!res.ok) return plan;

    const data = (await res.json()) as OllamaGenerate;
    const raw = data.response ?? "";
    const parsed = JSON.parse(raw) as {
      days?: { date: string; exerciseIds?: string[] }[];
    };
    if (!parsed.days?.length) return plan;

    const byId = new Map(catalog.map((e) => [e.id, e]));
    return plan.map((day) => {
      if (day.kind !== "gym") return day;
      const hit = parsed.days!.find((d) => d.date === day.date);
      if (!hit?.exerciseIds?.length) return day;
      const ids = hit.exerciseIds.filter((id) => byId.has(id) && !disliked.has(id)).slice(0, 6);
      if (ids.length < 3) return day;
      const rest = day.exercises[0]?.restSeconds ?? prefs?.restTimerSeconds ?? 90;
      const sets = day.exercises[0]?.sets ?? 4;
      const reps = day.exercises[0]?.reps ?? 8;
      return {
        ...day,
        exercises: ids.map((id) => {
          const ex = byId.get(id)!;
          const prev = day.exercises.find((e) => e.exerciseId === id);
          return {
            exerciseId: id,
            name: ex.name,
            sets,
            reps,
            restSeconds: rest,
            ...(prev?.suggestedWeight != null ? { suggestedWeight: prev.suggestedWeight } : {}),
          };
        }),
      };
    });
  } catch {
    return plan;
  }
}
