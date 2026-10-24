import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";
import Svg, { ClipPath, Defs, Path, Rect } from "react-native-svg";
import { useColors } from "@/hooks/useColors";

interface Props {
  elapsedSeconds: number;
  running: boolean;
  size?: number;
}

export function MinuteHourglass({ elapsedSeconds, running, size = 56 }: Props) {
  const colors = useColors();
  const rotation = useRef(new Animated.Value(0)).current;
  const previousMinute = useRef(Math.floor(elapsedSeconds / 60));
  const minuteIndex = Math.floor(elapsedSeconds / 60);
  const minuteProgress = (elapsedSeconds % 60) / 60;
  const topSand = 1 - minuteProgress;
  const bottomSand = minuteProgress;

  useEffect(() => {
    if (minuteIndex > previousMinute.current) {
      rotation.setValue(0);
      Animated.timing(rotation, {
        toValue: 1,
        duration: 800,
        useNativeDriver: true,
      }).start(({ finished }) => {
        if (finished) rotation.setValue(0);
      });
    }
    previousMinute.current = minuteIndex;
  }, [minuteIndex, rotation]);

  const rotate = rotation.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });
  const sandColor = running ? colors.primary : colors.mutedForeground;

  return (
    <View
      accessible
      accessibilityRole="image"
      accessibilityLabel="Песочные часы: песок пересыпается каждую минуту"
      style={[styles.container, { width: size, height: size * 1.34 }]}
    >
      <Animated.View style={{ transform: [{ rotate }] }}>
        <Svg width={size} height={size * 1.34} viewBox="0 0 48 64">
          <Defs>
            <ClipPath id="minute-hourglass-top">
              <Path d="M14 9H34L25 31H23Z" />
            </ClipPath>
            <ClipPath id="minute-hourglass-bottom">
              <Path d="M23 33H25L34 55H14Z" />
            </ClipPath>
          </Defs>
          <Rect
            x="10"
            y={31 - 22 * topSand}
            width="28"
            height={22 * topSand}
            fill={sandColor}
            clipPath="url(#minute-hourglass-top)"
            opacity={running ? 0.9 : 0.45}
          />
          <Rect
            x="10"
            y={55 - 22 * bottomSand}
            width="28"
            height={22 * bottomSand}
            fill={sandColor}
            clipPath="url(#minute-hourglass-bottom)"
            opacity={running ? 0.9 : 0.45}
          />
          {running && (
            <Path d="M24 29v6" stroke={colors.primary} strokeWidth="1.5" strokeDasharray="1 1" />
          )}
          <Path
            d="M12 7h24M12 57h24M14 9c0 9 8 14 10 22-2 8-10 15-10 24M34 9c0 9-8 14-10 22 2 8 10 15 10 24"
            fill="none"
            stroke={running ? colors.primary : colors.mutedForeground}
            strokeWidth="2.5"
            strokeLinecap="round"
            strokeLinejoin="round"
            opacity={0.85}
          />
        </Svg>
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    alignItems: "center",
    justifyContent: "center",
    flexShrink: 0,
  },
});
