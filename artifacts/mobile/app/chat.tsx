import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Modal,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { decodeBase64 } from "tweetnacl-util";

import { useCitizen } from "@/context/CitizenContext";
import { getBaseUrl } from "@/lib/api";
import { decryptMsg, getOrCreateKeyPair } from "@/lib/e2ee";

const BASE_URL = getBaseUrl();

// ── Theme ─────────────────────────────────────────────────────────────────────
const C = {
  bg: "#0A0A0F",
  surface: "#12121A",
  border: "#1E1E2E",
  primary: "#C9A84C",
  fg: "#E8E8F0",
  muted: "#6B6B7E",
  unread: "#C9A84C",
};

// ── Types ─────────────────────────────────────────────────────────────────────
interface Conversation {
  peer_id: number;
  peer_name: string | null;
  peer_rank: string | null;
  peer_chat_public_key: string | null;
  id: number;
  from_citizen_id: number;
  to_citizen_id: number;
  ciphertext: string;
  nonce: string;
  msg_type: string;
  darmin_amount: number | null;
  created_at: string;
  unread_count: number;
}

interface Citizen {
  id: number;
  name: string | null;
  rank: string | null;
  citizenNumber: string | null;
}

function formatTime(iso: string): string {
  const d = new Date(iso);
  const now = new Date();
  const diff = now.getTime() - d.getTime();
  if (diff < 86400000) {
    return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  }
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

export default function ChatListScreen() {
  const router = useRouter();
  const { authToken, authHeaders, citizen } = useCitizen();

  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [loading, setLoading] = useState(true);
  const [decrypted, setDecrypted] = useState<Record<number, string>>({});
  const [searchModal, setSearchModal] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [searchResults, setSearchResults] = useState<Citizen[]>([]);
  const [searching, setSearching] = useState(false);
  const secretKeyRef = useRef<Uint8Array | null>(null);

  // ── Init keypair ──────────────────────────────────────────────────────────
  useEffect(() => {
    if (!citizen || !authToken) return;
    (async () => {
      const kp = await getOrCreateKeyPair();
      secretKeyRef.current = kp.secretKey;

      // Upload public key if not set
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
      } catch {
        // silent — will retry next open
      }
    })();
  }, [citizen, authToken]);

  // ── Load conversations ────────────────────────────────────────────────────
  const loadConversations = useCallback(async () => {
    if (!authToken) { setLoading(false); return; }
    setLoading(true);
    try {
      const res = await fetch(`${BASE_URL}/api/chat/conversations`, { headers: authHeaders });
      const data = await res.json() as { conversations: Conversation[] };
      setConversations(data.conversations ?? []);
    } catch {
      Alert.alert("Ошибка", "Не удалось загрузить переписки");
    } finally {
      setLoading(false);
    }
  }, [authToken]);

  useEffect(() => { loadConversations(); }, [loadConversations]);

  // ── Decrypt last messages ─────────────────────────────────────────────────
  useEffect(() => {
    if (!secretKeyRef.current || conversations.length === 0) return;
    const mySecretKey = secretKeyRef.current;
    const map: Record<number, string> = {};
    for (const c of conversations) {
      if (!c.peer_chat_public_key) {
        map[c.id] = "🔒 Ключ недоступен";
        continue;
      }
      if (c.msg_type === "darmin_transfer") {
        map[c.id] = `💸 ${c.darmin_amount ?? "?"} Д`;
        continue;
      }
      const peerPub = decodeBase64(c.peer_chat_public_key);
      const text = decryptMsg(c.ciphertext, c.nonce, peerPub, mySecretKey);
      map[c.id] = text ?? "🔒 Зашифровано";
    }
    setDecrypted(map);
  }, [conversations]);

  // ── Citizen search ────────────────────────────────────────────────────────
  useEffect(() => {
    if (!searchQuery.trim()) { setSearchResults([]); return; }
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const res = await fetch(`${BASE_URL}/api/citizens`);
        const all = await res.json() as Citizen[];
        const q = searchQuery.toLowerCase();
        const filtered = all.filter((c) =>
          (c.name ?? "").toLowerCase().includes(q) ||
          (c.citizenNumber ?? "").includes(q)
        ).slice(0, 20);
        setSearchResults(filtered);
      } catch {
        setSearchResults([]);
      } finally {
        setSearching(false);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [searchQuery]);

  // ── Render ────────────────────────────────────────────────────────────────
  if (!citizen) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.emptyCenter}>
          <Text style={s.emptyText}>Войдите, чтобы открыть чат</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
          <Feather name="arrow-left" size={22} color={C.primary} />
        </TouchableOpacity>
        <View style={s.headerTitle}>
          <Text style={s.title}>Сообщения</Text>
          <View style={s.e2eeBadge}>
            <Feather name="lock" size={9} color={C.primary} />
            <Text style={s.e2eeBadgeText}>E2EE</Text>
          </View>
        </View>
        <TouchableOpacity onPress={() => setSearchModal(true)} activeOpacity={0.7}>
          <Feather name="edit" size={20} color={C.primary} />
        </TouchableOpacity>
      </View>

      {loading ? (
        <View style={s.emptyCenter}><ActivityIndicator color={C.primary} /></View>
      ) : conversations.length === 0 ? (
        <View style={s.emptyCenter}>
          <Feather name="message-square" size={40} color={C.muted} />
          <Text style={s.emptyText}>Нет переписок</Text>
          <Text style={s.emptySubText}>Нажмите карандаш, чтобы начать диалог</Text>
        </View>
      ) : (
        <FlatList
          data={conversations}
          keyExtractor={(c) => String(c.peer_id)}
          renderItem={({ item: conv }) => (
            <TouchableOpacity
              style={s.convItem}
              onPress={() => router.push(`/chat/${conv.peer_id}`)}
              activeOpacity={0.75}
            >
              <View style={s.avatar}>
                <Text style={s.avatarText}>{(conv.peer_name ?? "?")[0]?.toUpperCase()}</Text>
              </View>
              <View style={s.convBody}>
                <View style={s.convTopRow}>
                  <Text style={s.convName} numberOfLines={1}>{conv.peer_name ?? `ID ${conv.peer_id}`}</Text>
                  <Text style={s.convTime}>{formatTime(conv.created_at)}</Text>
                </View>
                <View style={s.convBotRow}>
                  <Text style={s.convPreview} numberOfLines={1}>
                    {conv.from_citizen_id === citizen.id ? "Вы: " : ""}{decrypted[conv.id] ?? "..."}
                  </Text>
                  {Number(conv.unread_count) > 0 && (
                    <View style={s.unreadBadge}>
                      <Text style={s.unreadText}>{conv.unread_count}</Text>
                    </View>
                  )}
                </View>
                {conv.peer_rank && <Text style={s.convRank}>{conv.peer_rank}</Text>}
              </View>
            </TouchableOpacity>
          )}
          contentContainerStyle={{ paddingBottom: 24 }}
          onRefresh={loadConversations}
          refreshing={loading}
        />
      )}

      {/* New Chat Modal */}
      <Modal visible={searchModal} animationType="slide" transparent>
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Новый диалог</Text>
              <TouchableOpacity onPress={() => { setSearchModal(false); setSearchQuery(""); }}>
                <Feather name="x" size={20} color={C.fg} />
              </TouchableOpacity>
            </View>
            <TextInput
              style={s.searchInput}
              placeholder="Поиск граждан..."
              placeholderTextColor={C.muted}
              value={searchQuery}
              onChangeText={setSearchQuery}
              autoFocus
            />
            {searching && <ActivityIndicator color={C.primary} style={{ marginTop: 12 }} />}
            <FlatList
              data={searchResults}
              keyExtractor={(c) => String(c.id)}
              renderItem={({ item: c }) => (
                <TouchableOpacity
                  style={s.searchItem}
                  onPress={() => {
                    setSearchModal(false);
                    setSearchQuery("");
                    router.push(`/chat/${c.id}`);
                  }}
                  activeOpacity={0.75}
                >
                  <View style={[s.avatar, { width: 36, height: 36, borderRadius: 18 }]}>
                    <Text style={s.avatarText}>{(c.name ?? "?")[0]?.toUpperCase()}</Text>
                  </View>
                  <View>
                    <Text style={s.searchItemName}>{c.name ?? `ID ${c.id}`}</Text>
                    {c.rank && <Text style={s.searchItemRank}>{c.rank}</Text>}
                  </View>
                </TouchableOpacity>
              )}
              style={{ maxHeight: 300 }}
            />
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border, gap: 12 },
  headerTitle: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  title: { fontSize: 20, fontFamily: "Inter_700Bold", color: C.fg },
  e2eeBadge: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "rgba(201,168,76,0.12)", borderWidth: 1, borderColor: "rgba(201,168,76,0.3)", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  e2eeBadgeText: { fontSize: 9, fontFamily: "Inter_600SemiBold", color: C.primary },
  emptyCenter: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  emptyText: { fontSize: 16, fontFamily: "Inter_500Medium", color: C.muted },
  emptySubText: { fontSize: 13, fontFamily: "Inter_400Regular", color: C.muted, textAlign: "center", paddingHorizontal: 32 },
  convItem: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border, gap: 12 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(201,168,76,0.15)", borderWidth: 1, borderColor: "rgba(201,168,76,0.3)", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  avatarText: { fontSize: 18, fontFamily: "Inter_700Bold", color: C.primary },
  convBody: { flex: 1, gap: 3 },
  convTopRow: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  convName: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: C.fg, flex: 1 },
  convTime: { fontSize: 11, fontFamily: "Inter_400Regular", color: C.muted, flexShrink: 0 },
  convBotRow: { flexDirection: "row", alignItems: "center", gap: 6 },
  convPreview: { fontSize: 13, fontFamily: "Inter_400Regular", color: C.muted, flex: 1 },
  convRank: { fontSize: 10, fontFamily: "Inter_400Regular", color: C.primary, opacity: 0.7 },
  unreadBadge: { backgroundColor: C.unread, borderRadius: 10, minWidth: 18, height: 18, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  unreadText: { fontSize: 10, fontFamily: "Inter_700Bold", color: "#0A0A0F" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modalSheet: { backgroundColor: C.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 36 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  modalTitle: { fontSize: 17, fontFamily: "Inter_700Bold", color: C.fg },
  searchInput: { backgroundColor: C.bg, borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, color: C.fg, fontFamily: "Inter_400Regular", fontSize: 15, marginBottom: 8 },
  searchItem: { flexDirection: "row", alignItems: "center", paddingVertical: 10, gap: 12 },
  searchItemName: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: C.fg },
  searchItemRank: { fontSize: 11, fontFamily: "Inter_400Regular", color: C.primary },
});
