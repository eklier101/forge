import { Tabs } from "expo-router";
import { View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Ionicons } from "@expo/vector-icons";
import type { ComponentProps } from "react";
import { useFeatures } from "../../src/lib/featuresContext";
import { colors } from "../../src/theme/colors";

type IconName = ComponentProps<typeof Ionicons>["name"];

function TabIcon({ name, focused }: { name: IconName; focused: boolean }) {
  return (
    <View style={{ alignItems: "center", justifyContent: "center", minWidth: 28, minHeight: 28 }}>
      <Ionicons name={name} size={22} color={focused ? colors.accent : colors.textMuted} />
    </View>
  );
}

export default function TabsLayout() {
  const insets = useSafeAreaInsets();
  const bottom = Math.max(insets.bottom, 8);
  const { features, ready } = useFeatures();
  // Until prefs load, hide Fuel/Fast so a flash-on doesn't fight a toggle-off.
  const fuelOn = ready ? features.fuel : false;
  const fastOn = ready ? features.fast : false;

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarShowLabel: true,
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.textMuted,
        tabBarLabelStyle: {
          fontSize: 11,
          fontFamily: "Outfit_700Bold",
          marginBottom: 2,
        },
        tabBarStyle: {
          backgroundColor: colors.bgElevated,
          borderTopColor: colors.line,
          borderTopWidth: 1,
          height: 56 + bottom,
          paddingBottom: bottom,
          paddingTop: 8,
        },
        tabBarItemStyle: { paddingTop: 2 },
      }}
    >
      <Tabs.Screen
        name="today"
        options={{
          title: "Home",
          tabBarIcon: ({ focused }) => <TabIcon name={focused ? "home" : "home-outline"} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="plan"
        options={{
          title: "Plan",
          tabBarIcon: ({ focused }) => <TabIcon name={focused ? "calendar" : "calendar-outline"} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="fast"
        options={{
          title: "Fast",
          href: fastOn ? undefined : null,
          tabBarIcon: ({ focused }) => <TabIcon name={focused ? "timer" : "timer-outline"} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="fuel"
        options={{
          title: "Fuel",
          href: fuelOn ? undefined : null,
          tabBarIcon: ({ focused }) => <TabIcon name={focused ? "nutrition" : "nutrition-outline"} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="you"
        options={{
          title: "You",
          tabBarIcon: ({ focused }) => <TabIcon name={focused ? "person" : "person-outline"} focused={focused} />,
        }}
      />
      <Tabs.Screen
        name="log"
        options={{
          href: null,
          title: "Log",
        }}
      />
    </Tabs>
  );
}
