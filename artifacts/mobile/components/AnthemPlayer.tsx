import { Audio } from "expo-av";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Feather } from "@expo/vector-icons";
import React, { useEffect, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

const ANTHEM = require("../assets/sounds/timenation-anthem.mp3");
const ENABLED_KEY = "timenation.anthem.enabled";
const VOLUME_KEY = "timenation.anthem.volume.v2";
const DEFAULT_VOLUME = 0.28;

export function AnthemPlayer({ active }: { active: boolean }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const soundRef = useRef<Audio.Sound | null>(null);
  const enabledRef = useRef(true);
  const volumeRef = useRef(DEFAULT_VOLUME);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [volume, setVolume] = useState(DEFAULT_VOLUME);
  const [playing, setPlaying] = useState(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);

  useEffect(() => {
    let mounted = true;
    void AsyncStorage.multiGet([ENABLED_KEY, VOLUME_KEY])
      .then((entries) => {
        if (!mounted) return;
        const savedEnabled = entries[0]?.[1];
        const rawVolume = entries[1]?.[1];
        const savedVolume = rawVolume === null || rawVolume === undefined || rawVolume.trim() === ""
          ? Number.NaN
          : Number(rawVolume);
        const nextEnabled = savedEnabled !== "false";
        const nextVolume = Number.isFinite(savedVolume) && savedVolume >= 0 && savedVolume <= 1
          ? savedVolume
          : DEFAULT_VOLUME;
        enabledRef.current = nextEnabled;
        volumeRef.current = nextVolume;
        setEnabled(nextEnabled);
        setVolume(nextVolume);
      })
      .catch(() => {})
      .finally(() => {
        if (mounted) setPreferencesLoaded(true);
      });
    return () => {
      mounted = false;
    };
  }, []);

  useEffect(() => {
    if (!preferencesLoaded) return;
    void AsyncStorage.multiSet([
      [ENABLED_KEY, String(enabled)],
      [VOLUME_KEY, String(volume)],
    ]).catch(() => {});
  }, [enabled, preferencesLoaded, volume]);

  useEffect(() => {
    if (!active || !preferencesLoaded) {
      setPlaying(false);
      return;
    }

    let cancelled = false;
    const prepareSound = async () => {
      await Audio.setAudioModeAsync({
        playsInSilentModeIOS: true,
        staysActiveInBackground: false,
      });
      const { sound, status } = await Audio.Sound.createAsync(ANTHEM, {
        shouldPlay: enabledRef.current,
        isLooping: true,
        volume: volumeRef.current,
      });
      if (cancelled) {
        await sound.unloadAsync();
        return;
      }
      soundRef.current = sound;
      sound.setOnPlaybackStatusUpdate((status) => {
        if (status.isLoaded) {
          setPlaying(status.isPlaying);
          setAutoplayBlocked(enabledRef.current && !status.isPlaying);
        }
      });
      setPlaying(status.isLoaded && status.isPlaying);
      setAutoplayBlocked(enabledRef.current && !(status.isLoaded && status.isPlaying));
    };

    void prepareSound().catch(() => {
      if (!cancelled) {
        setPlaying(false);
        setAutoplayBlocked(true);
      }
    });

    return () => {
      cancelled = true;
      const sound = soundRef.current;
      soundRef.current = null;
      if (sound) {
        void sound.stopAsync().catch(() => {}).then(() => sound.unloadAsync()).catch(() => {});
      }
    };
  }, [active, preferencesLoaded]);

  useEffect(() => {
    const sound = soundRef.current;
    if (!sound || !active || !preferencesLoaded) return;
    void (enabled ? sound.playAsync() : sound.pauseAsync())
      .then(() => setAutoplayBlocked(false))
      .catch(() => setAutoplayBlocked(true));
  }, [active, enabled, preferencesLoaded]);

  useEffect(() => {
    if (soundRef.current) {
      void soundRef.current.setVolumeAsync(volume).catch(() => {});
    }
  }, [volume]);

  if (!active || !preferencesLoaded) return null;

  const togglePlayback = () => {
    if (enabledRef.current && !playing) {
      const sound = soundRef.current;
      if (sound) {
        void sound.playAsync()
          .then(() => setAutoplayBlocked(false))
          .catch(() => setAutoplayBlocked(true));
      }
      return;
    }
    const nextEnabled = !enabledRef.current;
    enabledRef.current = nextEnabled;
    setEnabled(nextEnabled);
  };
  const adjustVolume = (delta: number) => {
    const nextVolume = Math.max(0, Math.min(1, Math.round((volumeRef.current + delta) * 100) / 100));
    volumeRef.current = nextVolume;
    setVolume(nextVolume);
  };

  return (
    <View pointerEvents="box-none" style={StyleSheet.absoluteFill}>
      <View
        accessibilityLabel="Управление гимном TimeNation"
        style={[
          styles.panel,
          {
            right: 12,
            bottom: insets.bottom + (Platform.OS === "web" ? 92 : 82),
            backgroundColor: colors.card,
            borderColor: colors.border,
          },
        ]}
      >
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={playing ? "Отключить гимн TimeNation" : "Включить гимн TimeNation"}
          testID="anthem-toggle"
          onPress={togglePlayback}
          style={[styles.iconButton, { borderColor: colors.border }]}
        >
          <Feather name={playing ? "pause" : "play"} size={16} color={colors.primary} />
        </Pressable>
        <View style={styles.copy}>
          <Text numberOfLines={1} style={[styles.title, { color: colors.foreground }]}>Гимн TimeNation</Text>
          <Text numberOfLines={1} style={[styles.status, { color: colors.mutedForeground }]}>
            {autoplayBlocked ? "Нажмите ▶ для запуска" : playing ? "Воспроизведение" : "Отключён"}
          </Text>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Уменьшить громкость"
          testID="anthem-volume-down"
          onPress={() => adjustVolume(-0.1)}
          style={styles.volumeButton}
        >
          <Feather name="minus" size={15} color={colors.mutedForeground} />
        </Pressable>
        <Text accessibilityLabel={`Громкость ${Math.round(volume * 100)} процентов`} style={[styles.volumeValue, { color: colors.foreground }]}>
          {Math.round(volume * 100)}%
        </Text>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="Увеличить громкость"
          testID="anthem-volume-up"
          onPress={() => adjustVolume(0.1)}
          style={styles.volumeButton}
        >
          <Feather name="plus" size={15} color={colors.mutedForeground} />
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    position: "absolute",
    zIndex: 100,
    minHeight: 54,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 9,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  iconButton: {
    width: 34,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 10,
  },
  copy: { maxWidth: 116, gap: 2 },
  title: { fontSize: 11, fontWeight: "700" },
  status: { fontSize: 9 },
  volumeButton: {
    width: 28,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
  },
  volumeValue: { minWidth: 31, textAlign: "center", fontSize: 10, fontVariant: ["tabular-nums"] },
});
