import React, { useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, ActivityIndicator, Alert, Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useColors } from "@/hooks/useColors";
import { useCitizen } from "@/context/CitizenContext";
import { getBaseUrl } from "@/lib/api";

const BASE_URL = getBaseUrl();

const DEPOSIT_OPTIONS = [
  { label: "1 час", hours: 1 },
  { label: "2 часа", hours: 2 },
  { label: "4 часа", hours: 4 },
  { label: "8 часов (макс)", hours: 8 },
];

export default function LaborProfileScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { citizen, setCitizen } = useCitizen();

  const [skills, setSkills] = useState(citizen?.professionalSkills ?? "");
  const [depositHours, setDepositHours] = useState(4);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{
    kq: number; industry: string; justification: string;
    depositBonus: number; earnedDarmins: number;
  } | null>(null);

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  async function handleAuditAndDeposit() {
    if (!citizen) { Alert.alert("Ошибка", "Необходимо войти в систему"); return; }
    if (skills.trim().length < 20) {
      Alert.alert("Слишком мало информации", "Опишите навыки подробнее (минимум 20 символов)");
      return;
    }
    setLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/api/citizens/deposit-labor`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ citizenId: citizen.id, professionalSkills: skills, depositHours }),
      });
      const data = await res.json() as {
        kq?: number; industry?: string; justification?: string;
        depositBonus?: number; earnedDarmins?: number; error?: string;
      };
      if (!res.ok) { Alert.alert("Ошибка", data.error ?? "Неизвестная ошибка"); return; }
      setResult({
        kq: data.kq ?? 1.0,
        industry: data.industry ?? "",
        justification: data.justification ?? "",
        depositBonus: data.depositBonus ?? 0,
        earnedDarmins: data.earnedDarmins ?? 0,
      });
      if (citizen && data.kq) {
        setCitizen({ ...citizen, professionalSkills: skills, calculatedMinuteRate: data.kq });
      }
    } catch {
      Alert.alert("Сетевая ошибка", "Проверьте подключение");
    } finally {
      setLoading(false);
    }
  }

  const s = styles(colors);

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[s.header, { paddingTop: topPad + 12 }]}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Депозит Труда</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} showsVerticalScrollIndicator={false}>

        {/* Current rate card */}
        {citizen?.calculatedMinuteRate !== undefined && (
          <View style={s.rateCard}>
            <Text style={s.rateLabel}>Ваш текущий тариф</Text>
            <Text style={s.rateValue}>{(citizen.calculatedMinuteRate ?? 1).toFixed(2)} Д/мин</Text>
            <Text style={s.rateSub}>
              {citizen.potentialLaborDepositedMinutes ?? 0} мин задепонировано
              {citizen.skillsAuditedAt ? ` · обновлён ${new Date(citizen.skillsAuditedAt).toLocaleDateString("ru")}` : ""}
            </Text>
          </View>
        )}

        {/* Skills input */}
        <Text style={s.sectionLabel}>Мои навыки, опыт и услуги</Text>
        <Text style={s.hint}>
          Опишите подробно: специальность, годы опыта, сертификаты, перечень услуг. ИИ-Аудитор рассчитает персональный коэффициент Kq.
        </Text>
        <TextInput
          style={s.textarea}
          value={skills}
          onChangeText={setSkills}
          placeholder={"Пример: IT-архитектор, 12 лет опыта. Проектирование микросервисов, AWS, Kubernetes. Сертификат AWS Solutions Architect Pro. Услуги: аудит архитектуры, code review, менторство."}
          placeholderTextColor={colors.mutedForeground}
          multiline
          numberOfLines={6}
          textAlignVertical="top"
        />

        {/* Deposit hours */}
        <Text style={[s.sectionLabel, { marginTop: 20 }]}>Депонировать потенциальный труд</Text>
        <Text style={s.hint}>До 8 часов · Заработанные Дармины = часы × Kq × 60</Text>
        <View style={s.chipRow}>
          {DEPOSIT_OPTIONS.map(opt => (
            <TouchableOpacity
              key={opt.hours}
              style={[s.chip, depositHours === opt.hours && s.chipActive]}
              onPress={() => setDepositHours(opt.hours)}
            >
              <Text style={[s.chipText, depositHours === opt.hours && s.chipTextActive]}>
                {opt.label}
              </Text>
            </TouchableOpacity>
          ))}
        </View>

        {/* Preview */}
        <View style={s.preview}>
          <Text style={s.previewLabel}>Ожидаемый заработок</Text>
          <Text style={s.previewValue}>
            {(depositHours * (citizen?.calculatedMinuteRate ?? 1) * 60).toFixed(0)} Д
          </Text>
          <Text style={s.previewSub}>
            {depositHours}ч × {(citizen?.calculatedMinuteRate ?? 1).toFixed(2)} Kq × 60 мин
          </Text>
        </View>

        {/* Submit */}
        <TouchableOpacity style={[s.btn, loading && { opacity: 0.6 }]} onPress={handleAuditAndDeposit} disabled={loading}>
          {loading
            ? <ActivityIndicator color="#000" />
            : <Text style={s.btnText}>Рассчитать тариф и депонировать {depositHours}ч</Text>
          }
        </TouchableOpacity>

        {/* Result */}
        {result && (
          <View style={s.resultCard}>
            <Text style={s.resultTitle}>Аудит завершён ✓</Text>
            <View style={s.resultRow}>
              <Text style={s.resultLabel}>Коэффициент Kq</Text>
              <Text style={s.resultKq}>{result.kq.toFixed(2)}</Text>
            </View>
            <View style={s.resultRow}>
              <Text style={s.resultLabel}>Отрасль</Text>
              <Text style={s.resultVal}>{result.industry}</Text>
            </View>
            <View style={s.resultRow}>
              <Text style={s.resultLabel}>Начислено Д</Text>
              <Text style={[s.resultVal, { color: "#4ade80", fontFamily: "Inter_700Bold" }]}>
                +{result.earnedDarmins.toFixed(1)} Д
              </Text>
            </View>
            <Text style={s.resultJustification}>{result.justification}</Text>
          </View>
        )}

      </ScrollView>
    </View>
  );
}

function styles(c: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    header: {
      flexDirection: "row", alignItems: "center", justifyContent: "space-between",
      paddingHorizontal: 16, paddingBottom: 12,
      borderBottomWidth: 1, borderBottomColor: c.border,
      backgroundColor: c.background,
    },
    backBtn: { width: 36, height: 36, alignItems: "center", justifyContent: "center" },
    headerTitle: { fontSize: 17, fontFamily: "Inter_700Bold", color: c.foreground },
    rateCard: {
      backgroundColor: c.card, borderRadius: 16, padding: 20,
      marginBottom: 24, alignItems: "center", borderWidth: 1, borderColor: c.border,
    },
    rateLabel: { fontSize: 12, fontFamily: "Inter_500Medium", color: c.mutedForeground, letterSpacing: 1, marginBottom: 6 },
    rateValue: { fontSize: 36, fontFamily: "Inter_700Bold", color: c.primary, marginBottom: 4 },
    rateSub: { fontSize: 12, fontFamily: "Inter_400Regular", color: c.mutedForeground },
    sectionLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: c.foreground, marginBottom: 6 },
    hint: { fontSize: 12, fontFamily: "Inter_400Regular", color: c.mutedForeground, marginBottom: 10, lineHeight: 18 },
    textarea: {
      backgroundColor: c.card, borderRadius: 12, borderWidth: 1, borderColor: c.border,
      padding: 14, fontSize: 14, fontFamily: "Inter_400Regular", color: c.foreground,
      minHeight: 140,
    },
    chipRow: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginBottom: 16 },
    chip: {
      paddingHorizontal: 14, paddingVertical: 8, borderRadius: 8,
      backgroundColor: c.card, borderWidth: 1, borderColor: c.border,
    },
    chipActive: { backgroundColor: c.primary, borderColor: c.primary },
    chipText: { fontSize: 13, fontFamily: "Inter_500Medium", color: c.mutedForeground },
    chipTextActive: { color: "#000" },
    preview: {
      backgroundColor: c.card, borderRadius: 12, padding: 16,
      alignItems: "center", marginBottom: 20, borderWidth: 1, borderColor: c.border,
    },
    previewLabel: { fontSize: 11, fontFamily: "Inter_500Medium", color: c.mutedForeground, letterSpacing: 1 },
    previewValue: { fontSize: 32, fontFamily: "Inter_700Bold", color: c.primary, marginVertical: 4 },
    previewSub: { fontSize: 12, fontFamily: "Inter_400Regular", color: c.mutedForeground },
    btn: {
      backgroundColor: c.primary, borderRadius: 14, padding: 16,
      alignItems: "center", marginBottom: 20,
    },
    btnText: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#000" },
    resultCard: {
      backgroundColor: c.card, borderRadius: 14, padding: 18,
      borderWidth: 1, borderColor: "#4ade8044",
    },
    resultTitle: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#4ade80", marginBottom: 12 },
    resultRow: { flexDirection: "row", justifyContent: "space-between", marginBottom: 8 },
    resultLabel: { fontSize: 13, fontFamily: "Inter_400Regular", color: c.mutedForeground },
    resultKq: { fontSize: 20, fontFamily: "Inter_700Bold", color: c.primary },
    resultVal: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: c.foreground },
    resultJustification: {
      fontSize: 12, fontFamily: "Inter_400Regular", color: c.mutedForeground,
      lineHeight: 18, marginTop: 10, fontStyle: "italic",
    },
  });
}
