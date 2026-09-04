/** Jersey Mike's sub builder — base sandwich + bread + Mike's Way + condiments. */

export type MacroDelta = {
  calories?: number;
  protein?: number;
  carbs?: number;
  fat?: number;
  fiber?: number;
  sugar?: number;
  sodium?: number;
};

export type JmSize = "mini" | "regular";

export type JmBase = {
  id: string;
  number: string;
  name: string;
  aliases?: string[];
  /** Macros for Regular, white bread, no oil/vinegar/mayo (dry + veggies only). */
  regular: Required<Pick<MacroDelta, "calories" | "protein" | "carbs" | "fat">> & MacroDelta;
  /** Mini is ~55% of regular when not listed separately. */
  miniScale?: number;
};

export type JmBread = {
  id: string;
  label: string;
  /** Added on top of white baseline for Regular. */
  delta: MacroDelta;
};

export type JmCondiment = {
  id: string;
  label: string;
  /** Per Regular; mini uses ~0.55×. */
  delta: MacroDelta;
};

export const JM_BREADS: JmBread[] = [
  { id: "white", label: "White", delta: {} },
  { id: "wheat", label: "Wheat", delta: { calories: 10, carbs: 2, fiber: 2, sodium: 40 } },
  {
    id: "rosemary",
    label: "Rosemary Parmesan",
    delta: { calories: 30, carbs: 3, fat: 2.5, sodium: 80 },
  },
];

/** Oil, vinegar, oregano, salt — classic Mike's Way (not mayo). */
export const JM_MIKES_WAY: MacroDelta = {
  calories: 200,
  fat: 22,
  carbs: 2,
  sodium: 150,
};

export const JM_CONDIMENTS: JmCondiment[] = [
  { id: "mayo", label: "Mayo", delta: { calories: 90, fat: 10, sodium: 80 } },
  { id: "yellow_mustard", label: "Yellow mustard", delta: { calories: 5, carbs: 1, sodium: 55 } },
  {
    id: "pepper_relish",
    label: "Pepper relish",
    delta: { calories: 20, carbs: 4, sugar: 3, sodium: 90 },
  },
  { id: "oil", label: "Extra oil", delta: { calories: 120, fat: 14 } },
  { id: "vinegar", label: "Vinegar", delta: { calories: 5, carbs: 1 } },
];

export const JM_BASES: JmBase[] = [
  {
    id: "13",
    number: "13",
    name: "Original Italian",
    aliases: ["italian", "real deal", "#13"],
    regular: { calories: 680, protein: 46, carbs: 68, fat: 24, fiber: 3, sugar: 7, sodium: 2500 },
  },
  {
    id: "3",
    number: "3",
    name: "Ham & Provolone",
    aliases: ["ham"],
    regular: { calories: 560, protein: 42, carbs: 60, fat: 18, fiber: 3, sugar: 7, sodium: 2100 },
  },
  {
    id: "7",
    number: "7",
    name: "Turkey & Provolone",
    aliases: ["turkey"],
    regular: { calories: 580, protein: 48, carbs: 60, fat: 16, fiber: 3, sugar: 7, sodium: 2000 },
  },
  {
    id: "8",
    number: "8",
    name: "Club Super",
    aliases: ["club"],
    regular: { calories: 620, protein: 50, carbs: 62, fat: 20, fiber: 3, sugar: 7, sodium: 2200 },
  },
  {
    id: "9",
    number: "9",
    name: "Roast Beef & Provolone",
    aliases: ["roast beef"],
    regular: { calories: 600, protein: 48, carbs: 58, fat: 18, fiber: 3, sugar: 6, sodium: 2100 },
  },
  {
    id: "14",
    number: "14",
    name: "Chipotle Cheese Steak",
    aliases: ["chipotle", "cheesesteak", "steak"],
    regular: { calories: 720, protein: 52, carbs: 64, fat: 30, fiber: 3, sugar: 7, sodium: 1900 },
  },
  {
    id: "43",
    number: "43",
    name: "Chicken Philly",
    aliases: ["chicken philly"],
    regular: { calories: 680, protein: 50, carbs: 62, fat: 26, fiber: 3, sugar: 7, sodium: 1800 },
  },
  {
    id: "56",
    number: "56",
    name: "BLT",
    aliases: ["blt", "bacon"],
    regular: { calories: 620, protein: 28, carbs: 56, fat: 32, fiber: 3, sugar: 6, sodium: 1600 },
  },
];

export type JmBuild = {
  baseId: string;
  size: JmSize;
  breadId: string;
  mikesWay: boolean;
  condimentIds: string[];
};

/** Ethan’s usual — Regular #13 rosemary, Mike’s Way + mayo, yellow mustard, pepper relish. */
export const JM_DEFAULT_BUILD: JmBuild = {
  baseId: "13",
  size: "regular",
  breadId: "rosemary",
  mikesWay: true,
  condimentIds: ["mayo", "yellow_mustard", "pepper_relish"],
};

function scaleDelta(d: MacroDelta, factor: number): MacroDelta {
  const out: MacroDelta = {};
  for (const key of ["calories", "protein", "carbs", "fat", "fiber", "sugar", "sodium"] as const) {
    const v = d[key];
    if (typeof v === "number") out[key] = Math.round(v * factor);
  }
  return out;
}

function add(a: MacroDelta, b: MacroDelta): MacroDelta {
  const out: MacroDelta = { ...a };
  for (const key of ["calories", "protein", "carbs", "fat", "fiber", "sugar", "sodium"] as const) {
    const bv = b[key];
    if (typeof bv !== "number") continue;
    out[key] = Math.round((Number(out[key]) || 0) + bv);
  }
  return out;
}

export function resolveJmBuild(build: JmBuild) {
  const base = JM_BASES.find((b) => b.id === build.baseId) ?? JM_BASES[0]!;
  const bread = JM_BREADS.find((b) => b.id === build.breadId) ?? JM_BREADS[0]!;
  const sizeFactor = build.size === "mini" ? (base.miniScale ?? 0.55) : 1;

  let macros: MacroDelta = scaleDelta(base.regular, sizeFactor);
  macros = add(macros, scaleDelta(bread.delta, sizeFactor));
  if (build.mikesWay) macros = add(macros, scaleDelta(JM_MIKES_WAY, sizeFactor));
  for (const id of build.condimentIds) {
    const c = JM_CONDIMENTS.find((x) => x.id === id);
    if (c) macros = add(macros, scaleDelta(c.delta, sizeFactor));
  }

  const condLabels = build.condimentIds
    .map((id) => JM_CONDIMENTS.find((c) => c.id === id)?.label)
    .filter(Boolean) as string[];
  const parts = [
    `#${base.number} ${base.name}`,
    build.size === "mini" ? "Mini" : "Regular",
    bread.label,
    build.mikesWay ? "Mike's Way" : null,
    ...condLabels,
  ].filter(Boolean);

  return {
    name: `Jersey Mike's ${parts.join(" · ")}`,
    servingLabel: build.size === "mini" ? "mini" : "sub",
    calories: Math.round(Number(macros.calories) || 0),
    protein: Math.round(Number(macros.protein) || 0),
    carbs: Math.round(Number(macros.carbs) || 0),
    fat: Math.round(Number(macros.fat) || 0),
    fiber: Math.round(Number(macros.fiber) || 0),
    sugar: Math.round(Number(macros.sugar) || 0),
    sodium: Math.round(Number(macros.sodium) || 0),
  };
}
