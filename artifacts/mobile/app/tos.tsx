import React, { useState } from "react";
import {
  View, Text, StyleSheet, TouchableOpacity, ScrollView, Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useRouter } from "expo-router";
import { useColors } from "@/hooks/useColors";
import { LogoBrand } from "@/components/LogoBrand";

const SECTIONS = [
  {
    title: "1. Природа Дарминов",
    body: "Дармины (ДАРМИН) — внутриигровые баллы IT-платформы TimeNation. Они не являются электронными деньгами, криптовалютой, ценными бумагами или иным финансовым инструментом. Использование Дарминов за пределами платформы не предусмотрено.",
  },
  {
    title: "2. TiMETR-сессии",
    body: "Передача Дарминов происходит в рамках TiMETR-сессий — измерения реального времени взаимодействия. 1 Дармин = 1 минута эфирного времени в рамках платформы.",
  },
  {
    title: "3. Земельный Фонд / Посольства",
    body: "Регистрация «Посольства» означает предоставление площади под узел связи (ноду) распределённой IT-сети. Это оформляется как «Локус размещения узла» — не как аренда земли. Вознаграждение в Дарминах начисляется за поддержание аптайма ноды.",
  },
  {
    title: "4. P2P-аукционы",
    body: "Платформа является доской объявлений P2P-сделок с Дарминами. Фиатные деньги в систему не входят. Платформа берёт 2% комиссии с завершённых сделок в Дарминах. Платформа не является обменником.",
  },
  {
    title: "5. Геймификация",
    body: "Термины «Государство», «Гражданин», «Посол», «Казначейство» являются элементами геймификации и художественного оформления IT-платформы. Они не несут юридической силы и не создают государственно-правовых отношений.",
  },
  {
    title: "6. Оплата и возвраты",
    body: "Оплата картой в EUR обрабатывается через Stripe. USDT-платежи через TRC20 или WalletConnect выполняются в блокчейн-сетях и не обрабатываются Stripe. Возврат можно запросить в течение 14 календарных дней с даты оплаты при любом способе оплаты. Для запроса напишите на support@timenation.info.",
  },
];

export default function TosScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const [accepted, setAccepted] = useState(false);
  const topPad = Platform.OS === "web" ? 67 : insets.top;
  const botPad = Platform.OS === "web" ? 34 : insets.bottom;
  const styles = getStyles(colors);

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <View style={styles.header}>
        <LogoBrand size={32} />
        <Text style={styles.headerTitle}>Пользовательское соглашение</Text>
      </View>

      <ScrollView style={styles.scroll} contentContainerStyle={{ padding: 20, paddingBottom: 120 }}>
        <Text style={styles.intro}>
          Перед использованием платформы TimeNation ознакомься с ключевыми условиями. Дармины — это внутриигровые баллы, не деньги.
        </Text>
        {SECTIONS.map((s, i) => (
          <View key={i} style={styles.section}>
            <Text style={styles.sectionTitle}>{s.title}</Text>
            <Text style={styles.sectionBody}>{s.body}</Text>
          </View>
        ))}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: botPad + 16 }]}>
        <TouchableOpacity
          style={styles.checkRow}
          onPress={() => setAccepted(!accepted)}
          activeOpacity={0.8}
        >
          <View style={[styles.checkbox, accepted && styles.checkboxChecked]}>
            {accepted && <Text style={styles.checkmark}>✓</Text>}
          </View>
          <Text style={styles.checkLabel}>Я прочитал(а) и принимаю условия</Text>
        </TouchableOpacity>
        <TouchableOpacity
          style={[styles.acceptBtn, !accepted && styles.acceptBtnDisabled]}
          onPress={() => router.replace("/(tabs)")}
          disabled={!accepted}
          activeOpacity={0.8}
        >
          <Text style={styles.acceptBtnText}>Принять и продолжить</Text>
        </TouchableOpacity>
      </View>
    </View>
  );
}

function getStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1, borderBottomColor: colors.border },
    headerTitle: { fontSize: 17, fontFamily: "Inter_700Bold", color: colors.foreground, flex: 1 },
    scroll: { flex: 1 },
    intro: { fontSize: 14, fontFamily: "Inter_400Regular", color: colors.mutedForeground, lineHeight: 21, marginBottom: 20, backgroundColor: colors.card, padding: 16, borderRadius: 12, borderWidth: 1, borderColor: colors.border },
    section: { marginBottom: 20 },
    sectionTitle: { fontSize: 15, fontFamily: "Inter_700Bold", color: colors.foreground, marginBottom: 6 },
    sectionBody: { fontSize: 13, fontFamily: "Inter_400Regular", color: colors.mutedForeground, lineHeight: 20 },
    footer: { borderTopWidth: 1, borderTopColor: colors.border, padding: 20, backgroundColor: colors.background },
    checkRow: { flexDirection: "row", alignItems: "center", gap: 12, marginBottom: 16 },
    checkbox: { width: 22, height: 22, borderRadius: 6, borderWidth: 2, borderColor: colors.border, alignItems: "center", justifyContent: "center" },
    checkboxChecked: { backgroundColor: colors.primary, borderColor: colors.primary },
    checkmark: { fontSize: 14, color: colors.primaryForeground, fontFamily: "Inter_700Bold" },
    checkLabel: { flex: 1, fontSize: 14, fontFamily: "Inter_500Medium", color: colors.foreground },
    acceptBtn: { backgroundColor: colors.primary, borderRadius: 12, padding: 16, alignItems: "center" },
    acceptBtnDisabled: { opacity: 0.4 },
    acceptBtnText: { fontSize: 16, fontFamily: "Inter_700Bold", color: colors.primaryForeground },
  });
}
