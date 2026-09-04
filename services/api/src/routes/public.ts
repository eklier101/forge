import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { eq } from "drizzle-orm";
import type { FastifyInstance } from "fastify";
import { db } from "../db/client.js";
import { inviteCodes } from "../db/schema.js";

const __dirname = path.dirname(fileURLToPath(import.meta.url));

function readVersion(): string {
  const candidates = [
    path.resolve(__dirname, "../../../VERSION"),
    path.resolve(__dirname, "../../VERSION"),
    path.resolve(process.cwd(), "VERSION"),
    path.resolve(process.cwd(), "../../VERSION"),
  ];
  for (const p of candidates) {
    try {
      if (fs.existsSync(p)) return fs.readFileSync(p, "utf8").trim();
    } catch {
      /* continue */
    }
  }
  return process.env.FORGE_VERSION ?? "0.2.0";
}

function publicRoot(): string {
  const candidates = [
    path.resolve(__dirname, "../../public"),
    path.resolve(process.cwd(), "public"),
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return path.resolve(process.cwd(), "public");
}

function apkPath(): string | null {
  const p = path.join(publicRoot(), "downloads", "forge.apk");
  return fs.existsSync(p) ? p : null;
}

function isAndroid(ua: string): boolean {
  return /android/i.test(ua);
}

const pageCss = `
  :root { color-scheme: dark; }
  * { box-sizing: border-box; }
  body {
    margin: 0; min-height: 100vh; display: grid; place-items: center;
    background:
      radial-gradient(ellipse at 20% 0%, #1a2a22 0%, transparent 50%),
      radial-gradient(ellipse at 80% 100%, #152018 0%, transparent 45%),
      #0B1210;
    color: #E8F0EC; font-family: "Segoe UI", system-ui, sans-serif;
  }
  main { width: min(26rem, 92vw); padding: 2rem 1.25rem; text-align: left; }
  .brand { color: #C4F542; letter-spacing: .28em; font-size: 2.4rem; font-weight: 800; margin: 0; }
  .sub { color: #8FA399; margin: .6rem 0 1.6rem; line-height: 1.45; }
  .card {
    background: #121A17; border: 1px solid #24302B; border-radius: 1.1rem;
    padding: 1.1rem; display: grid; gap: .75rem;
  }
  .cta {
    display: block; text-align: center; text-decoration: none; font-weight: 700;
    border-radius: 999px; padding: .85rem 1rem;
  }
  .primary { background: #C4F542; color: #0B1210; }
  .secondary { background: #18211D; color: #E8F0EC; border: 1px solid #24302B; }
  .hint { color: #8FA399; font-size: .85rem; margin: 0; }
  code { color: #5AD1C4; word-break: break-all; }
  .meta { margin-top: 1.25rem; color: #5A6B64; font-size: .8rem; }
`;

export function buildLandingHtml(opts: { android: boolean; version: string; hasApk: boolean }): string {
  const apkBlock = opts.hasApk
    ? opts.android
      ? `<a class="cta primary" href="/download/forge.apk">Install Android APK</a>
         <p class="hint">v${opts.version} · allow “Install unknown apps” if prompted</p>`
      : `<a class="cta secondary" href="/download/forge.apk">Download Android APK</a>`
    : `<p class="hint">APK not uploaded yet — ask the host to publish a build.</p>`;

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="theme-color" content="#0B1210"/>
<title>Forge</title>
<style>${pageCss}</style>
</head><body><main>
  <h1 class="brand">FORGE</h1>
  <p class="sub">Train offline after login. Same HTTPS link is your server URL and web app.</p>
  <div class="card">
    ${apkBlock}
    <a class="cta ${opts.android && opts.hasApk ? "secondary" : "primary"}" href="/app/">Open web app</a>
    <p class="hint">In the app, set <strong>Server URL</strong> to this site’s origin<br/><code id="origin"></code></p>
  </div>
  <p class="meta">Forge API v${opts.version} · <a href="/health" style="color:#5AD1C4">health</a></p>
  <script>document.getElementById("origin").textContent = location.origin;</script>
</main></body></html>`;
}

function buildInviteHtml(opts: {
  valid: boolean;
  message: string;
  code?: string;
  expiresAt?: string;
  hasApk: boolean;
}): string {
  const webHref = opts.code ? `/app/pair?invite=${encodeURIComponent(opts.code)}` : "/app/";
  const appHref = opts.code ? `forge://invite/${opts.code}` : "forge://";
  const actions = opts.valid
    ? `<a class="cta primary" href="${webHref}">Create account</a>
       <a class="cta secondary" href="${appHref}">Open in Forge app</a>
       ${
         opts.hasApk
           ? `<a class="cta secondary" href="/download/forge.apk">Install Android APK first</a>`
           : ""
       }
       <p class="hint">One-time invite · expires ${opts.expiresAt ? new Date(opts.expiresAt).toLocaleString() : "in 24 hours"}</p>`
    : `<a class="cta secondary" href="/">Back to Forge</a>
       <p class="hint">${opts.message}</p>`;

  return `<!doctype html>
<html lang="en"><head>
<meta charset="utf-8"/>
<meta name="viewport" content="width=device-width,initial-scale=1"/>
<meta name="theme-color" content="#0B1210"/>
<title>Forge invite</title>
<style>${pageCss}</style>
</head><body><main>
  <h1 class="brand">FORGE</h1>
  <p class="sub">${opts.valid ? "You’ve been invited. Create your account to get access." : "This invite can’t be used."}</p>
  <div class="card">${actions}</div>
</main></body></html>`;
}

export async function registerPublicRoutes(app: FastifyInstance) {
  const version = readVersion();
  const root = publicRoot();

  app.get("/", async (request, reply) => {
    const accept = String(request.headers.accept ?? "");
    const ua = String(request.headers["user-agent"] ?? "");
    if (!accept.includes("text/html") && accept.includes("application/json")) {
      return {
        service: "forge-api",
        ok: true,
        version,
        health: "/health",
        web: "/app/",
        apk: "/download/forge.apk",
        auth: { login: "POST /auth/login", register: "POST /auth/register", status: "GET /auth/status" },
      };
    }
    return reply
      .type("text/html")
      .send(buildLandingHtml({ android: isAndroid(ua), version, hasApk: !!apkPath() }));
  });

  app.get("/invite/:code", async (request, reply) => {
    const code = String((request.params as { code: string }).code ?? "")
      .trim()
      .toLowerCase();
    const [row] = await db.select().from(inviteCodes).where(eq(inviteCodes.code, code));
    if (!row) {
      return reply
        .type("text/html")
        .status(404)
        .send(
          buildInviteHtml({
            valid: false,
            message: "Invalid invite link.",
            hasApk: !!apkPath(),
          }),
        );
    }
    if (row.uses >= row.maxUses) {
      return reply
        .type("text/html")
        .status(410)
        .send(
          buildInviteHtml({
            valid: false,
            message: "This invite was already used.",
            hasApk: !!apkPath(),
          }),
        );
    }
    if (row.expiresAt.getTime() <= Date.now()) {
      return reply
        .type("text/html")
        .status(410)
        .send(
          buildInviteHtml({
            valid: false,
            message: "This invite expired (links last 24 hours).",
            hasApk: !!apkPath(),
          }),
        );
    }

    return reply.type("text/html").send(
      buildInviteHtml({
        valid: true,
        message: "ok",
        code: row.code,
        expiresAt: row.expiresAt.toISOString(),
        hasApk: !!apkPath(),
      }),
    );
  });

  app.get("/download/forge.apk", async (_request, reply) => {
    const file = apkPath();
    if (!file) return reply.status(404).send({ error: "APK not published yet" });
    const stat = fs.statSync(file);
    reply.header("Content-Type", "application/vnd.android.package-archive");
    reply.header("Content-Length", String(stat.size));
    reply.header("Content-Disposition", `attachment; filename="forge-${version}.apk"`);
    return reply.send(fs.createReadStream(file));
  });

  app.get("/version", async () => ({
    version,
    apk: !!apkPath(),
  }));

  return { version, publicRoot: root };
}
