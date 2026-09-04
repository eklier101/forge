import "dotenv/config";
import path from "node:path";
import fs from "node:fs";
import cors from "@fastify/cors";
import jwt from "@fastify/jwt";
import fastifyStatic from "@fastify/static";
import Fastify from "fastify";
import type { FastifyReply, FastifyRequest } from "fastify";
import { seedExercises } from "./db/seed.js";
import { queryClient } from "./db/client.js";
import { authRoutes } from "./routes/auth.js";
import { syncRoutes } from "./routes/sync.js";
import { workoutRoutes } from "./routes/workouts.js";
import { registerPublicRoutes } from "./routes/public.js";
import { DEFAULT_OWNED_EQUIPMENT } from "./db/schema.js";

if (process.env.NODE_ENV === "production" && !process.env.JWT_SECRET?.trim()) {
  throw new Error("JWT_SECRET must be set in production");
}

declare module "fastify" {
  interface FastifyInstance {
    authenticate: (request: FastifyRequest, reply: FastifyReply) => Promise<void>;
  }
}

const app = Fastify({ logger: true });

await app.register(cors, { origin: true });
await app.register(jwt, {
  secret: process.env.JWT_SECRET ?? "dev-only-change-me",
});

app.decorate("authenticate", async (request: FastifyRequest, reply: FastifyReply) => {
  try {
    await request.jwtVerify();
  } catch {
    return reply.status(401).send({ error: "Unauthorized" });
  }
});

const { version, publicRoot } = await registerPublicRoutes(app);

app.get("/health", async () => ({
  ok: true,
  service: "forge-api",
  version,
  aiEnabled: process.env.AI_ENABLED === "true",
  haEnabled: process.env.HA_ENABLED === "true",
}));

await app.register(authRoutes);
await app.register(syncRoutes);
await app.register(workoutRoutes);

const webRoot = path.join(publicRoot, "app");
if (fs.existsSync(webRoot)) {
  await app.register(fastifyStatic, {
    root: webRoot,
    prefix: "/app/",
    wildcard: true,
    decorateReply: false,
  });
  // SPA fallback for client-side routes under /app
  app.setNotFoundHandler((request, reply) => {
    if (request.url.startsWith("/app")) {
      const index = path.join(webRoot, "index.html");
      if (fs.existsSync(index)) {
        return reply.type("text/html").send(fs.readFileSync(index));
      }
    }
    return reply.status(404).send({ error: "Not Found", statusCode: 404 });
  });
}

async function ensureSchema() {
  await queryClient`CREATE EXTENSION IF NOT EXISTS pgcrypto;`;
  await queryClient`
    CREATE TABLE IF NOT EXISTS users (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      username text,
      password_hash text,
      display_name text NOT NULL,
      role text NOT NULL DEFAULT 'user',
      invite_code_used text,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `;
  // Migrate pre-auth users table (invite-only pair era)
  await queryClient`ALTER TABLE users ADD COLUMN IF NOT EXISTS username text;`;
  await queryClient`ALTER TABLE users ADD COLUMN IF NOT EXISTS password_hash text;`;
  await queryClient`ALTER TABLE users ADD COLUMN IF NOT EXISTS role text NOT NULL DEFAULT 'user';`;
  // Drop incomplete legacy accounts so first real register becomes admin bootstrap
  await queryClient`DELETE FROM users WHERE username IS NULL OR password_hash IS NULL;`;
  await queryClient`
    DO $$ BEGIN
      IF NOT EXISTS (
        SELECT 1 FROM pg_constraint WHERE conname = 'users_username_key'
      ) THEN
        ALTER TABLE users ADD CONSTRAINT users_username_key UNIQUE (username);
      END IF;
    END $$;
  `;
  await queryClient`ALTER TABLE users ALTER COLUMN username SET NOT NULL;`;
  await queryClient`ALTER TABLE users ALTER COLUMN password_hash SET NOT NULL;`;

  await queryClient`
    CREATE TABLE IF NOT EXISTS invite_codes (
      code text PRIMARY KEY,
      created_by uuid REFERENCES users(id) ON DELETE SET NULL,
      max_uses integer NOT NULL DEFAULT 1,
      uses integer NOT NULL DEFAULT 0,
      note text,
      created_at timestamptz NOT NULL DEFAULT now()
    );
  `;
  await queryClient`
    CREATE TABLE IF NOT EXISTS devices (
      id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      device_name text NOT NULL,
      paired_at timestamptz NOT NULL DEFAULT now()
    );
  `;
  await queryClient`
    CREATE TABLE IF NOT EXISTS sync_entities (
      id text PRIMARY KEY,
      user_id uuid NOT NULL REFERENCES users(id) ON DELETE CASCADE,
      entity_type text NOT NULL,
      payload jsonb NOT NULL,
      updated_at timestamptz NOT NULL,
      deleted boolean NOT NULL DEFAULT false
    );
  `;
  await queryClient`
    CREATE TABLE IF NOT EXISTS exercises (
      id text PRIMARY KEY,
      name text NOT NULL,
      muscle_group text NOT NULL,
      equipment text NOT NULL DEFAULT 'bodyweight',
      location text NOT NULL DEFAULT 'gym',
      is_custom boolean NOT NULL DEFAULT false
    );
  `;
  const ownedDefault = JSON.stringify(DEFAULT_OWNED_EQUIPMENT);
  await queryClient`
    CREATE TABLE IF NOT EXISTS preferences (
      user_id uuid PRIMARY KEY REFERENCES users(id) ON DELETE CASCADE,
      gym_days_per_week integer NOT NULL DEFAULT 3,
      gym_weekdays jsonb NOT NULL DEFAULT '[1,3,5]'::jsonb,
      split_id text NOT NULL DEFAULT 'full_body_3',
      home_workouts_enabled boolean NOT NULL DEFAULT true,
      progression_focus text NOT NULL DEFAULT 'balanced',
      units text NOT NULL DEFAULT 'lb',
      rest_timer_seconds integer NOT NULL DEFAULT 90,
      favorite_exercise_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
      disliked_exercise_ids jsonb NOT NULL DEFAULT '[]'::jsonb,
      owned_equipment jsonb NOT NULL DEFAULT ${ownedDefault}::jsonb,
      calorie_target integer DEFAULT 2200,
      protein_target integer DEFAULT 150
    );
  `;
  await queryClient`ALTER TABLE preferences ADD COLUMN IF NOT EXISTS owned_equipment jsonb;`;
  await queryClient`
    UPDATE preferences
    SET owned_equipment = ${ownedDefault}::jsonb
    WHERE owned_equipment IS NULL;
  `;

  await seedExercises();
}

const port = Number(process.env.PORT ?? 3000);
const host = process.env.HOST ?? "0.0.0.0";

try {
  await ensureSchema();
  await app.listen({ port, host });
  app.log.info(`Forge API v${version} listening on ${host}:${port}`);
} catch (err) {
  app.log.error(err);
  process.exit(1);
}
