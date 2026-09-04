import { eq } from "drizzle-orm";
import { db } from "../db/client.js";
import { appSettings } from "../db/schema.js";

export type AppSettings = {
  publicBaseUrl: string | null;
  haEnabled: boolean;
  haMqttUrl: string | null;
  haMqttUsername: string | null;
  haMqttPassword: string | null;
  haRestUrl: string | null;
  haRestToken: string | null;
  aiEnabled: boolean;
  ollamaUrl: string | null;
  garminEnabled: boolean;
  renphoEnabled: boolean;
  integrationToken: string | null;
  flowforgeEnabled: boolean;
  flowforgeSyncUrl: string | null;
  updatedAt: string | null;
};

export type PublicAppSettings = Omit<AppSettings, "haMqttPassword" | "haRestToken" | "integrationToken"> & {
  haMqttPasswordSet: boolean;
  haRestTokenSet: boolean;
  integrationTokenSet: boolean;
};

const SECRET_KEEP = "__keep__";

let cache: AppSettings | null = null;

function fromEnvDefaults(): AppSettings {
  return {
    publicBaseUrl: process.env.PUBLIC_BASE_URL?.replace(/\/$/, "") || null,
    haEnabled: process.env.HA_ENABLED === "true",
    haMqttUrl: process.env.HA_MQTT_URL || null,
    haMqttUsername: process.env.HA_MQTT_USERNAME || null,
    haMqttPassword: process.env.HA_MQTT_PASSWORD || null,
    haRestUrl: process.env.HA_REST_URL || null,
    haRestToken: process.env.HA_REST_TOKEN || null,
    aiEnabled: process.env.AI_ENABLED === "true",
    ollamaUrl: process.env.OLLAMA_URL || "http://127.0.0.1:11434",
    garminEnabled: process.env.GARMIN_ENABLED === "true",
    renphoEnabled: process.env.RENPHO_ENABLED === "true",
    integrationToken: process.env.INTEGRATION_TOKEN || null,
    flowforgeEnabled: process.env.FLOWFORGE_ENABLED !== "false",
    flowforgeSyncUrl: process.env.FLOWFORGE_SYNC_URL || null,
    updatedAt: null,
  };
}

function rowToSettings(row: typeof appSettings.$inferSelect): AppSettings {
  const env = fromEnvDefaults();
  return {
    publicBaseUrl: row.publicBaseUrl ?? env.publicBaseUrl,
    haEnabled: row.haEnabled,
    haMqttUrl: row.haMqttUrl ?? env.haMqttUrl,
    haMqttUsername: row.haMqttUsername ?? env.haMqttUsername,
    haMqttPassword: row.haMqttPassword ?? env.haMqttPassword,
    haRestUrl: row.haRestUrl ?? env.haRestUrl,
    haRestToken: row.haRestToken ?? env.haRestToken,
    aiEnabled: row.aiEnabled,
    ollamaUrl: row.ollamaUrl ?? env.ollamaUrl,
    garminEnabled: row.garminEnabled ?? env.garminEnabled,
    renphoEnabled: row.renphoEnabled ?? env.renphoEnabled,
    integrationToken: row.integrationToken ?? env.integrationToken,
    flowforgeEnabled: row.flowforgeEnabled ?? env.flowforgeEnabled,
    flowforgeSyncUrl: row.flowforgeSyncUrl ?? env.flowforgeSyncUrl,
    updatedAt: row.updatedAt?.toISOString() ?? null,
  };
}

export async function ensureAppSettingsRow() {
  const [existing] = await db.select().from(appSettings).where(eq(appSettings.id, 1));
  if (existing) return;
  const env = fromEnvDefaults();
  await db.insert(appSettings).values({
    id: 1,
    publicBaseUrl: env.publicBaseUrl,
    haEnabled: env.haEnabled,
    haMqttUrl: env.haMqttUrl,
    haMqttUsername: env.haMqttUsername,
    haMqttPassword: env.haMqttPassword,
    haRestUrl: env.haRestUrl,
    haRestToken: env.haRestToken,
    aiEnabled: env.aiEnabled,
    ollamaUrl: env.ollamaUrl,
    garminEnabled: env.garminEnabled,
    renphoEnabled: env.renphoEnabled,
    integrationToken: env.integrationToken,
    flowforgeEnabled: env.flowforgeEnabled,
    flowforgeSyncUrl: env.flowforgeSyncUrl,
  });
}

