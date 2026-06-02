import React from "react";
import { Image, StyleSheet, View } from "react-native";

interface Props {
  size?: number;
}

export function LogoBrand({ size = 36 }: Props) {
  return (
    <View style={[styles.wrapper, { width: size, height: size, borderRadius: size / 2 }]}>
      <Image
        source={require("@/assets/images/logo.jpg")}
        style={{ width: size, height: size, borderRadius: size / 2 }}
        resizeMode="cover"
      />
    </View>
  );
}

const styles = StyleSheet.create({
  wrapper: {
    overflow: "hidden",
  },
});
