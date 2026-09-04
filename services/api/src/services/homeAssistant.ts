import mqtt from "mqtt";
import { getAppSettings } from "./settings.js";

export type HaEventName =
  | "workout_completed"
  | "workout_started"
  | "workout_skipped"
  | "nutrition"
  | "weight";

type HaSettings = Awaited<ReturnType<typeof getAppSettings>>;

export async function publishHaEvent(
  name: HaEventName,
  payload: unknown,
): Promise<{ ok: boolean; via?: string; error?: string; discovery?: boolean }> {
  const settings = await getAppSettings();
  if (!settings.haEnabled) {
    return { ok: false, error: "Home Assistant is disabled" };
  }

  try {
    if (settings.haMqttUrl) {
      await publishMqtt(name, payload, settings);
      return { ok: true, via: "mqtt", discovery: true };
    }

    if (settings.haRestUrl && settings.haRestToken) {
      const res = await fetch(`${settings.haRestUrl.replace(/\/$/, "")}/api/events/forge_${name}`, {
        method: "POST",
        headers: {
          Authorization: `Bearer ${settings.haRestToken}`,
          "Content-Type": "application/json",
        },
        body: JSON.stringify(payload),
      });
      if (!res.ok) {
        const body = await res.text();
        return { ok: false, via: "rest", error: body || res.statusText };
      }
      return { ok: true, via: "rest" };
    }

    return { ok: false, error: "No MQTT URL or REST URL+token configured" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "HA publish failed" };
  }
}

/** Publish MQTT discovery configs so HA auto-creates Forge sensors. */
export async function publishHaDiscovery(): Promise<{ ok: boolean; via?: string; error?: string }> {
  const settings = await getAppSettings();
  if (!settings.haEnabled) {
    return { ok: false, error: "Home Assistant is disabled" };
  }
  if (!settings.haMqttUrl) {
    return { ok: false, error: "MQTT URL required for discovery (REST cannot discover entities)" };
  }

  try {
    await withMqtt(settings, async (publish) => {
      await publishHaDiscoveryConfigs(publish);
    });
    return { ok: true, via: "mqtt" };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Discovery failed" };
  }
}

function publishMqtt(name: HaEventName, payload: unknown, settings: HaSettings): Promise<void> {
  return withMqtt(settings, async (publish) => {
    // Ensure discovery exists before the first real event
    await publishHaDiscoveryConfigs(publish);
    await publish(`forge/${name}`, JSON.stringify(payload), false);
  });
}

async function publishHaDiscoveryConfigs(
  publish: (topic: string, message: string, retain: boolean) => Promise<void>,
) {
  const sensors = [
    {
      objectId: "forge_last_workout",
      name: "Forge Last Workout",
      stateTopic: "forge/workout_completed",
      valueTemplate: "{{ value_json.completedAt }}",
      jsonAttributesTopic: "forge/workout_completed",
      icon: "mdi:dumbbell",
    },
    {
      objectId: "forge_workout_started",
      name: "Forge Workout Started",
      stateTopic: "forge/workout_started",
      valueTemplate: "{{ value_json.startedAt }}",
      jsonAttributesTopic: "forge/workout_started",
      icon: "mdi:play",
    },
    {
      objectId: "forge_workout_skipped",
      name: "Forge Workout Skipped",
      stateTopic: "forge/workout_skipped",
      valueTemplate: "{{ value_json.skippedAt }}",
      jsonAttributesTopic: "forge/workout_skipped",
      icon: "mdi:cancel",
    },
    {
      objectId: "forge_nutrition",
      name: "Forge Nutrition Calories",
      stateTopic: "forge/nutrition",
      valueTemplate: "{{ value_json.calories }}",
      unit: "kcal",
      jsonAttributesTopic: "forge/nutrition",
      icon: "mdi:food-apple",
    },
    {
      objectId: "forge_weight",
      name: "Forge Body Weight",
      stateTopic: "forge/weight",
      valueTemplate: "{{ value_json.weight }}",
      unit: "{{ value_json.units }}",
      jsonAttributesTopic: "forge/weight",
      icon: "mdi:scale-bathroom",
    },
  ];

  for (const s of sensors) {
    const config = {
      name: s.name,
      unique_id: s.objectId,
      state_topic: s.stateTopic,
      value_template: s.valueTemplate,
      json_attributes_topic: s.jsonAttributesTopic,
      icon: s.icon,
      ...(s.unit ? { unit_of_measurement: s.unit } : {}),
      device: {
        identifiers: ["forge_workout"],
        name: "Forge Workout",
        manufacturer: "Forge",
        model: "Workout Tracker",
      },
    };
    await publish(`homeassistant/sensor/${s.objectId}/config`, JSON.stringify(config), true);
  }
}

function withMqtt(
  settings: HaSettings,
  work: (publish: (topic: string, message: string, retain: boolean) => Promise<void>) => Promise<void>,
): Promise<void> {
  return new Promise((resolve, reject) => {
    const client = mqtt.connect(settings.haMqttUrl!, {
      username: settings.haMqttUsername || undefined,
      password: settings.haMqttPassword || undefined,
      connectTimeout: 4000,
    });

    const timer = setTimeout(() => {
      client.end(true);
      reject(new Error("MQTT connect timeout"));
    }, 8000);

    const publish = (topic: string, message: string, retain: boolean) =>
      new Promise<void>((res, rej) => {
        client.publish(topic, message, { qos: 0, retain }, (err) => (err ? rej(err) : res()));
      });

    client.on("connect", () => {
      void work(publish)
        .then(() => {
          clearTimeout(timer);
          client.end(true);
          resolve();
        })
        .catch((err) => {
          clearTimeout(timer);
          client.end(true);
          reject(err);
        });
    });

    client.on("error", (err) => {
      clearTimeout(timer);
      client.end(true);
      reject(err);
    });
  });
}
