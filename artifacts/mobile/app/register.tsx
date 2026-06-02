import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { useCitizen, CitizenProfile } from "@/context/CitizenContext";
import { useColors } from "@/hooks/useColors";

const BASE_URL = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;

export default function RegisterScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { setCitizen } = useCitizen();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [mode, setMode] = useState<"choose" | "register" | "login">("choose");
  const [name, setName] = useState("");
  const [phone, setPhone] = useState("");
  const [loading, setLoading] = useState(false);
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  async function handleRegister() {
    if (!name.trim() || !phone.trim()) { Alert.alert("Заполни все поля"); return; }
    setLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/api/citizens`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ name: name.trim(), phone: phone.trim() }),
      });
      const data = await res.json() as CitizenProfile | { error: string };
      if (!res.ok) { Alert.alert("Ошибка", (data as { error: string }).error); return; }
      setCitizen(data as CitizenProfile);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      queryClient.invalidateQueries({ queryKey: ["citizens"] });
      router.back();
    } finally { setLoading(false); }
  }

  async function handleLogin() {
    if (!phone.trim()) { Alert.alert("Введи номер телефона"); return; }
    setLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/api/citizens/by-phone/${encodeURIComponent(phone.trim())}`);
      const data = await res.json() as CitizenProfile | { error: string };
      if (!res.ok) { Alert.alert("Гражданин не найден", "Проверь номер или зарегистрируйся"); return; }
      setCitizen(data as CitizenProfile);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      router.back();
    } finally { setLoading(false); }
  }

  const styles = getStyles(colors);

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.75}>
        <Feather name="arrow-left" size={22} color={colors.foreground} />
      </TouchableOpacity>

      <View style={styles.logoSection}>
        <View style={styles.logoMark}><Text style={styles.logoText}>TN</Text></View>
        <Text style={styles.title}>TimeNation</Text>
        <Text style={styles.subtitle}>Цифровое государство</Text>
      </View>

      {mode === "choose" && (
        <View style={styles.chooseSection}>
          <TouchableOpacity style={styles.primaryBtn} onPress={() => setMode("register")} activeOpacity={0.8}>
            <Feather name="user-plus" size={18} color={colors.primaryForeground} />
            <Text style={styles.primaryBtnText}>Стать гражданином</Text>
          </TouchableOpacity>
          <TouchableOpacity style={styles.secondaryBtn} onPress={() => setMode("login")} activeOpacity={0.8}>
            <Feather name="log-in" size={18} color={colors.foreground} />
            <Text style={styles.secondaryBtnText}>Войти по телефону</Text>
          </TouchableOpacity>
        </View>
      )}

      {mode === "register" && (
        <View style={styles.formSection}>
          <Text style={styles.formTitle}>Регистрация</Text>
          <Text style={styles.fieldLabel}>ИМЯ</Text>
          <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="Твоё имя" placeholderTextColor={colors.mutedForeground} autoFocus />
          <Text style={styles.fieldLabel}>ТЕЛЕФОН</Text>
          <TextInput style={styles.input} value={phone} onChangeText={setPhone} placeholder="+7..." placeholderTextColor={colors.mutedForeground} keyboardType="phone-pad" />
          <Text style={styles.hint}>Начальный баланс: 60 Минут Валюты</Text>
          <TouchableOpacity style={styles.primaryBtn} onPress={handleRegister} disabled={loading} activeOpacity={0.8}>
            {loading ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={styles.primaryBtnText}>Зарегистрироваться</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelBtn} onPress={() => setMode("choose")} activeOpacity={0.8}>
            <Text style={styles.cancelBtnText}>Назад</Text>
          </TouchableOpacity>
        </View>
      )}

      {mode === "login" && (
        <View style={styles.formSection}>
          <Text style={styles.formTitle}>Вход</Text>
          <Text style={styles.fieldLabel}>ТЕЛЕФОН</Text>
          <TextInput style={styles.input} value={phone} onChangeText={setPhone} placeholder="+7..." placeholderTextColor={colors.mutedForeground} keyboardType="phone-pad" autoFocus />
          <TouchableOpacity style={styles.primaryBtn} onPress={handleLogin} disabled={loading} activeOpacity={0.8}>
            {loading ? <ActivityIndicator color={colors.primaryForeground} /> : <Text style={styles.primaryBtnText}>Войти</Text>}
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelBtn} onPress={() => setMode("choose")} activeOpacity={0.8}>
            <Text style={styles.cancelBtnText}>Назад</Text>
          </TouchableOpacity>
        </View>
      )}
    </View>
  );
}

function getStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: 24 },
    backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center", marginBottom: 8 },
    logoSection: { alignItems: "center", paddingVertical: 40 },
    logoMark: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.goldGlow, borderWidth: 2, borderColor: colors.primary, alignItems: "center", justifyContent: "center", marginBottom: 16 },
    logoText: { fontSize: 24, fontFamily: "Inter_700Bold", color: colors.primary, letterSpacing: 2 },
    title: { fontSize: 28, fontFamily: "Inter_700Bold", color: colors.foreground, letterSpacing: 1 },
    subtitle: { fontSize: 14, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 4 },
    chooseSection: { gap: 12 },
    formSection: { gap: 4 },
    formTitle: { fontSize: 22, fontFamily: "Inter_700Bold", color: colors.foreground, marginBottom: 16 },
    fieldLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground, letterSpacing: 1, marginBottom: 6, marginTop: 8 },
    input: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, borderRadius: 12, paddingHorizontal: 16, paddingVertical: 14, fontSize: 15, fontFamily: "Inter_400Regular", color: colors.foreground },
    hint: { fontSize: 12, fontFamily: "Inter_400Regular", color: colors.primary, textAlign: "center", marginTop: 4, marginBottom: 12 },
    primaryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: colors.primary, borderRadius: 14, padding: 16, marginTop: 8 },
    primaryBtnText: { fontSize: 16, fontFamily: "Inter_700Bold", color: colors.primaryForeground },
    secondaryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: colors.card, borderRadius: 14, padding: 16, borderWidth: 1, borderColor: colors.border },
    secondaryBtnText: { fontSize: 16, fontFamily: "Inter_500Medium", color: colors.foreground },
    cancelBtn: { padding: 14, alignItems: "center", marginTop: 4 },
    cancelBtnText: { fontSize: 15, fontFamily: "Inter_500Medium", color: colors.mutedForeground },
  });
}
