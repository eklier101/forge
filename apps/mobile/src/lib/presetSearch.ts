/**
 * Natural-language-ish matching for meal presets / recipes.
 * Tokenizes the query, expands light synonyms, and scores name/brand/aliases.
 */

const SYNONYMS: Record<string, string[]> = {
  jm: ["jersey", "mike", "mikes"],
  "jersey mike": ["jersey", "mike"],
  "jersey mikes": ["jersey", "mike"],
  sub: ["sandwich", "sub"],
  sandwich: ["sub", "sandwich"],
  oreos: ["oreo"],
  "double stuffed": ["double", "stuf"],
  "double stuff": ["double", "stuf"],
  "sun chips": ["sunchips"],
  sunchip: ["sunchips"],
  mcdonalds: ["mcdonald"],
  mcd: ["mcdonald"],
  wendys: ["wendy"],
  chickfila: ["chick", "fil"],
  "chick fil a": ["chick", "fil"],
  cfa: ["chick", "fil"],
  bk: ["burger", "king"],
  pizza: ["slice", "pizza"],
  fries: ["french", "fries"],
  nuggets: ["nugget"],
  cookie: ["oreo", "cookie"],
};

function normalize(s: string): string {
  return s
    .toLowerCase()
    .replace(/[#']/g, " ")
    .replace(/[^a-z0-9.+]+/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

function tokenize(query: string): string[] {
  const n = normalize(query);
  if (!n) return [];
  const tokens = new Set<string>();
  for (const part of n.split(" ")) {
    if (part.length >= 1) tokens.add(part);
  }
  // Expand multi-word synonym keys found as substrings
  for (const [key, extras] of Object.entries(SYNONYMS)) {
    if (n.includes(normalize(key))) {
      for (const e of extras) tokens.add(e);
    }
  }
  // Single-token synonyms
  for (const t of [...tokens]) {
    const extras = SYNONYMS[t];
    if (extras) for (const e of extras) tokens.add(e);
  }
  return [...tokens];
}

type Searchable = {
  name: string;
  brand?: string;
  servingLabel?: string;
  aliases?: string[];
  notes?: string;
};

function haystack(item: Searchable): string {
  return normalize(
    [item.brand, item.name, item.servingLabel, item.notes, ...(item.aliases ?? [])].filter(Boolean).join(" "),
  );
}

/** Higher is better; 0 = no match. */
export function scorePresetMatch(item: Searchable, query: string): number {
  const q = normalize(query);
  if (!q) return 1;
  const hay = haystack(item);
  if (!hay) return 0;

  // Exact / prefix boosts
  let score = 0;
  if (hay === q) score += 100;
  if (hay.includes(q)) score += 40;
  if (normalize(item.name).startsWith(q)) score += 25;
  if (item.brand && normalize(item.brand).includes(q)) score += 20;

  const tokens = tokenize(query);
  if (tokens.length === 0) return score || 1;

  let hits = 0;
  for (const t of tokens) {
    if (t.length === 1 && !/\d/.test(t)) continue;
    if (hay.includes(t)) {
      hits += 1;
      score += t.length >= 3 ? 8 : 4;
    }
  }
  // Require most tokens to hit for multi-word natural queries
  const significant = tokens.filter((t) => t.length > 1 || /\d/.test(t));
  if (significant.length >= 2 && hits < Math.ceil(significant.length * 0.6)) {
    return 0;
  }
  if (significant.length === 1 && hits === 0 && score === 0) return 0;
  return score;
}

export function filterPresetsByQuery<T extends Searchable>(items: T[], query: string, limit = 40): T[] {
  const q = query.trim();
  if (!q) return items.slice(0, limit);
  return items
    .map((item) => ({ item, score: scorePresetMatch(item, q) }))
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score || a.item.name.localeCompare(b.item.name))
    .slice(0, limit)
    .map((r) => r.item);
}
