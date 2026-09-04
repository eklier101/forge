import fs from "node:fs";
import path from "node:path";

const DATA_DIR = process.env.ML_FEEDBACK_DIR || path.join(process.cwd(), "data");
const FILE = path.join(DATA_DIR, "ml_feedback.jsonl");

export async function appendMlFeedback(row: Record<string, unknown>): Promise<void> {
  try {
    fs.mkdirSync(DATA_DIR, { recursive: true });
    fs.appendFileSync(FILE, `${JSON.stringify(row)}\n`, "utf8");
  } catch (e) {
    console.warn("ml_feedback append failed", e);
  }
}
