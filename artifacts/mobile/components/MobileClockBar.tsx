import { useEffect, useState } from "react";
import { View, Text, StyleSheet } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { getBaseUrl } from "@/lib/api";

const BASE_URL = getBaseUrl();

export function MobileClockBar() {
  const colors = useColors();
  const insets = useSafeAreaInsets();

  const [localTime, setLocalTime] = useState("--:--:--");
  const [utcTime, setUtcTime] = useState("--:--:--");
  const [synced, setSynced] = useState(false);
  const [offset, setOffset] = useState(0);

  useEffect(() => {
    const sync = async () => {
      try {
        const before = Date.now();
        const res = await fetch(`${BASE_URL}/api/system/time`);
        const after = Date.now();
        if (res.ok) {
          const data = (await res.json()) as { ts: number };
          const rtt = (after - before) / 2;
          setOffset(data.ts - after + rtt);
          setSynced(true);
        }
      } catch {
        setSynced(false);
      }
    };

    void sync();
    const syncTimer = setInterval(sync, 60_000);

    const tick = setInterval(() => {
      const nowLocal = new Date();
      const nowServer = new Date(Date.now() + offset);
      const pad = (n: number) => String(n).padStart(2, "0");
      setLocalTime(`${pad(nowLocal.getHours())}:${pad(nowLocal.getMinutes())}:${pad(nowLocal.getSeconds())}`);
      setUtcTime(nowServer.toISOString().slice(11, 19));
    }, 1000);

    return () => {
      clearInterval(tick);
      clearInterval(syncTimer);
    };
  }, [offset]);

  return (
    <View
      style={[
        styles.bar,
        {
          paddingTop: insets.top + 4,
          backgroundColor: colors.card,
          borderBottomColor: colors.border,
        },
      ]}
    >
      <View style={styles.inner}>
        {/* Local time */}
        <View style={styles.timeBlock}>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>LOCAL</Text>
          <Text style={[styles.time, { color: colors.foreground }]}>{localTime}</Text>
        </View>

        {/* Sync dot */}
        <View style={styles.dotWrap}>
          <View
            style={[
              styles.dot,
              {
                backgroundColor: synced ? "#22c55e" : "#f59e0b",
                shadowColor: synced ? "#22c55e" : "#f59e0b",
              },
            ]}
          />
        </View>

        {/* UTC time */}
        <View style={[styles.timeBlock, styles.timeRight]}>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>UTC</Text>
          <Text style={[styles.time, { color: colors.mutedForeground }]}>{utcTime}</Text>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    borderBottomWidth: StyleSheet.hairlineWidth,
    paddingBottom: 6,
    zIndex: 10,
  },
  inner: {
    flexDirection: "row",
    alignItems: "center",
    paddingHorizontal: 16,
  },
  timeBlock: {
    flex: 1,
  },
  timeRight: {
    alignItems: "flex-end",
  },
  label: {
    fontSize: 9,
    fontFamily: "Inter_400Regular",
    letterSpacing: 1.5,
    marginBottom: 1,
  },
  time: {
    fontSize: 18,
    fontFamily: "Inter_700Bold",
    letterSpacing: -0.5,
    fontVariant: ["tabular-nums"],
  },
  dotWrap: {
    paddingHorizontal: 12,
    alignItems: "center",
  },
  dot: {
    width: 7,
    height: 7,
    borderRadius: 4,
    shadowOpacity: 0.7,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 0 },
    elevation: 3,
  },
});
