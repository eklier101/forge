/** Live feature flags shared across tabs / Home / Admin. */

import React, { createContext, useCallback, useContext, useEffect, useState, type ReactNode } from "react";
import { getPreferences } from "../db/local";
import { onFeaturesChanged } from "./featuresEvents";
import { debugLog } from "./debugLog";
import { pullPreferences } from "./sync";
import { subscribeSession } from "./session";

export type LiveFeatures = {
  gym: boolean;
  home: boolean;
  fuel: boolean;
  fast: boolean;
  photos: boolean;
  sync: boolean;
  aiPlan: boolean;
  aiEstimate: boolean;
  autoTargets: boolean;
  homeAssistant: boolean;
};

/** Start hidden until prefs load — avoids a flash of modules that are actually off. */
const HIDDEN_UNTIL_READY: LiveFeatures = {
  gym: false,
  home: false,
  fuel: false,
  fast: false,
  photos: false,
  sync: true,
  aiPlan: true,
  aiEstimate: true,
  autoTargets: true,
  homeAssistant: false,
};

type Ctx = {
  features: LiveFeatures;
  ready: boolean;
  refresh: () => Promise<void>;
};

const FeaturesContext = createContext<Ctx>({
  features: HIDDEN_UNTIL_READY,
  ready: false,
  refresh: async () => undefined,
});

function fromPrefs(raw: unknown): LiveFeatures {
  const f =
    raw && typeof raw === "object" ? (raw as Record<string, unknown>) : {};
  return {
    gym: f.gym !== false,
    home: f.home !== false,
    fuel: f.fuel !== false,
    fast: f.fast !== false,
    photos: f.photos !== false,
    sync: f.sync !== false,
    aiPlan: f.aiPlan !== false,
    aiEstimate: f.aiEstimate !== false,
    autoTargets: f.autoTargets !== false,
    homeAssistant: f.homeAssistant !== false,
  };
}

export function FeaturesProvider({ children }: { children: ReactNode }) {
  const [features, setFeatures] = useState<LiveFeatures>(HIDDEN_UNTIL_READY);
  const [ready, setReady] = useState(false);

  const refresh = useCallback(async () => {
    const prefs = await getPreferences();
    const next = fromPrefs(prefs.features);
    setFeatures(next);
    setReady(true);
    void debugLog("features", "refresh", next);
  }, []);

  useEffect(() => {
    void (async () => {
      await refresh();
      const remote = await pullPreferences();
      if (remote) await refresh();
    })();
    const unsubFeatures = onFeaturesChanged(() => {
      void refresh();
    });
    const unsubSession = subscribeSession(() => {
      // Account switch wipes prefs — hide until pull, then refresh.
      setReady(false);
      setFeatures(HIDDEN_UNTIL_READY);
      void (async () => {
        await refresh();
        const remote = await pullPreferences();
        if (remote) await refresh();
      })();
    });
    return () => {
      unsubFeatures();
      unsubSession();
    };
  }, [refresh]);

  return (
    <FeaturesContext.Provider value={{ features, ready, refresh }}>
      {children}
    </FeaturesContext.Provider>
  );
}

export function useFeatures(): Ctx {
  return useContext(FeaturesContext);
}
