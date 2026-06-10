import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  FlatList,
  TextInput,
  ActivityIndicator,
  Alert,
  ScrollView,
  Platform,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useColors } from "@/hooks/useColors";
import { useCitizen } from "@/context/CitizenContext";
import { LogoBrand } from "@/components/LogoBrand";

const BASE_URL = `https://${process.env.EXPO_PUBLIC_DOMAIN}`;

type ZoomLevel = 1 | 2 | 3 | 4 | 5;

interface OccupiedEntry {
  timelineCoord: string;
  citizenId: number;
}

function padYear(y: number) { return String(y).padStart(4, "0"); }
function pad2(n: number) { return String(n).padStart(2, "0"); }
function makeCoord(year: number, month: number, day: number, hour: number, minute: number) {
  return `${padYear(year)}${pad2(month)}${pad2(day)}${pad2(hour)}${pad2(minute)}`;
}
function daysInMonth(year: number, month: number) { return new Date(year, month, 0).getDate(); }

const MONTH_NAMES = ["Янв","Фев","Мар","Апр","Май","Июн","Июл","Авг","Сен","Окт","Ноя","Дек"];

export default function TimelineScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const { citizen } = useCitizen();

  const [zoom, setZoom] = useState<ZoomLevel>(1);
  const [selectedCentury, setSelectedCentury] = useState<number>(21);
  const [selectedYear, setSelectedYear] = useState<number>(2026);
  const [selectedMonth, setSelectedMonth] = useState<number>(1);
  const [selectedDay, setSelectedDay] = useState<number>(1);
  const [selectedHour, setSelectedHour] = useState<number>(0);
  const [occupied, setOccupied] = useState<OccupiedEntry[]>([]);
  const [loadingOccupied, setLoadingOccupied] = useState(false);
  const [anchoring, setAnchoring] = useState<string | null>(null);
  const [jumpYear, setJumpYear] = useState("");
  const [jumpMonth, setJumpMonth] = useState("");
  const [jumpDay, setJumpDay] = useState("");

  const fetchOccupied = useCallback(async (year: number, month?: number, day?: number) => {
    setLoadingOccupied(true);
    try {
      let url = `${BASE_URL}/api/timeline/occupied?year=${padYear(year)}`;
      if (month) url += `&month=${pad2(month)}`;
      if (day) url += `&day=${pad2(day)}`;
      const res = await fetch(url);
      if (res.ok) setOccupied((await res.json()) as OccupiedEntry[]);
    } catch {} finally { setLoadingOccupied(false); }
  }, []);

  useEffect(() => {
    if (zoom === 3) fetchOccupied(selectedYear, selectedMonth);
    if (zoom === 4) fetchOccupied(selectedYear, selectedMonth, selectedDay);
    if (zoom === 5) fetchOccupied(selectedYear, selectedMonth, selectedDay);
  }, [zoom, selectedYear, selectedMonth, selectedDay, fetchOccupied]);

  const anchorMinute = useCallback(async (coord: string) => {
    if (!citizen) { Alert.alert("Нужна авторизация", "Зарегистрируйтесь как гражданин"); return; }
    const humanCoord = `${coord.slice(6, 8)}.${coord.slice(4, 6)}.${parseInt(coord.slice(0, 4), 10)} ${coord.slice(8, 10)}:${coord.slice(10, 12)}`;
    Alert.alert("⏳ Закрепить координату", `Зафиксировать координату ${humanCoord} навсегда за вашим родом?\n\nСтоимость: 1 Дармин`, [
      { text: "Отмена", style: "cancel" },
      { text: "Закрепить", onPress: async () => {
        setAnchoring(coord);
        try {
          const res = await fetch(`${BASE_URL}/api/timeline/anchor`, {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ citizenId: citizen.id, timelineCoord: coord }),
          });
          const data = await res.json() as { error?: string; newBalance?: number };
          if (!res.ok) Alert.alert("Ошибка", data.error ?? "Не удалось закрепить координату");
          else {
            Alert.alert("✅ Зафиксировано!", `Координата ${humanCoord} закреплена навсегда!\nОстаток: ${data.newBalance} Д`);
            await fetchOccupied(selectedYear, selectedMonth, selectedDay);
          }
        } catch { Alert.alert("Ошибка", "Не удалось подключиться к серверу"); }
        finally { setAnchoring(null); }
      }},
    ]);
  }, [citizen, selectedYear, selectedMonth, selectedDay, fetchOccupied]);

  const jumpToDate = useCallback(() => {
    const y = parseInt(jumpYear, 10);
    const m = parseInt(jumpMonth || "1", 10);
    const d = parseInt(jumpDay || "1", 10);
    if (!y || y < 1 || y > 9999) { Alert.alert("Ошибка", "Год должен быть от 1 до 9999"); return; }
    setSelectedCentury(Math.ceil(y / 100));
    setSelectedYear(y);
    setSelectedMonth(Math.min(Math.max(m, 1), 12));
    setSelectedDay(Math.min(Math.max(d, 1), daysInMonth(y, m)));
    setZoom(4);
  }, [jumpYear, jumpMonth, jumpDay]);

  const styles = getStyles(colors);
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const getBreadcrumb = () => {
    if (zoom === 1) return "Таймлайн";
    if (zoom === 2) return `${selectedCentury} век`;
    if (zoom === 3) return `${selectedYear} г. — ${MONTH_NAMES[selectedMonth - 1]}`;
    if (zoom === 4) return `${pad2(selectedDay)}.${pad2(selectedMonth)}.${selectedYear}`;
    return `${pad2(selectedDay)}.${pad2(selectedMonth)}.${selectedYear} ${pad2(selectedHour)}:__`;
  };

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <View style={styles.header}>
        <View style={styles.headerRow}>
          {zoom > 1 && (
            <TouchableOpacity style={styles.backBtn} onPress={() => setZoom((z) => (z - 1) as ZoomLevel)}>
              <Feather name="arrow-left" size={18} color={colors.primary} />
            </TouchableOpacity>
          )}
          <LogoBrand size={24} />
          <Text style={styles.headerTitle}>Таймлайн</Text>
          <Text style={styles.breadcrumb}>{getBreadcrumb()}</Text>
        </View>
        <View style={styles.jumpRow}>
          <TextInput style={styles.jumpInput} placeholder="Год" placeholderTextColor={colors.mutedForeground} keyboardType="numeric" value={jumpYear} onChangeText={setJumpYear} maxLength={4} />
          <TextInput style={styles.jumpInput} placeholder="Мес" placeholderTextColor={colors.mutedForeground} keyboardType="numeric" value={jumpMonth} onChangeText={setJumpMonth} maxLength={2} />
          <TextInput style={styles.jumpInput} placeholder="День" placeholderTextColor={colors.mutedForeground} keyboardType="numeric" value={jumpDay} onChangeText={setJumpDay} maxLength={2} />
          <TouchableOpacity style={styles.jumpBtn} onPress={jumpToDate}>
            <Feather name="navigation" size={14} color={colors.background} />
            <Text style={styles.jumpBtnText}>Перейти</Text>
          </TouchableOpacity>
        </View>
      </View>

      {loadingOccupied && (
        <View style={styles.loadingBar}>
          <ActivityIndicator size="small" color={colors.primary} />
          <Text style={styles.loadingText}>Загрузка...</Text>
        </View>
      )}

      {zoom === 1 && (
        <FlatList
          data={Array.from({ length: 100 }, (_, i) => i + 1)}
          keyExtractor={(c) => String(c)}
          numColumns={5}
          contentContainerStyle={styles.gridContainer}
          renderItem={({ item: c }) => (
            <TouchableOpacity style={[styles.gridCell, styles.centuryCell]} onPress={() => { setSelectedCentury(c); setZoom(2); }}>
              <Text style={styles.centuryCellText}>{c} в.</Text>
              <Text style={styles.centuryYearHint}>{(c - 1) * 100 + 1}–{c * 100}</Text>
            </TouchableOpacity>
          )}
        />
      )}
      {zoom === 2 && (
        <FlatList
          data={Array.from({ length: 100 }, (_, i) => (selectedCentury - 1) * 100 + 1 + i).filter((y) => y <= 9999)}
          keyExtractor={(y) => String(y)}
          numColumns={5}
          contentContainerStyle={styles.gridContainer}
          renderItem={({ item: y }) => (
            <TouchableOpacity style={[styles.gridCell, styles.yearCell]} onPress={() => { setSelectedYear(y); setZoom(3); }}>
              <Text style={styles.yearCellText}>{y}</Text>
            </TouchableOpacity>
          )}
        />
      )}
      {zoom === 3 && (
        <ScrollView contentContainerStyle={styles.calendarContainer}>
          <View style={styles.monthRow}>
            {MONTH_NAMES.map((name, i) => (
              <TouchableOpacity key={i} style={[styles.monthChip, selectedMonth === i + 1 && styles.monthChipActive]} onPress={() => setSelectedMonth(i + 1)}>
                <Text style={[styles.monthChipText, selectedMonth === i + 1 && styles.monthChipTextActive]}>{name}</Text>
              </TouchableOpacity>
            ))}
          </View>
          <View style={styles.daysGrid}>
            {Array.from({ length: daysInMonth(selectedYear, selectedMonth) }, (_, i) => i + 1).map((d) => {
              const prefix = `${padYear(selectedYear)}${pad2(selectedMonth)}${pad2(d)}`;
              const mine = occupied.some((o) => o.timelineCoord.startsWith(prefix) && o.citizenId === citizen?.id);
              const occ = !mine && occupied.some((o) => o.timelineCoord.startsWith(prefix));
              return (
                <TouchableOpacity key={d} style={[styles.dayCell, mine && { backgroundColor: colors.primary }, occ && { backgroundColor: "#e63946" }]} onPress={() => { setSelectedDay(d); setZoom(4); }}>
                  <Text style={[styles.dayCellText, (mine || occ) && { color: "#fff" }]}>{d}</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      )}
      {zoom === 4 && (
        <ScrollView contentContainerStyle={styles.hoursContainer}>
          <Text style={styles.minuteTitle}>{pad2(selectedDay)}.{pad2(selectedMonth)}.{selectedYear} — выберите час</Text>
          <View style={styles.hoursGrid}>
            {Array.from({ length: 24 }, (_, h) => h).map((h) => {
              const prefix = `${padYear(selectedYear)}${pad2(selectedMonth)}${pad2(selectedDay)}${pad2(h)}`;
              const mine = occupied.some((o) => o.timelineCoord.startsWith(prefix) && o.citizenId === citizen?.id);
              const occ = !mine && occupied.some((o) => o.timelineCoord.startsWith(prefix));
              return (
                <TouchableOpacity
                  key={h}
                  style={[styles.hourCell, mine && { backgroundColor: colors.primary, borderColor: colors.primary }, occ && { backgroundColor: "#e63946", borderColor: "#e63946" }]}
                  onPress={() => { setSelectedHour(h); setZoom(5); }}
                  activeOpacity={0.75}
                >
                  <Text style={[styles.hourCellText, (mine || occ) && { color: "#fff" }]}>{pad2(h)}</Text>
                  <Text style={[styles.hourCellSub, (mine || occ) && { color: "rgba(255,255,255,0.7)" }]}>:00</Text>
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      )}
      {zoom === 5 && (
        <ScrollView contentContainerStyle={styles.minuteContainer}>
          <Text style={styles.minuteTitle}>
            {pad2(selectedDay)}.{pad2(selectedMonth)}.{selectedYear} {pad2(selectedHour)}:00 — {pad2(selectedHour)}:59 — выберите минуту
          </Text>
          <View style={styles.minuteGrid}>
            {Array.from({ length: 60 }, (_, min) => {
              const coord = makeCoord(selectedYear, selectedMonth, selectedDay, selectedHour, min);
              const ownerId = occupied.find((o) => o.timelineCoord === coord)?.citizenId;
              const isMine = ownerId === citizen?.id;
              const isOccupied = !!ownerId && !isMine;
              const isAnchoring = anchoring === coord;
              return (
                <TouchableOpacity
                  key={min}
                  style={[
                    styles.minuteCell,
                    isMine && { backgroundColor: colors.primary, borderColor: colors.primary },
                    isOccupied && { backgroundColor: "#e63946", borderColor: "#e63946" },
                  ]}
                  onPress={() => !ownerId && anchorMinute(coord)}
                  disabled={!!ownerId || !!anchoring}
                  activeOpacity={0.7}
                >
                  {isAnchoring ? (
                    <ActivityIndicator size={10} color="#fff" />
                  ) : (
                    <Text style={[styles.minuteText, (isMine || isOccupied) && { color: "#fff" }]}>
                      {pad2(min)}
                    </Text>
                  )}
                </TouchableOpacity>
              );
            })}
          </View>
        </ScrollView>
      )}

      <View style={[styles.legend, { paddingBottom: insets.bottom + 80 }]}>
        {[{ color: colors.primary, label: "Мои" }, { color: "#e63946", label: "Занято" }, { color: colors.card, label: "Свободно" }].map((item) => (
          <View key={item.label} style={styles.legendItem}>
            <View style={[styles.legendDot, { backgroundColor: item.color }]} />
            <Text style={styles.legendText}>{item.label}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

function getStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { paddingHorizontal: 16, paddingBottom: 8, borderBottomWidth: 1, borderBottomColor: colors.border },
    headerRow: { flexDirection: "row", alignItems: "center", gap: 8, paddingVertical: 8 },
    backBtn: { padding: 4 },
    headerTitle: { fontSize: 18, fontWeight: "700", color: colors.primary },
    breadcrumb: { fontSize: 13, color: colors.mutedForeground, marginLeft: "auto" },
    jumpRow: { flexDirection: "row", gap: 6, paddingBottom: 6 },
    jumpInput: { flex: 1, height: 34, borderRadius: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card, color: colors.foreground, paddingHorizontal: 8, fontSize: 13, textAlign: "center" },
    jumpBtn: { flexDirection: "row", alignItems: "center", gap: 4, backgroundColor: colors.primary, paddingHorizontal: 10, borderRadius: 8, height: 34 },
    jumpBtnText: { color: colors.background, fontSize: 12, fontWeight: "600" },
    loadingBar: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 16, paddingVertical: 6 },
    loadingText: { color: colors.mutedForeground, fontSize: 12 },
    gridContainer: { padding: 12, gap: 6 },
    gridCell: { flex: 1, margin: 3, borderRadius: 8, alignItems: "center", justifyContent: "center", padding: 8, borderWidth: 1, borderColor: colors.border, backgroundColor: colors.card },
    centuryCell: { minHeight: 56 },
    centuryCellText: { color: colors.foreground, fontSize: 13, fontWeight: "600" },
    centuryYearHint: { color: colors.mutedForeground, fontSize: 9, marginTop: 2 },
    yearCell: { minHeight: 44 },
    yearCellText: { color: colors.foreground, fontSize: 13, fontWeight: "500" },
    calendarContainer: { padding: 12 },
    monthRow: { flexDirection: "row", flexWrap: "wrap", gap: 6, marginBottom: 14 },
    monthChip: { paddingHorizontal: 10, paddingVertical: 5, borderRadius: 20, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
    monthChipActive: { backgroundColor: colors.primary, borderColor: colors.primary },
    monthChipText: { color: colors.foreground, fontSize: 12 },
    monthChipTextActive: { color: colors.background, fontWeight: "700" },
    daysGrid: { flexDirection: "row", flexWrap: "wrap", gap: 4 },
    dayCell: { width: 40, height: 40, borderRadius: 8, backgroundColor: colors.card, alignItems: "center", justifyContent: "center", borderWidth: 1, borderColor: colors.border },
    dayCellText: { color: colors.foreground, fontSize: 14, fontWeight: "500" },
    minuteContainer: { paddingHorizontal: 12, paddingBottom: 16 },
    minuteTitle: { color: colors.mutedForeground, fontSize: 11, textAlign: "center", paddingVertical: 8 },
    hoursContainer: { padding: 12 },
    hoursGrid: { flexDirection: "row", flexWrap: "wrap", gap: 8 },
    hourCell: { width: "21%", aspectRatio: 1.6, borderRadius: 10, backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border, alignItems: "center" as const, justifyContent: "center" as const, flexDirection: "row" as const, gap: 1 },
    hourCellText: { fontSize: 18, fontFamily: "Inter_700Bold", color: colors.foreground },
    hourCellSub: { fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 4 },
    minuteGrid: { flexDirection: "row" as const, flexWrap: "wrap" as const },
    minuteCell: { width: "10%" as const, aspectRatio: 1, padding: 3, borderRadius: 6, backgroundColor: colors.card, alignItems: "center" as const, justifyContent: "center" as const, borderWidth: 1, borderColor: colors.border },
    minuteText: { color: colors.mutedForeground, fontSize: 11, fontFamily: "Inter_500Medium" },
    legend: { flexDirection: "row", justifyContent: "center", gap: 20, paddingTop: 8, paddingHorizontal: 16 },
    legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
    legendDot: { width: 10, height: 10, borderRadius: 5 },
    legendText: { color: colors.mutedForeground, fontSize: 12 },
  });
}
