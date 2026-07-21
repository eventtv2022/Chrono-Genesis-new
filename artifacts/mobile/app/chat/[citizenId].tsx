import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  KeyboardAvoidingView,
  Modal,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useLocalSearchParams, useRouter } from "expo-router";
import { decodeBase64 } from "tweetnacl-util";

import { useCitizen } from "@/context/CitizenContext";
import { getBaseUrl } from "@/lib/api";
import { decryptMsg, encryptMsg, getOrCreateKeyPair } from "@/lib/e2ee";

const BASE_URL = getBaseUrl();

const C = {
  bg: "#0A0A0F",
  surface: "#12121A",
  border: "#1E1E2E",
  primary: "#C9A84C",
  fg: "#E8E8F0",
  muted: "#6B6B7E",
  mine: "#1E3A2A",
  mineBorder: "#2D5A3D",
  theirs: "#12121A",
  theirsBorder: "#1E1E2E",
};

interface RawMessage {
  id: number;
  from_citizen_id: number;
  to_citizen_id: number;
  ciphertext: string;
  nonce: string;
  msg_type: string;
  darmin_amount: number | null;
  created_at: string;
  read_at: string | null;
}

interface DecryptedMessage extends RawMessage {
  plaintext: string;
}

interface PeerInfo {
  id: number;
  name: string | null;
  rank: string | null;
  publicKey: string | null;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

export default function ConversationScreen() {
  const router = useRouter();
  const { citizenId: rawId } = useLocalSearchParams<{ citizenId: string }>();
  const peerId = parseInt(rawId ?? "0", 10);

  const { citizen, authToken, authHeaders } = useCitizen();
  const [peer, setPeer] = useState<PeerInfo | null>(null);
  const [messages, setMessages] = useState<DecryptedMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [darminModal, setDarminModal] = useState(false);
  const [darminAmount, setDarminAmount] = useState("");
  const [darminNote, setDarminNote] = useState("");
  const [transferring, setTransferring] = useState(false);
  const flatRef = useRef<FlatList>(null);

  const secretKeyRef = useRef<Uint8Array | null>(null);
  const publicKeyRef = useRef<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const peerPubKeyRef = useRef<Uint8Array | null>(null);

  // ── Init keypair + peer info ───────────────────────────────────────────────
  useEffect(() => {
    if (!citizen || !authToken || !peerId) return;
    (async () => {
      const kp = await getOrCreateKeyPair();
      secretKeyRef.current = kp.secretKey;
      publicKeyRef.current = kp.publicKeyB64;

      // Upload key if not set
      try {
        const checkRes = await fetch(`${BASE_URL}/api/chat/key/${citizen.id}`);
        const checkData = await checkRes.json() as { publicKey?: string };
        if (checkData.publicKey !== kp.publicKeyB64) {
          await fetch(`${BASE_URL}/api/chat/key`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...authHeaders },
            body: JSON.stringify({ publicKey: kp.publicKeyB64 }),
          });
        }
      } catch { /* silent */ }

      // Load peer info
      try {
        const peerRes = await fetch(`${BASE_URL}/api/chat/key/${peerId}`);
        if (peerRes.ok) {
          const peerData = await peerRes.json() as { citizenId: number; name: string; publicKey: string };
          setPeer({ id: peerData.citizenId, name: peerData.name, rank: null, publicKey: peerData.publicKey });
          peerPubKeyRef.current = decodeBase64(peerData.publicKey);
        } else {
          // Peer exists but no key — still load their name from citizens
          const citRes = await fetch(`${BASE_URL}/api/citizens/${peerId}`);
          if (citRes.ok) {
            const c = await citRes.json() as { id: number; name: string | null; rank: string | null };
            if (c?.id) setPeer({ id: c.id, name: c.name, rank: c.rank, publicKey: null });
          }
        }
      } catch { /* silent */ }
    })();
  }, [citizen, authToken, peerId]);

  // ── Load messages ─────────────────────────────────────────────────────────
  const loadMessages = useCallback(async () => {
    if (!authToken || !peerId) { setLoading(false); return; }
    setLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/api/chat/messages/${peerId}?limit=100`, { headers: authHeaders });
      const data = await res.json() as { messages: RawMessage[] };
      const raw = data.messages ?? [];
      decryptAndSet(raw);
      // Mark as read
      fetch(`${BASE_URL}/api/chat/messages/read/${peerId}`, { method: "PATCH", headers: authHeaders }).catch(() => { /* silent */ });
    } catch {
      Alert.alert("Ошибка", "Не удалось загрузить сообщения");
    } finally {
      setLoading(false);
    }
  }, [authToken, peerId]);

  function decryptAndSet(raw: RawMessage[]) {
    const sk = secretKeyRef.current;
    if (!sk) { setMessages(raw.map((m) => ({ ...m, plaintext: "..." }))); return; }

    const resolved: DecryptedMessage[] = raw.map((m) => {
      if (m.msg_type === "darmin_transfer") {
        return { ...m, plaintext: `💸 ${m.darmin_amount ?? "?"} Д` };
      }
      // peerPubKey may not be loaded yet — we'll try with what we have
      const peerPub = peerPubKeyRef.current;
      if (!peerPub) return { ...m, plaintext: "🔒 Ключ недоступен" };
      const text = decryptMsg(m.ciphertext, m.nonce, peerPub, sk);
      return { ...m, plaintext: text ?? "🔒 Не удалось расшифровать" };
    });
    setMessages(resolved);
  }

  useEffect(() => {
    if (peer && secretKeyRef.current) loadMessages();
  }, [peer, loadMessages]);

  useEffect(() => {
    if (messages.length > 0) {
      setTimeout(() => flatRef.current?.scrollToEnd({ animated: false }), 80);
    }
  }, [messages.length]);

  // ── WebSocket for real-time messages ──────────────────────────────────────
  useEffect(() => {
    if (!citizen || !authToken) return;
    const wsUrl = BASE_URL.replace(/^https?/, (m: string) => (m === "https" ? "wss" : "ws")) + "/api/ws";
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;

    ws.onopen = () => {
      ws.send(JSON.stringify({ type: "auth", citizenId: citizen.id }));
    };

    ws.onmessage = (evt: MessageEvent) => {
      try {
        const msg = JSON.parse(evt.data as string) as { type: string; message?: RawMessage };
        if (msg.type === "chat_message" && msg.message) {
          const m = msg.message;
          if (
            (m.from_citizen_id === peerId && m.to_citizen_id === citizen.id) ||
            (m.from_citizen_id === citizen.id && m.to_citizen_id === peerId)
          ) {
            const sk = secretKeyRef.current;
            const peerPub = peerPubKeyRef.current;
            let plaintext = "🔒";
            if (m.msg_type === "darmin_transfer") {
              plaintext = `💸 ${m.darmin_amount ?? "?"} Д`;
            } else if (sk && peerPub) {
              plaintext = decryptMsg(m.ciphertext, m.nonce, peerPub, sk) ?? "🔒";
            }
            const dm: DecryptedMessage = { ...m, plaintext };
            setMessages((prev) => [...prev, dm]);
            setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 80);

            // Mark as read if from peer
            if (m.from_citizen_id === peerId) {
              fetch(`${BASE_URL}/api/chat/messages/read/${peerId}`, { method: "PATCH", headers: authHeaders }).catch(() => { /* silent */ });
            }
          }
        }
      } catch { /* ignore parse errors */ }
    };

    return () => {
      ws.close();
      wsRef.current = null;
    };
  }, [citizen, authToken, peerId]);

  // ── Send message ──────────────────────────────────────────────────────────
  async function sendMessage() {
    if (!input.trim() || !citizen || !authToken) return;
    const peerPub = peerPubKeyRef.current;
    const sk = secretKeyRef.current;

    if (!peerPub || !sk) {
      Alert.alert("E2EE", "Собеседник не зарегистрировал ключ шифрования. Попросите его открыть чат.");
      return;
    }

    setSending(true);
    try {
      const { ciphertext, nonce } = encryptMsg(input.trim(), peerPub, sk);
      const res = await fetch(`${BASE_URL}/api/chat/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ toCitizenId: peerId, ciphertext, nonce }),
      });
      if (!res.ok) {
        const err = await res.json() as { error?: string };
        Alert.alert("Ошибка", err.error ?? "Не удалось отправить");
        return;
      }
      const { message: sent } = await res.json() as { message: RawMessage };
      setMessages((prev) => [...prev, { ...sent, plaintext: input.trim() }]);
      setInput("");
      setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 80);
    } catch {
      Alert.alert("Ошибка", "Сетевая ошибка");
    } finally {
      setSending(false);
    }
  }

  // ── Transfer Darmins ──────────────────────────────────────────────────────
  async function transferDarmins() {
    const amount = parseFloat(darminAmount);
    if (!citizen || !authToken || isNaN(amount) || amount <= 0) {
      Alert.alert("Ошибка", "Введите корректную сумму");
      return;
    }
    setTransferring(true);
    try {
      // 1. Make the actual transaction
      const txRes = await fetch(`${BASE_URL}/api/transactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({
          fromCitizenId: citizen.id,
          toCitizenId: peerId,
          minutes: amount,
          note: darminNote || `Перевод из чата`,
        }),
      });
      if (!txRes.ok) {
        const err = await txRes.json() as { error?: string };
        Alert.alert("Ошибка", err.error ?? "Транзакция не выполнена");
        return;
      }

      // 2. Send chat notification (darmin_transfer type) — ciphertext contains note
      const peerPub = peerPubKeyRef.current;
      const sk = secretKeyRef.current;
      if (peerPub && sk) {
        const noteText = darminNote || `Перевод ${amount} Д`;
        const { ciphertext, nonce } = encryptMsg(noteText, peerPub, sk);
        await fetch(`${BASE_URL}/api/chat/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...authHeaders },
          body: JSON.stringify({
            toCitizenId: peerId,
            ciphertext,
            nonce,
            msgType: "darmin_transfer",
            darminAmount: amount,
          }),
        });
      }

      setDarminModal(false);
      setDarminAmount("");
      setDarminNote("");
      Alert.alert("✓ Готово", `${amount} Д переведены`);
    } catch {
      Alert.alert("Ошибка", "Сетевая ошибка");
    } finally {
      setTransferring(false);
    }
  }

  // ── Render ────────────────────────────────────────────────────────────────
  if (!citizen) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.centered}><Text style={s.muted}>Требуется авторизация</Text></View>
      </SafeAreaView>
    );
  }

  const peerName = peer?.name ?? `ID ${peerId}`;

  return (
    <SafeAreaView style={s.safe}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
          <Feather name="arrow-left" size={22} color={C.primary} />
        </TouchableOpacity>
        <View style={s.peerInfo}>
          <View style={s.peerAvatar}>
            <Text style={s.peerAvatarText}>{(peerName)[0]?.toUpperCase()}</Text>
          </View>
          <View>
            <Text style={s.peerName}>{peerName}</Text>
            {peer?.rank && <Text style={s.peerRank}>{peer.rank}</Text>}
          </View>
        </View>
        <View style={s.e2eeBadge}>
          <Feather name="lock" size={9} color={C.primary} />
          <Text style={s.e2eeText}>E2EE</Text>
        </View>
      </View>

      {/* Messages */}
      {loading ? (
        <View style={s.centered}><ActivityIndicator color={C.primary} /></View>
      ) : (
        <FlatList
          ref={flatRef}
          data={messages}
          keyExtractor={(m) => String(m.id)}
          contentContainerStyle={s.msgList}
          renderItem={({ item: m }) => {
            const isMine = m.from_citizen_id === citizen.id;
            const isDarmin = m.msg_type === "darmin_transfer";
            return (
              <View style={[s.msgRow, isMine ? s.msgRowMine : s.msgRowTheirs]}>
                {isDarmin ? (
                  <View style={s.darminBubble}>
                    <Feather name="send" size={14} color={C.primary} />
                    <Text style={s.darminText}>{m.darmin_amount ?? "?"} Д</Text>
                    <Text style={s.darminLabel}>{isMine ? "Отправлено" : "Получено"}</Text>
                  </View>
                ) : (
                  <View style={[s.bubble, isMine ? s.bubbleMine : s.bubbleTheirs]}>
                    <Text style={[s.bubbleText, isMine ? s.bubbleTextMine : s.bubbleTextTheirs]}>
                      {m.plaintext}
                    </Text>
                    <Text style={s.msgTime}>{formatTime(m.created_at)}</Text>
                  </View>
                )}
              </View>
            );
          }}
        />
      )}

      {/* Input bar */}
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={0}>
        <View style={s.inputBar}>
          <TouchableOpacity
            style={s.darminBtn}
            onPress={() => setDarminModal(true)}
            activeOpacity={0.75}
          >
            <Text style={s.darminBtnText}>Д</Text>
          </TouchableOpacity>
          <TextInput
            style={s.input}
            placeholder="Сообщение..."
            placeholderTextColor={C.muted}
            value={input}
            onChangeText={setInput}
            multiline
            maxLength={2000}
            returnKeyType="send"
            onSubmitEditing={sendMessage}
          />
          <TouchableOpacity
            style={[s.sendBtn, (!input.trim() || sending) && s.sendBtnDisabled]}
            onPress={sendMessage}
            disabled={!input.trim() || sending}
            activeOpacity={0.75}
          >
            {sending ? (
              <ActivityIndicator size="small" color="#0A0A0F" />
            ) : (
              <Feather name="send" size={16} color="#0A0A0F" />
            )}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Darmin Transfer Modal */}
      <Modal visible={darminModal} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Перевод Дарминов</Text>
              <TouchableOpacity onPress={() => { setDarminModal(false); setDarminAmount(""); setDarminNote(""); }}>
                <Feather name="x" size={20} color={C.fg} />
              </TouchableOpacity>
            </View>
            <Text style={s.modalSubtitle}>Гражданину: {peerName}</Text>
            <TextInput
              style={s.modalInput}
              placeholder="Сумма в Д"
              placeholderTextColor={C.muted}
              value={darminAmount}
              onChangeText={setDarminAmount}
              keyboardType="decimal-pad"
              autoFocus
            />
            <TextInput
              style={[s.modalInput, { marginTop: 8 }]}
              placeholder="Комментарий (необязательно)"
              placeholderTextColor={C.muted}
              value={darminNote}
              onChangeText={setDarminNote}
              maxLength={100}
            />
            <TouchableOpacity
              style={[s.transferBtn, transferring && { opacity: 0.5 }]}
              onPress={transferDarmins}
              disabled={transferring}
              activeOpacity={0.8}
            >
              {transferring ? (
                <ActivityIndicator color="#0A0A0F" />
              ) : (
                <Text style={s.transferBtnText}>Перевести</Text>
              )}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  centered: { flex: 1, alignItems: "center", justifyContent: "center" },
  muted: { color: C.muted, fontSize: 15 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border, gap: 12 },
  peerInfo: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  peerAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(201,168,76,0.15)", borderWidth: 1, borderColor: "rgba(201,168,76,0.3)", alignItems: "center", justifyContent: "center" },
  peerAvatarText: { fontSize: 16, fontFamily: "Inter_700Bold", color: C.primary },
  peerName: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: C.fg },
  peerRank: { fontSize: 10, fontFamily: "Inter_400Regular", color: C.primary },
  e2eeBadge: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "rgba(201,168,76,0.1)", borderWidth: 1, borderColor: "rgba(201,168,76,0.25)", paddingHorizontal: 6, paddingVertical: 3, borderRadius: 8 },
  e2eeText: { fontSize: 9, fontFamily: "Inter_600SemiBold", color: C.primary },
  msgList: { padding: 12, gap: 6, flexGrow: 1 },
  msgRow: { flexDirection: "row", marginBottom: 6 },
  msgRowMine: { justifyContent: "flex-end" },
  msgRowTheirs: { justifyContent: "flex-start" },
  bubble: { maxWidth: "78%", borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1 },
  bubbleMine: { backgroundColor: C.mine, borderColor: C.mineBorder, borderBottomRightRadius: 4 },
  bubbleTheirs: { backgroundColor: C.theirs, borderColor: C.theirsBorder, borderBottomLeftRadius: 4 },
  bubbleText: { fontSize: 15, fontFamily: "Inter_400Regular", lineHeight: 21 },
  bubbleTextMine: { color: "#A8D8B0" },
  bubbleTextTheirs: { color: C.fg },
  msgTime: { fontSize: 10, fontFamily: "Inter_400Regular", color: C.muted, marginTop: 4, textAlign: "right" },
  darminBubble: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(201,168,76,0.12)", borderWidth: 1, borderColor: "rgba(201,168,76,0.35)", borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10 },
  darminText: { fontSize: 18, fontFamily: "Inter_700Bold", color: C.primary },
  darminLabel: { fontSize: 11, fontFamily: "Inter_400Regular", color: C.muted },
  inputBar: { flexDirection: "row", alignItems: "flex-end", paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: C.border, gap: 8, backgroundColor: C.bg },
  darminBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, borderColor: C.primary, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(201,168,76,0.1)", flexShrink: 0 },
  darminBtnText: { fontSize: 14, fontFamily: "Inter_700Bold", color: C.primary },
  input: { flex: 1, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, color: C.fg, fontFamily: "Inter_400Regular", fontSize: 15, maxHeight: 120 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.primary, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  sendBtnDisabled: { opacity: 0.4 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modalSheet: { backgroundColor: C.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 36, gap: 12 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: C.fg },
  modalSubtitle: { fontSize: 13, fontFamily: "Inter_400Regular", color: C.muted },
  modalInput: { backgroundColor: C.bg, borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: C.fg, fontFamily: "Inter_400Regular", fontSize: 16 },
  transferBtn: { backgroundColor: C.primary, borderRadius: 14, paddingVertical: 14, alignItems: "center", marginTop: 4 },
  transferBtnText: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#0A0A0F" },
});
