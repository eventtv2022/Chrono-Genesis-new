/**
 * Chat attachment UI helpers:
 *   <AttachmentPreview> — strip above input bar (pending files before send)
 *   <AttachmentBubble>  — renders one attachment inside a message bubble
 */
import React, { useCallback, useRef, useState } from "react";
import {
  ActivityIndicator,
  Image,
  Linking,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Platform,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { Audio } from "expo-av";
import { useCitizen } from "@/context/CitizenContext";
import { getBaseUrl } from "@/lib/api";

export interface AttachmentMeta {
  url: string;
  type: "image" | "video" | "audio" | "document";
  name: string;
  size: number;
}

const C = {
  bg: "#0A0A0F", surface: "#12121A", border: "#1E1E2E",
  primary: "#C9A84C", fg: "#E8E8F0", muted: "#6B6B7E",
};

function fmtSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

// ── Pending attachment preview (before sending) ─────────────────────────────
interface PendingFile {
  uri: string;
  name: string;
  size: number;
  mimeType: string;
}

interface AttachmentPreviewProps {
  files: PendingFile[];
  onRemove: (index: number) => void;
}

export function AttachmentPreviewStrip({ files, onRemove }: AttachmentPreviewProps) {
  if (files.length === 0) return null;
  return (
    <View style={ps.strip}>
      {files.map((f, i) => {
        const isImage = f.mimeType.startsWith("image/");
        const isAudio = f.mimeType.startsWith("audio/");
        return (
          <View key={i} style={ps.card}>
            {isImage ? (
              <Image source={{ uri: f.uri }} style={ps.thumb} resizeMode="cover" />
            ) : (
              <View style={ps.iconBox}>
                <Feather name={isAudio ? "music" : "file"} size={20} color={C.primary} />
              </View>
            )}
            <View style={ps.info}>
              <Text style={ps.name} numberOfLines={1}>{f.name}</Text>
              <Text style={ps.size}>{fmtSize(f.size)}</Text>
            </View>
            <TouchableOpacity onPress={() => onRemove(i)} style={ps.remove} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Feather name="x" size={14} color={C.muted} />
            </TouchableOpacity>
          </View>
        );
      })}
    </View>
  );
}

const ps = StyleSheet.create({
  strip: { flexDirection: "row", flexWrap: "wrap", gap: 8, paddingHorizontal: 12, paddingVertical: 8, borderTopWidth: 1, borderTopColor: "#1E1E2E" },
  card: { flexDirection: "row", alignItems: "center", backgroundColor: "#1A1E30", borderRadius: 10, padding: 8, maxWidth: 220, gap: 8 },
  thumb: { width: 44, height: 44, borderRadius: 6 },
  iconBox: { width: 44, height: 44, borderRadius: 6, backgroundColor: "#12121A", alignItems: "center", justifyContent: "center" },
  info: { flex: 1 },
  name: { color: "#E8E8F0", fontSize: 12, fontFamily: "Inter_500Medium" },
  size: { color: "#6B6B7E", fontSize: 11 },
  remove: { padding: 2 },
});

// ── Attachment bubble (inside message) ─────────────────────────────────────
interface AttachmentBubbleProps {
  att: AttachmentMeta;
  isMine: boolean;
}

// Singleton audio sound tracker — only one plays at a time
let globalSound: Audio.Sound | null = null;
let globalSoundUrl = "";

export function AttachmentBubble({ att, isMine }: AttachmentBubbleProps) {
  const { authToken } = useCitizen();
  const base = getBaseUrl();
  const [playing, setPlaying] = useState(false);
  const [loading, setLoading] = useState(false);

  const resolveUrl = useCallback((url: string) => {
    const full = url.startsWith("http") ? url : `${base}${url}`;
    if (Platform.OS === "web" && authToken) {
      return `${full}${full.includes("?") ? "&" : "?"}token=${encodeURIComponent(authToken)}`;
    }
    return full;
  }, [base, authToken]);

  // ── Audio player ───────────────────────────────────────────────────────
  const toggleAudio = useCallback(async () => {
    if (loading) return;
    const targetUrl = resolveUrl(att.url);

    if (playing) {
      if (globalSound) {
        await globalSound.pauseAsync().catch(() => {});
        setPlaying(false);
      }
      return;
    }

    setLoading(true);
    try {
      // Stop any currently playing sound
      if (globalSound) {
        await globalSound.stopAsync().catch(() => {});
        await globalSound.unloadAsync().catch(() => {});
        globalSound = null;
      }

      if ((Platform.OS as string) === "web") {
        // On web, just open the file (audio element would need DOM)
        await Linking.openURL(targetUrl);
        setLoading(false);
        return;
      }

      await Audio.setAudioModeAsync({ playsInSilentModeIOS: true });
      const { sound } = await Audio.Sound.createAsync(
        { uri: targetUrl, headers: authToken ? { Authorization: `Bearer ${authToken}` } : {} },
        { shouldPlay: true },
        (status) => {
          if (status.isLoaded && status.didJustFinish) {
            setPlaying(false);
            globalSound = null;
          }
        }
      );
      globalSound = sound;
      globalSoundUrl = att.url;
      setPlaying(true);
    } catch (e) {
      console.warn("[AttachmentBubble] audio error", e);
    } finally {
      setLoading(false);
    }
  }, [att.url, loading, playing, resolveUrl, authToken]);

  const ac = isMine ? ab.cardMine : ab.cardTheirs;

  if (att.type === "image") {
    const imgUrl = resolveUrl(att.url);
    const imgSource: { uri: string; headers?: { [key: string]: string } } = { uri: imgUrl };
    if (Platform.OS !== "web" && authToken) imgSource.headers = { Authorization: `Bearer ${authToken}` };
    return (
      <TouchableOpacity onPress={() => Linking.openURL(resolveUrl(att.url))} activeOpacity={0.85}>
        <Image source={imgSource} style={ab.image} resizeMode="cover" />
      </TouchableOpacity>
    );
  }

  if (att.type === "audio") {
    return (
      <TouchableOpacity style={[ab.card, ac]} onPress={toggleAudio} activeOpacity={0.8}>
        {loading
          ? <ActivityIndicator size="small" color={C.primary} />
          : <Feather name={playing ? "pause" : "play"} size={18} color={C.primary} />}
        <View style={{ flex: 1 }}>
          <Text style={ab.attName} numberOfLines={1}>{att.name}</Text>
          <Text style={ab.attSize}>{fmtSize(att.size)}</Text>
        </View>
        <Feather name="music" size={14} color={C.muted} />
      </TouchableOpacity>
    );
  }

  // document / video → tap to open/download
  const icon = att.type === "video" ? "video" : "file";
  return (
    <TouchableOpacity style={[ab.card, ac]} onPress={() => Linking.openURL(resolveUrl(att.url))} activeOpacity={0.8}>
      <Feather name={icon} size={18} color={C.primary} />
      <View style={{ flex: 1 }}>
        <Text style={ab.attName} numberOfLines={1}>{att.name}</Text>
        <Text style={ab.attSize}>{fmtSize(att.size)}</Text>
      </View>
      <Feather name="download" size={14} color={C.muted} />
    </TouchableOpacity>
  );
}

const ab = StyleSheet.create({
  image: { width: 220, height: 160, borderRadius: 10, marginBottom: 4 },
  card: { flexDirection: "row", alignItems: "center", borderRadius: 10, padding: 10, gap: 10, marginBottom: 4, minWidth: 200 },
  cardMine: { backgroundColor: "#1C3526" },
  cardTheirs: { backgroundColor: "#252A44" },
  attName: { color: "#E8E8F0", fontSize: 13, fontFamily: "Inter_500Medium" },
  attSize: { color: "#6B6B7E", fontSize: 11 },
});
