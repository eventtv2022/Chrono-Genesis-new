import React from "react";
import {
  Modal,
  View,
  Text,
  TouchableOpacity,
  StyleSheet,
} from "react-native";
import { useColors } from "@/hooks/useColors";

interface Props {
  visible: boolean;
  onClose: () => void;
  onConfirm: () => void;
  icon: string;
  title: string;
  explanation: string;
  ctaLabel: string;
}

export function ContextualGuideModal({
  visible,
  onClose,
  onConfirm,
  icon,
  title,
  explanation,
  ctaLabel,
}: Props) {
  const colors = useColors();

  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <TouchableOpacity
        style={styles.overlay}
        activeOpacity={1}
        onPress={onClose}
      >
        <TouchableOpacity activeOpacity={1} onPress={() => {}}>
          <View
            style={[
              styles.card,
              { backgroundColor: colors.card, borderColor: colors.border },
            ]}
          >
            <Text style={styles.icon}>{icon}</Text>
            <Text style={[styles.title, { color: colors.foreground }]}>
              {title}
            </Text>
            <Text style={[styles.explanation, { color: colors.mutedForeground }]}>
              {explanation}
            </Text>
            <TouchableOpacity
              style={[styles.confirmBtn, { backgroundColor: colors.primary }]}
              onPress={onConfirm}
              activeOpacity={0.8}
            >
              <Text
                style={[
                  styles.confirmText,
                  { color: colors.primaryForeground },
                ]}
              >
                {ctaLabel}
              </Text>
            </TouchableOpacity>
            <TouchableOpacity
              onPress={onClose}
              style={styles.skipBtn}
              activeOpacity={0.7}
            >
              <Text style={[styles.skipText, { color: colors.mutedForeground }]}>
                Закрыть
              </Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </TouchableOpacity>
    </Modal>
  );
}

const styles = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.65)",
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
  },
  card: {
    width: 320,
    borderRadius: 16,
    borderWidth: 1,
    padding: 24,
    gap: 12,
    alignItems: "center",
  },
  icon: { fontSize: 40, textAlign: "center" },
  title: {
    fontSize: 17,
    fontFamily: "Inter_700Bold",
    textAlign: "center",
    letterSpacing: 0.2,
  },
  explanation: {
    fontSize: 14,
    fontFamily: "Inter_400Regular",
    lineHeight: 22,
    textAlign: "center",
  },
  confirmBtn: {
    width: "100%",
    borderRadius: 12,
    paddingVertical: 14,
    alignItems: "center",
    marginTop: 4,
  },
  confirmText: {
    fontSize: 14,
    fontFamily: "Inter_700Bold",
    letterSpacing: 0.5,
  },
  skipBtn: { alignItems: "center", paddingVertical: 6 },
  skipText: { fontSize: 13, fontFamily: "Inter_400Regular" },
});
