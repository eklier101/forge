/** Shared metabolic fasting stage definitions + helpers. */

export const METABOLIC_STAGES = [
  {
    id: "anabolic",
    label: "Anabolic Phase",
    short: "Anabolic",
    from: 0,
    to: 4,
    hint: "Digestion & glycogen storage",
  },
  {
    id: "catabolic",
    label: "Catabolic Phase",
    short: "Catabolic",
    from: 4,
    to: 12,
    hint: "Blood sugar drops, insulin stabilizes",
  },
  {
    id: "fat",
    label: "Fat Burning / Ketosis",
    short: "Fat burn",
    from: 12,
    to: 18,
    hint: "Ketone production",
  },
  {
    id: "auto",
    label: "Autophagy",
    short: "Autophagy",
    from: 18,
    to: 24,
    hint: "Cellular repair & cleanup",
  },
] as const;

export type MetabolicStage = (typeof METABOLIC_STAGES)[number];

export function stageForHours(elapsedHours: number): {
  index: number;
  stage: MetabolicStage;
  progress: number;
} {
  let index = 0;
  for (let i = 0; i < METABOLIC_STAGES.length; i++) {
    if (elapsedHours >= METABOLIC_STAGES[i].from) index = i;
  }
  const stage = METABOLIC_STAGES[index];
  const span = Math.max(0.01, stage.to - stage.from);
  const progress = Math.min(1, Math.max(0, (elapsedHours - stage.from) / span));
  return { index, stage, progress };
}
