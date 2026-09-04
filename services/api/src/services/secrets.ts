import { createCipheriv, createDecipheriv, createHash, randomBytes } from "node:crypto";

const PREFIX = "enc:v1:";

function keyFromSecret(): Buffer {
  const secret =
    process.env.CREDENTIALS_SECRET ||
    process.env.JWT_SECRET ||
    "dev-only-change-me";
  return createHash("sha256").update(secret).digest();
}

/** AES-256-GCM encrypt → `enc:v1:<iv_b64>:<tag_b64>:<data_b64>` */
export function encryptSecret(plaintext: string): string {
  const iv = randomBytes(12);
  const cipher = createCipheriv("aes-256-gcm", keyFromSecret(), iv);
  const enc = Buffer.concat([cipher.update(plaintext, "utf8"), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${PREFIX}${iv.toString("base64")}:${tag.toString("base64")}:${enc.toString("base64")}`;
}

export function decryptSecret(stored: string): string {
  if (!stored.startsWith(PREFIX)) return stored; // legacy plaintext
  const rest = stored.slice(PREFIX.length);
  const [ivB64, tagB64, dataB64] = rest.split(":");
  if (!ivB64 || !tagB64 || !dataB64) throw new Error("Corrupt encrypted secret");
  const decipher = createDecipheriv("aes-256-gcm", keyFromSecret(), Buffer.from(ivB64, "base64"));
  decipher.setAuthTag(Buffer.from(tagB64, "base64"));
  return Buffer.concat([
    decipher.update(Buffer.from(dataB64, "base64")),
    decipher.final(),
  ]).toString("utf8");
}

export function encryptJson(obj: unknown): string {
  return encryptSecret(JSON.stringify(obj));
}

export function decryptJson<T = unknown>(stored: string | null | undefined): T | null {
  if (!stored) return null;
  try {
    return JSON.parse(decryptSecret(stored)) as T;
  } catch {
    try {
      return JSON.parse(stored) as T;
    } catch {
      return null;
    }
  }
}
