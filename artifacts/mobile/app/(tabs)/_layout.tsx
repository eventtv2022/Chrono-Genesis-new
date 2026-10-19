import { BlurView } from "expo-blur";
import { isLiquidGlassAvailable } from "expo-glass-effect";
import { Slot, Tabs } from "expo-router";
import { Icon, Label, NativeTabs } from "expo-router/unstable-native-tabs";
import { Feather } from "@expo/vector-icons";
import React from "react";
import { Platform, StyleSheet, View, useColorScheme } from "react-native";
import { useColors } from "@/hooks/useColors";
import { MobileClockBar } from "@/components/MobileClockBar";
import { useLanguage } from "@/context/LanguageContext";
import { useCitizen } from "@/context/CitizenContext";
import { ActivityIndicator } from "react-native";

function NativeTabLayout() {
  const { t, lang } = useLanguage();
  return (
    <NativeTabs>
      <NativeTabs.Trigger name="index">
        <Icon sf={{ default: "timer", selected: "timer" }} />
        <Label>{t.tab_timer}</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="timeline">
        <Icon sf={{ default: "timeline.selection", selected: "timeline.selection" }} />
        <Label>{t.tab_timeline}</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="stats">
        <Icon sf={{ default: "chart.bar", selected: "chart.bar.fill" }} />
        <Label>{t.tab_economy}</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="embassies">
        <Icon sf={{ default: "mappin.circle", selected: "mappin.circle.fill" }} />
        <Label>{t.tab_embassies}</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="auctions">
        <Icon sf={{ default: "tag", selected: "tag.fill" }} />
        <Label>{t.tab_auction}</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="tv">
        <Icon sf={{ default: "play.tv", selected: "play.tv.fill" }} />
        <Label>{t.tab_tv}</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="chronopedia">
        <Icon sf={{ default: "globe.europe.africa", selected: "globe.europe.africa.fill" }} />
        <Label>{t.tab_chronopedia}</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="timeutils">
        <Icon sf={{ default: "clock.badge", selected: "clock.badge.fill" }} />
        <Label>{t.tab_time}</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="language-clock">
        <Icon sf={{ default: "globe.americas", selected: "globe.americas.fill" }} />
        <Label>{t.tab_clock}</Label>
      </NativeTabs.Trigger>
      <NativeTabs.Trigger name="profile">
        <Icon sf={{ default: "person.crop.circle", selected: "person.crop.circle.fill" }} />
        <Label>{lang === "ru" ? "Профиль" : "Profile"}</Label>
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}

function ClassicTabLayout() {
  const colors = useColors();
  const { t, lang } = useLanguage();
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
          title: t.tab_timer,
          tabBarIcon: ({ color }) => <Feather name="clock" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="timeline"
        options={{
          title: t.tab_timeline,
          tabBarIcon: ({ color }) => <Feather name="grid" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="stats"
        options={{
          title: t.tab_economy,
          tabBarIcon: ({ color }) => <Feather name="bar-chart-2" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="embassies"
        options={{
          title: t.tab_embassies,
          tabBarIcon: ({ color }) => <Feather name="map-pin" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="auctions"
        options={{
          title: t.tab_auction,
          tabBarIcon: ({ color }) => <Feather name="tag" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="tv"
        options={{
          title: t.tab_tv,
          tabBarIcon: ({ color }) => <Feather name="tv" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="chronopedia"
        options={{
          title: t.tab_chronopedia,
          tabBarIcon: ({ color }) => <Feather name="globe" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="timeutils"
        options={{
          title: t.tab_time,
          tabBarIcon: ({ color }) => <Feather name="clock" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="language-clock"
        options={{
          title: t.tab_clock,
          tabBarIcon: ({ color }) => <Feather name="globe" size={22} color={color} />,
        }}
      />
      <Tabs.Screen
        name="profile"
        options={{
          title: lang === "ru" ? "Профиль" : "Profile",
          tabBarIcon: ({ color }) => <Feather name="user" size={22} color={color} />,
        }}
      />
    </Tabs>
  );
}

export default function TabLayout() {
  const { citizen, isLoading } = useCitizen();
  const colors = useColors();
  if (isLoading) {
    return <View style={{ flex: 1, backgroundColor: colors.background, alignItems: "center", justifyContent: "center" }}><ActivityIndicator color={colors.primary} /></View>;
  }
  if (!citizen) return <Slot />;

  return (
    <View style={{ flex: 1 }}>
      <MobileClockBar />
      {isLiquidGlassAvailable() ? <NativeTabLayout /> : <ClassicTabLayout />}
    </View>
  );
}
