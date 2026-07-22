import React from "react";
import {
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { RTCView } from "react-native-webrtc";
import type { WebRTCStream } from "@/lib/webrtcService";

const C = {
  bg: "#0A0A0F",
  border: "#1E1E2E",
  primary: "#C9A84C",
  fg: "#E8E8F0",
  muted: "#6B6B7E",
  danger: "#E05555",
  accept: "#3CB878",
};

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

function fmtDuration(sec: number): string {
  const m = Math.floor(sec / 60);
  const s = sec % 60;
  return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
}

const STATUS_LABEL: Record<CallState, string> = {
  idle: "",
  calling: "Вызов...",
  incoming: "Входящий вызов",
  connecting: "Соединение...",
  connected: "",
};

export default function CallScreen({
  visible, peerName, callType, callState, duration,
  localStream, remoteStream, isMuted, isCameraOn,
  onAccept, onReject, onMute, onCamera, onEnd,
}: Props) {
  const isVideo = callType === "video";
  const isIncoming = callState === "incoming";
  const statusLabel = callState === "connected" ? fmtDuration(duration) : STATUS_LABEL[callState];

  return (
    <Modal visible={visible} animationType="slide" statusBarTranslucent>
      <View style={s.container}>

        {/* Remote video or avatar background */}
        {isVideo && remoteStream ? (
          <RTCView
            streamURL={remoteStream.toURL()}
            style={s.remoteVideo}
            objectFit="cover"
          />
        ) : (
          <View style={s.audioBg}>
            <View style={s.bigAvatar}>
              <Text style={s.bigAvatarText}>{peerName[0]?.toUpperCase() ?? "?"}</Text>
            </View>
          </View>
        )}

        {/* Gradient overlay */}
        <View style={s.topGradient} />

        {/* Status info */}
        <View style={s.infoOverlay}>
          <Text style={s.peerName}>{peerName}</Text>
          <Text style={s.statusText}>{statusLabel}</Text>
          <View style={s.callTypeBadge}>
            <Feather name={isVideo ? "video" : "phone"} size={12} color={C.primary} />
            <Text style={s.callTypeText}>{isVideo ? "Видеозвонок" : "Аудиозвонок"}</Text>
          </View>
        </View>

        {/* Local video overlay */}
        {isVideo && localStream && !isIncoming && (
          <View style={s.localVideoWrap}>
            <RTCView
              streamURL={localStream.toURL()}
              style={s.localVideo}
              objectFit="cover"
              zOrder={1}
            />
          </View>
        )}

        {/* Controls */}
        <View style={s.bottomSection}>
          {isIncoming ? (
            <View style={s.incomingRow}>
              <View style={s.incomingBtnGroup}>
                <TouchableOpacity style={s.rejectBtn} onPress={onReject} activeOpacity={0.75}>
                  <Feather name="phone-off" size={28} color="#fff" />
                </TouchableOpacity>
                <Text style={s.incomingBtnLabel}>Отклонить</Text>
              </View>
              <View style={s.incomingBtnGroup}>
                <TouchableOpacity style={s.acceptBtn} onPress={onAccept} activeOpacity={0.75}>
                  <Feather name="phone" size={28} color="#fff" />
                </TouchableOpacity>
                <Text style={s.incomingBtnLabel}>Принять</Text>
              </View>
            </View>
          ) : (
            <>
              <View style={s.ctrlRow}>
                <TouchableOpacity style={[s.ctrlBtn, isMuted && s.ctrlBtnOff]} onPress={onMute} activeOpacity={0.75}>
                  <Feather name={isMuted ? "mic-off" : "mic"} size={22} color={isMuted ? C.danger : C.fg} />
                  <Text style={s.ctrlLabel}>{isMuted ? "Микрофон\nвыключен" : "Микрофон"}</Text>
                </TouchableOpacity>

                {isVideo && (
                  <TouchableOpacity style={[s.ctrlBtn, !isCameraOn && s.ctrlBtnOff]} onPress={onCamera} activeOpacity={0.75}>
                    <Feather name={isCameraOn ? "video" : "video-off"} size={22} color={!isCameraOn ? C.danger : C.fg} />
                    <Text style={s.ctrlLabel}>{isCameraOn ? "Камера" : "Камера\nвыключена"}</Text>
                  </TouchableOpacity>
                )}
              </View>

              <View style={s.endRow}>
                <TouchableOpacity style={s.endBtn} onPress={onEnd} activeOpacity={0.75}>
                  <Feather name="phone-off" size={28} color="#fff" />
                </TouchableOpacity>
                <Text style={s.endLabel}>Завершить</Text>
              </View>
            </>
          )}
        </View>
      </View>
    </Modal>
  );
}

const s = StyleSheet.create({
  container: { flex: 1, backgroundColor: C.bg },
  audioBg: {
    ...StyleSheet.absoluteFillObject,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#0D0D18",
  },
  remoteVideo: { ...StyleSheet.absoluteFillObject },
  bigAvatar: {
    width: 120, height: 120, borderRadius: 60,
    backgroundColor: "rgba(201,168,76,0.15)",
    borderWidth: 2, borderColor: "rgba(201,168,76,0.4)",
    alignItems: "center", justifyContent: "center",
  },
  bigAvatarText: { fontSize: 52, fontFamily: "Inter_700Bold", color: C.primary },
  topGradient: {
    position: "absolute", top: 0, left: 0, right: 0, height: 200,
    backgroundColor: "rgba(10,10,15,0.6)",
  },
  infoOverlay: {
    position: "absolute", top: 80, left: 0, right: 0,
    alignItems: "center", paddingHorizontal: 24,
  },
  peerName: { fontSize: 28, fontFamily: "Inter_700Bold", color: C.fg, textAlign: "center" },
  statusText: { fontSize: 16, fontFamily: "Inter_400Regular", color: C.muted, marginTop: 8, fontVariant: ["tabular-nums"] },
  callTypeBadge: {
    flexDirection: "row", alignItems: "center", gap: 6, marginTop: 10,
    backgroundColor: "rgba(201,168,76,0.12)", borderWidth: 1,
    borderColor: "rgba(201,168,76,0.3)", borderRadius: 20,
    paddingHorizontal: 12, paddingVertical: 4,
  },
  callTypeText: { fontSize: 12, fontFamily: "Inter_400Regular", color: C.primary },
  localVideoWrap: {
    position: "absolute", top: 100, right: 20,
    width: 100, height: 150, borderRadius: 12,
    overflow: "hidden", borderWidth: 2, borderColor: C.border, elevation: 8,
  },
  localVideo: { flex: 1 },
  bottomSection: { position: "absolute", bottom: 60, left: 0, right: 0, paddingHorizontal: 24 },
  incomingRow: { flexDirection: "row", justifyContent: "space-around", alignItems: "center", marginTop: 20 },
  incomingBtnGroup: { alignItems: "center", gap: 12 },
  incomingBtnLabel: { fontSize: 14, fontFamily: "Inter_400Regular", color: C.muted },
  acceptBtn: { width: 72, height: 72, borderRadius: 36, backgroundColor: C.accept, alignItems: "center", justifyContent: "center", elevation: 6 },
  rejectBtn: { width: 72, height: 72, borderRadius: 36, backgroundColor: C.danger, alignItems: "center", justifyContent: "center", elevation: 6 },
  ctrlRow: { flexDirection: "row", justifyContent: "center", gap: 24, marginBottom: 28 },
  ctrlBtn: { alignItems: "center", gap: 8, backgroundColor: "rgba(255,255,255,0.08)", borderRadius: 16, padding: 16, minWidth: 80 },
  ctrlBtnOff: { backgroundColor: "rgba(224,85,85,0.15)" },
  ctrlLabel: { fontSize: 11, fontFamily: "Inter_400Regular", color: C.muted, textAlign: "center" },
  endRow: { alignItems: "center", gap: 10 },
  endBtn: { width: 72, height: 72, borderRadius: 36, backgroundColor: C.danger, alignItems: "center", justifyContent: "center", elevation: 6 },
  endLabel: { fontSize: 13, fontFamily: "Inter_400Regular", color: C.muted },
});
