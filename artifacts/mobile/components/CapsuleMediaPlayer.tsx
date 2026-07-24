import React, { useState, useEffect, useRef } from "react";
import { View, Text, TouchableOpacity, Platform } from "react-native";
import { Video, Audio, ResizeMode } from "expo-av";
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
 * Replaces Linking.openURL so media plays in-app without leaving the screen.
 */
export function CapsuleMediaPlayer({ mediaUrl, mediaType, baseUrl, colors }: Props) {
  const fullUri = `${baseUrl}${mediaUrl}`;

  // ── Audio state ────────────────────────────────────────────────────────────
  const soundRef = useRef<Audio.Sound | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [audioLoading, setAudioLoading] = useState(false);

  // Cleanup on unmount
  useEffect(() => {
    return () => {
      if (soundRef.current) {
        void soundRef.current.unloadAsync();
      }
    };
  }, []);

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
              // Reset when finished
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

  // ── Video ──────────────────────────────────────────────────────────────────
  if (mediaType === "video") {
    // On web, expo-av Video renders an HTML5 <video> element — no redirect
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

  // ── Audio ──────────────────────────────────────────────────────────────────
  return (
    <TouchableOpacity
      activeOpacity={0.8}
      onPress={() => void toggleAudio()}
      disabled={audioLoading}
      style={{
        flexDirection: "row", alignItems: "center", gap: 12,
        backgroundColor: "#7c3aed11", borderWidth: 1, borderColor: "#7c3aed33",
        borderRadius: 14, padding: 16,
        cursor: Platform.OS === "web" ? ("pointer" as never) : undefined,
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
