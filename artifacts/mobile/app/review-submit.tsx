import React, { useState } from "react";
import {
  View, Text, StyleSheet, ScrollView, TextInput,
  TouchableOpacity, ActivityIndicator, Alert, Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter, useLocalSearchParams } from "expo-router";
import { useColors } from "@/hooks/useColors";
import { useCitizen } from "@/context/CitizenContext";
import { getBaseUrl } from "@/lib/api";

const BASE_URL = getBaseUrl();
const REVIEW_TAX = 15;

function StarRow({ rating, onSelect }: { rating: number; onSelect: (r: number) => void }) {
  const colors = useColors();
  return (
    <View style={{ flexDirection: "row", gap: 8, marginVertical: 12 }}>
      {[1, 2, 3, 4, 5].map(n => (
        <TouchableOpacity key={n} onPress={() => onSelect(n)}>
          <Feather
            name="star"
            size={32}
            color={n <= rating ? "#f59e0b" : colors.border}
          />
        </TouchableOpacity>
      ))}
    </View>
  );
}

export default function ReviewSubmitScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { citizen } = useCitizen();
  const params = useLocalSearchParams<{ targetId?: string; targetName?: string }>();

  const targetId = params.targetId ? parseInt(params.targetId) : null;
  const targetName = params.targetName ?? "Специалист";

  const [rating, setRating] = useState(5);
  const [reviewText, setReviewText] = useState("");
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  const [rateAdj, setRateAdj] = useState<{ newRate: number; delta: number; reason: string } | null>(null);

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  async function handleSubmit() {
    if (!citizen) { Alert.alert("Ошибка", "Войдите в систему"); return; }
    if (!targetId) { Alert.alert("Ошибка", "Не указан получатель отзыва"); return; }
    if (reviewText.trim().length < 10) {
      Alert.alert("Слишком короткий отзыв", "Напишите хотя бы 10 символов");
      return;
    }
    if ((citizen.balanceMinutes ?? 0) < REVIEW_TAX + 1) {
      Alert.alert("Недостаточно Дарминов", `Для отправки отзыва требуется ${REVIEW_TAX} Д (государственный сбор)`);
      return;
    }

    Alert.alert(
      "Подтвердите отправку",
      `С вашего баланса будет списано ${REVIEW_TAX} Д в пользу Казначейства. Отзыв нельзя удалить.`,
      [
        { text: "Отмена", style: "cancel" },
        { text: "Отправить", style: "destructive", onPress: submitReview },
      ]
    );
  }

  async function submitReview() {
    if (!citizen || !targetId) return;
    setLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/api/reviews/submit`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ authorId: citizen.id, targetId, rating, reviewText }),
      });
      const data = await res.json() as {
        review?: unknown;
        rateAdjustment?: { newRate: number; delta: number; reason: string };
        error?: string;
      };
      if (!res.ok) { Alert.alert("Ошибка", data.error ?? "Неизвестная ошибка"); return; }
      setRateAdj(data.rateAdjustment ?? null);
      setDone(true);
    } catch {
      Alert.alert("Сетевая ошибка", "Проверьте подключение");
    } finally {
      setLoading(false);
    }
  }

  const s = styles(colors);

  if (done) {
    return (
      <View style={{ flex: 1, backgroundColor: colors.background, justifyContent: "center", alignItems: "center", padding: 32 }}>
        <Feather name="check-circle" size={56} color="#4ade80" />
        <Text style={{ fontSize: 22, fontFamily: "Inter_700Bold", color: colors.foreground, marginTop: 16, marginBottom: 8 }}>
          Отзыв отправлен
        </Text>
        <Text style={{ fontSize: 14, fontFamily: "Inter_400Regular", color: colors.mutedForeground, textAlign: "center", lineHeight: 22 }}>
          {REVIEW_TAX} Д сбора зачислено в Казначейство.
          {rateAdj ? `\n\nИИ-Аудитор скорректировал тариф специалиста: ${rateAdj.delta >= 0 ? "+" : ""}${rateAdj.delta.toFixed(2)} → ${rateAdj.newRate.toFixed(2)} Д/мин` : ""}
        </Text>
        {rateAdj && (
          <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground, textAlign: "center", marginTop: 8, fontStyle: "italic" }}>
            {rateAdj.reason}
          </Text>
        )}
        <TouchableOpacity style={{ marginTop: 32, backgroundColor: colors.primary, borderRadius: 12, paddingHorizontal: 32, paddingVertical: 14 }} onPress={() => router.back()}>
          <Text style={{ fontSize: 15, fontFamily: "Inter_700Bold", color: "#000" }}>Назад</Text>
        </TouchableOpacity>
      </View>
    );
  }

  return (
    <View style={{ flex: 1, backgroundColor: colors.background }}>
      <View style={[s.header, { paddingTop: topPad + 12 }]}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <Text style={s.headerTitle}>Оставить отзыв</Text>
        <View style={{ width: 36 }} />
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }}>

        <View style={s.targetCard}>
          <Feather name="user" size={20} color={colors.primary} />
          <View style={{ flex: 1, marginLeft: 12 }}>
            <Text style={s.targetName}>{targetName}</Text>
            <Text style={s.targetSub}>Специалист TimeNation</Text>
          </View>
        </View>

        <Text style={s.sectionLabel}>Ваша оценка</Text>
        <StarRow rating={rating} onSelect={setRating} />

        <Text style={[s.sectionLabel, { marginTop: 8 }]}>Ваш отзыв</Text>
        <TextInput
          style={s.textarea}
          value={reviewText}
          onChangeText={setReviewText}
          placeholder="Опишите качество работы, скорость, профессионализм..."
          placeholderTextColor={colors.mutedForeground}
          multiline
          numberOfLines={5}
          textAlignVertical="top"
        />

        <View style={s.taxWarning}>
          <Feather name="alert-triangle" size={15} color="#f59e0b" />
          <Text style={s.taxText}>
            Отправка платная: {REVIEW_TAX} Д поступает в Казначейство TimeNation.
            Отзыв влияет на тариф специалиста через ИИ-Аудитор.
          </Text>
        </View>

        <TouchableOpacity style={[s.btn, loading && { opacity: 0.6 }]} onPress={handleSubmit} disabled={loading}>
          {loading
            ? <ActivityIndicator color="#000" />
            : <Text style={s.btnText}>Отправить отзыв ({REVIEW_TAX} Д)</Text>
          }
        </TouchableOpacity>

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
    targetCard: {
      flexDirection: "row", alignItems: "center",
      backgroundColor: c.card, borderRadius: 14, padding: 16,
      marginBottom: 20, borderWidth: 1, borderColor: c.border,
    },
    targetName: { fontSize: 16, fontFamily: "Inter_700Bold", color: c.foreground },
    targetSub: { fontSize: 12, fontFamily: "Inter_400Regular", color: c.mutedForeground },
    sectionLabel: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: c.foreground, marginBottom: 4 },
    textarea: {
      backgroundColor: c.card, borderRadius: 12, borderWidth: 1, borderColor: c.border,
      padding: 14, fontSize: 14, fontFamily: "Inter_400Regular", color: c.foreground,
      minHeight: 120, marginBottom: 16,
    },
    taxWarning: {
      flexDirection: "row", alignItems: "flex-start", gap: 8,
      backgroundColor: "#f59e0b18", borderRadius: 10, padding: 12, marginBottom: 20,
    },
    taxText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", color: "#f59e0b", lineHeight: 18 },
    btn: {
      backgroundColor: c.primary, borderRadius: 14, padding: 16, alignItems: "center",
    },
    btnText: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#000" },
  });
}
