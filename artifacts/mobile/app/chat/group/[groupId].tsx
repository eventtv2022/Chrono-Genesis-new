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

import { useCitizen } from "@/context/CitizenContext";
import { getBaseUrl } from "@/lib/api";
import { getStoredAuthHeaders } from "@/lib/authStorage";
import {
  getOrCreateKeyPair,
  generateGroupKey,
  encryptGroupKeyForMember,
  decryptGroupKey,
  encryptGroupMsg,
  decryptGroupMsg,
  encryptMsg,
} from "@/lib/e2ee";
import { decodeBase64 } from "tweetnacl-util";
import { useLanguage } from "@/context/LanguageContext";
import { AttachmentPreviewStrip, type AttachmentMeta } from "@/components/ChatAttachments";

const BASE_URL = getBaseUrl();

const C = {
  bg: "#0A0A0F", surface: "#12121A", border: "#1E1E2E",
  primary: "#C9A84C", fg: "#E8E8F0", muted: "#6B6B7E",
  mine: "#1C3526", mineBorder: "#2D5A3D",
  theirs: "#1A1E30", theirsBorder: "#252A44",
};

interface GroupInfo { id: number; name: string; description: string | null; created_by: number; }
interface Member { citizen_id: number; name: string | null; rank: string | null; is_admin: boolean; }
interface CitizenItem { id: number; name: string | null; rank: string | null; }

interface GrpMsg {
  id: number; group_id: number; from_citizen_id: number;
  content: string; msg_type: string; darmin_amount: number | null;
  forwarded_from_dm_id: number | null; created_at: string;
  sender_name: string | null; sender_rank: string | null;
  // E2EE fields
  ciphertext?: string | null; msg_nonce?: string | null;
  // Reply fields
  reply_to_id?: number | null; reply_sender_name?: string | null; reply_content?: string | null;
}

interface PendingFile { uri: string; name: string; size: number; mimeType: string; }

