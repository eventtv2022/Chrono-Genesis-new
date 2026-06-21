import { getBaseUrl } from "@/lib/api";
import React, { useState, useCallback } from "react";
import {
  View, Text, TextInput, TouchableOpacity, ScrollView,
  StyleSheet, ActivityIndicator, Platform, Alert,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { useCitizen } from "@/context/CitizenContext";
import { useColors } from "@/hooks/useColors";

const BASE_URL = getBaseUrl();

interface AuditLog {
  id: number;
  citizenId: number | null;
  taskDescription: string;
  estimatedMinutes: number;
  actualMinutes: number | null;
  deviationPercent: number | null;
  complexityLevel: string;
  justification: string;
  requiresCalibration: number;
  createdAt: string;
}

const COMPLEXITY_COLORS = {
  low: "#4ade80",
  medium: "#facc15",
  high: "#f87171",
};
const COMPLEXITY_LABELS: Record<string, string> = {
  low: "Низкая", medium: "Средняя", high: "Высокая",
};

function ComplexityBadge({ level, colors }: { level: string; colors: ReturnType<typeof useColors> }) {
  const color = COMPLEXITY_COLORS[level as keyof typeof COMPLEXITY_COLORS] ?? colors.mutedForeground;
  return (
    <View style={{ paddingHorizontal: 8, paddingVertical: 3, borderRadius: 6, borderWidth: 1, borderColor: color + "55", backgroundColor: color + "22" }}>
      <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color }}>{COMPLEXITY_LABELS[level] ?? level}</Text>
    </View>
  );
}

