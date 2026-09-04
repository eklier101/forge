import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dbPath = path.join(process.env.TEMP || "/tmp", "exercises-db.json");
const seedPath = path.join(__dirname, "../services/api/src/db/seed.ts");
const outPath = path.join(__dirname, "../services/api/src/db/exerciseMedia.generated.json");

const db = JSON.parse(fs.readFileSync(dbPath, "utf8"));
const seed = fs.readFileSync(seedPath, "utf8");
const ours = [...seed.matchAll(/\{ id: "([^"]+)", name: "([^"]+)"/g)].map((m) => ({
  id: m[1],
  name: m[2],
}));

function norm(s) {
  return s
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function score(a, b) {
  const aa = norm(a).split(" ").filter(Boolean);
  const bb = new Set(norm(b).split(" ").filter(Boolean));
  let hit = 0;
  for (const w of aa) if (bb.has(w)) hit++;
  return hit / Math.max(aa.length, 1);
}

const map = {};
for (const o of ours) {
  let best = null;
  let bestScore = 0;
  for (const e of db) {
    const s = score(o.name, e.name);
    if (s > bestScore) {
      bestScore = s;
      best = e;
    }
  }
  if (best && bestScore >= 0.45) {
    map[o.id] = {
      images: best.images || [],
      instructions: (best.instructions || []).slice(0, 5),
      sourceName: best.name,
    };
  } else {
    map[o.id] = {
      images: [],
      instructions: [
        `Set up for ${o.name} with controlled posture.`,
        "Move through a full range with a steady tempo.",
        "Squeeze the target muscles at the hard part of the rep.",
        "Return under control and repeat for the prescribed reps.",
      ],
      sourceName: null,
    };
  }
}

fs.writeFileSync(outPath, JSON.stringify(map, null, 2));
const matched = Object.values(map).filter((x) => x.images.length).length;
console.log(`matched images ${matched}/${ours.length} -> ${outPath}`);
