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

const C = {
  bg: "#0A0A0F",
  surface: "#12121A",
  border: "#1E1E2E",
  primary: "#C9A84C",
  fg: "#E8E8F0",
  muted: "#6B6B7E",
  tabInactive: "#2A2A3A",
};

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

interface GroupItem {
  id: number;
  name: string;
  description: string | null;
  member_count: number;
  unread_count: number;
  last_message: { content: string; msg_type: string; from_citizen_id: number; created_at: string } | null;
  is_admin: boolean;
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
  if (now.getTime() - d.getTime() < 86400000)
    return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
  return d.toLocaleDateString("ru-RU", { day: "numeric", month: "short" });
}

type Tab = "dms" | "groups";

export default function ChatListScreen() {
  const router = useRouter();
  const { authToken, authHeaders, citizen } = useCitizen();

  const [activeTab, setActiveTab] = useState<Tab>("dms");
  const [conversations, setConversations] = useState<Conversation[]>([]);
  const [groups, setGroups] = useState<GroupItem[]>([]);
  const [onlineIds, setOnlineIds] = useState<Set<number>>(new Set());
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
      try {
        const checkRes = await fetch(`${BASE_URL}/api/chat/key/${citizen.id}`);
        const checkData = (await checkRes.json()) as { publicKey?: string };
        if (checkData.publicKey !== kp.publicKeyB64) {
          await fetch(`${BASE_URL}/api/chat/key`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...authHeaders },
            body: JSON.stringify({ publicKey: kp.publicKeyB64 }),
          });
        }
      } catch { /* silent */ }
    })();
  }, [citizen, authToken]);

  // ── Load data ─────────────────────────────────────────────────────────────
  const loadAll = useCallback(async () => {
    if (!authToken) { setLoading(false); return; }
    setLoading(true);
    try {
      const [convRes, grpRes, onlineRes] = await Promise.all([
        fetch(`${BASE_URL}/api/chat/conversations`, { headers: authHeaders }),
        fetch(`${BASE_URL}/api/chat/groups`, { headers: authHeaders }),
        fetch(`${BASE_URL}/api/chat/online`, { headers: authHeaders }),
      ]);
      if (convRes.ok) {
        const d = (await convRes.json()) as { conversations: Conversation[] };
        setConversations(d.conversations ?? []);
      }
      if (grpRes.ok) {
        const d = (await grpRes.json()) as { groups: GroupItem[] };
        setGroups(d.groups ?? []);
      }
      if (onlineRes.ok) {
        const d = (await onlineRes.json()) as { online: number[] };
        setOnlineIds(new Set(d.online ?? []));
      }
    } catch {
      Alert.alert("Ошибка", "Не удалось загрузить чаты");
    } finally {
      setLoading(false);
    }
  }, [authToken]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // ── Decrypt last messages ─────────────────────────────────────────────────
  useEffect(() => {
    const sk = secretKeyRef.current;
    if (!sk || conversations.length === 0) return;
    const map: Record<number, string> = {};
    for (const c of conversations) {
      if (c.msg_type === "voice") { map[c.id] = "🎤 Голосовое"; continue; }
      if (c.msg_type === "darmin_transfer") { map[c.id] = `💸 ${c.darmin_amount ?? "?"} Д`; continue; }
      if (!c.peer_chat_public_key) { map[c.id] = "🔒"; continue; }
      const pub = decodeBase64(c.peer_chat_public_key);
      map[c.id] = decryptMsg(c.ciphertext, c.nonce, pub, sk) ?? "🔒";
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
        const all = (await res.json()) as Citizen[];
        const q = searchQuery.toLowerCase();
        setSearchResults(all.filter((c) => (c.name ?? "").toLowerCase().includes(q) || (c.citizenNumber ?? "").includes(q)).slice(0, 20));
      } catch { setSearchResults([]); }
      finally { setSearching(false); }
    }, 400);
    return () => clearTimeout(t);
  }, [searchQuery]);

  if (!citizen) {
    return (
      <SafeAreaView style={s.safe}>
        <View style={s.center}><Text style={s.muted}>Войдите, чтобы открыть чат</Text></View>
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
        <View style={s.headerCenter}>
          <Text style={s.title}>Сообщения</Text>
          <View style={s.e2eeBadge}>
            <Feather name="lock" size={9} color={C.primary} />
            <Text style={s.e2eeBadgeText}>E2EE</Text>
          </View>
        </View>
        <TouchableOpacity
          onPress={() => activeTab === "groups" ? router.push("/chat/new-group") : setSearchModal(true)}
          activeOpacity={0.7}
        >
          <Feather name={activeTab === "groups" ? "users" : "edit"} size={20} color={C.primary} />
        </TouchableOpacity>
      </View>

      {/* Tab bar */}
      <View style={s.tabBar}>
        {(["dms", "groups"] as Tab[]).map((tab) => (
          <TouchableOpacity
            key={tab}
            style={[s.tab, activeTab === tab && s.tabActive]}
            onPress={() => setActiveTab(tab)}
            activeOpacity={0.7}
          >
            <Feather
              name={tab === "dms" ? "message-square" : "users"}
              size={14}
              color={activeTab === tab ? C.primary : C.muted}
            />
            <Text style={[s.tabText, activeTab === tab && s.tabTextActive]}>
              {tab === "dms" ? "Чаты" : "Группы"}
            </Text>
            {tab === "dms" && conversations.some((c) => Number(c.unread_count) > 0) && (
              <View style={s.tabDot} />
            )}
            {tab === "groups" && groups.some((g) => Number(g.unread_count) > 0) && (
              <View style={s.tabDot} />
            )}
          </TouchableOpacity>
        ))}
      </View>

      {loading ? (
        <View style={s.center}><ActivityIndicator color={C.primary} /></View>
      ) : activeTab === "dms" ? (
        /* ── DM list ── */
        conversations.length === 0 ? (
          <View style={s.center}>
            <Feather name="message-square" size={40} color={C.muted} />
            <Text style={s.emptyText}>Нет переписок</Text>
            <Text style={s.emptySubText}>Нажмите карандаш чтобы начать диалог</Text>
          </View>
        ) : (
          <FlatList
            data={conversations}
            keyExtractor={(c) => String(c.peer_id)}
            onRefresh={loadAll}
            refreshing={loading}
            contentContainerStyle={{ paddingBottom: 24 }}
            renderItem={({ item: conv }) => {
              const isOnline = onlineIds.has(conv.peer_id);
              return (
                <TouchableOpacity
                  style={s.convItem}
                  onPress={() => router.push(`/chat/${conv.peer_id}`)}
                  activeOpacity={0.75}
                >
                  <View style={s.avatarWrap}>
                    <View style={s.avatar}>
                      <Text style={s.avatarText}>{(conv.peer_name ?? "?")[0]?.toUpperCase()}</Text>
                    </View>
                    {isOnline && <View style={s.onlineDot} />}
                  </View>
                  <View style={s.convBody}>
                    <View style={s.convTop}>
                      <Text style={s.convName} numberOfLines={1}>{conv.peer_name ?? `ID ${conv.peer_id}`}</Text>
                      <Text style={s.convTime}>{formatTime(conv.created_at)}</Text>
                    </View>
                    <View style={s.convBot}>
                      <Text style={s.convPreview} numberOfLines={1}>
                        {conv.from_citizen_id === citizen.id ? "Вы: " : ""}
                        {decrypted[conv.id] ?? "..."}
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
              );
            }}
          />
        )
      ) : (
        /* ── Groups list ── */
        groups.length === 0 ? (
          <View style={s.center}>
            <Feather name="users" size={40} color={C.muted} />
            <Text style={s.emptyText}>Нет групп</Text>
            <Text style={s.emptySubText}>Нажмите иконку группы чтобы создать</Text>
          </View>
        ) : (
          <FlatList
            data={groups}
            keyExtractor={(g) => String(g.id)}
            onRefresh={loadAll}
            refreshing={loading}
            contentContainerStyle={{ paddingBottom: 24 }}
            renderItem={({ item: grp }) => (
              <TouchableOpacity
                style={s.convItem}
                onPress={() => router.push(`/chat/group/${grp.id}`)}
                activeOpacity={0.75}
              >
                <View style={s.groupAvatarWrap}>
                  <Feather name="users" size={20} color={C.primary} />
                </View>
                <View style={s.convBody}>
                  <View style={s.convTop}>
                    <Text style={s.convName} numberOfLines={1}>{grp.name}</Text>
                    {grp.last_message && <Text style={s.convTime}>{formatTime(grp.last_message.created_at)}</Text>}
                  </View>
                  <View style={s.convBot}>
                    <Text style={s.convPreview} numberOfLines={1}>
                      {grp.last_message
                        ? grp.last_message.msg_type === "voice" ? "🎤 Голосовое"
                        : grp.last_message.msg_type === "darmin_transfer" ? `💸 Перевод`
                        : grp.last_message.content
                        : `${grp.member_count} участников`}
                    </Text>
                    {Number(grp.unread_count) > 0 && (
                      <View style={s.unreadBadge}>
                        <Text style={s.unreadText}>{grp.unread_count}</Text>
                      </View>
                    )}
                  </View>
                  <Text style={s.convRank}>{grp.member_count} участников{grp.is_admin ? " · Администратор" : ""}</Text>
                </View>
              </TouchableOpacity>
            )}
          />
        )
      )}

      {/* New DM Modal */}
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
              style={{ maxHeight: 300 }}
              renderItem={({ item: c }) => (
                <TouchableOpacity
                  style={s.searchItem}
                  onPress={() => { setSearchModal(false); setSearchQuery(""); router.push(`/chat/${c.id}`); }}
                  activeOpacity={0.75}
                >
                  <View style={s.avatar}>
                    <Text style={s.avatarText}>{(c.name ?? "?")[0]?.toUpperCase()}</Text>
                  </View>
                  <View>
                    <Text style={s.searchName}>{c.name ?? `ID ${c.id}`}</Text>
                    {c.rank && <Text style={s.searchRank}>{c.rank}</Text>}
                  </View>
                  {onlineIds.has(c.id) && <View style={[s.onlineDot, { position: "relative", marginLeft: "auto" }]} />}
                </TouchableOpacity>
              )}
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
  headerCenter: { flex: 1, flexDirection: "row", alignItems: "center", gap: 8 },
  title: { fontSize: 20, fontFamily: "Inter_700Bold", color: C.fg },
  e2eeBadge: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "rgba(201,168,76,0.12)", borderWidth: 1, borderColor: "rgba(201,168,76,0.3)", paddingHorizontal: 6, paddingVertical: 2, borderRadius: 8 },
  e2eeBadgeText: { fontSize: 9, fontFamily: "Inter_600SemiBold", color: C.primary },
  tabBar: { flexDirection: "row", borderBottomWidth: 1, borderBottomColor: C.border },
  tab: { flex: 1, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 6, paddingVertical: 12 },
  tabActive: { borderBottomWidth: 2, borderBottomColor: C.primary },
  tabText: { fontSize: 13, fontFamily: "Inter_600SemiBold", color: C.muted },
  tabTextActive: { color: C.primary },
  tabDot: { width: 6, height: 6, borderRadius: 3, backgroundColor: C.primary },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
  muted: { color: C.muted, fontSize: 15 },
  emptyText: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: C.muted },
  emptySubText: { fontSize: 13, fontFamily: "Inter_400Regular", color: C.muted, textAlign: "center", paddingHorizontal: 32 },
  convItem: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border, gap: 12 },
  avatarWrap: { position: "relative", flexShrink: 0 },
  avatar: { width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(201,168,76,0.15)", borderWidth: 1, borderColor: "rgba(201,168,76,0.3)", alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 18, fontFamily: "Inter_700Bold", color: C.primary },
  onlineDot: { position: "absolute", bottom: 1, right: 1, width: 11, height: 11, borderRadius: 6, backgroundColor: "#3CB878", borderWidth: 2, borderColor: C.bg },
  groupAvatarWrap: { width: 44, height: 44, borderRadius: 22, backgroundColor: "rgba(201,168,76,0.1)", borderWidth: 1, borderColor: "rgba(201,168,76,0.25)", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  convBody: { flex: 1, gap: 3 },
  convTop: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  convName: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: C.fg, flex: 1 },
  convTime: { fontSize: 11, fontFamily: "Inter_400Regular", color: C.muted, flexShrink: 0 },
  convBot: { flexDirection: "row", alignItems: "center", gap: 6 },
  convPreview: { fontSize: 13, fontFamily: "Inter_400Regular", color: C.muted, flex: 1 },
  convRank: { fontSize: 10, fontFamily: "Inter_400Regular", color: C.primary, opacity: 0.7 },
  unreadBadge: { backgroundColor: C.primary, borderRadius: 10, minWidth: 18, height: 18, alignItems: "center", justifyContent: "center", paddingHorizontal: 4 },
  unreadText: { fontSize: 10, fontFamily: "Inter_700Bold", color: "#0A0A0F" },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modalSheet: { backgroundColor: C.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 36 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", marginBottom: 14 },
  modalTitle: { fontSize: 17, fontFamily: "Inter_700Bold", color: C.fg },
  searchInput: { backgroundColor: C.bg, borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, color: C.fg, fontFamily: "Inter_400Regular", fontSize: 15, marginBottom: 8 },
  searchItem: { flexDirection: "row", alignItems: "center", paddingVertical: 10, gap: 12 },
  searchName: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: C.fg },
  searchRank: { fontSize: 11, fontFamily: "Inter_400Regular", color: C.primary },
});