export default function TimeAuditScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const qc = useQueryClient();
  const { citizen } = useCitizen();

  const [taskDesc, setTaskDesc] = useState("");
  const [activeTab, setActiveTab] = useState<"new" | "history">("new");
  const [expandedId, setExpandedId] = useState<number | null>(null);
  const [actualInputs, setActualInputs] = useState<Record<number, string>>({});

  const topPad = Platform.OS === "web" ? 67 : insets.top;

  // ── History query ────────────────────────────────────────────────────────────
  const { data: histData, isLoading: histLoading, refetch: refetchHist } = useQuery({
    queryKey: ["audit-logs", citizen?.id],
    enabled: !!citizen?.id && activeTab === "history",
    queryFn: async () => {
      const res = await fetch(`${BASE_URL}/api/citizens/${citizen!.id}/audit-logs`);
      return (await res.json()) as { logs: AuditLog[] };
    },
  });

  // ── Submit audit mutation ────────────────────────────────────────────────────
  const auditMut = useMutation({
    mutationFn: async () => {
      const res = await fetch(`${BASE_URL}/api/citizens/audit-task`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ taskDescription: taskDesc, citizenId: citizen?.id }),
      });
      if (!res.ok) {
        const e = await res.json() as { error?: string };
        throw new Error(e.error ?? "Ошибка");
      }
      return (await res.json()) as { log: AuditLog; confidenceScore: number | null };
    },
    onSuccess: () => {
      void qc.invalidateQueries({ queryKey: ["audit-logs", citizen?.id] });
    },
    onError: (err: Error) => {
      Alert.alert("Ошибка", err.message);
    },
  });

  // ── Record actual time mutation ──────────────────────────────────────────────
  const actualMut = useMutation({
    mutationFn: async ({ logId, actual }: { logId: number; actual: number }) => {
      const res = await fetch(`${BASE_URL}/api/citizens/audit-logs/${logId}/actual`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ actualMinutes: actual }),
      });
      return (await res.json()) as { log: AuditLog };
    },
    onSuccess: () => void refetchHist(),
  });

  const handleSubmit = useCallback(() => {
    if (taskDesc.trim().length < 5) {
      Alert.alert("Ошибка", "Опишите задачу подробнее (минимум 5 символов)");
      return;
    }
    auditMut.mutate();
  }, [taskDesc, auditMut]);

  const handleActual = useCallback((log: AuditLog) => {
    const val = parseFloat(actualInputs[log.id] ?? "");
    if (!val || val <= 0) { Alert.alert("Ошибка", "Введите корректное время"); return; }
    actualMut.mutate({ logId: log.id, actual: val });
  }, [actualInputs, actualMut]);

  const result = auditMut.data;

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      {/* Header */}
      <View style={[styles.header, { paddingTop: topPad + 12, borderBottomColor: colors.border, backgroundColor: colors.background }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backBtn} activeOpacity={0.7}>
          <Feather name="arrow-left" size={20} color={colors.foreground} />
        </TouchableOpacity>
        <View style={styles.headerTitle}>
          <Text style={[styles.title, { color: colors.foreground }]}>ИИ-Аудитор Времени</Text>
          <Text style={[styles.subtitle, { color: colors.mutedForeground }]}>Оцифровка трудозатрат в Дарминах</Text>
        </View>
      </View>

      {/* Tabs */}
      <View style={[styles.tabBar, { borderBottomColor: colors.border, backgroundColor: colors.background }]}>
        {(["new", "history"] as const).map(tab => (
          <TouchableOpacity
            key={tab}
            style={[styles.tab, activeTab === tab && { borderBottomColor: colors.primary, borderBottomWidth: 2 }]}
            onPress={() => setActiveTab(tab)}
            activeOpacity={0.7}
          >
            <Feather name={tab === "new" ? "cpu" : "clock"} size={14} color={activeTab === tab ? colors.primary : colors.mutedForeground} />
            <Text style={[styles.tabText, { color: activeTab === tab ? colors.primary : colors.mutedForeground }]}>
              {tab === "new" ? "Новый аудит" : "История"}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <ScrollView contentContainerStyle={{ padding: 20, paddingBottom: 40 }} keyboardShouldPersistTaps="handled">

        {activeTab === "new" && (
          <>
            {/* Description card */}
            <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>ОПИСАНИЕ ЗАДАЧИ</Text>
              <TextInput
                style={[styles.textarea, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
                multiline
                numberOfLines={5}
                placeholder={"Опишите задачу подробно:\n• Тип работы (разработка, дизайн, текст…)\n• Объём и сложность\n• Используемые технологии"}
                placeholderTextColor={colors.mutedForeground}
                value={taskDesc}
                onChangeText={setTaskDesc}
                textAlignVertical="top"
              />

              {/* Quick templates */}
              <Text style={[styles.label, { color: colors.mutedForeground, marginTop: 12 }]}>БЫСТРЫЕ ШАБЛОНЫ</Text>
              <ScrollView horizontal showsHorizontalScrollIndicator={false} style={{ marginTop: 6 }}>
                {[
                  "Написание простого скрипта на Python для автоматизации",
                  "Дизайн баннера 1920×1080 в фирменном стиле",
                  "Перевод статьи (2000 знаков) с английского на русский",
                  "Архитектура REST API для мобильного приложения",
                ].map((t, i) => (
                  <TouchableOpacity
                    key={i}
                    style={[styles.chip, { backgroundColor: colors.muted, borderColor: colors.border }]}
                    onPress={() => setTaskDesc(t)}
                    activeOpacity={0.7}
                  >
                    <Text style={{ fontSize: 12, fontFamily: "Inter_400Regular", color: colors.foreground }} numberOfLines={1}>{t}</Text>
                  </TouchableOpacity>
                ))}
              </ScrollView>

              <TouchableOpacity
                style={[styles.submitBtn, { backgroundColor: auditMut.isPending ? colors.muted : colors.primary }]}
                onPress={handleSubmit}
                disabled={auditMut.isPending}
                activeOpacity={0.8}
              >
                {auditMut.isPending
                  ? <ActivityIndicator color="#fff" size="small" />
                  : <><Feather name="cpu" size={16} color="#fff" /><Text style={styles.submitText}>Оценить задачу</Text></>
                }
              </TouchableOpacity>
            </View>

            {/* Result */}
            {result && (
              <View style={[styles.card, { backgroundColor: "#0f2e1c", borderColor: "#4ade8055", marginTop: 16 }]}>
                <View style={styles.resultHeader}>
                  <Feather name="check-circle" size={16} color="#4ade80" />
                  <Text style={[styles.resultTitle, { color: "#4ade80" }]}>Аудит #{result.log.id} выполнен</Text>
                </View>
                <View style={styles.resultGrid}>
                  <View style={styles.resultCell}>
                    <Text style={[styles.label, { color: "#4ade8088" }]}>ОЦЕНКА ВРЕМЕНИ</Text>
                    <Text style={[styles.resultBig, { color: "#4ade80" }]}>{result.log.estimatedMinutes} Д</Text>
                    {result.confidenceScore != null && (
                      <Text style={{ fontSize: 11, color: "#4ade8099", fontFamily: "Inter_400Regular" }}>
                        Уверенность {Math.round(result.confidenceScore * 100)}%
                      </Text>
                    )}
                  </View>
                  <View style={styles.resultCell}>
                    <Text style={[styles.label, { color: "#4ade8088" }]}>СЛОЖНОСТЬ</Text>
                    <View style={{ marginTop: 4 }}>
                      <ComplexityBadge level={result.log.complexityLevel} colors={colors} />
                    </View>
                  </View>
                </View>
                <Text style={[styles.label, { color: "#4ade8088", marginTop: 12 }]}>ОБОСНОВАНИЕ ИИ</Text>
                <Text style={{ fontSize: 13, color: "#d1fae5", fontFamily: "Inter_400Regular", lineHeight: 20, marginTop: 4 }}>
                  {result.log.justification}
                </Text>
              </View>
            )}
          </>
        )}

        {activeTab === "history" && (
          <>
            {histLoading ? (
              <View style={styles.centered}>
                <ActivityIndicator color={colors.primary} size="large" />
              </View>
            ) : !histData?.logs.length ? (
              <View style={styles.centered}>
                <Feather name="clock" size={40} color={colors.mutedForeground} />
                <Text style={[styles.emptyText, { color: colors.mutedForeground }]}>Нет записей аудита</Text>
                <Text style={[styles.emptySubtext, { color: colors.mutedForeground }]}>Создайте первый аудит</Text>
              </View>
            ) : (
              histData.logs.map(log => (
                <TouchableOpacity
                  key={log.id}
                  style={[styles.logCard, {
                    backgroundColor: colors.card,
                    borderColor: log.requiresCalibration ? "#f97316aa" : colors.border,
                  }]}
                  onPress={() => setExpandedId(expandedId === log.id ? null : log.id)}
                  activeOpacity={0.8}
                >
                  <View style={styles.logRow}>
                    <View style={{ flex: 1, gap: 4 }}>
                      <View style={{ flexDirection: "row", alignItems: "center", gap: 6, flexWrap: "wrap" }}>
                        {log.requiresCalibration === 1 && <Feather name="alert-triangle" size={13} color="#f97316" />}
                        <Text style={{ fontSize: 13, fontFamily: "Inter_500Medium", color: colors.foreground }} numberOfLines={expandedId === log.id ? undefined : 1}>
                          {log.taskDescription}
                        </Text>
                      </View>
                      <View style={{ flexDirection: "row", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
                        <ComplexityBadge level={log.complexityLevel} colors={colors} />
                        <Text style={{ fontSize: 11, color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>
                          Оценка: <Text style={{ color: colors.primary, fontFamily: "Inter_600SemiBold" }}>{log.estimatedMinutes} Д</Text>
                        </Text>
                        {log.actualMinutes != null && (
                          <Text style={{ fontSize: 11, color: colors.mutedForeground, fontFamily: "Inter_400Regular" }}>
                            Факт: <Text style={{ fontFamily: "Inter_600SemiBold" }}>{log.actualMinutes} Д</Text>
                          </Text>
                        )}
                        {log.deviationPercent != null && (
                          <Text style={{ fontSize: 11, fontFamily: "Inter_600SemiBold", color: log.requiresCalibration ? "#f97316" : "#4ade80" }}>
                            Δ {log.deviationPercent.toFixed(1)}%
                          </Text>
                        )}
                      </View>
                    </View>
                    <Feather name={expandedId === log.id ? "chevron-up" : "chevron-down"} size={16} color={colors.mutedForeground} />
                  </View>

                  {expandedId === log.id && (
                    <View style={[styles.logExpanded, { borderTopColor: colors.border }]}>
                      <Text style={{ fontSize: 12, color: colors.mutedForeground, fontFamily: "Inter_400Regular", lineHeight: 18, marginBottom: 12 }}>
                        {log.justification}
                      </Text>
                      {log.actualMinutes == null && (
                        <View style={{ flexDirection: "row", gap: 8, alignItems: "flex-end" }}>
                          <View style={{ flex: 1 }}>
                            <Text style={[styles.label, { color: colors.mutedForeground }]}>ФАКТИЧЕСКОЕ ВРЕМЯ (Д)</Text>
                            <TextInput
                              style={[styles.smallInput, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]}
                              keyboardType="numeric"
                              placeholder="0"
                              placeholderTextColor={colors.mutedForeground}
                              value={actualInputs[log.id] ?? ""}
                              onChangeText={v => setActualInputs(prev => ({ ...prev, [log.id]: v }))}
                            />
                          </View>
                          <TouchableOpacity
                            style={[styles.recordBtn, { backgroundColor: colors.primary }]}
                            onPress={() => handleActual(log)}
                            disabled={actualMut.isPending}
                            activeOpacity={0.8}
                          >
                            <Text style={{ fontSize: 13, fontFamily: "Inter_600SemiBold", color: "#fff" }}>
                              {actualMut.isPending ? "…" : "Записать"}
                            </Text>
                          </TouchableOpacity>
                        </View>
                      )}
                    </View>
                  )}
                </TouchableOpacity>
              ))
            )}
          </>
        )}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 20, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  backBtn: { padding: 4 },
  headerTitle: { flex: 1 },
  title: { fontSize: 18, fontFamily: "Inter_700Bold" },
  subtitle: { fontSize: 12, fontFamily: "Inter_400Regular", marginTop: 1 },
  tabBar: { flexDirection: "row", borderBottomWidth: StyleSheet.hairlineWidth },
  tab: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12 },
  tabText: { fontSize: 13, fontFamily: "Inter_500Medium" },
  card: { borderRadius: 14, borderWidth: 1, padding: 16, gap: 0 },
  label: { fontSize: 10, fontFamily: "Inter_500Medium", letterSpacing: 1, marginBottom: 6 },
  textarea: { borderWidth: 1.5, borderRadius: 10, padding: 12, fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 22, minHeight: 120 },
  chip: { borderRadius: 20, borderWidth: 1, paddingHorizontal: 12, paddingVertical: 7, marginRight: 8, maxWidth: 220 },
  submitBtn: { flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8, paddingVertical: 14, borderRadius: 12, marginTop: 16 },
  submitText: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: "#fff" },
  resultHeader: { flexDirection: "row", alignItems: "center", gap: 8, marginBottom: 14 },
  resultTitle: { fontSize: 14, fontFamily: "Inter_600SemiBold" },
  resultGrid: { flexDirection: "row", gap: 16 },
  resultCell: { flex: 1 },
  resultBig: { fontSize: 36, fontFamily: "Inter_700Bold", marginTop: 2 },
  centered: { flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 60, gap: 12 },
  emptyText: { fontSize: 16, fontFamily: "Inter_600SemiBold" },
  emptySubtext: { fontSize: 13, fontFamily: "Inter_400Regular" },
  logCard: { borderRadius: 12, borderWidth: 1, marginBottom: 10 },
  logRow: { flexDirection: "row", alignItems: "flex-start", gap: 8, padding: 14 },
  logExpanded: { borderTopWidth: StyleSheet.hairlineWidth, padding: 14 },
  smallInput: { borderWidth: 1.5, borderRadius: 8, paddingHorizontal: 12, paddingVertical: 8, fontSize: 14, fontFamily: "Inter_600SemiBold" },
  recordBtn: { paddingHorizontal: 16, paddingVertical: 9, borderRadius: 8 },
});
