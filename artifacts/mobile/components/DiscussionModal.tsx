import React, { useState, useEffect, useRef, useCallback } from "react";
import {
  View,
  Text,
  Modal,
  TouchableOpacity,
  TextInput,
  FlatList,
  ActivityIndicator,
  AppState,
  AppStateStatus,
  Alert,
  StyleSheet,
  Image,
  KeyboardAvoidingView,
  Platform,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import * as ImagePicker from "expo-image-picker";
import * as Haptics from "expo-haptics";
import { getBaseUrl } from "@/lib/api";

const BASE_URL = getBaseUrl();

interface ChatMsg {
  id: number;
  dealId: number;
  senderId: number;
  senderName: string | null;
  messageText: string | null;
  imageUrl: string | null;
  createdAt: string;
}

interface DealForChat {
  id: number;
  senderId: number;
  receiverId: number | null;
  amount: number;
  description: string;
  status: string;
  timerStatus: string;
  totalTrackedMinutes: number;
  timerStartedAt: string | null;
}

interface Colors {
  background: string;
  card: string;
  surface: string;
  foreground: string;
  mutedForeground: string;
  primary: string;
  primaryForeground: string;
  border: string;
}

interface Props {
  visible: boolean;
  deal: DealForChat;
  citizenId: number;
  citizenName: string;
  colors: Colors;
  onClose: () => void;
  onDealUpdate: (updated: DealForChat) => void;
}

export function DiscussionModal({ visible, deal, citizenId, citizenName, colors, onClose, onDealUpdate }: Props) {
  const [messages, setMessages] = useState<ChatMsg[]>([]);
  const [msgLoading, setMsgLoading] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [timerSeconds, setTimerSeconds] = useState(0);
  const [localTimerRunning, setLocalTimerRunning] = useState(false);
  const [timerOp, setTimerOp] = useState(false);

  const flatRef = useRef<FlatList>(null);
  const tickRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const appStateRef = useRef<AppStateStatus>(AppState.currentState);
  const bgTimeRef = useRef<Date | null>(null);

  const isReceiver = deal.receiverId === citizenId;
  const isSender = deal.senderId === citizenId;
  const canChat = isReceiver || isSender;
  const canTimer = isReceiver && ["accepted"].includes(deal.status);

  // ── Timer tick (local display only) ─────────────────────────────────────────
  const startTick = useCallback(() => {
    if (tickRef.current) clearInterval(tickRef.current);
    tickRef.current = setInterval(() => {
      setTimerSeconds((s) => s + 1);
    }, 1000);
  }, []);

  const stopTick = useCallback(() => {
    if (tickRef.current) { clearInterval(tickRef.current); tickRef.current = null; }
  }, []);

  // Sync local timer display with server state
  useEffect(() => {
    if (!visible) return;
    const base = deal.totalTrackedMinutes * 60;
    if (deal.timerStatus === "running" && deal.timerStartedAt) {
      const elapsed = Math.floor((Date.now() - new Date(deal.timerStartedAt).getTime()) / 1000);
      setTimerSeconds(base + elapsed);
      setLocalTimerRunning(true);
      startTick();
    } else {
      setTimerSeconds(base);
      setLocalTimerRunning(false);
      stopTick();
    }
    return () => stopTick();
  }, [visible, deal.timerStatus, deal.timerStartedAt, deal.totalTrackedMinutes, startTick, stopTick]);

  // ── AppState: pause timer when app goes to background ───────────────────────
  useEffect(() => {
    if (!visible || !canTimer) return;
    const sub = AppState.addEventListener("change", async (next: AppStateStatus) => {
      const prev = appStateRef.current;
      appStateRef.current = next;

      if (prev === "active" && (next === "background" || next === "inactive")) {
        // App going to background — pause timer if running
        bgTimeRef.current = new Date();
        if (localTimerRunning) {
          stopTick();
          setLocalTimerRunning(false);
          try {
            const r = await fetch(`${BASE_URL}/api/deals/${deal.id}/timer/pause`, {
              method: "POST",
              headers: { "Content-Type": "application/json" },
              body: JSON.stringify({ citizenId }),
            });
            if (r.ok) {
              const updated = await r.json() as DealForChat;
              onDealUpdate(updated);
            }
          } catch { /* silent */ }
        }
      }
    });
    return () => sub.remove();
  }, [visible, canTimer, localTimerRunning, deal.id, citizenId, stopTick, onDealUpdate]);

  // ── Load messages ────────────────────────────────────────────────────────────
  const loadMessages = useCallback(async () => {
    if (!visible) return;
    setMsgLoading(true);
    try {
      const r = await fetch(`${BASE_URL}/api/deals/${deal.id}/chat`);
      if (r.ok) {
        const data = await r.json() as { messages: ChatMsg[] };
        setMessages(data.messages ?? []);
        setTimeout(() => flatRef.current?.scrollToEnd({ animated: false }), 100);
      }
    } catch { /* ignore */ }
    setMsgLoading(false);
  }, [visible, deal.id]);

  useEffect(() => {
    if (visible) {
      void loadMessages();
      const poll = setInterval(() => { void loadMessages(); }, 5000);
      return () => clearInterval(poll);
    }
  }, [visible, loadMessages]);

  // ── Send message ─────────────────────────────────────────────────────────────
  const sendMessage = async (text?: string, imageUrl?: string) => {
    if (!text && !imageUrl) return;
    setSending(true);
    try {
      const r = await fetch(`${BASE_URL}/api/deals/${deal.id}/chat`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ senderId: citizenId, messageText: text ?? undefined, imageUrl }),
      });
      if (!r.ok) {
        const e = await r.json() as { error?: string };
        throw new Error(e.error ?? "Ошибка отправки");
      }
      setInput("");
      await loadMessages();
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    } catch (e: unknown) {
      Alert.alert("Ошибка", (e as Error).message);
    }
    setSending(false);
  };

  // ── Image picker (platform-aware) ───────────────────────────────────────────
  // Web: uses native browser <input type="file"> (no permissions needed)
  // Native: uses expo-image-picker with permission request

  const openFileInputWeb = (capture: boolean) => {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    const doc = (typeof document !== "undefined" ? document : null) as any;
    if (!doc) return;
    const input = doc.createElement("input") as HTMLInputElement;
    input.type = "file";
    input.accept = "image/*";
    if (capture) input.setAttribute("capture", "environment");
    input.onchange = async () => {
      const file = input.files?.[0];
      if (!file) return;
      setSending(true);
      try {
        const dataUrl = await new Promise<string>((resolve, reject) => {
          const reader = new FileReader();
          reader.onload = (e) => resolve(e.target?.result as string);
          reader.onerror = reject;
          reader.readAsDataURL(file);
        });
        await sendMessage(undefined, dataUrl);
      } catch {
        Alert.alert("Ошибка", "Не удалось загрузить изображение");
        setSending(false);
      }
    };
    input.click();
  };

  const pickImage = async () => {
    if (Platform.OS === "web") {
      openFileInputWeb(false);
      return;
    }
    const perm = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Нет доступа", "Разреши доступ к галерее в настройках");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: "images",
      quality: 0.4,
      base64: true,
      allowsEditing: true,
    });
    if (!result.canceled && result.assets[0]) {
      const { base64, mimeType } = result.assets[0];
      if (!base64) return;
      await sendMessage(undefined, `data:${mimeType ?? "image/jpeg"};base64,${base64}`);
    }
  };

  const takePhoto = async () => {
    if (Platform.OS === "web") {
      openFileInputWeb(true);
      return;
    }
    const perm = await ImagePicker.requestCameraPermissionsAsync();
    if (!perm.granted) {
      Alert.alert("Нет доступа", "Разреши доступ к камере в настройках");
      return;
    }
    const result = await ImagePicker.launchCameraAsync({
      quality: 0.4,
      base64: true,
      allowsEditing: true,
    });
    if (!result.canceled && result.assets[0]) {
      const { base64, mimeType } = result.assets[0];
      if (!base64) return;
      await sendMessage(undefined, `data:${mimeType ?? "image/jpeg"};base64,${base64}`);
    }
  };

  // ── Timer controls ───────────────────────────────────────────────────────────
  const timerAction = async (action: "start" | "pause" | "complete") => {
    setTimerOp(true);
    try {
      const r = await fetch(`${BASE_URL}/api/deals/${deal.id}/timer/${action}`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ citizenId }),
      });
      const data = await r.json() as { deal?: DealForChat; error?: string } & DealForChat;
      if (!r.ok) throw new Error(data.error ?? "Ошибка таймера");

      const updated: DealForChat = data.deal ?? data;
      onDealUpdate(updated);

      if (action === "start") {
        setLocalTimerRunning(true);
        startTick();
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      } else {
        setLocalTimerRunning(false);
        stopTick();
        if (action === "complete") {
          Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
          await loadMessages(); // AI analysis posted as message
        } else {
          Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
        }
      }
    } catch (e: unknown) {
      Alert.alert("Ошибка", (e as Error).message);
    }
    setTimerOp(false);
  };

  const fmtTimer = (secs: number) => {
    const h = Math.floor(secs / 3600);
    const m = Math.floor((secs % 3600) / 60);
    const s = secs % 60;
    if (h > 0) return `${h}:${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
    return `${String(m).padStart(2, "0")}:${String(s).padStart(2, "0")}`;
  };

  const s = styles(colors);

  const renderMessage = ({ item }: { item: ChatMsg }) => {
    const mine = item.senderId === citizenId;
    return (
      <View style={[s.msgRow, mine ? s.msgRowMine : s.msgRowOther]}>
        <View style={[s.msgBubble, mine ? s.msgBubbleMine : s.msgBubbleOther]}>
          {!mine && (
            <Text style={s.msgSender}>{item.senderName ?? "Участник"}</Text>
          )}
          {item.imageUrl ? (
            <Image source={{ uri: item.imageUrl }} style={s.msgImage} resizeMode="cover" />
          ) : null}
          {item.messageText ? (
            <Text style={[s.msgText, { color: mine ? colors.primaryForeground : colors.foreground }]}>
              {item.messageText}
            </Text>
          ) : null}
          <Text style={[s.msgTime, { color: mine ? colors.primaryForeground + "88" : colors.mutedForeground }]}>
            {new Date(item.createdAt).toLocaleTimeString("ru", { hour: "2-digit", minute: "2-digit" })}
          </Text>
        </View>
      </View>
    );
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <KeyboardAvoidingView
        style={[s.root, { backgroundColor: colors.background }]}
        behavior={Platform.OS === "ios" ? "padding" : "height"}
        keyboardVerticalOffset={Platform.OS === "ios" ? 0 : 24}
      >
        {/* Header */}
        <View style={[s.header, { borderBottomColor: colors.border }]}>
          <View style={{ flex: 1 }}>
            <Text style={[s.headerTitle, { color: colors.foreground }]}>💬 Обсуждение Сделки #{deal.id}</Text>
            <Text style={[s.headerSub, { color: colors.mutedForeground }]} numberOfLines={1}>{deal.description}</Text>
          </View>
          <TouchableOpacity onPress={onClose} style={s.closeBtn} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Feather name="x" size={22} color={colors.mutedForeground} />
          </TouchableOpacity>
        </View>

        {/* Timer panel — receiver only, deal must be accepted */}
        {canTimer && (
          <View style={[s.timerPanel, { backgroundColor: colors.card, borderBottomColor: colors.border }]}>
            <View style={s.timerLeft}>
              <View style={[s.timerDot, { backgroundColor: localTimerRunning ? "#4CAF50" : deal.timerStatus === "completed" ? colors.primary : colors.mutedForeground }]} />
              <Text style={[s.timerDisplay, { color: colors.foreground }]}>{fmtTimer(timerSeconds)}</Text>
              <Text style={[s.timerLabel, { color: colors.mutedForeground }]}>
                {deal.timerStatus === "completed" ? "Завершено" : localTimerRunning ? "Работаю" : "На паузе"}
              </Text>
            </View>
            {timerOp ? (
              <ActivityIndicator color={colors.primary} />
            ) : deal.timerStatus === "completed" ? (
              <Text style={[s.timerDone, { color: colors.primary }]}>✓ Работа сдана</Text>
            ) : (
              <View style={s.timerBtns}>
                {!localTimerRunning ? (
                  <TouchableOpacity style={[s.timerBtn, { backgroundColor: "#4CAF5022", borderColor: "#4CAF50" }]} onPress={() => timerAction("start")}>
                    <Feather name="play" size={14} color="#4CAF50" />
                    <Text style={[s.timerBtnText, { color: "#4CAF50" }]}>Начать</Text>
                  </TouchableOpacity>
                ) : (
                  <TouchableOpacity style={[s.timerBtn, { backgroundColor: colors.surface, borderColor: colors.border }]} onPress={() => timerAction("pause")}>
                    <Feather name="pause" size={14} color={colors.mutedForeground} />
                    <Text style={[s.timerBtnText, { color: colors.mutedForeground }]}>Пауза</Text>
                  </TouchableOpacity>
                )}
                {(deal.totalTrackedMinutes > 0 || localTimerRunning) && (
                  <TouchableOpacity style={[s.timerBtn, { backgroundColor: colors.primary + "22", borderColor: colors.primary }]} onPress={() => timerAction("complete")}>
                    <Feather name="flag" size={14} color={colors.primary} />
                    <Text style={[s.timerBtnText, { color: colors.primary }]}>Завершить</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
          </View>
        )}

        {/* Messages */}
        {msgLoading && messages.length === 0 ? (
          <ActivityIndicator color={colors.primary} style={{ marginTop: 30 }} />
        ) : (
          <FlatList
            ref={flatRef}
            data={messages}
            keyExtractor={(m) => String(m.id)}
            renderItem={renderMessage}
            contentContainerStyle={{ padding: 12, paddingBottom: 8, flexGrow: 1 }}
            ListEmptyComponent={
              <View style={{ flex: 1, alignItems: "center", justifyContent: "center", paddingTop: 60 }}>
                <Feather name="message-circle" size={40} color={colors.mutedForeground} />
                <Text style={{ color: colors.mutedForeground, marginTop: 12, fontFamily: "Inter_400Regular", fontSize: 14 }}>
                  Начните обсуждение
                </Text>
              </View>
            }
            onContentSizeChange={() => flatRef.current?.scrollToEnd({ animated: true })}
          />
        )}

        {/* Input bar */}
        {canChat && (
          <View style={[s.inputBar, { backgroundColor: colors.card, borderTopColor: colors.border }]}>
            <TouchableOpacity onPress={takePhoto} style={s.attachBtn} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
              <Feather name="camera" size={20} color={colors.mutedForeground} />
            </TouchableOpacity>
            <TouchableOpacity onPress={pickImage} style={s.attachBtn} hitSlop={{ top: 6, bottom: 6, left: 6, right: 6 }}>
              <Feather name="image" size={20} color={colors.mutedForeground} />
            </TouchableOpacity>
            <TextInput
              style={[s.input, { color: colors.foreground, backgroundColor: colors.surface }]}
              placeholder="Сообщение..."
              placeholderTextColor={colors.mutedForeground}
              value={input}
              onChangeText={setInput}
              multiline
              maxLength={2000}
              returnKeyType="default"
            />
            <TouchableOpacity
              style={[s.sendBtn, { backgroundColor: input.trim() ? colors.primary : colors.surface }]}
              onPress={() => { if (input.trim()) sendMessage(input.trim()); }}
              disabled={!input.trim() || sending}
            >
              {sending
                ? <ActivityIndicator size="small" color={colors.primaryForeground} />
                : <Feather name="send" size={18} color={input.trim() ? colors.primaryForeground : colors.mutedForeground} />
              }
            </TouchableOpacity>
          </View>
        )}
      </KeyboardAvoidingView>
    </Modal>
  );
}

const styles = (c: Colors) => StyleSheet.create({
  root: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", padding: 16, paddingTop: 20, borderBottomWidth: 1 },
  headerTitle: { fontSize: 15, fontFamily: "Inter_700Bold" },
  headerSub: { fontSize: 11, fontFamily: "Inter_400Regular", marginTop: 2 },
  closeBtn: { padding: 4, marginLeft: 12 },
  timerPanel: { flexDirection: "row", alignItems: "center", padding: 12, borderBottomWidth: 1, gap: 12 },
  timerLeft: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  timerDot: { width: 8, height: 8, borderRadius: 4 },
  timerDisplay: { fontSize: 22, fontFamily: "Inter_700Bold", letterSpacing: 1 },
  timerLabel: { fontSize: 11, fontFamily: "Inter_400Regular" },
  timerBtns: { flexDirection: "row", gap: 6 },
  timerBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 10, paddingVertical: 6, borderRadius: 8, borderWidth: 1 },
  timerBtnText: { fontSize: 12, fontFamily: "Inter_600SemiBold" },
  timerDone: { fontSize: 13, fontFamily: "Inter_600SemiBold" },
  msgRow: { marginBottom: 8 },
  msgRowMine: { alignItems: "flex-end" },
  msgRowOther: { alignItems: "flex-start" },
  msgBubble: { maxWidth: "80%", borderRadius: 14, padding: 10 },
  msgBubbleMine: { backgroundColor: "#C9A84C", borderBottomRightRadius: 4 },
  msgBubbleOther: { backgroundColor: "#1E2E40", borderBottomLeftRadius: 4 },
  msgSender: { fontSize: 10, fontFamily: "Inter_600SemiBold", color: "#C9A84C", marginBottom: 4 },
  msgText: { fontSize: 14, fontFamily: "Inter_400Regular", lineHeight: 20 },
  msgImage: { width: 200, height: 150, borderRadius: 8, marginBottom: 6 },
  msgTime: { fontSize: 9, fontFamily: "Inter_400Regular", marginTop: 4, textAlign: "right" },
  inputBar: { flexDirection: "row", alignItems: "flex-end", padding: 8, gap: 6, borderTopWidth: 1 },
  attachBtn: { paddingBottom: 10, paddingHorizontal: 2 },
  input: { flex: 1, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 8, maxHeight: 100, fontSize: 14, fontFamily: "Inter_400Regular" },
  sendBtn: { width: 40, height: 40, borderRadius: 20, alignItems: "center", justifyContent: "center" },
});
