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
import { getStoredAuthHeaders } from "@/lib/authStorage";
import { useQueryClient } from "@tanstack/react-query";

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

  const [headers, setHeaders] = useState<Record<string, string> | null>(null);
  const [imageError, setImageError] = useState(false);
  const [uploading, setUploading] = useState(false);
  const mountedRef = useRef(true);

  useEffect(() => {
    mountedRef.current = true;
    if (hasPhoto) {
      getStoredAuthHeaders().then((h) => {
        if (mountedRef.current) setHeaders(h);
      });
    }
    return () => { mountedRef.current = false; };
  }, [hasPhoto, citizenId]);

  // Reset error state when citizenId/hasPhoto changes
  useEffect(() => { setImageError(false); }, [citizenId, hasPhoto]);

  const showImage = hasPhoto && !imageError && headers !== null;

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
      const uriParts = (asset.uri ?? "").split(".");
      const ext = uriParts[uriParts.length - 1] ?? "jpg";
      // @ts-expect-error — RN FormData accepts { uri, name, type }
      form.append("photo", { uri: asset.uri, name: `photo.${ext}`, type: `image/${ext}` });

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
        const newHeaders = await getStoredAuthHeaders();
        if (mountedRef.current) setHeaders({ ...newHeaders });
        onPhotoUpdated?.();
      }
    } catch (e) {
      Alert.alert("Ошибка", "Не удалось загрузить фото");
    } finally {
      if (mountedRef.current) setUploading(false);
    }
  }

  const initial = name?.[0]?.toUpperCase() || "?";

  const inner = uploading ? (
    <View style={[st.base, { width: size, height: size, borderRadius: radius }, style]}>
      <ActivityIndicator size="small" color={rankColor} />
    </View>
  ) : showImage ? (
    <Image
      source={{
        uri: `${getBaseUrl()}/api/citizens/${citizenId}/photo?t=${Object.keys(headers).length}`,
        headers,
      }}
      style={{ width: size, height: size, borderRadius: radius }}
      resizeMode="cover"
      onError={() => setImageError(true)}
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
