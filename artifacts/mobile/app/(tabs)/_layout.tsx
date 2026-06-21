import { BlurView } from "expo-blur";
import { isLiquidGlassAvailable } from "expo-glass-effect";
import { Tabs } from "expo-router";
import { Icon, Label, NativeTabs } from "expo-router/unstable-native-tabs";
import { Feather } from "@expo/vector-icons";
import React from "react";
import { Platform, StyleSheet, View, useColorScheme } from "react-native";
import { useColors } from "@/hooks/useColors";

function NativeTabLayout() {
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <Icon sf={{ default: "timer", selected: "timer" }} />
        <Label>TiMETR</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="timeline">
        <Icon sf={{ default: "timeline.selection", selected: "timeline.selection" }} />
        <Label>Таймлайн</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="stats">
        <Icon sf={{ default: "chart.bar", selected: "chart.bar.fill" }} />
        <Label>Экономика</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="embassies">
        <Icon sf={{ default: "mappin.circle", selected: "mappin.circle.fill" }} />
        <Label>Посольства</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="auctions">
        <Icon sf={{ default: "tag", selected: "tag.fill" }} />
        <Label>Аукцион</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="tv">
        <Icon sf={{ default: "play.tv", selected: "play.tv.fill" }} />
        <Label>TV</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="chronopedia">
        <Icon sf={{ default: "globe.europe.africa", selected: "globe.europe.africa.fill" }} />
        <Label>Хронопедия</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="timeutils">
        <Icon sf={{ default: "clock.badge", selected: "clock.badge.fill" }} />
        <Label>Время</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

function ClassicTabLayout() {
  const colors = useColors();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === "dark";
  const isIOS = Platform.OS === "ios";
  const isWeb = Platform.OS === "web";

  return (
    <Tabs
      screenOptions={{
        tabBarActiveTintColor: colors.primary,
        tabBarInactiveTintColor: colors.mutedForeground,
        headerShown: false,
        tabBarStyle: {
          position: "absolute",
          backgroundColor: isIOS ? "transparent" : colors.background,
          borderTopWidth: 1,
          borderTopColor: colors.border,
          elevation: 0,
          ...(isWeb ? { height: 84 } : {}),
        },
        tabBarBackground: () =>
          isIOS ? (
            <BlurView intensity={80} tint={isDark ? "dark" : "extraLight"} style={StyleSheet.absoluteFill} />
          ) : isWeb ? (
            <View style={[StyleSheet.absoluteFill, { backgroundColor: colors.background }]} />
          ) : null,
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "TiMETR",
          tabBarIcon: ({ color }) => <Feather name="clock" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="timeline"
        options={{
          title: "Таймлайн",
          tabBarIcon: ({ color }) => <Feather name="grid" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="stats"
        options={{
          title: "Экономика",
          tabBarIcon: ({ color }) => <Feather name="bar-chart-2" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="embassies"
        options={{
          title: "Посольства",
          tabBarIcon: ({ color }) => <Feather name="map-pin" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="auctions"
        options={{
          title: "Аукцион",
          tabBarIcon: ({ color }) => <Feather name="tag" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="tv"
        options={{
          title: "TV",
          tabBarIcon: ({ color }) => <Feather name="tv" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="chronopedia"
        options={{
          title: "Хронопедия",
          tabBarIcon: ({ color }) => <Feather name="globe" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="timeutils"
        options={{
          title: "Время",
          tabBarIcon: ({ color }) => <Feather name="clock" size={22} color={color} />,
        }}
      />
    </Tabs>
  );
}

export default function TabLayout() {
  if (isLiquidGlassAvailable()) {
    return <NativeTabLayout />;
  }
  return <ClassicTabLayout />;
}
