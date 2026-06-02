import React, { useEffect, useRef } from "react";
import { Animated, StyleSheet, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";

interface Props {
  active: boolean;
  size?: number;
}

export function AnimatedHourglass({ active, size = 32 }: Props) {
  const colors = useColors();
  const spin = useRef(new Animated.Value(0)).current;
  const glow = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (active) {
      const spinLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(spin, { toValue: 1, duration: 1600, useNativeDriver: true }),
          Animated.timing(spin, { toValue: 1, duration: 300, useNativeDriver: true }),
          Animated.timing(spin, { toValue: 2, duration: 1600, useNativeDriver: true }),
          Animated.timing(spin, { toValue: 2, duration: 300, useNativeDriver: true }),
        ])
      );
      const glowLoop = Animated.loop(
        Animated.sequence([
          Animated.timing(glow, { toValue: 1, duration: 900, useNativeDriver: true }),
          Animated.timing(glow, { toValue: 0, duration: 900, useNativeDriver: true }),
        ])
      );
      spinLoop.start();
      glowLoop.start();
      return () => {
        spinLoop.stop();
        glowLoop.stop();
        spin.setValue(0);
        glow.setValue(0);
      };
    }
  }, [active, spin, glow]);

  const rotate = spin.interpolate({
    inputRange: [0, 1, 1, 2],
    outputRange: ["0deg", "180deg", "180deg", "360deg"],
  });

  const glowOpacity = glow.interpolate({
    inputRange: [0, 1],
    outputRange: [0.4, 1.0],
  });

  if (!active) {
    return (
      <View style={[styles.wrapper, { width: size + 16, height: size + 16 }]}>
        <Feather name="clock" size={size} color={colors.mutedForeground} />
      </View>
    );
  }

  return (
    <Animated.View
      style={[
        styles.wrapper,
        styles.activeRing,
        {
          width: size + 16,
          height: size + 16,
          borderRadius: (size + 16) / 2,
          borderColor: colors.primary,
          opacity: glowOpacity,
        },
      ]}
    >
      <Animated.View style={{ transform: [{ rotate }] }}>
        <Feather name="clock" size={size} color={colors.primary} />
      </Animated.View>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    alignItems: "center",
    justifyContent: "center",
  },
  activeRing: {
    borderWidth: 2,
    backgroundColor: "rgba(201,168,76,0.12)",
  },
});
