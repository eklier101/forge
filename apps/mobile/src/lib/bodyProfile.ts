import type { ImageSourcePropType } from "react-native";

/** Physique options for current body / goal selection. */
export type BodyTypeOption = {
  id: string;
  label: string;
  blurb: string;
  tone: string;
  image: ImageSourcePropType;
};

export const BODY_TYPE_OPTIONS: BodyTypeOption[] = [
  {
    id: "slim",
    label: "Slim",
    blurb: "Lean frame, lighter build",
    tone: "#7FA8C9",
    image: require("../../assets/body-types/slim.png"),
  },
  {
    id: "average",
    label: "Average",
    blurb: "Balanced everyday build",
    tone: "#8FA399",
    image: require("../../assets/body-types/average.png"),
  },
  {
    id: "soft",
    label: "Soft",
    blurb: "Some cushion, less definition",
    tone: "#C4A882",
    image: require("../../assets/body-types/soft.png"),
  },
  {
    id: "athletic",
    label: "Athletic",
    blurb: "Fit, visible muscle tone",
    tone: "#5AD1C4",
    image: require("../../assets/body-types/athletic.png"),
  },
  {
    id: "muscular",
    label: "Muscular",
    blurb: "Heavier muscle mass",
    tone: "#C4F542",
    image: require("../../assets/body-types/muscular.png"),
  },
];

export function bodyTypeOption(id: string | null | undefined): BodyTypeOption | undefined {
  return BODY_TYPE_OPTIONS.find((b) => b.id === id);
}

export function bodyTypeLabel(id: string | null | undefined): string {
  return bodyTypeOption(id)?.label ?? "—";
}

/** BMI from kg and height cm. */
export function calcBmi(weightKg: number, heightCm: number): number | null {
  if (!weightKg || !heightCm || heightCm < 100) return null;
  const m = heightCm / 100;
  return Math.round((weightKg / (m * m)) * 10) / 10;
}

export function bmiCategory(bmi: number): string {
  if (bmi < 18.5) return "Underweight";
  if (bmi < 25) return "Healthy range";
  if (bmi < 30) return "Overweight";
  return "Obese range";
}

export function lbToKg(lb: number) {
  return lb / 2.20462;
}

export function kgToLb(kg: number) {
  return kg * 2.20462;
}