export async function getAppSettings(force = false): Promise<AppSettings> {
  if (cache && !force) return cache;
  const [row] = await db.select().from(appSettings).where(eq(appSettings.id, 1));
  cache = row ? rowToSettings(row) : fromEnvDefaults();
  return cache;
}

export function toPublicSettings(settings: AppSettings): PublicAppSettings {
  const { haMqttPassword, haRestToken, integrationToken, ...rest } = settings;
  return {
    ...rest,
    haMqttPasswordSet: Boolean(haMqttPassword),
    haRestTokenSet: Boolean(haRestToken),
    integrationTokenSet: Boolean(integrationToken),
  };
}

export type SettingsPatch = {
  publicBaseUrl?: string | null;
  haEnabled?: boolean;
  haMqttUrl?: string | null;
  haMqttUsername?: string | null;
  /** Pass null to clear, omit or __keep__ to leave unchanged, otherwise set. */
  haMqttPassword?: string | null;
  haRestUrl?: string | null;
  haRestToken?: string | null;
  aiEnabled?: boolean;
  ollamaUrl?: string | null;
  garminEnabled?: boolean;
  renphoEnabled?: boolean;
  integrationToken?: string | null;
  flowforgeEnabled?: boolean;
  flowforgeSyncUrl?: string | null;
};

export async function updateAppSettings(patch: SettingsPatch): Promise<AppSettings> {
  await ensureAppSettingsRow();
  const current = await getAppSettings(true);

  const nextPassword =
    patch.haMqttPassword === undefined || patch.haMqttPassword === SECRET_KEEP
      ? current.haMqttPassword
      : patch.haMqttPassword;
  const nextToken =
    patch.haRestToken === undefined || patch.haRestToken === SECRET_KEEP
      ? current.haRestToken
      : patch.haRestToken;
  const nextIntegration =
    patch.integrationToken === undefined || patch.integrationToken === SECRET_KEEP
      ? current.integrationToken
      : patch.integrationToken;

  const publicBaseUrl =
    patch.publicBaseUrl === undefined
      ? current.publicBaseUrl
      : patch.publicBaseUrl?.trim().replace(/\/$/, "") || null;

  const [row] = await db
    .update(appSettings)
    .set({
      publicBaseUrl,
      haEnabled: patch.haEnabled ?? current.haEnabled,
      haMqttUrl: patch.haMqttUrl === undefined ? current.haMqttUrl : patch.haMqttUrl?.trim() || null,
      haMqttUsername:
        patch.haMqttUsername === undefined ? current.haMqttUsername : patch.haMqttUsername?.trim() || null,
      haMqttPassword: nextPassword,
      haRestUrl: patch.haRestUrl === undefined ? current.haRestUrl : patch.haRestUrl?.trim() || null,
      haRestToken: nextToken,
      aiEnabled: patch.aiEnabled ?? current.aiEnabled,
      ollamaUrl: patch.ollamaUrl === undefined ? current.ollamaUrl : patch.ollamaUrl?.trim() || null,
      garminEnabled: patch.garminEnabled ?? current.garminEnabled,
      renphoEnabled: patch.renphoEnabled ?? current.renphoEnabled,
      integrationToken: nextIntegration,
      flowforgeEnabled: patch.flowforgeEnabled ?? current.flowforgeEnabled,
      flowforgeSyncUrl:
        patch.flowforgeSyncUrl === undefined
          ? current.flowforgeSyncUrl
          : patch.flowforgeSyncUrl?.trim() || null,
      updatedAt: new Date(),
    })
    .where(eq(appSettings.id, 1))
    .returning();

  cache = rowToSettings(row);
  return cache;
}

export { SECRET_KEEP };
