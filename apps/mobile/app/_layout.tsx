import { Stack, useRouter, useSegments, useGlobalSearchParams } from "expo-router";
import { useEffect, useState } from "react";
import { ActivityIndicator, View } from "react-native";
import { useFonts, Outfit_500Medium, Outfit_700Bold } from "@expo-google-fonts/outfit";
import { SpaceGrotesk_500Medium, SpaceGrotesk_700Bold } from "@expo-google-fonts/space-grotesk";
import Ionicons from "@expo/vector-icons/Ionicons";
import { StatusBar } from "expo-status-bar";
import { initLocalStore } from "../src/db/local";
import { getPairedFlag, setPairedFlag, subscribePairedFlag } from "../src/lib/authFlag";
import {
  ensureNotificationSetup,
  startStickyNotificationWatchdog,
} from "../src/lib/notifications";
import { restorePersistentStickies } from "../src/lib/restoreStickies";
import { registerPushToken } from "../src/lib/pushRegister";
import { startHealthConnectPolling } from "../src/lib/healthConnect";
import { getToken, subscribeSession, clearSession } from "../src/lib/session";
import { WhatsNewModal } from "../src/components/WhatsNewModal";
import { colors } from "../src/theme/colors";
import { startUpdateDownloadWatcher } from "../src/lib/updateDownloadManager";
import { FeaturesProvider } from "../src/lib/featuresContext";

function firstParam(v: string | string[] | undefined): string {
  if (Array.isArray(v)) return v[0] ?? "";
  return v ?? "";
}

export default function RootLayout() {
  const [ready, setReady] = useState(false);
  const [paired, setPaired] = useState(getPairedFlag());
  const segments = useSegments();
  const router = useRouter();
  const params = useGlobalSearchParams<{ invite?: string | string[] }>();
  const inviteCode = firstParam(params.invite).trim();

  const [fontsLoaded] = useFonts({
    Outfit_500Medium,
    Outfit_700Bold,
    SpaceGrotesk_500Medium,
    SpaceGrotesk_700Bold,
    ...Ionicons.font,
  });

  useEffect(() => {
    (async () => {
      await initLocalStore();
      const token = await getToken();
      setPairedFlag(!!token);
      setPaired(!!token);
      setReady(true);
      void ensureNotificationSetup().then(() => {
        if (token) void restorePersistentStickies();
      });
    })();
  }, []);

  useEffect(() => {
    const stop = startStickyNotificationWatchdog();
    return stop;
  }, []);

  useEffect(() => {
    return startUpdateDownloadWatcher();
  }, []);

  useEffect(() => {
    if (!paired) return;
    void restorePersistentStickies();
    void registerPushToken();
    return startHealthConnectPolling();
  }, [paired]);

  useEffect(() => {
    const unsubFlag = subscribePairedFlag(() => setPaired(getPairedFlag()));
    const unsubSession = subscribeSession(() => {
      void getToken().then((token) => {
        setPairedFlag(!!token);
      });
    });
    return () => {
      unsubFlag();
      unsubSession();
    };
  }, []);

  // Opening an invite while already signed in: clear session so register can proceed.
  useEffect(() => {
    if (!ready) return;
    const root = segments[0];
    const onInviteFlow =
      root === "invite" || (root === "pair" && Boolean(inviteCode));
    if (!onInviteFlow || !paired) return;
    void (async () => {
      await clearSession();
      setPairedFlag(false);
      setPaired(false);
    })();
  }, [ready, paired, segments, inviteCode]);

  useEffect(() => {
    if (!ready) return;
    const root = segments[0];
    const onAuth = root === "pair" || root === "invite";
    const onSetup = root === "setup-profile";
    const inviteInProgress =
      root === "invite" || (root === "pair" && Boolean(inviteCode));
    if (!paired && !onAuth) {
      router.replace("/pair");
      return;
    }
    // Don't bounce invite/register away to Home when a session still exists briefly.
    if (paired && onAuth && !inviteInProgress) {
      router.replace("/(tabs)/today");
    }
    void onSetup;
  }, [ready, paired, segments, router, inviteCode]);

  if (!ready || !fontsLoaded) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.bg, alignItems: "center", justifyContent: "center" }}>
        <ActivityIndicator color={colors.accent} />
      </View>
    );
  }

  return (
    <FeaturesProvider>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }} />
      {paired ? <WhatsNewModal /> : null}
    </FeaturesProvider>
  );
}
