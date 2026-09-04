/** Open Food Facts client — barcode + text search → macros for Fuel draft. */

export type OffProduct = {
  code: string;
  name: string;
  calories: number;
  protein: number;
  carbs: number;
  fat: number;
  fiber: number;
  sugar: number;
  sodium: number;
  servingSize?: string;
};

function num(v: unknown): number {
  const n = Number(v);
  return Number.isFinite(n) ? n : 0;
}

function mapProduct(p: Record<string, unknown>, code?: string): OffProduct | null {
  const n = p.nutriments as Record<string, unknown> | undefined;
  if (!n) return null;
  const name =
    String(p.product_name || p.generic_name || p.brands || "Product").trim() || "Product";
  // Prefer per-serving when present; else per 100g
  const cal =
    num(n["energy-kcal_serving"]) ||
    num(n["energy-kcal_100g"]) ||
    num(n.energy_kcal) ||
    0;
  return {
    code: String(code || p.code || ""),
    name: name.slice(0, 120),
    calories: Math.round(cal),
    protein: Math.round(num(n.proteins_serving) || num(n.proteins_100g)),
    carbs: Math.round(num(n.carbohydrates_serving) || num(n.carbohydrates_100g)),
    fat: Math.round(num(n.fat_serving) || num(n.fat_100g)),
    fiber: Math.round(num(n.fiber_serving) || num(n.fiber_100g)),
    sugar: Math.round(num(n.sugars_serving) || num(n.sugars_100g)),
    sodium: Math.round((num(n.sodium_serving) || num(n.sodium_100g)) * 1000), // g → mg when OFF uses g
    servingSize: p.serving_size ? String(p.serving_size) : undefined,
  };
}

export async function fetchByBarcode(barcode: string): Promise<OffProduct | null> {
  const code = barcode.replace(/\D/g, "");
  if (code.length < 8) return null;
  const res = await fetch(
    `https://world.openfoodfacts.org/api/v2/product/${encodeURIComponent(code)}.json`,
    { headers: { "User-Agent": "ForgeWorkout/1.0 (local)" } },
  );
  if (!res.ok) return null;
  const data = (await res.json()) as { status?: number; product?: Record<string, unknown> };
  if (data.status !== 1 || !data.product) return null;
  return mapProduct(data.product, code);
}

export async function searchProducts(query: string, limit = 8): Promise<OffProduct[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const url = new URL("https://world.openfoodfacts.org/cgi/search.pl");
  url.searchParams.set("search_terms", q);
  url.searchParams.set("search_simple", "1");
  url.searchParams.set("action", "process");
  url.searchParams.set("json", "1");
  url.searchParams.set("page_size", String(limit));
  const res = await fetch(url.toString(), {
    headers: { "User-Agent": "ForgeWorkout/1.0 (local)" },
  });
  if (!res.ok) return [];
  const data = (await res.json()) as { products?: Record<string, unknown>[] };
  const out: OffProduct[] = [];
  for (const p of data.products ?? []) {
    const mapped = mapProduct(p);
    if (mapped && mapped.calories > 0) out.push(mapped);
  }
  return out;
}
