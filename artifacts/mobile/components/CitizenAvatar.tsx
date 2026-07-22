import React, { useEffect, useRef, useState } from "react";
import {
  View,
  Text,
  Image,
  TouchableOpacity,
  ActivityIndicator,
  StyleSheet,
  Alert,
  Platform,
} from "react-native";
import { getBaseUrl } from "@/lib/api";
import { getStoredAuthHeaders, getStoredToken } from "@/lib/authStorage";

interface Props {
  citizenId: number;
  name: string;
  hasPhoto: boolean;
  size?: number;
  rankColor?: string;
  editable?: boolean;
  onPhotoUpdated?: () => void;
  style?: object;
}

export function CitizenAvatar({
  citizenId,
  name,
  hasPhoto,
  size = 36,
  rankColor = "#C9A84C",
  editable = false,
  onPhotoUpdated,
  style,
}: Props) {
  const radius = size / 2;
  const fontSize = Math.round(size * 0.44);

  // imageUrl is set once token is loaded; null = still loading
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageError, setImageError] = useState(false);
  const [uploading, setUploading] = useState(false);
  // version counter — bumped after upload to bust cache
  const [version, setVersion] = useState(0);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);

  // Build the photo URL whenever citizenId / hasPhoto / version changes
  useEffect(() => {
    setImageError(false);
    if (!hasPhoto) { setImageUrl(null); return; }

    void (async () => {
      const base = getBaseUrl();
      if (Platform.OS === "web") {
        // Browsers can't set custom headers on <img> — pass token in query string
        const token = await getStoredToken();
        if (!token) { setImageUrl(null); return; }
        const url = `${base}/api/citizens/${citizenId}/photo?token=${encodeURIComponent(token)}&v=${version}`;
        if (mountedRef.current) setImageUrl(url);
      } else {
        // Native: React Native Image supports source.headers
        const hdrs = await getStoredAuthHeaders();
        if (!hdrs.Authorization) { setImageUrl(null); return; }
        // Encode auth headers into a sentinel URL; handled below in Image source
        if (mountedRef.current) setImageUrl(`${base}/api/citizens/${citizenId}/photo?v=${version}`);
      }
    })();
  }, [hasPhoto, citizenId, version]);

  // Auth headers for native Image source (not used on web)
  const [nativeHeaders, setNativeHeaders] = useState<Record<string, string>>({});
  useEffect(() => {
    if (Platform.OS !== "web" && hasPhoto) {
      getStoredAuthHeaders().then((h) => {
        if (mountedRef.current) setNativeHeaders(h);
      });
    }
  }, [hasPhoto, citizenId]);

  const showImage = hasPhoto && !imageError && imageUrl !== null;

  // ── Upload handler ────────────────────────────────────────────────────────
  async function pickAndUpload() {
    if (!editable) return;
    try {
      const ImagePicker = await import("expo-image-picker");
      const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
      if (!perm.granted) {
        Alert.alert("Доступ запрещён", "Разрешите доступ к галерее в настройках.");
        return;
      }
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: ImagePicker.MediaTypeOptions.Images,
        allowsEditing: true,
        aspect: [1, 1],
        quality: 0.85,
      });
      if (result.canceled || !result.assets?.[0]) return;

      setUploading(true);
      const asset = result.assets[0];
      const authHeaders = await getStoredAuthHeaders();

      const form = new FormData();
      if (Platform.OS === "web") {
        // Web: fetch the blob from URI and append as File
        const response = await fetch(asset.uri ?? "");
        const blob = await response.blob();
        form.append("photo", blob, "photo.jpg");
      } else {
        const uriParts = (asset.uri ?? "").split(".");
        const ext = uriParts[uriParts.length - 1] ?? "jpg";
        // @ts-expect-error — RN FormData accepts { uri, name, type }
        form.append("photo", { uri: asset.uri, name: `photo.${ext}`, type: `image/${ext}` });
      }

      const res = await fetch(`${getBaseUrl()}/api/citizens/me/photo`, {
        method: "POST",
        headers: authHeaders,
        body: form,
      });

      if (!res.ok) {
        const err = (await res.json().catch(() => ({}))) as { error?: string };
        Alert.alert("Ошибка", err.error ?? "Не удалось загрузить фото");
      } else {
        setImageError(false);
        setVersion((v) => v + 1); // bust cache → re-fetch photo
        onPhotoUpdated?.();
      }
    } catch {
      Alert.alert("Ошибка", "Не удалось загрузить фото");
    } finally {
      if (mountedRef.current) setUploading(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  const initial = name?.[0]?.toUpperCase() || "?";

  const inner = uploading ? (
    <View style={[st.base, { width: size, height: size, borderRadius: radius }, style]}>
      <ActivityIndicator size="small" color={rankColor} />
    </View>
  ) : showImage ? (
    <Image
      source={
        Platform.OS === "web"
          ? { uri: imageUrl! }
          : { uri: imageUrl!, headers: nativeHeaders }
      }
      style={{ width: size, height: size, borderRadius: radius }}
      resizeMode="cover"
      onError={(e) => {
        console.warn("[CitizenAvatar] image load error", citizenId, e.nativeEvent?.error ?? "");
        setImageError(true);
      }}
    />
  ) : (
    <View
      style={[
        st.base,
        {
          width: size,
          height: size,
          borderRadius: radius,
          borderColor: rankColor + "55",
          backgroundColor: rankColor + "1A",
        },
        style,
      ]}
    >
      <Text style={[st.initial, { fontSize, color: rankColor }]}>{initial}</Text>
      {editable && (
        <View style={[st.editBadge, { width: size * 0.38, height: size * 0.38, borderRadius: size * 0.19 }]}>
          <Text style={{ fontSize: size * 0.18, color: "#fff" }}>📷</Text>
        </View>
      )}
    </View>
  );

  if (!editable) return inner;

  return (
    <TouchableOpacity onPress={() => void pickAndUpload()} activeOpacity={0.75}>
      {inner}
    </TouchableOpacity>
  );
}

const st = StyleSheet.create({
  base: {
    alignItems: "center",
    justifyContent: "center",
    borderWidth: 1,
    overflow: "hidden",
  },
  initial: {
    fontFamily: "Inter_700Bold",
  },
  editBadge: {
    position: "absolute",
    bottom: 0,
    right: 0,
    backgroundColor: "rgba(0,0,0,0.6)",
    alignItems: "center",
    justifyContent: "center",
  },
});
