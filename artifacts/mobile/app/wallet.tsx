import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  TextInput,
  TouchableOpacity,
  ActivityIndicator,
  Alert,
  ScrollView,
  Platform,
} from "react-native";
import * as Clipboard from "expo-clipboard";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import * as Haptics from "expo-haptics";
import { useRouter } from "expo-router";
import { useCitizen } from "@/context/CitizenContext";
import { useColors } from "@/hooks/useColors";
import { LogoBrand } from "@/components/LogoBrand";

const BASE_URL = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;

type Step = "input" | "sign" | "verify" | "done";

function truncate(addr: string) {
  return addr.slice(0, 6) + "..." + addr.slice(-4);
}

export default function WalletScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { citizen, refreshCitizen } = useCitizen();
  const router = useRouter();

  const [step, setStep] = useState<Step>(
    citizen?.walletAddress && citizen?.walletVerified ? "done" : "input"
  );
  const [walletAddress, setWalletAddress] = useState(citizen?.walletAddress ?? "");
  const [signMessage, setSignMessage] = useState("");
  const [signature, setSignature] = useState("");
  const [loading, setLoading] = useState(false);

  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const styles = getStyles(colors);

  async function handleRequestNonce() {
    if (!citizen) return;
    const addr = walletAddress.trim();
    if (!addr || (!addr.startsWith("0x") && addr.length < 32)) {
      Alert.alert("Ошибка", "Введи корректный Ethereum адрес (0x...) или Solana публичный ключ");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(
        `${BASE_URL}/api/auth/wallet-nonce?walletAddress=${encodeURIComponent(addr)}&citizenId=${citizen.id}`
      );
      const data = await res.json() as { nonce?: string; message?: string; error?: string };
      if (!res.ok) {
        Alert.alert("Ошибка", data.error ?? "Не удалось получить nonce");
        return;
      }
      setSignMessage(data.message ?? "");
      setStep("sign");
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
    } finally {
      setLoading(false);
    }
  }

  async function handleCopyMessage() {
    await Clipboard.setStringAsync(signMessage);
    Haptics.selectionAsync();
    Alert.alert("✅ Скопировано", "Вставь это сообщение в MetaMask или любой кошелёк для подписи");
  }

  async function handleVerify() {
    if (!citizen) return;
    const sig = signature.trim();
    if (!sig) {
      Alert.alert("Ошибка", "Вставь подпись из кошелька");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/api/auth/wallet-verify`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          citizenId: citizen.id,
          walletAddress: walletAddress.trim(),
          signature: sig,
        }),
      });
      const data = await res.json() as { success?: boolean; walletAddress?: string; error?: string };
      if (!res.ok) {
        Alert.alert("Верификация не прошла", data.error ?? "Подпись не совпадает с адресом");
        return;
      }
      await refreshCitizen();
      setStep("done");
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } finally {
      setLoading(false);
    }
  }

  async function handleUnlink() {
    if (!citizen) return;
    Alert.alert("Отвязать кошелёк?", "Это удалит привязку кошелька из вашего паспорта", [
      { text: "Отмена", style: "cancel" },
      {
        text: "Отвязать",
        style: "destructive",
        onPress: async () => {
          setLoading(true);
          try {
            await fetch(`${BASE_URL}/api/auth/wallet-unlink`, {
              method: "DELETE",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ citizenId: citizen.id }),
            });
            await refreshCitizen();
            setWalletAddress("");
            setSignature("");
            setSignMessage("");
            setStep("input");
          } finally {
            setLoading(false);
          }
        },
      },
    ]);
  }

  return (
    <ScrollView
      style={[styles.container, { paddingTop: topPad }]}
      contentContainerStyle={{ paddingBottom: insets.bottom + 32 }}
      showsVerticalScrollIndicator={false}
    >
      <TouchableOpacity style={styles.backBtn} onPress={() => router.back()} activeOpacity={0.75}>
        <Feather name="arrow-left" size={22} color={colors.foreground} />
      </TouchableOpacity>

      <View style={styles.headerSection}>
        <LogoBrand size={72} />
        <Text style={styles.title}>Web3 Паспорт</Text>
        <Text style={styles.subtitle}>Привяжи Ethereum-кошелёк к своему гражданству в TimeNation</Text>
      </View>

      {step === "done" && (
        <View style={styles.doneCard}>
          <View style={styles.doneHeader}>
            <View style={styles.verifiedBadge}>
              <Feather name="shield" size={14} color={colors.primaryForeground} />
              <Text style={styles.verifiedText}>Верифицирован</Text>
            </View>
          </View>
          <Text style={styles.doneAddress}>
            {citizen?.walletAddress ? truncate(citizen.walletAddress) : walletAddress}
          </Text>
          <Text style={styles.doneFullAddress}>{citizen?.walletAddress ?? walletAddress}</Text>
          <View style={styles.doneStats}>
            <View style={styles.doneStat}>
              <Feather name="anchor" size={14} color={colors.primary} />
              <Text style={styles.doneStatText}>Временные координаты принадлежат этому адресу</Text>
            </View>
            <View style={styles.doneStat}>
              <Feather name="clock" size={14} color={colors.primary} />
              <Text style={styles.doneStatText}>Баланс: {citizen?.balanceMinutes} мин</Text>
            </View>
          </View>
          <TouchableOpacity style={styles.unlinkBtn} onPress={handleUnlink} disabled={loading} activeOpacity={0.8}>
            {loading ? (
              <ActivityIndicator color={colors.destructiveForeground} size="small" />
            ) : (
              <>
                <Feather name="scissors" size={14} color={colors.destructiveForeground} />
                <Text style={styles.unlinkBtnText}>Отвязать кошелёк</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      {step === "input" && (
        <View style={styles.stepCard}>
          <View style={styles.stepBadge}><Text style={styles.stepNum}>1</Text></View>
          <Text style={styles.stepTitle}>Введи адрес кошелька</Text>
          <Text style={styles.stepDesc}>Введи свой Ethereum-адрес (0x...). Мы сгенерируем уникальное сообщение для подписи.</Text>
          <TextInput
            style={styles.input}
            value={walletAddress}
            onChangeText={setWalletAddress}
            placeholder="0x1234...abcd"
            placeholderTextColor={colors.mutedForeground}
            autoCapitalize="none"
            autoCorrect={false}
          />
          <TouchableOpacity style={styles.primaryBtn} onPress={handleRequestNonce} disabled={loading} activeOpacity={0.8}>
            {loading ? (
              <ActivityIndicator color={colors.primaryForeground} />
            ) : (
              <>
                <Feather name="arrow-right" size={18} color={colors.primaryForeground} />
                <Text style={styles.primaryBtnText}>Получить сообщение для подписи</Text>
              </>
            )}
          </TouchableOpacity>
        </View>
      )}

      {step === "sign" && (
        <View style={styles.stepCard}>
          <View style={styles.stepBadge}><Text style={styles.stepNum}>2</Text></View>
          <Text style={styles.stepTitle}>Подпиши сообщение</Text>
          <Text style={styles.stepDesc}>
            Скопируй сообщение ниже и подпиши его в MetaMask, TrustWallet или любом EVM-кошельке через "Sign Message". Затем вставь подпись в поле ниже.
          </Text>

          <View style={styles.messageBox}>
            <Text style={styles.messageText}>{signMessage}</Text>
          </View>
          <TouchableOpacity style={styles.copyBtn} onPress={handleCopyMessage} activeOpacity={0.8}>
            <Feather name="copy" size={14} color={colors.primary} />
            <Text style={styles.copyBtnText}>Скопировать сообщение</Text>
          </TouchableOpacity>

          <View style={styles.howToSection}>
            <Text style={styles.howToTitle}>Как подписать:</Text>
            {[
              "1. Открой MetaMask → три точки → Sign",
              "2. Вставь текст выше и подтверди",
              "3. Скопируй строку подписи (0x...)",
              "4. Вставь её в поле ниже",
            ].map((s, i) => (
              <Text key={i} style={styles.howToStep}>{s}</Text>
            ))}
          </View>

          <Text style={styles.fieldLabel}>ПОДПИСЬ (0x...)</Text>
          <TextInput
            style={[styles.input, styles.sigInput]}
            value={signature}
            onChangeText={setSignature}
            placeholder="0x4b8d3f..."
            placeholderTextColor={colors.mutedForeground}
            autoCapitalize="none"
            autoCorrect={false}
            multiline
          />

          <TouchableOpacity style={styles.primaryBtn} onPress={handleVerify} disabled={loading || !signature.trim()} activeOpacity={0.8}>
            {loading ? (
              <ActivityIndicator color={colors.primaryForeground} />
            ) : (
              <>
                <Feather name="shield" size={18} color={colors.primaryForeground} />
                <Text style={styles.primaryBtnText}>Верифицировать и привязать</Text>
              </>
            )}
          </TouchableOpacity>
          <TouchableOpacity style={styles.cancelBtn} onPress={() => setStep("input")} activeOpacity={0.8}>
            <Text style={styles.cancelBtnText}>Назад</Text>
          </TouchableOpacity>
        </View>
      )}

      <View style={styles.securityNote}>
        <Feather name="lock" size={14} color={colors.mutedForeground} />
        <Text style={styles.securityText}>
          Верификация использует криптографию EVM (ethers.js). Ключи никогда не покидают ваш кошелёк.
        </Text>
      </View>
    </ScrollView>
  );
}

function getStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background, paddingHorizontal: 20 },
    backBtn: { width: 40, height: 40, alignItems: "center", justifyContent: "center", marginBottom: 4 },
    headerSection: { alignItems: "center", paddingVertical: 24, gap: 10 },
    iconRing: { width: 72, height: 72, borderRadius: 36, backgroundColor: colors.goldGlow, borderWidth: 2, borderColor: colors.primary, alignItems: "center", justifyContent: "center" },
    title: { fontSize: 24, fontFamily: "Inter_700Bold", color: colors.foreground },
    subtitle: { fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, textAlign: "center", lineHeight: 20 },
    doneCard: { backgroundColor: colors.card, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: colors.primary, gap: 12 },
    doneHeader: { alignItems: "flex-start" },
    verifiedBadge: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: colors.primary, paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20 },
    verifiedText: { fontSize: 12, fontFamily: "Inter_700Bold", color: colors.primaryForeground },
    doneAddress: { fontSize: 22, fontFamily: "Inter_700Bold", color: colors.foreground, letterSpacing: 1 },
    doneFullAddress: { fontSize: 10, fontFamily: "Inter_400Regular", color: colors.mutedForeground, letterSpacing: 0.5 },
    doneStats: { gap: 8 },
    doneStat: { flexDirection: "row", alignItems: "center", gap: 8 },
    doneStatText: { fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground },
    unlinkBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, backgroundColor: colors.destructive, borderRadius: 10, padding: 12, marginTop: 4 },
    unlinkBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.destructiveForeground },
    stepCard: { backgroundColor: colors.card, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: colors.border, gap: 12 },
    stepBadge: { width: 32, height: 32, borderRadius: 16, backgroundColor: colors.primary, alignItems: "center", justifyContent: "center" },
    stepNum: { fontSize: 16, fontFamily: "Inter_700Bold", color: colors.primaryForeground },
    stepTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: colors.foreground },
    stepDesc: { fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, lineHeight: 20 },
    input: { backgroundColor: colors.background, borderWidth: 1, borderColor: colors.border, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 12, fontSize: 14, fontFamily: "Inter_400Regular", color: colors.foreground },
    sigInput: { minHeight: 80, textAlignVertical: "top" },
    fieldLabel: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground, letterSpacing: 1 },
    messageBox: { backgroundColor: colors.background, borderRadius: 10, padding: 14, borderWidth: 1, borderColor: colors.border },
    messageText: { fontSize: 11, fontFamily: "Inter_400Regular", color: colors.foreground, lineHeight: 18 },
    copyBtn: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", backgroundColor: colors.goldGlow, borderWidth: 1, borderColor: colors.primary, paddingHorizontal: 12, paddingVertical: 7, borderRadius: 8 },
    copyBtnText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: colors.primary },
    howToSection: { backgroundColor: colors.background, borderRadius: 10, padding: 12, gap: 4 },
    howToTitle: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.mutedForeground, marginBottom: 4 },
    howToStep: { fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground, lineHeight: 18 },
    primaryBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 10, backgroundColor: colors.primary, borderRadius: 12, padding: 14 },
    primaryBtnText: { fontSize: 15, fontFamily: "Inter_700Bold", color: colors.primaryForeground },
    cancelBtn: { alignItems: "center", padding: 10 },
    cancelBtnText: { fontSize: 14, fontFamily: "Inter_500Medium", color: colors.mutedForeground },
    securityNote: { flexDirection: "row", alignItems: "flex-start", gap: 8, marginTop: 24, backgroundColor: colors.card, borderRadius: 10, padding: 12, borderWidth: 1, borderColor: colors.border },
    securityText: { flex: 1, fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground, lineHeight: 17 },
  });
}
