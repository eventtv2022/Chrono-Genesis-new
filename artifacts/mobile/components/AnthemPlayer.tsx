import { Audio } from "expo-av";
import AsyncStorage from "@react-native-async-storage/async-storage";
import { Feather } from "@expo/vector-icons";
import React, { useEffect, useRef, useState } from "react";
import { Platform, Pressable, StyleSheet, Text, View } from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";

const ANTHEM = require("../assets/sounds/timenation-anthem.mp3");
const ENGLISH_ANTHEM = require("../assets/sounds/timenation-anthem-en.mp3");
const TRACK_ASSETS = { ru: ANTHEM, en: ENGLISH_ANTHEM } as const;
const TRACKS = [
  { id: "ru", label: "Рус. версия" },
  { id: "en", label: "English version" },
] as const;
type TrackId = (typeof TRACKS)[number]["id"];
const ENABLED_KEY = "timenation.anthem.enabled";
const VOLUME_KEY = "timenation.anthem.volume.v2";
const TRACK_KEY = "timenation.anthem.track";
const DEFAULT_VOLUME = 0.28;

export function AnthemPlayer({ active }: { active: boolean }) {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const soundRef = useRef<Audio.Sound | null>(null);
  const enabledRef = useRef(true);
  const volumeRef = useRef(DEFAULT_VOLUME);
  const [preferencesLoaded, setPreferencesLoaded] = useState(false);
  const [enabled, setEnabled] = useState(true);
  const [track, setTrack] = useState<TrackId>("ru");
  const [volume, setVolume] = useState(DEFAULT_VOLUME);
  const [playing, setPlaying] = useState(false);
  const [autoplayBlocked, setAutoplayBlocked] = useState(false);

  useEffect(() => {
    let mounted = true;
    void AsyncStorage.multiGet([ENABLED_KEY, VOLUME_KEY, TRACK_KEY])
      .then((entries) => {
        if (!mounted) return;
        const savedEnabled = entries[0]?.[1];
        const rawVolume = entries[1]?.[1];
        const savedVolume = rawVolume === null || rawVolume === undefined || rawVolume.trim() === ""
          ? Number.NaN
          : Number(rawVolume);
        const nextEnabled = savedEnabled !== "false";
        const nextTrack: TrackId = entries[2]?.[1] === "en" ? "en" : "ru";
        const nextVolume = Number.isFinite(savedVolume) && savedVolume >= 0 && savedVolume <= 1
          ? savedVolume
          : DEFAULT_VOLUME;
        enabledRef.current = nextEnabled;
        volumeRef.current = nextVolume;
        setEnabled(nextEnabled);
        setTrack(nextTrack);
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
      [TRACK_KEY, track],
    ]).catch(() => {});
  }, [enabled, preferencesLoaded, track, volume]);

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
      const { sound, status } = await Audio.Sound.createAsync(TRACK_ASSETS[track], {
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
  }, [active, preferencesLoaded, track]);

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

  const selectTrack = (nextTrack: TrackId) => {
    if (nextTrack !== track) {
      enabledRef.current = true;
      setEnabled(true);
      setPlaying(false);
      setAutoplayBlocked(false);
      setTrack(nextTrack);
      return;
    }
    if (enabledRef.current && playing) {
      enabledRef.current = false;
      setEnabled(false);
      return;
    }
    enabledRef.current = true;
    setEnabled(true);
    const sound = soundRef.current;
    if (sound) {
      void sound.playAsync()
        .then(() => setAutoplayBlocked(false))
        .catch(() => setAutoplayBlocked(true));
    }
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
        {TRACKS.map(({ id, label }) => {
          const selected = id === track;
          const rowPlaying = selected && playing;
          return (
            <Pressable
              key={id}
              accessibilityRole="button"
              accessibilityLabel={`${label}, ${rowPlaying ? "пауза" : "воспроизвести"}`}
              accessibilityState={{ selected }}
              testID={`anthem-track-${id}`}
              onPress={() => selectTrack(id)}
              style={[
                styles.trackButton,
                {
                  borderColor: selected ? colors.primary : colors.border,
                  backgroundColor: selected ? `${colors.primary}18` : "transparent",
                },
              ]}
            >
              <Feather name={rowPlaying ? "pause" : "play"} size={15} color={selected ? colors.primary : colors.mutedForeground} />
              <Text style={[styles.title, { color: selected ? colors.primary : colors.foreground }]}>{label}</Text>
              {selected && (
                <Text numberOfLines={1} style={[styles.status, { color: colors.mutedForeground }]}>
                  {autoplayBlocked ? "Нажмите для запуска" : playing ? "Играет" : "Пауза"}
                </Text>
              )}
            </Pressable>
          );
        })}
        <View style={styles.volumeRow}>
          <Text style={[styles.status, { color: colors.mutedForeground }]}>Громкость</Text>
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
    </View>
  );
}

const styles = StyleSheet.create({
  panel: {
    position: "absolute",
    zIndex: 100,
    width: 252,
    gap: 5,
    padding: 9,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 14,
    shadowColor: "#000",
    shadowOpacity: 0.2,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 4 },
    elevation: 8,
  },
  trackButton: {
    minHeight: 34,
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
    paddingHorizontal: 8,
    borderWidth: StyleSheet.hairlineWidth,
    borderRadius: 9,
  },
  title: { fontSize: 11, fontWeight: "700" },
  status: { fontSize: 9, marginLeft: "auto" },
  volumeRow: { minHeight: 30, flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 3 },
  volumeButton: {
    width: 28,
    height: 34,
    alignItems: "center",
    justifyContent: "center",
  },
  volumeValue: { minWidth: 31, textAlign: "center", fontSize: 10, fontVariant: ["tabular-nums"] },
});
