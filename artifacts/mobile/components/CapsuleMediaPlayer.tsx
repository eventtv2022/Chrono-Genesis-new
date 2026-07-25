import React, { useState, useEffect, useRef, createElement } from "react";
import { View, Text, TouchableOpacity, Platform } from "react-native";
import { Audio } from "expo-av";
import type { AVPlaybackStatus } from "expo-av";
import { Feather } from "@expo/vector-icons";

interface Props {
  mediaUrl: string;        // relative path, e.g. /uploads/capsules/xxx.mp4
  mediaType: "audio" | "video";
  baseUrl: string;
  colors: { foreground: string; mutedForeground: string };
}

/**
 * Inline audio / video player for Time Capsule modals.
 *
 * On Expo Web: renders native HTML5 <video>/<audio> elements via React.createElement
 * so playback happens in-app without any URL redirect.
 *
 * On native: uses expo-av Audio.Sound for audio; Video component for video.
 */
export function CapsuleMediaPlayer({ mediaUrl, mediaType, baseUrl, colors }: Props) {
  const fullUri = `${baseUrl}${mediaUrl}`;

  // ── Web: native HTML elements ─────────────────────────────────────────────
  if (Platform.OS === "web") {
    if (mediaType === "video") {
      return (
        <View style={{ borderRadius: 14, overflow: "hidden", backgroundColor: "#000" }}>
          {createElement("video", {
            src: fullUri,
            controls: true,
            playsInline: true,
            preload: "metadata",
            style: { width: "100%", maxHeight: 220, display: "block", borderRadius: 14 },
          })}
        </View>
      );
    }
    return (
      <View style={{ borderRadius: 14, overflow: "hidden", backgroundColor: "#7c3aed11", borderWidth: 1, borderColor: "#7c3aed33", padding: 12 }}>
        {createElement("audio", {
          src: fullUri,
          controls: true,
          preload: "metadata",
          style: { width: "100%", display: "block" },
        })}
      </View>
    );
  }

  // ── Native: expo-av ───────────────────────────────────────────────────────
  return <NativeAudioPlayer fullUri={fullUri} mediaType={mediaType} colors={colors} />;
}

// Separate component so hooks only run on native (web branch returns early above)
function NativeAudioPlayer({
  fullUri,
  mediaType,
  colors,
}: {
  fullUri: string;
  mediaType: "audio" | "video";
  colors: { foreground: string; mutedForeground: string };
}) {
  const soundRef = useRef<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioLoading, setAudioLoading] = useState(false);

  useEffect(() => {
    return () => {
      if (soundRef.current) void soundRef.current.unloadAsync();
    };
  }, []);

  if (mediaType === "video") {
    // Lazy import to avoid pulling expo-av Video into web bundle
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const { Video, ResizeMode } = require("expo-av") as typeof import("expo-av");
    return (
      <Video
        source={{ uri: fullUri }}
        style={{ width: "100%", height: 200, borderRadius: 14, backgroundColor: "#000" }}
        useNativeControls
        resizeMode={ResizeMode.CONTAIN}
        shouldPlay={false}
      />
    );
  }

  const toggleAudio = async () => {
    try {
      if (!soundRef.current) {
        setAudioLoading(true);
        await Audio.setAudioModeAsync({ playsInSilentModeIOS: true, staysActiveInBackground: false });
        const { sound } = await Audio.Sound.createAsync(
          { uri: fullUri },
          { shouldPlay: true },
          (status: AVPlaybackStatus) => {
            if (status.isLoaded) {
              setIsPlaying(status.isPlaying);
              if (status.didJustFinish) {
                void sound.setPositionAsync(0);
                setIsPlaying(false);
              }
            }
          }
        );
        soundRef.current = sound;
        setIsPlaying(true);
        setAudioLoading(false);
      } else if (isPlaying) {
        await soundRef.current.pauseAsync();
      } else {
        await soundRef.current.playAsync();
      }
    } catch {
      setAudioLoading(false);
    }
  };

  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={() => void toggleAudio()}
      disabled={audioLoading}
      style={{
        flexDirection: "row", alignItems: "center", gap: 12,
        backgroundColor: "#7c3aed11", borderWidth: 1, borderColor: "#7c3aed33",
        borderRadius: 14, padding: 16,
      }}
    >
      <Text style={{ fontSize: 28 }}>🎤</Text>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: 14, fontWeight: "700", color: colors.foreground }}>Аудиопослание</Text>
        <Text style={{ fontSize: 12, color: colors.mutedForeground, marginTop: 2 }}>
          {audioLoading ? "Загружается…" : isPlaying ? "Воспроизводится…" : "Нажмите для воспроизведения"}
        </Text>
      </View>
      <Feather
        name={audioLoading ? "loader" : isPlaying ? "pause-circle" : "play-circle"}
        size={26}
        color="#7c3aed"
      />
    </TouchableOpacity>
  );
}
