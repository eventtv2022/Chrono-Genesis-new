/**
 * Proof-of-Location QR Scanner Screen
 * Route: /embassy/verify
 *
 * Flow:
 *  1. Camera opens → scans QR code (payload: { embassyId, token, lat, lng })
 *  2. Requests GPS via expo-location (Highest accuracy)
 *  3. POSTs { token, phoneLat, phoneLng } to /api/embassies/verify-location
 *  4. Shows success (node ONLINE) or error (too far / expired)
 */

import React, { useState, useEffect, useRef } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, ActivityIndicator,
  Alert, Platform, Pressable,
} from "react-native";
import { router } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { CameraView, useCameraPermissions } from "expo-camera";
import * as Location from "expo-location";
import { useColors } from "@/hooks/useColors";

const BASE_URL = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;

type Phase = "scanning" | "verifying" | "success" | "error";

interface QrPayload { embassyId: number; token: string; lat: number; lng: number }
interface VerifyResult { success?: boolean; message?: string; error?: string; distanceM?: number; nodeStatus?: string }

export default function EmbassyVerifyScreen() {
  const colors      = useColors();
  const insets      = useSafeAreaInsets();
  const [permission, requestPermission] = useCameraPermissions();
  const [phase,      setPhase]     = useState<Phase>("scanning");
  const [result,     setResult]    = useState<VerifyResult | null>(null);
  const [qrPayload,  setQrPayload] = useState<QrPayload | null>(null);
  const [distM,      setDistM]     = useState<number | null>(null);
  const scannedRef   = useRef(false); // debounce multiple scan events

  useEffect(() => {
    if (!permission?.granted) requestPermission();
  }, [permission, requestPermission]);

  const handleBarcodeScanned = async ({ data }: { data: string }) => {
    if (scannedRef.current || phase !== "scanning") return;
    scannedRef.current = true;

    let payload: QrPayload;
    try {
      payload = JSON.parse(data) as QrPayload;
      if (!payload.token || !payload.embassyId) throw new Error("bad payload");
    } catch {
      Alert.alert(
        "Неверный QR-код",
        "Этот QR-код не является токеном верификации ноды TimeNation.",
        [{ text: "Повторить", onPress: () => { scannedRef.current = false; } }],
      );
      return;
    }

    setQrPayload(payload);
    setPhase("verifying");

    try {
      // ── Step 1: get GPS ──────────────────────────────────────────────────────
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== "granted") {
        setPhase("error");
        setResult({ error: "Доступ к GPS не разрешён. Открой настройки и разреши геолокацию для TimeNation." });
        return;
      }

      const pos = await Location.getCurrentPositionAsync({
        accuracy: Location.Accuracy.BestForNavigation,
      });

      const { latitude: phoneLat, longitude: phoneLng, accuracy } = pos.coords;

      // ── Step 2: POST to backend ──────────────────────────────────────────────
      const res = await fetch(`${BASE_URL}/api/embassies/verify-location`, {
        method:  "POST",
        headers: { "Content-Type": "application/json" },
        body:    JSON.stringify({ token: payload.token, phoneLat, phoneLng }),
      });

      const data2 = await res.json() as VerifyResult;

      if (res.ok && data2.success) {
        setResult(data2);
        setDistM(accuracy ? Math.round(accuracy) : null);
        setPhase("success");
      } else {
        setResult(data2);
        setDistM(data2.distanceM ?? null);
        setPhase("error");
      }
    } catch (err) {
      setPhase("error");
      setResult({ error: "Ошибка сети. Проверь интернет-соединение и попробуй снова." });
    }
  };

  const reset = () => {
    scannedRef.current = false;
    setPhase("scanning");
    setResult(null);
    setQrPayload(null);
    setDistM(null);
  };

  const topPad = Platform.OS === "web" ? 67 : insets.top + 8;

  // ── Permission not granted ───────────────────────────────────────────────────
  if (!permission?.granted) {
    return (
      <View style={[styles.root, { backgroundColor: colors.background, paddingTop: topPad }]}>
        <Pressable onPress={() => router.back()} style={styles.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </Pressable>
        <View style={styles.centerBox}>
          <Feather name="camera-off" size={48} color={colors.mutedForeground} />
          <Text style={[styles.permTitle, { color: colors.foreground }]}>Нужен доступ к камере</Text>
          <Text style={[styles.permSub, { color: colors.mutedForeground }]}>
            Для сканирования QR-кода ноды TimeNation требуется разрешение на использование камеры.
          </Text>
          <TouchableOpacity style={[styles.btn, { backgroundColor: colors.primary }]} onPress={requestPermission} activeOpacity={0.8}>
            <Text style={[styles.btnText, { color: colors.primaryForeground }]}>Разрешить камеру</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Scanning phase ───────────────────────────────────────────────────────────
  if (phase === "scanning") {
    return (
      <View style={[styles.root, { backgroundColor: "#000", paddingTop: topPad }]}>
        <View style={styles.header}>
          <Pressable onPress={() => router.back()} style={styles.backBtnDark} hitSlop={12}>
            <Feather name="arrow-left" size={22} color="#fff" />
          </Pressable>
          <Text style={styles.headerTitleDark}>📡 Сканирование ноды</Text>
          <View style={{ width: 40 }} />
        </View>

        <CameraView
          style={StyleSheet.absoluteFill}
          facing="back"
          onBarcodeScanned={handleBarcodeScanned}
          barcodeScannerSettings={{ barcodeTypes: ["qr"] }}
        />

        {/* Overlay frame */}
        <View style={styles.scanOverlay} pointerEvents="none">
          <View style={styles.scanFrame}>
            {/* Corner markers */}
            <View style={[styles.corner, styles.cornerTL]} />
            <View style={[styles.corner, styles.cornerTR]} />
            <View style={[styles.corner, styles.cornerBL]} />
            <View style={[styles.corner, styles.cornerBR]} />
          </View>
          <Text style={styles.scanHint}>
            Наведи камеру на QR-код на экране ноды
          </Text>
          <Text style={styles.scanSubhint}>Находись в радиусе 15 метров от оборудования</Text>
        </View>
      </View>
    );
  }

  // ── Verifying phase ──────────────────────────────────────────────────────────
  if (phase === "verifying") {
    return (
      <View style={[styles.root, { backgroundColor: colors.background, paddingTop: topPad }]}>
        <View style={styles.centerBox}>
          <ActivityIndicator size="large" color={colors.primary} />
          <Text style={[styles.permTitle, { color: colors.foreground }]}>Верификация…</Text>
          <Text style={[styles.permSub, { color: colors.mutedForeground }]}>
            Получаем GPS-координаты и отправляем данные на сервер
          </Text>
          {qrPayload && (
            <Text style={[styles.embassyIdHint, { color: colors.mutedForeground }]}>
              Посольство #{qrPayload.embassyId}
            </Text>
          )}
        </View>
      </View>
    );
  }

  // ── Success phase ────────────────────────────────────────────────────────────
  if (phase === "success") {
    return (
      <View style={[styles.root, { backgroundColor: colors.background, paddingTop: topPad }]}>
        <View style={styles.centerBox}>
          <View style={[styles.statusIcon, { backgroundColor: "rgba(34,197,94,0.12)", borderColor: "#22c55e" }]}>
            <Feather name="shield" size={48} color="#22c55e" />
          </View>
          <Text style={[styles.permTitle, { color: "#22c55e" }]}>Нода активирована!</Text>
          <Text style={[styles.permSub, { color: colors.mutedForeground }]}>
            {result?.message ?? "Аптайм-майнинг Дарминов запущен"}
          </Text>

          <View style={[styles.detailCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.detailRow}>
              <Feather name="wifi" size={14} color="#22c55e" />
              <Text style={[styles.detailText, { color: colors.foreground }]}>Статус ноды: ONLINE</Text>
            </View>
            {qrPayload && (
              <View style={styles.detailRow}>
                <Feather name="map-pin" size={14} color={colors.primary} />
                <Text style={[styles.detailText, { color: colors.foreground }]}>
                  Посольство #{qrPayload.embassyId}
                </Text>
              </View>
            )}
          </View>

          <TouchableOpacity
            style={[styles.btn, { backgroundColor: colors.primary, marginTop: 8 }]}
            onPress={() => router.replace("/(tabs)/embassies")}
            activeOpacity={0.8}
          >
            <Text style={[styles.btnText, { color: colors.primaryForeground }]}>К посольствам</Text>
          </TouchableOpacity>
        </View>
      </View>
    );
  }

  // ── Error phase ──────────────────────────────────────────────────────────────
  return (
    <View style={[styles.root, { backgroundColor: colors.background, paddingTop: topPad }]}>
      <View style={styles.centerBox}>
        <View style={[styles.statusIcon, { backgroundColor: "rgba(239,68,68,0.12)", borderColor: "#ef4444" }]}>
          <Feather name="alert-triangle" size={48} color="#ef4444" />
        </View>
        <Text style={[styles.permTitle, { color: "#ef4444" }]}>Верификация не пройдена</Text>
        <Text style={[styles.permSub, { color: colors.mutedForeground }]}>
          {result?.error ?? "Неизвестная ошибка"}
        </Text>

        {distM !== null && (
          <View style={[styles.detailCard, { backgroundColor: colors.card, borderColor: "#ef444466" }]}>
            <View style={styles.detailRow}>
              <Feather name="navigation" size={14} color="#ef4444" />
              <Text style={[styles.detailText, { color: colors.foreground }]}>
                Расстояние до ноды: ~{distM} м (допустимо ≤15 м)
              </Text>
            </View>
          </View>
        )}

        <TouchableOpacity
          style={[styles.btn, { backgroundColor: colors.primary, marginTop: 8 }]}
          onPress={reset}
          activeOpacity={0.8}
        >
          <Feather name="camera" size={16} color={colors.primaryForeground} />
          <Text style={[styles.btnText, { color: colors.primaryForeground }]}>  Сканировать снова</Text>
        </TouchableOpacity>
        <TouchableOpacity style={styles.cancelLink} onPress={() => router.back()} activeOpacity={0.7}>
          <Text style={{ color: colors.mutedForeground, fontSize: 14, fontFamily: "Inter_400Regular" }}>Назад</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

const CORNER_SIZE = 24;
const CORNER_W    = 3;
const FRAME_SIZE  = 240;

const styles = StyleSheet.create({
  root:          { flex: 1 },
  header:        { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 16, paddingVertical: 10, zIndex: 10 },
  backBtn:       { padding: 8 },
  backBtnDark:   { width: 40, height: 40, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(0,0,0,0.5)", borderRadius: 20 },
  headerTitleDark: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: "#fff" },
  centerBox:     { flex: 1, alignItems: "center", justifyContent: "center", paddingHorizontal: 32, gap: 16 },
  permTitle:     { fontSize: 20, fontFamily: "Inter_700Bold", textAlign: "center" },
  permSub:       { fontSize: 14, fontFamily: "Inter_400Regular", textAlign: "center", lineHeight: 20 },
  btn:           { flexDirection: "row", alignItems: "center", justifyContent: "center", paddingVertical: 14, paddingHorizontal: 28, borderRadius: 12, minWidth: 200 },
  btnText:       { fontSize: 16, fontFamily: "Inter_700Bold" },
  cancelLink:    { padding: 12, marginTop: 4 },
  embassyIdHint: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 4 },
  statusIcon:    { width: 96, height: 96, borderRadius: 48, alignItems: "center", justifyContent: "center", borderWidth: 2, marginBottom: 8 },
  detailCard:    { width: "100%", borderWidth: 1, borderRadius: 12, padding: 16, gap: 10, marginTop: 4 },
  detailRow:     { flexDirection: "row", alignItems: "center", gap: 10 },
  detailText:    { fontSize: 14, fontFamily: "Inter_500Medium", flex: 1 },
  // QR overlay
  scanOverlay:   { ...StyleSheet.absoluteFillObject, alignItems: "center", justifyContent: "center" },
  scanFrame:     { width: FRAME_SIZE, height: FRAME_SIZE, position: "relative" },
  corner:        { position: "absolute", width: CORNER_SIZE, height: CORNER_SIZE, borderColor: "#f59e0b" },
  cornerTL:      { top: 0, left: 0, borderTopWidth: CORNER_W, borderLeftWidth: CORNER_W },
  cornerTR:      { top: 0, right: 0, borderTopWidth: CORNER_W, borderRightWidth: CORNER_W },
  cornerBL:      { bottom: 0, left: 0, borderBottomWidth: CORNER_W, borderLeftWidth: CORNER_W },
  cornerBR:      { bottom: 0, right: 0, borderBottomWidth: CORNER_W, borderRightWidth: CORNER_W },
  scanHint:      { color: "#fff", fontSize: 15, fontFamily: "Inter_600SemiBold", marginTop: 32, textAlign: "center", textShadowColor: "#000", textShadowRadius: 8 },
  scanSubhint:   { color: "rgba(255,255,255,0.7)", fontSize: 12, fontFamily: "Inter_400Regular", textAlign: "center", marginTop: 6 },
});
