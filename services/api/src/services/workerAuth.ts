import { createHash, randomBytes } from "node:crypto";

/** Same derivation as sync-worker — lets the worker auth with JWT_SECRET alone. */
export function derivedWorkerToken(jwtSecret: string): string {
  return createHash("sha256").update(`${jwtSecret}:forge-sync-worker`).digest("hex");
}

export function generateIntegrationToken(): string {
  return randomBytes(24).toString("hex");
}

export function integrationAuthorized(
  request: { headers: Record<string, unknown> },
  integrationToken: string | null | undefined,
): boolean {
  const header = String(request.headers["x-forge-token"] ?? request.headers["authorization"] ?? "");
  const bearer = header.toLowerCase().startsWith("bearer ") ? header.slice(7).trim() : header.trim();
  if (!bearer) return false;

  if (integrationToken && (header === integrationToken || bearer === integrationToken)) {
    return true;
  }

  const jwtSecret = process.env.JWT_SECRET ?? "dev-only-change-me";
  const derived = derivedWorkerToken(jwtSecret);
  return bearer === derived || header === derived;
}
