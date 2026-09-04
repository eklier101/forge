import fs from "fs";
import path from "path";
import readline from "readline";

const transcript =
  "C:/Users/ethan/.cursor/projects/c-Android-Studio/agent-transcripts/153919a5-4625-471a-815c-1ab33394c1e1/153919a5-4625-471a-815c-1ab33394c1e1.jsonl";
const root = path.resolve("C:/Apps/Forge");
const reps = [];

const rl = readline.createInterface({
  input: fs.createReadStream(transcript, { encoding: "utf8" }),
  crlfDelay: Infinity,
});

rl.on("line", (line) => {
  if (!line.includes('"name":"StrReplace"')) return;
  let obj;
  try {
    obj = JSON.parse(line);
  } catch {
    return;
  }
  for (const part of obj?.message?.content ?? []) {
    if (part?.name !== "StrReplace" || !part?.input?.path) continue;
    const filePath = path.resolve(part.input.path);
    if (!filePath.toLowerCase().startsWith(root.toLowerCase() + path.sep)) continue;
    reps.push({
      path: filePath,
      oldStr: part.input.old_string,
      newStr: part.input.new_string,
    });
  }
});

rl.on("close", () => {
  console.log(`Found ${reps.length} StrReplace ops under ${root}`);
  let applied = 0;
  let skipped = 0;
  for (const r of reps) {
    if (!fs.existsSync(r.path)) {
      skipped++;
      continue;
    }
    const txt = fs.readFileSync(r.path, "utf8");
    if (!txt.includes(r.oldStr)) {
      skipped++;
      continue;
    }
    fs.writeFileSync(r.path, txt.replace(r.oldStr, r.newStr), "utf8");
    applied++;
  }
  console.log(`Applied ${applied}, skipped ${skipped}`);
});