function formatTime(iso: string | Date | null | undefined): string {
  if (!iso) return "Только что";
  // PostgreSQL returns "YYYY-MM-DD HH:mm:ss+00" (space, not T). Normalise to ISO.
  const s = typeof iso === "string" ? iso.replace(" ", "T") : iso;
  const d = new Date(s);
  if (isNaN(d.getTime())) return "Только что";
  return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

export default function GroupConversationScreen() {
  const router = useRouter();
  const { groupId: rawId } = useLocalSearchParams<{ groupId: string }>();
  const groupId = parseInt(rawId ?? "0", 10);
  const { citizen } = useCitizen();

  const [group, setGroup] = useState<GroupInfo | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [messages, setMessages] = useState<GrpMsg[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [showMembers, setShowMembers] = useState(false);
  const [darminModal, setDarminModal] = useState(false);
  const [darminAmount, setDarminAmount] = useState("");
  const [darminNote, setDarminNote] = useState("");
  const [transferring, setTransferring] = useState(false);
  const [isE2EE, setIsE2EE] = useState(false);
  const [selectedMsg, setSelectedMsg] = useState<GrpMsg | null>(null);
  const [showForwardModal, setShowForwardModal] = useState(false);
  const [forwardCitizens, setForwardCitizens] = useState<CitizenItem[]>([]);
  const [forwardSearch, setForwardSearch] = useState("");
  const [forwardingTo, setForwardingTo] = useState<number | null>(null);
  const [replyTo, setReplyTo] = useState<{ id: number; text: string; senderName: string } | null>(null);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);

  const { t } = useLanguage();
  const flatRef = useRef<FlatList>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const groupKeyRef = useRef<Uint8Array | null>(null);
  const mySecretKeyRef = useRef<Uint8Array | null>(null);
  const myPubKeyB64Ref = useRef<string | null>(null);
  const forwardMsgRef = useRef<GrpMsg | null>(null);

  // ── Decrypt a message if group key is available ───────────────────────────
  function decryptIfNeeded(m: GrpMsg): GrpMsg {
    if (m.ciphertext && m.msg_nonce && groupKeyRef.current) {
      const plain = decryptGroupMsg(m.ciphertext, m.msg_nonce, groupKeyRef.current);
      return { ...m, content: plain ?? "🔒 [не удалось расшифровать]" };
    }
    return m;
  }

  // ── Load + distribute group E2EE key ─────────────────────────────────────
  async function loadGroupKeyWith(grp: GroupInfo | null, mbrs: Member[], hdrs: Record<string, string>) {
    if (!grp || !mySecretKeyRef.current || !myPubKeyB64Ref.current) return;
    try {
      const res = await fetch(`${BASE_URL}/api/chat/groups/${grp.id}/key`, { headers: hdrs });
      if (res.ok) {
        const d = (await res.json()) as { encryptedKey: string; encNonce: string; creatorPublicKey: string };
        const creatorPub = decodeBase64(d.creatorPublicKey);
        const gk = decryptGroupKey(d.encryptedKey, d.encNonce, creatorPub, mySecretKeyRef.current!);
        if (gk) { groupKeyRef.current = gk; setIsE2EE(true); return; }
      }
      // Key not found — if I'm the creator, generate + distribute to all members
      if (citizen && grp.created_by === citizen.id) {
        const newKey = generateGroupKey();
        const entries: Array<{ citizenId: number; encryptedKey: string; encNonce: string; creatorPublicKey: string }> = [];
        for (const m of mbrs) {
          try {
            const kr = await fetch(`${BASE_URL}/api/chat/key/${m.citizen_id}`);
            if (!kr.ok) continue;
            const { publicKey } = (await kr.json()) as { publicKey: string };
            const { encryptedKey, encNonce } = encryptGroupKeyForMember(
              newKey, decodeBase64(publicKey), mySecretKeyRef.current!,
            );
            entries.push({ citizenId: m.citizen_id, encryptedKey, encNonce, creatorPublicKey: myPubKeyB64Ref.current! });
          } catch { /* skip members with no key */ }
        }
        if (entries.length > 0) {
          await fetch(`${BASE_URL}/api/chat/groups/${grp.id}/key`, {
            method: "POST",
            headers: { "Content-Type": "application/json", ...hdrs },
            body: JSON.stringify({ keys: entries }),
          });
          groupKeyRef.current = newKey;
          setIsE2EE(true);
        }
      }
    } catch { /* E2EE setup is non-critical */ }
  }

  // ── Forward group message to personal DM ─────────────────────────────────
  async function openGroupForward() {
    try {
      const res = await fetch(`${BASE_URL}/api/citizens`);
      const all = (await res.json()) as CitizenItem[];
      setForwardCitizens(all.filter((c) => c.id !== citizen?.id).slice(0, 100));
    } catch { setForwardCitizens([]); }
    setShowForwardModal(true);
  }

  async function forwardToUser(targetId: number) {
    const msg = forwardMsgRef.current;
    const sk = mySecretKeyRef.current;
    if (!msg || !citizen || !sk) return;
    setForwardingTo(targetId);
    try {
      const keyRes = await fetch(`${BASE_URL}/api/chat/key/${targetId}`);
      if (!keyRes.ok) { Alert.alert("Ошибка", "Получатель не подключил E2EE"); return; }
      const { publicKey } = (await keyRes.json()) as { publicKey: string };
      const targetPub = decodeBase64(publicKey);
      const hdrs = await getStoredAuthHeaders();
      const { ciphertext, nonce } = encryptMsg(msg.content, targetPub, sk);
      await fetch(`${BASE_URL}/api/chat/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...hdrs },
        body: JSON.stringify({ toCitizenId: targetId, ciphertext, nonce }),
      });
      setShowForwardModal(false);
      setForwardSearch("");
      Alert.alert("✓", "Сообщение переслано");
    } catch { Alert.alert("Ошибка", "Не удалось переслать"); }
    finally { setForwardingTo(null); }
  }

  // ── Load group + messages ─────────────────────────────────────────────────
  const loadGroup = useCallback(async () => {
    if (!groupId) { setLoading(false); return; }
    setLoading(true);
    try {
      // Load my keypair first (needed for E2EE)
      if (!mySecretKeyRef.current) {
        const kp = await getOrCreateKeyPair();
        mySecretKeyRef.current = kp.secretKey;
        myPubKeyB64Ref.current = kp.publicKeyB64;
      }
      const hdrs = await getStoredAuthHeaders();
      const [infoRes, msgRes] = await Promise.all([
        fetch(`${BASE_URL}/api/chat/groups/${groupId}`, { headers: hdrs }),
        fetch(`${BASE_URL}/api/chat/groups/${groupId}/messages?limit=100`, { headers: hdrs }),
      ]);
      let grp: GroupInfo | null = null;
      let mbrs: Member[] = [];
      if (infoRes.ok) {
        const d = (await infoRes.json()) as { group: GroupInfo; members: Member[] };
        grp = d.group; mbrs = d.members ?? [];
        setGroup(grp); setMembers(mbrs);
      }
      // Load E2EE group key before rendering messages
      await loadGroupKeyWith(grp, mbrs, hdrs);
      if (msgRes.ok) {
        const d = (await msgRes.json()) as { messages: GrpMsg[] };
        setMessages((d.messages ?? []).map(decryptIfNeeded));
      }
      // Mark as read
      fetch(`${BASE_URL}/api/chat/groups/${groupId}/read`, { method: "PATCH", headers: hdrs }).catch(() => {});
    } catch {
      Alert.alert("Ошибка", "Не удалось загрузить группу");
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [groupId, citizen?.id]);

  useEffect(() => { loadGroup(); }, [loadGroup]);

  useEffect(() => {
    if (messages.length > 0) setTimeout(() => flatRef.current?.scrollToEnd({ animated: false }), 80);
  }, [messages.length]);

  // ── WebSocket ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!citizen) return;
    const wsUrl = BASE_URL.replace(/^https?/, (m) => (m === "https" ? "wss" : "ws")) + "/api/ws";
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    ws.onopen = () => ws.send(JSON.stringify({ type: "auth", citizenId: citizen.id }));
    ws.onmessage = (evt: MessageEvent) => {
      try {
        const msg = JSON.parse(evt.data as string) as { type: string; message?: GrpMsg };
        if (msg.type === "group_message" && msg.message && msg.message.group_id === groupId) {
          const incoming = decryptIfNeeded(msg.message);
          setMessages((prev) => [...prev, incoming]);
          setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 80);
          getStoredAuthHeaders().then((h) =>
            fetch(`${BASE_URL}/api/chat/groups/${groupId}/read`, { method: "PATCH", headers: h }).catch(() => {})
          );
        }
      } catch { /* ignore */ }
    };
    return () => { ws.close(); wsRef.current = null; };
  }, [citizen, groupId]);

  // ── Send message ──────────────────────────────────────────────────────────
  async function sendMessage() {
    if (!input.trim() && pendingFiles.length === 0) return;
    if (!citizen) return;
    setSending(true);
    const plaintext = input.trim();
    const capturedFiles = pendingFiles;
    try {
      const hdrs = await getStoredAuthHeaders();
      if (!hdrs.Authorization) { Alert.alert("Сессия истекла", "Выйдите и войдите снова"); return; }

      let uploadedAtts: AttachmentMeta[] = [];
      if (capturedFiles.length > 0) {
        const token = hdrs.Authorization.replace("Bearer ", "");
        uploadedAtts = await uploadFiles(capturedFiles, token);
      }

      const replyFields = replyTo
        ? { replyToId: replyTo.id, replySenderName: replyTo.senderName, replyContent: replyTo.text.slice(0, 400) }
        : {};
      const attField = uploadedAtts.length > 0 ? { attachments: uploadedAtts } : {};
      let body: object;
      if (groupKeyRef.current) {
        const { ciphertext, msgNonce } = encryptGroupMsg(plaintext, groupKeyRef.current);
        body = { content: "", ciphertext, msgNonce, msgType: "text", ...replyFields, ...attField };
      } else {
        body = { content: plaintext, msgType: "text", ...replyFields, ...attField };
      }
      const res = await fetch(`${BASE_URL}/api/chat/groups/${groupId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...hdrs },
        body: JSON.stringify(body),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        Alert.alert("Ошибка", err.error ?? "Не удалось отправить"); return;
      }
      const { message: sent } = (await res.json()) as { message: GrpMsg };
      setMessages((prev) => [...prev, {
        ...sent, content: plaintext,
        reply_to_id: replyTo?.id ?? null,
        reply_sender_name: replyTo?.senderName ?? null,
        reply_content: replyTo?.text.slice(0, 400) ?? null,
      }]);
      setInput("");
      setPendingFiles([]);
      setReplyTo(null);
      setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 80);
    } catch { Alert.alert("Ошибка", "Сетевая ошибка"); }
    finally { setSending(false); }
  }

  // ── Transfer Darmins in group ─────────────────────────────────────────────
  async function transferDarmins() {
    const amount = parseFloat(darminAmount);
    if (!citizen || isNaN(amount) || amount <= 0) {
      Alert.alert("Ошибка", "Введите корректную сумму"); return;
    }
    setTransferring(true);
    try {
      const hdrs = await getStoredAuthHeaders();
      if (!hdrs.Authorization) { Alert.alert("Сессия истекла", "Выйдите и войдите снова"); return; }
      const targets = members.filter((m) => m.citizen_id !== citizen.id);
      for (const target of targets) {
        await fetch(`${BASE_URL}/api/chat/transfer`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...hdrs },
          body: JSON.stringify({ toCitizenId: target.citizen_id, amount, note: darminNote || `Групповой перевод` }),
        });
      }
      await fetch(`${BASE_URL}/api/chat/groups/${groupId}/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...hdrs },
        body: JSON.stringify({ content: darminNote || `Перевод ${amount} Д всем участникам`, msgType: "darmin_transfer", darminAmount: amount }),
      });
      setDarminModal(false); setDarminAmount(""); setDarminNote("");
      Alert.alert("✓ Готово", `${amount} Д переведены всем участникам (${targets.length})`);
    } catch { Alert.alert("Ошибка", "Сетевая ошибка"); }
    finally { setTransferring(false); }
  }

  // ── File attachment picker ────────────────────────────────────────────────
  async function pickAttachment() {
    if (pendingFiles.length >= 5) { Alert.alert("Лимит", "Максимум 5 файлов за раз"); return; }
    try {
      const DocumentPicker = await import("expo-document-picker");
      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      const sizeBytes = asset.size ?? 0;
      if (sizeBytes > 12 * 1024 * 1024) {
        Alert.alert(t.tl_media_label, t.tl_media_limit); return;
      }
      setPendingFiles((prev) => [...prev, {
        uri: asset.uri,
        name: asset.name ?? "file",
        size: sizeBytes,
        mimeType: asset.mimeType ?? "application/octet-stream",
      }]);
    } catch { /* user cancelled or permission denied */ }
  }

  // ── Upload files to server ────────────────────────────────────────────────
  async function uploadFiles(files: PendingFile[], token: string): Promise<AttachmentMeta[]> {
    const uploadOne = async (pf: PendingFile): Promise<AttachmentMeta> => {
      const form = new FormData();
      if (Platform.OS === "web") {
        let blob: Blob;
        try { blob = await fetch(pf.uri).then((r) => r.blob()); }
        catch { throw new Error(`Не удалось прочитать файл «${pf.name}»`); }
        form.append("file", new File([blob], pf.name, { type: pf.mimeType || blob.type || "application/octet-stream" }));
      } else {
        form.append("file", { uri: pf.uri, name: pf.name, type: pf.mimeType } as unknown as Blob);
      }
      const res = await fetch(`${BASE_URL}/api/chat/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({}) as object) as { error?: string };
        throw new Error(err.error ?? `Ошибка загрузки «${pf.name}»`);
      }
      return res.json() as Promise<AttachmentMeta>;
    };
    return Promise.all(files.map(uploadOne));
  }

  if (!citizen) {
    return <SafeAreaView style={s.safe}><View style={s.center}><Text style={s.muted}>Требуется авторизация</Text></View></SafeAreaView>;
  }

  return (
    <SafeAreaView style={s.safe}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
          <Feather name="arrow-left" size={22} color={C.primary} />
        </TouchableOpacity>
        <TouchableOpacity style={s.headerCenter} onPress={() => setShowMembers(true)} activeOpacity={0.8}>
          <View style={s.groupIcon}><Feather name="users" size={16} color={C.primary} /></View>
          <View>
            <Text style={s.groupName}>{group?.name ?? `Группа ${groupId}`}</Text>
            <Text style={s.memberCount}>{members.length} участников</Text>
          </View>
        </TouchableOpacity>
        <View style={s.headerActions}>
          <TouchableOpacity
            style={s.callBtn}
            onPress={() => Alert.alert("📞 " + t.grp_call_audio, t.grp_call_starting)}
            activeOpacity={0.75}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Feather name="phone" size={16} color={C.primary} />
          </TouchableOpacity>
          <TouchableOpacity
            style={s.callBtn}
            onPress={() => Alert.alert("📹 " + t.grp_call_video, t.grp_call_starting)}
            activeOpacity={0.75}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Feather name="video" size={16} color={C.primary} />
          </TouchableOpacity>
          <View style={[s.serverBadge, isE2EE && { borderColor: "rgba(201,168,76,0.4)", backgroundColor: "rgba(201,168,76,0.08)" }]}>
            <Feather name={isE2EE ? "lock" : "server"} size={9} color={isE2EE ? C.primary : C.muted} />
            <Text style={[s.serverText, isE2EE && { color: C.primary }]}>{isE2EE ? "E2EE" : "Сервер"}</Text>
          </View>
        </View>
      </View>

      {/* Messages */}
      {loading ? (
        <View style={s.center}><ActivityIndicator color={C.primary} /></View>
      ) : messages.length === 0 ? (
        <View style={s.center}>
          <Feather name="message-circle" size={36} color={C.muted} />
          <Text style={s.muted}>Нет сообщений</Text>
        </View>
      ) : (
        <FlatList
          ref={flatRef}
          data={messages}
          keyExtractor={(m) => String(m.id)}
          contentContainerStyle={s.msgList}
          renderItem={({ item: m }) => {
            const isMine = Number(m.from_citizen_id) === Number(citizen.id);
            const isDarmin = m.msg_type === "darmin_transfer";
            return (
              <TouchableOpacity
                activeOpacity={0.85}
                onLongPress={() => { forwardMsgRef.current = m; setSelectedMsg(m); }}
                style={[s.msgRow, isMine ? s.msgRowMine : s.msgRowTheirs]}
              >
                <View style={{ alignSelf: isMine ? "flex-end" : "flex-start", maxWidth: "82%" }}>
                  {!isMine && (
                    <Text style={s.senderName}>{m.sender_name ?? `ID ${m.from_citizen_id}`}</Text>
                  )}
                  {isDarmin ? (
                    <View style={s.darminBubble}>
                      <Feather name="send" size={14} color={C.primary} />
                      <Text style={s.darminText}>{m.darmin_amount ?? "?"} Д</Text>
                      <Text style={s.darminLabel}>{isMine ? "Отправлено всем" : "Получено"}</Text>
                    </View>
                  ) : (
                    <View style={[s.bubble, isMine ? s.bubbleMine : s.bubbleTheirs]}>
                      {m.reply_to_id && (
                        <View style={s.quoteBubble}>
                          <View style={s.quoteStripe} />
                          <View style={{ flex: 1 }}>
                            <Text style={s.quoteName}>{m.reply_sender_name ?? "Ответ"}</Text>
                            <Text style={s.quoteText} numberOfLines={2}>{m.reply_content ?? "Сообщение"}</Text>
                          </View>
                        </View>
                      )}
                      <Text style={[s.bubbleText, isMine ? s.bubbleTextMine : s.bubbleTextTheirs]}>
                        {m.content}
                      </Text>
                      <Text style={s.msgTime}>{formatTime(m.created_at)}</Text>
                    </View>
                  )}
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* Input */}
      <KeyboardAvoidingView behavior={Platform.OS === "ios" ? "padding" : "height"} keyboardVerticalOffset={0}>
        {replyTo && (
          <View style={s.replyBanner}>
            <View style={s.replyStripe} />
            <View style={{ flex: 1, overflow: "hidden" }}>
              <Text style={s.replyName}>{replyTo.senderName}</Text>
              <Text style={s.replyText} numberOfLines={1}>{replyTo.text}</Text>
            </View>
            <TouchableOpacity onPress={() => setReplyTo(null)} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
              <Feather name="x" size={16} color={C.muted} />
            </TouchableOpacity>
          </View>
        )}
        {pendingFiles.length > 0 && (
          <AttachmentPreviewStrip
            files={pendingFiles}
            onRemove={(i) => setPendingFiles((p) => p.filter((_, idx) => idx !== i))}
          />
        )}
        <View style={s.inputBar}>
          <TouchableOpacity style={s.attachBtn} onPress={pickAttachment} activeOpacity={0.75}>
            <Feather name="paperclip" size={18} color={C.primary} />
          </TouchableOpacity>
          <TextInput
            style={s.input}
            placeholder={t.grp_msg_placeholder}
            placeholderTextColor={C.muted}
            value={input}
            onChangeText={setInput}
            multiline
            maxLength={4000}
            returnKeyType="send"
            onSubmitEditing={sendMessage}
          />
          <TouchableOpacity
            style={[s.sendBtn, (!input.trim() && pendingFiles.length === 0 || sending) && s.sendBtnDis]}
            onPress={sendMessage}
            disabled={(!input.trim() && pendingFiles.length === 0) || sending}
            activeOpacity={0.75}
          >
            {sending ? <ActivityIndicator size="small" color="#0A0A0F" /> : <Feather name="send" size={16} color="#0A0A0F" />}
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {/* Members Modal */}
      <Modal visible={showMembers} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>{group?.name}</Text>
              <TouchableOpacity onPress={() => setShowMembers(false)}><Feather name="x" size={20} color={C.fg} /></TouchableOpacity>
            </View>
            {group?.description ? <Text style={s.modalDesc}>{group.description}</Text> : null}
            <Text style={s.sectionLabel}>Участники ({members.length})</Text>
            <FlatList
              data={members}
              keyExtractor={(m) => String(m.citizen_id)}
              style={{ maxHeight: 300 }}
              renderItem={({ item: m }) => (
                <View style={s.memberItem}>
                  <View style={s.memberAvatar}><Text style={s.memberAvatarText}>{(m.name ?? "?")[0]?.toUpperCase()}</Text></View>
                  <View>
                    <Text style={s.memberName}>{m.name ?? `ID ${m.citizen_id}`}</Text>
                    <Text style={s.memberRank}>{m.rank ?? ""}  {m.is_admin ? "· Администратор" : ""}</Text>
                  </View>
                </View>
              )}
            />
          </View>
        </View>
      </Modal>

      {/* Action sheet modal */}
      <Modal visible={!!selectedMsg} transparent animationType="fade">
        <TouchableOpacity style={s.actionOverlay} activeOpacity={1} onPress={() => setSelectedMsg(null)}>
          <View style={s.actionSheet}>
            <View style={s.actionDivider} />
            <TouchableOpacity
              style={s.actionItem}
              onPress={() => {
                if (selectedMsg) {
                  const senderName = selectedMsg.from_citizen_id === citizen.id
                    ? "Вы"
                    : (selectedMsg.sender_name ?? `ID ${selectedMsg.from_citizen_id}`);
                  setReplyTo({ id: selectedMsg.id, text: selectedMsg.content, senderName });
                  setSelectedMsg(null);
                }
              }}
              activeOpacity={0.75}
            >
              <Feather name="corner-up-left" size={18} color={C.fg} />
              <Text style={s.actionText}>Ответить</Text>
            </TouchableOpacity>
            <TouchableOpacity
              style={s.actionItem}
              onPress={() => { forwardMsgRef.current = selectedMsg; setSelectedMsg(null); openGroupForward(); }}
              activeOpacity={0.75}
            >
              <Feather name="corner-up-right" size={18} color={C.fg} />
              <Text style={s.actionText}>Переслать</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Forward Modal */}
      <Modal visible={showForwardModal} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Переслать сообщение</Text>
              <TouchableOpacity onPress={() => { setShowForwardModal(false); setForwardSearch(""); }}>
                <Feather name="x" size={20} color={C.fg} />
              </TouchableOpacity>
            </View>
            <TextInput
              style={s.modalInput}
              placeholder="Поиск граждан..."
              placeholderTextColor={C.muted}
              value={forwardSearch}
              onChangeText={setForwardSearch}
              autoFocus
            />
            <FlatList
              data={forwardSearch.trim() ? forwardCitizens.filter((c) => (c.name ?? "").toLowerCase().includes(forwardSearch.toLowerCase())) : forwardCitizens}
              keyExtractor={(c) => String(c.id)}
              style={{ maxHeight: 300 }}
              renderItem={({ item: c }) => (
                <TouchableOpacity
                  style={s.fwdItem}
                  onPress={() => forwardToUser(c.id)}
                  disabled={forwardingTo === c.id}
                  activeOpacity={0.75}
                >
                  <View style={s.fwdAvatar}><Text style={s.fwdAvatarText}>{(c.name ?? "?")[0]?.toUpperCase()}</Text></View>
                  <View style={{ flex: 1 }}>
                    <Text style={s.fwdName}>{c.name ?? `ID ${c.id}`}</Text>
                    {c.rank && <Text style={s.fwdRank}>{c.rank}</Text>}
                  </View>
                  {forwardingTo === c.id ? <ActivityIndicator color={C.primary} size="small" /> : <Feather name="send" size={16} color={C.muted} />}
                </TouchableOpacity>
              )}
            />
          </View>
        </View>
      </Modal>

      {/* Darmin Modal */}
      <Modal visible={darminModal} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Перевод всем участникам</Text>
              <TouchableOpacity onPress={() => { setDarminModal(false); setDarminAmount(""); setDarminNote(""); }}><Feather name="x" size={20} color={C.fg} /></TouchableOpacity>
            </View>
            <Text style={s.modalDesc}>Каждый участник получит указанную сумму</Text>
            <TextInput style={s.modalInput} placeholder="Сумма в Д" placeholderTextColor={C.muted} value={darminAmount} onChangeText={setDarminAmount} keyboardType="decimal-pad" autoFocus />
            <TextInput style={[s.modalInput, { marginTop: 8 }]} placeholder="Комментарий" placeholderTextColor={C.muted} value={darminNote} onChangeText={setDarminNote} maxLength={100} />
            <TouchableOpacity style={[s.transferBtn, transferring && { opacity: 0.5 }]} onPress={transferDarmins} disabled={transferring} activeOpacity={0.8}>
              {transferring ? <ActivityIndicator color="#0A0A0F" /> : <Text style={s.transferBtnText}>Перевести всем ({members.length - 1})</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  muted: { color: C.muted, fontSize: 15 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border, gap: 12 },
  headerCenter: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10 },
  groupIcon: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(201,168,76,0.12)", borderWidth: 1, borderColor: "rgba(201,168,76,0.25)", alignItems: "center", justifyContent: "center" },
  groupName: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: C.fg },
  memberCount: { fontSize: 11, fontFamily: "Inter_400Regular", color: C.muted },
  serverBadge: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "rgba(107,107,126,0.12)", borderWidth: 1, borderColor: "rgba(107,107,126,0.25)", paddingHorizontal: 6, paddingVertical: 3, borderRadius: 8 },
  serverText: { fontSize: 9, fontFamily: "Inter_600SemiBold", color: C.muted },
  msgList: { padding: 12, gap: 2, flexGrow: 1 },
  msgRow: { marginBottom: 4 },
  msgRowMine: { alignItems: "flex-end" },
  msgRowTheirs: { alignItems: "flex-start" },
  senderName: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: C.primary, marginLeft: 4, marginBottom: 2 },
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
  replyBanner: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 8, borderTopWidth: 1, borderTopColor: C.border, backgroundColor: C.bg, gap: 10 },
  replyStripe: { width: 3, alignSelf: "stretch", backgroundColor: C.primary, borderRadius: 2, flexShrink: 0 },
  replyName: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: C.primary, marginBottom: 2 },
  replyText: { fontSize: 13, fontFamily: "Inter_400Regular", color: C.muted },
  quoteBubble: { flexDirection: "row", marginBottom: 6, borderRadius: 8, overflow: "hidden", backgroundColor: "rgba(201,168,76,0.07)", paddingVertical: 4, paddingRight: 8 },
  quoteStripe: { width: 3, backgroundColor: C.primary, marginRight: 6, flexShrink: 0 },
  quoteName: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: C.primary, marginBottom: 1 },
  quoteText: { fontSize: 12, fontFamily: "Inter_400Regular", color: C.muted, lineHeight: 16 },
  actionOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.5)", justifyContent: "flex-end" },
  actionSheet: { backgroundColor: C.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, paddingHorizontal: 24, paddingTop: 16, paddingBottom: 36 },
  actionDivider: { height: 1, backgroundColor: C.border, marginBottom: 12 },
  actionItem: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  actionText: { fontSize: 16, fontFamily: "Inter_400Regular", color: C.fg },
  fwdItem: { flexDirection: "row", alignItems: "center", paddingVertical: 10, gap: 12 },
  fwdAvatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(201,168,76,0.12)", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  fwdAvatarText: { fontSize: 16, fontFamily: "Inter_700Bold", color: C.primary },
  fwdName: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: C.fg },
  fwdRank: { fontSize: 11, fontFamily: "Inter_400Regular", color: C.muted },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 4, flexShrink: 0 },
  callBtn: { width: 34, height: 34, borderRadius: 17, borderWidth: 1, borderColor: "rgba(201,168,76,0.35)", backgroundColor: "rgba(201,168,76,0.08)", alignItems: "center", justifyContent: "center" },
  inputBar: { flexDirection: "row", alignItems: "flex-end", paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: C.border, gap: 8, backgroundColor: C.bg },
  attachBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, borderColor: C.primary, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(201,168,76,0.08)", flexShrink: 0 },
  input: { flex: 1, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, color: C.fg, fontFamily: "Inter_400Regular", fontSize: 15, maxHeight: 120 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.primary, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  sendBtnDis: { opacity: 0.4 },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modalSheet: { backgroundColor: C.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 36, gap: 12 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center" },
  modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: C.fg },
  modalDesc: { fontSize: 13, fontFamily: "Inter_400Regular", color: C.muted },
  sectionLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: C.muted, textTransform: "uppercase", letterSpacing: 0.5, marginTop: 4 },
  memberItem: { flexDirection: "row", alignItems: "center", paddingVertical: 8, gap: 10 },
  memberAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(201,168,76,0.12)", alignItems: "center", justifyContent: "center" },
  memberAvatarText: { fontSize: 15, fontFamily: "Inter_700Bold", color: C.primary },
  memberName: { fontSize: 14, fontFamily: "Inter_600SemiBold", color: C.fg },
  memberRank: { fontSize: 11, fontFamily: "Inter_400Regular", color: C.muted },
  modalInput: { backgroundColor: C.bg, borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: C.fg, fontFamily: "Inter_400Regular", fontSize: 16 },
  transferBtn: { backgroundColor: C.primary, borderRadius: 14, paddingVertical: 14, alignItems: "center", marginTop: 4 },
  transferBtnText: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#0A0A0F" },
});
