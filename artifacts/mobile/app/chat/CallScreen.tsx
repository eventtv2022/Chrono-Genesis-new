// Web platform stub — RTCView and react-native-webrtc are not available in browsers.
// Metro bundler automatically uses CallScreen.native.tsx for iOS/Android builds.
import React from "react";
import { Modal, StyleSheet, Text, TouchableOpacity, View } from "react-native";
import type { WebRTCStream } from "@/lib/webrtcService";

export type CallState = "idle" | "calling" | "incoming" | "connecting" | "connected";

interface Props {
  visible: boolean;
  peerName: string;
  callType: "audio" | "video";
  callState: CallState;
  duration: number;
  localStream: WebRTCStream | null;
  remoteStream: WebRTCStream | null;
  isMuted: boolean;
  isCameraOn: boolean;
  onAccept: () => void;
  onReject: () => void;
  onMute: () => void;
  onCamera: () => void;
  onEnd: () => void;
}

export default function CallScreen({ visible, onEnd }: Props) {
  return (
    <Modal visible={visible} animationType="fade" transparent>
      <View style={s.overlay}>
        <View style={s.card}>
          <Text style={s.icon}>📵</Text>
          <Text style={s.title}>Звонки недоступны</Text>
          <Text style={s.msg}>
            Звонки поддерживаются только в мобильном приложении (Android / iOS)
          </Text>
          <TouchableOpacity style={s.btn} onPress={onEnd} activeOpacity={0.8}>
            <Text style={s.btnText}>Закрыть</Text>
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  overlay: {
    flex: 1,
    backgroundColor: "rgba(0,0,0,0.75)",
    alignItems: "center",
    justifyContent: "center",
  },
  card: {
    backgroundColor: "#12121A",
    borderRadius: 20,
    padding: 32,
    maxWidth: 320,
    width: "90%",
    alignItems: "center",
    gap: 14,
    borderWidth: 1,
    borderColor: "#1E1E2E",
  },
  icon: { fontSize: 40 },
  title: { fontSize: 18, fontWeight: "700", color: "#E8E8F0" },
  msg: { fontSize: 14, color: "#6B6B7E", textAlign: "center", lineHeight: 22 },
  btn: {
    marginTop: 6,
    backgroundColor: "rgba(201,168,76,0.15)",
    borderRadius: 12,
    paddingHorizontal: 28,
    paddingVertical: 12,
    borderWidth: 1,
    borderColor: "rgba(201,168,76,0.35)",
  },
  btnText: { color: "#C9A84C", fontSize: 15, fontWeight: "600" },
});
