import { getBaseUrl } from "@/lib/api";
import React, { useState, useCallback, useEffect } from "react";
import {
  View,
  Text,
  StyleSheet,
  TouchableOpacity,
  Pressable,
  FlatList,
  TextInput,
  ActivityIndicator,
  ScrollView,
  Platform,
  Modal,
  Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useColors } from "@/hooks/useColors";
import { useCitizen } from "@/context/CitizenContext";
import { LogoBrand } from "@/components/LogoBrand";

const BASE_URL = getBaseUrl();

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
  const [confirmCoord, setConfirmCoord] = useState<string | null>(null);
  const [anchorResult, setAnchorResult] = useState<{ ok: boolean; msg: string } | null>(null);
  const [jumpYear, setJumpYear] = useState("");
  const [jumpMonth, setJumpMonth] = useState("");
  const [jumpDay, setJumpDay] = useState("");
  const [showMyAnchors, setShowMyAnchors] = useState(false);
  const [selectedAnchor, setSelectedAnchor] = useState<{ timelineCoord: string; status: string; createdAt: string } | null>(null);
  const [showAnchorActions, setShowAnchorActions] = useState(false);
  const [showCapsule, setShowCapsule] = useState(false);
  const [capsuleText, setCapsuleText] = useState("");
  const [capsuleSaving, setCapsuleSaving] = useState(false);

  const router = useRouter();

  const { data: myAnchors = [], refetch: refetchMyAnchors } = useQuery<
    { timelineCoord: string; status: string; createdAt: string }[]
  >({
    queryKey: ["myAnchors", citizen?.id],
    queryFn: async () => {
      if (!citizen) return [];
      const res = await fetch(`${BASE_URL}/api/timeline/my-anchors?citizenId=${citizen.id}`);
      if (!res.ok) return [];
      return res.json();
    },
    enabled: !!citizen,
  });

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

  const doAnchor = useCallback(async (coord: string) => {
    if (!citizen) { setAnchorResult({ ok: false, msg: "Зарегистрируйтесь как гражданин" }); return; }
    setConfirmCoord(null);
    setAnchoring(coord);
    setAnchorResult(null);
    try {
      const res = await fetch(`${BASE_URL}/api/timeline/anchor`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ citizenId: citizen.id, timelineCoord: coord }),
      });
      const data = await res.json() as { error?: string; newBalance?: number };
      if (!res.ok) {
        setAnchorResult({ ok: false, msg: data.error ?? "Не удалось закрепить координату" });
      } else {
        setAnchorResult({ ok: true, msg: `Зафиксировано! Остаток: ${data.newBalance} Д` });
        await fetchOccupied(selectedYear, selectedMonth, selectedDay);
        void refetchMyAnchors();
      }
    } catch {
      setAnchorResult({ ok: false, msg: "Ошибка соединения с сервером" });
    } finally {
      setAnchoring(null);
    }
  }, [citizen, selectedYear, selectedMonth, selectedDay, fetchOccupied]);

  const jumpToDate = useCallback(() => {
    const y = parseInt(jumpYear, 10);
    const m = parseInt(jumpMonth || "1", 10);
    const d = parseInt(jumpDay || "1", 10);
    if (!y || y < 1 || y > 9999) { setAnchorResult({ ok: false, msg: "Год должен быть от 1 до 9999" }); return; }
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
          {citizen && (
            <TouchableOpacity
              style={[styles.myAnchorsBtn, { borderColor: colors.primary + "55", backgroundColor: colors.card }]}
              onPress={() => setShowMyAnchors(true)}
            >
              <Feather name="map-pin" size={13} color={colors.primary} />
              {myAnchors.length > 0 && (
                <Text style={[styles.myAnchorsBadge, { color: colors.primary }]}>{myAnchors.length}</Text>
              )}
            </TouchableOpacity>
          )}
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
              const isPending = confirmCoord === coord;
              return (
                <Pressable
                  key={min}
                  style={({ pressed }) => [
                    styles.minuteCell,
                    isMine && { backgroundColor: colors.primary, borderColor: colors.primary },
                    isOccupied && { backgroundColor: "#e63946", borderColor: "#e63946" },
                    isPending && { backgroundColor: colors.primary + "66", borderColor: colors.primary },
                    pressed && !ownerId && { opacity: 0.6 },
                  ]}
                  onPress={() => {
                    if (ownerId) return;
                    setAnchorResult(null);
                    setConfirmCoord(coord);
                  }}
                  disabled={!!ownerId || !!anchoring}
                >
                  {isAnchoring ? (
                    <ActivityIndicator size={10} color="#fff" />
                  ) : (
                    <Text style={[styles.minuteText, (isMine || isOccupied || isPending) && { color: "#fff" }]}>
                      {pad2(min)}
                    </Text>
                  )}
                </Pressable>
              );
            })}
          </View>

          {/* Inline confirm panel — shown when a free minute is tapped */}
          {confirmCoord && (
            <View style={styles.confirmPanel}>
              <Text style={styles.confirmTitle}>⏳ Закрепить координату</Text>
              <Text style={styles.confirmMsg}>
                {`${confirmCoord.slice(6,8)}.${confirmCoord.slice(4,6)}.${parseInt(confirmCoord.slice(0,4),10)} ${confirmCoord.slice(8,10)}:${confirmCoord.slice(10,12)}`}
                {"\n"}Навсегда за вашим родом · Стоимость: 1 Дармин
              </Text>
              <View style={styles.confirmBtns}>
                <Pressable style={[styles.confirmBtn, styles.confirmBtnCancel]} onPress={() => setConfirmCoord(null)}>
                  <Text style={styles.confirmBtnCancelText}>Отмена</Text>
                </Pressable>
                <Pressable style={[styles.confirmBtn, styles.confirmBtnOk]} onPress={() => doAnchor(confirmCoord)}>
                  <Text style={styles.confirmBtnOkText}>Закрепить</Text>
                </Pressable>
              </View>
            </View>
          )}

          {/* Result message */}
          {anchorResult && (
            <Pressable onPress={() => setAnchorResult(null)}>
              <View style={[styles.resultPanel, anchorResult.ok ? styles.resultOk : styles.resultErr]}>
                <Text style={styles.resultText}>{anchorResult.ok ? "✅ " : "❌ "}{anchorResult.msg}</Text>
              </View>
            </Pressable>
          )}
        </ScrollView>
      )}

      {/* ── Anchor Action Sheet ──────────────────────────────────────────── */}
      <Modal visible={showAnchorActions} transparent animationType="slide" onRequestClose={() => setShowAnchorActions(false)}>
        <Pressable style={styles.asOverlay} onPress={() => setShowAnchorActions(false)}>
          <Pressable style={[styles.asSheet, { backgroundColor: colors.card }]} onPress={() => {}}>
            {/* drag handle */}
            <View style={[styles.asHandle, { backgroundColor: colors.border }]} />

            {/* coord label */}
            {selectedAnchor && (() => {
              const c = selectedAnchor.timelineCoord;
              const label = `${c.slice(6,8)}.${c.slice(4,6)}.${parseInt(c.slice(0,4),10)}  ${c.slice(8,10)}:${c.slice(10,12)}`;
              return (
                <View style={[styles.asCoordBox, { borderColor: colors.border }]}>
                  <Feather name="map-pin" size={14} color={colors.primary} />
                  <Text style={[styles.asCoordText, { color: colors.foreground }]}>{label}</Text>
                  <Text style={[styles.asCoordRaw, { color: colors.mutedForeground }]}>{c}</Text>
                </View>
              );
            })()}

            {/* action 1 — navigate */}
            <TouchableOpacity style={[styles.asRow, { borderBottomColor: colors.border }]} onPress={() => {
              if (!selectedAnchor) return;
              const c = selectedAnchor.timelineCoord;
              setSelectedYear(parseInt(c.slice(0,4),10));
              setSelectedCentury(Math.ceil(parseInt(c.slice(0,4),10)/100));
              setSelectedMonth(parseInt(c.slice(4,6),10));
              setSelectedDay(parseInt(c.slice(6,8),10));
              setSelectedHour(parseInt(c.slice(8,10),10));
              setZoom(5);
              setShowAnchorActions(false);
              setShowMyAnchors(false);
            }}>
              <View style={[styles.asIconBox, { backgroundColor: colors.primary + "22" }]}>
                <Feather name="navigation" size={18} color={colors.primary} />
              </View>
              <View style={styles.asRowText}>
                <Text style={[styles.asRowTitle, { color: colors.foreground }]}>Перейти к минуте</Text>
                <Text style={[styles.asRowSub, { color: colors.mutedForeground }]}>Открыть в таймлайне</Text>
              </View>
            </TouchableOpacity>

            {/* action 2 — capsule */}
            <TouchableOpacity style={[styles.asRow, { borderBottomColor: colors.border }]} onPress={() => {
              setShowAnchorActions(false);
              setTimeout(() => { setCapsuleText(""); setShowCapsule(true); }, 350);
            }}>
              <View style={[styles.asIconBox, { backgroundColor: "#7c3aed22" }]}>
                <Feather name="box" size={18} color="#7c3aed" />
              </View>
              <View style={styles.asRowText}>
                <Text style={[styles.asRowTitle, { color: colors.foreground }]}>Создать смысловую капсулу</Text>
                <Text style={[styles.asRowSub, { color: colors.mutedForeground }]}>Вложить текст в координату времени</Text>
              </View>
            </TouchableOpacity>

            {/* action 3 — auction */}
            <TouchableOpacity style={[styles.asRow, { borderBottomColor: colors.border }]} onPress={() => {
              setShowAnchorActions(false);
              setShowMyAnchors(false);
              setTimeout(() => router.push("/(tabs)/auctions" as never), 400);
            }}>
              <View style={[styles.asIconBox, { backgroundColor: "#e6952222" }]}>
                <Feather name="tag" size={18} color="#e69522" />
              </View>
              <View style={styles.asRowText}>
                <Text style={[styles.asRowTitle, { color: colors.foreground }]}>Выставить на аукцион</Text>
                <Text style={[styles.asRowSub, { color: colors.mutedForeground }]}>Продать минуту на P2P-рынке за Дармины</Text>
              </View>
            </TouchableOpacity>

            {/* action 4 — swap free */}
            <TouchableOpacity style={[styles.asRow, { borderBottomColor: colors.border }]} onPress={() =>
              Alert.alert("Скоро", "Обмен на свободную минуту будет доступен в следующем обновлении.")
            }>
              <View style={[styles.asIconBox, { backgroundColor: "#0ea5e922" }]}>
                <Feather name="refresh-cw" size={18} color="#0ea5e9" />
              </View>
              <View style={styles.asRowText}>
                <Text style={[styles.asRowTitle, { color: colors.foreground }]}>Обменять на свободную минуту</Text>
                <Text style={[styles.asRowSub, { color: colors.mutedForeground }]}>Переместить якорь на незанятую координату</Text>
              </View>
              <View style={styles.asSoon}><Text style={styles.asSoonText}>Скоро</Text></View>
            </TouchableOpacity>

            {/* action 5 — swap occupied */}
            <TouchableOpacity style={[styles.asRow, { borderBottomColor: colors.border }]} onPress={() =>
              Alert.alert("Скоро", "Обмен с другим гражданином будет доступен в следующем обновлении.")
            }>
              <View style={[styles.asIconBox, { backgroundColor: "#e6394622" }]}>
                <Feather name="users" size={18} color="#e63946" />
              </View>
              <View style={styles.asRowText}>
                <Text style={[styles.asRowTitle, { color: colors.foreground }]}>Обменять на занятую минуту</Text>
                <Text style={[styles.asRowSub, { color: colors.mutedForeground }]}>Договорной своп с другим гражданином</Text>
              </View>
              <View style={styles.asSoon}><Text style={styles.asSoonText}>Скоро</Text></View>
            </TouchableOpacity>

            {/* cancel */}
            <TouchableOpacity style={styles.asCancel} onPress={() => setShowAnchorActions(false)}>
              <Text style={[styles.asCancelText, { color: colors.mutedForeground }]}>Отмена</Text>
            </TouchableOpacity>
          </Pressable>
        </Pressable>
      </Modal>

      {/* ── Capsule Creation Modal ────────────────────────────────────────── */}
      <Modal visible={showCapsule} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowCapsule(false)}>
        <View style={[styles.capModal, { backgroundColor: colors.background }]}>
          <View style={[styles.capHeader, { borderBottomColor: colors.border }]}>
            <View style={styles.capHeaderLeft}>
              <Feather name="box" size={18} color="#7c3aed" />
              <Text style={[styles.capHeaderTitle, { color: colors.foreground }]}>Смысловая капсула</Text>
            </View>
            <TouchableOpacity onPress={() => setShowCapsule(false)} style={styles.maClose}>
              <Feather name="x" size={22} color={colors.foreground} />
            </TouchableOpacity>
          </View>

          {selectedAnchor && (() => {
            const c = selectedAnchor.timelineCoord;
            const label = `${c.slice(6,8)}.${c.slice(4,6)}.${parseInt(c.slice(0,4),10)}  ${c.slice(8,10)}:${c.slice(10,12)}`;
            return (
              <View style={[styles.capCoordBadge, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <Feather name="map-pin" size={12} color={colors.primary} />
                <Text style={[styles.capCoordBadgeText, { color: colors.mutedForeground }]}>{label} · {c}</Text>
              </View>
            );
          })()}

          <Text style={[styles.capLabel, { color: colors.foreground }]}>Смысл этой минуты</Text>
          <TextInput
            style={[styles.capInput, { backgroundColor: colors.card, borderColor: colors.border, color: colors.foreground }]}
            multiline
            numberOfLines={6}
            placeholder="Опишите, что значит для вас эта минута…"
            placeholderTextColor={colors.mutedForeground}
            value={capsuleText}
            onChangeText={setCapsuleText}
            maxLength={1000}
            textAlignVertical="top"
          />
          <Text style={[styles.capCount, { color: colors.mutedForeground }]}>{capsuleText.length}/1000</Text>

          <TouchableOpacity
            style={[styles.capSaveBtn, { backgroundColor: capsuleText.trim() ? "#7c3aed" : colors.border, opacity: capsuleSaving ? 0.6 : 1 }]}
            disabled={!capsuleText.trim() || capsuleSaving}
            onPress={async () => {
              if (!citizen || !selectedAnchor || !capsuleText.trim()) return;
              setCapsuleSaving(true);
              try {
                const res = await fetch(`${BASE_URL}/api/timeline/capsule`, {
                  method: "POST",
                  headers: { "Content-Type": "application/json" },
                  body: JSON.stringify({ citizenId: citizen.id, timelineCoord: selectedAnchor.timelineCoord, text: capsuleText.trim() }),
                });
                if (res.ok) {
                  setShowCapsule(false);
                  Alert.alert("Готово", "Капсула сохранена в вашей координатe времени.");
                } else {
                  const d = await res.json() as { error?: string };
                  Alert.alert("Ошибка", d.error ?? "Не удалось сохранить капсулу");
                }
              } catch {
                Alert.alert("Ошибка", "Ошибка соединения с сервером");
              } finally {
                setCapsuleSaving(false);
              }
            }}
          >
            {capsuleSaving
              ? <ActivityIndicator color="#fff" />
              : <Text style={styles.capSaveBtnText}>Сохранить капсулу</Text>}
          </TouchableOpacity>
        </View>
      </Modal>

      {/* ── My Anchors Modal ─────────────────────────────────────────────── */}
      <Modal visible={showMyAnchors} animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setShowMyAnchors(false)}>
        <View style={[styles.maModal, { backgroundColor: colors.background }]}>
          <View style={[styles.maHeader, { borderBottomColor: colors.border }]}>
            <View style={styles.maHeaderLeft}>
              <Feather name="map-pin" size={18} color={colors.primary} />
              <Text style={[styles.maHeaderTitle, { color: colors.foreground }]}>My TIME</Text>
              <View style={[styles.maCount, { backgroundColor: colors.primary }]}>
                <Text style={styles.maCountText}>{myAnchors.length}</Text>
              </View>
            </View>
            <TouchableOpacity onPress={() => setShowMyAnchors(false)} style={styles.maClose}>
              <Feather name="x" size={22} color={colors.foreground} />
            </TouchableOpacity>
          </View>

          {myAnchors.length === 0 ? (
            <View style={styles.maEmpty}>
              <Feather name="clock" size={40} color={colors.mutedForeground} />
              <Text style={[styles.maEmptyTitle, { color: colors.foreground }]}>Нет закреплённых координат</Text>
              <Text style={[styles.maEmptyText, { color: colors.mutedForeground }]}>
                Перейдите к нужной минуте в таймлайне и нажмите на неё — стоимость 1 Д
              </Text>
            </View>
          ) : (
            <FlatList
              data={myAnchors}
              keyExtractor={(a) => a.timelineCoord}
              contentContainerStyle={styles.maList}
              showsVerticalScrollIndicator={false}
              renderItem={({ item: a }) => {
                const c = a.timelineCoord;
                const label = `${c.slice(6,8)}.${c.slice(4,6)}.${parseInt(c.slice(0,4),10)}  ${c.slice(8,10)}:${c.slice(10,12)}`;
                return (
                  <TouchableOpacity
                    activeOpacity={0.75}
                    style={[styles.maRow, { backgroundColor: colors.card, borderColor: colors.border }]}
                    onPress={() => { setSelectedAnchor(a); setShowAnchorActions(true); }}
                  >
                    <View style={styles.maRowLeft}>
                      <Text style={[styles.maCoordLabel, { color: colors.foreground }]}>{label}</Text>
                      <Text style={[styles.maCoordRaw, { color: colors.mutedForeground }]}>{c}</Text>
                    </View>
                    <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
                  </TouchableOpacity>
                );
              }}
            />
          )}
        </View>
      </Modal>

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
    confirmPanel: { marginTop: 16, borderRadius: 12, borderWidth: 1, borderColor: colors.primary + "55", backgroundColor: colors.card, padding: 16 },
    confirmTitle: { color: colors.foreground, fontSize: 15, fontWeight: "700", marginBottom: 6 },
    confirmMsg: { color: colors.mutedForeground, fontSize: 13, lineHeight: 20, marginBottom: 14 },
    confirmBtns: { flexDirection: "row" as const, gap: 10 },
    confirmBtn: { flex: 1, paddingVertical: 10, borderRadius: 8, alignItems: "center" as const },
    confirmBtnCancel: { backgroundColor: colors.card, borderWidth: 1, borderColor: colors.border },
    confirmBtnOk: { backgroundColor: colors.primary },
    confirmBtnCancelText: { color: colors.foreground, fontSize: 14, fontWeight: "600" },
    confirmBtnOkText: { color: colors.background, fontSize: 14, fontWeight: "700" },
    resultPanel: { marginTop: 12, borderRadius: 10, padding: 12 },
    resultOk: { backgroundColor: "#1a3a2a", borderWidth: 1, borderColor: "#2d6a4f" },
    resultErr: { backgroundColor: "#3a1a1a", borderWidth: 1, borderColor: "#e63946" },
    resultText: { color: colors.foreground, fontSize: 13 },
    legend: { flexDirection: "row", justifyContent: "center", gap: 20, paddingTop: 8, paddingHorizontal: 16 },
    legendItem: { flexDirection: "row", alignItems: "center", gap: 6 },
    legendDot: { width: 10, height: 10, borderRadius: 5 },
    legendText: { color: colors.mutedForeground, fontSize: 12 },
    // My Anchors button (header)
    myAnchorsBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 20, borderWidth: 1, marginLeft: "auto" },
    myAnchorsBadge: { fontSize: 12, fontWeight: "700" },
    // Action Sheet
    asOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
    asSheet: { borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingBottom: 34, paddingTop: 10 },
    asHandle: { width: 40, height: 4, borderRadius: 2, alignSelf: "center", marginBottom: 12 },
    asCoordBox: { flexDirection: "row", alignItems: "center", gap: 8, paddingHorizontal: 20, paddingVertical: 12, borderBottomWidth: 1 },
    asCoordText: { fontSize: 16, fontWeight: "700", fontVariant: ["tabular-nums"] },
    asCoordRaw: { fontSize: 11, marginLeft: 4, letterSpacing: 1 },
    asRow: { flexDirection: "row", alignItems: "center", gap: 14, paddingHorizontal: 20, paddingVertical: 14, borderBottomWidth: StyleSheet.hairlineWidth },
    asIconBox: { width: 40, height: 40, borderRadius: 12, alignItems: "center", justifyContent: "center" },
    asRowText: { flex: 1 },
    asRowTitle: { fontSize: 15, fontWeight: "600" },
    asRowSub: { fontSize: 12, marginTop: 2 },
    asSoon: { backgroundColor: "#0ea5e933", paddingHorizontal: 7, paddingVertical: 2, borderRadius: 8 },
    asSoonText: { fontSize: 10, fontWeight: "700", color: "#0ea5e9" },
    asCancel: { marginTop: 8, paddingVertical: 14, alignItems: "center" },
    asCancelText: { fontSize: 16, fontWeight: "500" },
    // Capsule modal
    capModal: { flex: 1, padding: 20 },
    capHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingBottom: 16, borderBottomWidth: 1, marginBottom: 16 },
    capHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
    capHeaderTitle: { fontSize: 18, fontWeight: "700" },
    capCoordBadge: { flexDirection: "row", alignItems: "center", gap: 6, alignSelf: "flex-start", paddingHorizontal: 10, paddingVertical: 6, borderRadius: 10, borderWidth: 1, marginBottom: 20 },
    capCoordBadgeText: { fontSize: 12 },
    capLabel: { fontSize: 14, fontWeight: "600", marginBottom: 8 },
    capInput: { borderWidth: 1, borderRadius: 12, padding: 14, fontSize: 15, minHeight: 140, marginBottom: 6 },
    capCount: { fontSize: 11, textAlign: "right", marginBottom: 24 },
    capSaveBtn: { borderRadius: 14, paddingVertical: 16, alignItems: "center" },
    capSaveBtnText: { color: "#fff", fontSize: 16, fontWeight: "700" },
    // My Anchors modal
    maModal: { flex: 1 },
    maHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", paddingHorizontal: 20, paddingVertical: 16, borderBottomWidth: 1 },
    maHeaderLeft: { flexDirection: "row", alignItems: "center", gap: 10 },
    maHeaderTitle: { fontSize: 18, fontWeight: "700" },
    maCount: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 10 },
    maCountText: { color: "#fff", fontSize: 12, fontWeight: "700" },
    maClose: { padding: 4 },
    maEmpty: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12, padding: 40 },
    maEmptyTitle: { fontSize: 17, fontWeight: "700", textAlign: "center" },
    maEmptyText: { fontSize: 13, textAlign: "center", lineHeight: 20 },
    maList: { padding: 16, gap: 10 },
    maRow: { flexDirection: "row", alignItems: "center", borderRadius: 12, borderWidth: 1, padding: 14, gap: 12 },
    maRowLeft: { flex: 1, gap: 3 },
    maCoordLabel: { fontSize: 16, fontWeight: "600", fontVariant: ["tabular-nums"] },
    maCoordRaw: { fontSize: 11, fontFamily: "Inter_400Regular", letterSpacing: 1 },
    maGoBtn: { flexDirection: "row", alignItems: "center", gap: 5, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
    maGoBtnText: { fontSize: 13, fontWeight: "600" },
  });
}
