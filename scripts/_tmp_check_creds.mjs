import { createDecipheriv, createHash } from "node:crypto";
import { createRequire } from "node:module";
const require = createRequire("/app/package.json");
const postgres = require("postgres");

const sql = postgres(process.env.DATABASE_URL);
const secret = process.env.CREDENTIALS_SECRET || process.env.JWT_SECRET || "dev-only-change-me";
const key = createHash("sha256").update(secret).digest();

function decrypt(stored) {
  const PREFIX = "enc:v1:";
  const rest = stored.slice(PREFIX.length);
  const [ivB64, tagB64, dataB64] = rest.split(":");
  const d = createDecipheriv("aes-256-gcm", key, Buffer.from(ivB64, "base64"));
  d.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([d.update(Buffer.from(dataB64, "base64")), d.final()]).toString("utf8");
}

const rows = await sql`select provider, credentials from integration_accounts`;
for (const r of rows) {
  const j = JSON.parse(decrypt(r.credentials));
  const email = j.email || "";
  const pass = j.password || "";
  console.log(
    JSON.stringify({
      provider: r.provider,
      email,
      emailLen: email.length,
      passLen: pass.length,
      passHasSpace: /\s/.test(pass),
      passHasSpecial: /[^a-zA-Z0-9]/.test(pass),
      passCharsetHint: pass.replace(/[a-z]/g, "a").replace(/[A-Z]/g, "A").replace(/[0-9]/g, "0"),
    }),
  );
}
await sql.end();
