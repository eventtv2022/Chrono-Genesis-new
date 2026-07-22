import React, { useCallback, useEffect, useRef, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  Image,
  KeyboardAvoidingView,
  Modal,
  Platform,
  ScrollView,
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
import { Audio } from "expo-av";
import type { WebRTCStream } from "@/lib/webrtcService";
import { WebRTCService } from "@/lib/webrtcService";
import CallScreen, { type CallState } from "./CallScreen";

import { useCitizen } from "@/context/CitizenContext";
import { getBaseUrl } from "@/lib/api";
import { getStoredAuthHeaders, getStoredToken } from "@/lib/authStorage";
import { decryptMsg, encryptMsg, getOrCreateKeyPair, getSafetyCode } from "@/lib/e2ee";
import { CitizenAvatar } from "@/components/CitizenAvatar";
import { AttachmentPreviewStrip, AttachmentBubble, type AttachmentMeta } from "@/components/ChatAttachments";

const BASE_URL = getBaseUrl();

const C = {
  bg: "#0A0A0F", surface: "#12121A", border: "#1E1E2E",
  primary: "#C9A84C", fg: "#E8E8F0", muted: "#6B6B7E",
  mine: "#1C3526", mineBorder: "#2D5A3D",
  theirs: "#1A1E30", theirsBorder: "#252A44",
  warn: "#2A1E0A", warnBorder: "#5A3D0D",
  online: "#3CB878",
};

const QUICK_EMOJIS = ["👍", "❤️", "😂", "😮", "😢", "🔥"];

interface PendingFile {
  uri: string;
  name: string;
  size: number;
  mimeType: string;
}

interface RawMessage {
  id: number;
  from_citizen_id: number;
  to_citizen_id: number;
  ciphertext: string;
  nonce: string;
  msg_type: string;
  darmin_amount: number | null;
  forwarded_from_id: number | null;
  created_at: string;
  delivered_at: string | null;
  read_at: string | null;
  reactions: { citizenId: number; emoji: string }[];
  reply_to_id: number | null;
  reply_sender_name: string | null;
  reply_content: string | null;
  attachments: AttachmentMeta[] | null;
}

interface DecryptedMessage extends RawMessage {
  plaintext: string;
}

interface PeerInfo { id: number; name: string | null; rank: string | null; hasKey: boolean; photoUrl?: string | null; }
interface CitizenItem { id: number; name: string | null; rank: string | null; }

function formatTime(iso: string | Date | null | undefined): string {
  if (!iso) return "Только что";
  // PostgreSQL returns "YYYY-MM-DD HH:mm:ss+00" (space, not T). Normalise to ISO.
  const s = typeof iso === "string" ? iso.replace(" ", "T") : iso;
  const d = new Date(s);
  if (isNaN(d.getTime())) return "Только что";
  return d.toLocaleTimeString("ru-RU", { hour: "2-digit", minute: "2-digit" });
}

// ── Tick marks ────────────────────────────────────────────────────────────────
function Ticks({ msg, myId }: { msg: DecryptedMessage; myId: number }) {
  if (msg.from_citizen_id !== myId) return null;
  if (msg.read_at) return <Text style={tS.gold}>✓✓</Text>;
  if (msg.delivered_at) return <Text style={tS.gray}>✓✓</Text>;
  return <Text style={tS.gray}>✓</Text>;
}
const tS = StyleSheet.create({
  gold: { fontSize: 11, color: "#C9A84C", marginLeft: 4 },
  gray: { fontSize: 11, color: "#6B6B7E", marginLeft: 4 },
});

export default function ConversationScreen() {
  const router = useRouter();
  const { citizenId: rawId } = useLocalSearchParams<{ citizenId: string }>();
  const peerId = parseInt(rawId ?? "0", 10);
  const { citizen, authToken } = useCitizen();

  const [peer, setPeer] = useState<PeerInfo | null>(null);
  const [messages, setMessages] = useState<DecryptedMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [darminModal, setDarminModal] = useState(false);
  const [darminAmount, setDarminAmount] = useState("");
  const [darminNote, setDarminNote] = useState("");
  const [transferring, setTransferring] = useState(false);

  // Phase 2 state
  const [showSearch, setShowSearch] = useState(false);
  const [searchQuery, setSearchQuery] = useState("");
  const [selectedMsg, setSelectedMsg] = useState<DecryptedMessage | null>(null);
  const [showForwardModal, setShowForwardModal] = useState(false);
  const [forwardCitizens, setForwardCitizens] = useState<CitizenItem[]>([]);
  const [forwardSearch, setForwardSearch] = useState("");
  const [forwardingTo, setForwardingTo] = useState<number | null>(null);
  const [isRecording, setIsRecording] = useState(false);
  const [recordingDuration, setRecordingDuration] = useState(0);

  const [safetyModal, setSafetyModal] = useState(false);
  const [replyTo, setReplyTo] = useState<{ id: number; text: string; senderName: string } | null>(null);
  const [pendingFiles, setPendingFiles] = useState<PendingFile[]>([]);

  const flatRef = useRef<FlatList>(null);
  const secretKeyRef = useRef<Uint8Array | null>(null);
  const myPubKeyB64Ref = useRef<string | null>(null);
  const peerPubKeyRef = useRef<Uint8Array | null>(null);
  const peerPubKeyB64Ref = useRef<string | null>(null);
  const wsRef = useRef<WebSocket | null>(null);
  const forwardMsgRef = useRef<DecryptedMessage | null>(null);
  const recordingRef = useRef<Audio.Recording | null>(null);
  // ── Call state ────────────────────────────────────────────────────────────
  const [callState, setCallState] = useState<CallState>("idle");
  const [callType, setCallType] = useState<"audio" | "video">("audio");
  const [callDuration, setCallDuration] = useState(0);
  const [localStream, setLocalStream] = useState<WebRTCStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<WebRTCStream | null>(null);
  const [isMuted, setIsMuted] = useState(false);
  const [isCameraOn, setIsCameraOn] = useState(true);
  const [incomingSdp, setIncomingSdp] = useState<{ type: string; sdp: string } | null>(null);
  const [incomingCallType, setIncomingCallType] = useState<"audio" | "video">("audio");
  const callStateRef = useRef<CallState>("idle");
  const webrtcRef = useRef(new WebRTCService());
  const callTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const durationTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // ── Step 1: Init MY local secret key (server registration is in CitizenContext) ──
  useEffect(() => {
    if (!citizen) return;
    getOrCreateKeyPair()
      .then((kp) => {
        secretKeyRef.current = kp.secretKey;
        myPubKeyB64Ref.current = kp.publicKeyB64;
      })
      .catch(() => {});
  }, [citizen]);

  // ── Step 2: Load peer info + key ─────────────────────────────────────────
  const fetchPeerKey = useCallback(async () => {
    if (!peerId) return;

    // Try to get the encryption key first
    try {
      const keyRes = await fetch(`${BASE_URL}/api/chat/key/${peerId}`);
      if (keyRes.ok) {
        const d = (await keyRes.json()) as { citizenId: number; name: string; publicKey: string };
        peerPubKeyRef.current = decodeBase64(d.publicKey);
        peerPubKeyB64Ref.current = d.publicKey;
        setPeer((prev) => ({ id: d.citizenId, name: d.name, rank: prev?.rank ?? null, hasKey: true, photoUrl: prev?.photoUrl ?? null }));
        setMessages((prev) => redecrypt(prev));
      }
    } catch { /* fall through */ }

    // Always fetch full citizen profile to get photoUrl and rank
    try {
      const citRes = await fetch(`${BASE_URL}/api/citizens/${peerId}`);
      if (citRes.ok) {
        const c = (await citRes.json()) as { id: number; name: string | null; rank: string | null; photoUrl?: string | null };
        if (c?.id) {
          setPeer((prev) => prev
            ? { ...prev, rank: c.rank ?? prev.rank, photoUrl: c.photoUrl ?? prev.photoUrl }
            : { id: c.id, name: c.name, rank: c.rank, hasKey: false, photoUrl: c.photoUrl });
        }
      }
    } catch { /* silent */ }

    setPeer((prev) => prev ?? { id: peerId, name: null, rank: null, hasKey: false });
  }, [peerId]);

  useEffect(() => { fetchPeerKey(); }, [fetchPeerKey]);

  // Auto-poll for peer key every 15 s while key is missing
  useEffect(() => {
    if (!peerId) return;
    const interval = setInterval(async () => {
      // Only poll if we still don't have the key
      if (peerPubKeyRef.current) { clearInterval(interval); return; }
      await fetchPeerKey();
    }, 15000);
    return () => clearInterval(interval);
  }, [peerId, fetchPeerKey]);

  // ── Step 3: Load messages ─────────────────────────────────────────────────
  const loadMessages = useCallback(async () => {
    if (!peerId) { setLoading(false); return; }
    setLoading(true);
    try {
      const hdrs = await getStoredAuthHeaders();
      const res = await fetch(`${BASE_URL}/api/chat/messages/${peerId}?limit=100`, { headers: hdrs });
      if (!res.ok) { setLoading(false); return; }
      const data = (await res.json()) as { messages: RawMessage[] };
      setMessages((data.messages ?? []).map(decryptOne));
      fetch(`${BASE_URL}/api/chat/messages/read/${peerId}`, { method: "PATCH", headers: hdrs }).catch(() => {});
    } catch {
      Alert.alert("Ошибка", "Не удалось загрузить сообщения");
    } finally {
      setLoading(false);
    }
  }, [peerId]);

  useEffect(() => { loadMessages(); }, [loadMessages]);

  useEffect(() => {
    if (messages.length > 0) setTimeout(() => flatRef.current?.scrollToEnd({ animated: false }), 80);
  }, [messages.length]);

  // ── Decrypt helpers ───────────────────────────────────────────────────────
  function decryptOne(m: RawMessage): DecryptedMessage {
    if (m.msg_type === "darmin_transfer") return { ...m, plaintext: `💸 ${m.darmin_amount ?? "?"} Д` };
    if (m.msg_type === "voice") return { ...m, plaintext: "__voice__" };
    const sk = secretKeyRef.current;
    const pub = peerPubKeyRef.current;
    if (!sk || !pub) return { ...m, plaintext: "🔒" };
    return { ...m, plaintext: decryptMsg(m.ciphertext, m.nonce, pub, sk) ?? "🔒" };
  }

  function redecrypt(prev: DecryptedMessage[]): DecryptedMessage[] {
    const sk = secretKeyRef.current;
    const pub = peerPubKeyRef.current;
    if (!sk || !pub) return prev;
    return prev.map((m) => {
      if (m.msg_type === "darmin_transfer" || m.msg_type === "voice") return m;
      if (!m.plaintext.startsWith("🔒")) return m;
      return { ...m, plaintext: decryptMsg(m.ciphertext, m.nonce, pub, sk) ?? "🔒" };
    });
  }

  // ── WebSocket ─────────────────────────────────────────────────────────────
  useEffect(() => {
    if (!citizen) return;
    const wsUrl = BASE_URL.replace(/^https?/, (m) => (m === "https" ? "wss" : "ws")) + "/api/ws";
    const ws = new WebSocket(wsUrl);
    wsRef.current = ws;
    ws.onopen = () => ws.send(JSON.stringify({ type: "auth", citizenId: citizen.id }));

    ws.onmessage = (evt: MessageEvent) => {
      try {
        const msg = JSON.parse(evt.data as string) as Record<string, unknown>;

        if (msg["type"] === "chat_message") {
          const m = msg["message"] as RawMessage;
          const isRelevant =
            (m.from_citizen_id === peerId && m.to_citizen_id === citizen.id) ||
            (m.from_citizen_id === citizen.id && m.to_citizen_id === peerId);
          if (!isRelevant) return;
          setMessages((prev) => [...prev, decryptOne(m)]);
          setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 80);
          if (m.from_citizen_id === peerId) {
            getStoredAuthHeaders().then((h) =>
              fetch(`${BASE_URL}/api/chat/messages/read/${peerId}`, { method: "PATCH", headers: h }).catch(() => {})
            );
          }
        }

        if (msg["type"] === "message_delivered") {
          const mId = msg["messageId"] as number;
          setMessages((prev) => prev.map((m) => m.id === mId ? { ...m, delivered_at: new Date().toISOString() } : m));
        }

        if (msg["type"] === "messages_read") {
          const byId = msg["byId"] as number;
          if (byId === peerId) {
            const now = new Date().toISOString();
            setMessages((prev) => prev.map((m) => m.from_citizen_id === citizen.id && !m.read_at ? { ...m, read_at: now } : m));
          }
        }

        if (msg["type"] === "reaction_added") {
          const { messageId, citizenId: cid, emoji } = msg as { messageId: number; citizenId: number; emoji: string };
          setMessages((prev) => prev.map((m) => {
            if (m.id !== messageId) return m;
            const already = m.reactions.some((r) => r.citizenId === cid && r.emoji === emoji);
            if (already) return m;
            return { ...m, reactions: [...m.reactions, { citizenId: cid, emoji }] };
          }));
        }

        if (msg["type"] === "reaction_removed") {
          const { messageId, citizenId: cid, emoji } = msg as { messageId: number; citizenId: number; emoji: string };
          setMessages((prev) => prev.map((m) => {
            if (m.id !== messageId) return m;
            return { ...m, reactions: m.reactions.filter((r) => !(r.citizenId === cid && r.emoji === emoji)) };
          }));
        }

        // ── Call signaling ─────────────────────────────────────────────────
        if (msg["type"] === "call:offer") {
          const { fromId, sdp, callType: ct } = msg as { fromId: number; sdp: { type: string; sdp: string }; callType: "audio" | "video" };
          if (fromId !== peerId) return;
          if (callStateRef.current !== "idle") {
            wsRef.current?.send(JSON.stringify({ type: "call:end", toCitizenId: fromId }));
            return;
          }
          setIncomingSdp({ type: sdp.type, sdp: sdp.sdp ?? "" });
          setIncomingCallType(ct ?? "audio");
          setCallType(ct ?? "audio");
          callStateRef.current = "incoming";
          setCallState("incoming");
        }

        if (msg["type"] === "call:answer") {
          const { sdp } = msg as { sdp: { type: string; sdp: string } };
          void webrtcRef.current.setRemoteAnswer({ type: sdp.type, sdp: sdp.sdp ?? "" }).catch(() => {});
        }

        if (msg["type"] === "call:ice-candidate") {
          const { candidate } = msg as { candidate: { candidate: string; sdpMLineIndex?: number | null; sdpMid?: string | null } };
          void webrtcRef.current.addIceCandidate(candidate).catch(() => {});
        }

        if (msg["type"] === "call:reject") {
          Alert.alert("Вызов отклонён", `${peer?.name ?? peerName} отклонил(а) вызов`);
          cleanupCallState();
        }

        if (msg["type"] === "call:end") {
          cleanupCallState();
        }

        if (msg["type"] === "call:busy") {
          Alert.alert("Занято", `${peer?.name ?? peerName} сейчас в другом вызове`);
          cleanupCallState();
        }
      } catch { /* ignore */ }
    };

    return () => {
      ws.close();
      wsRef.current = null;
      webrtcRef.current.cleanup();
      if (callTimerRef.current) clearInterval(callTimerRef.current);
    };
  }, [citizen, peerId]);

  // ── Call helpers ──────────────────────────────────────────────────────────
  function cleanupCallState() {
    if (callTimerRef.current) { clearInterval(callTimerRef.current); callTimerRef.current = null; }
    webrtcRef.current.cleanup();
    callStateRef.current = "idle";
    setCallState("idle");
    setCallDuration(0);
    setLocalStream(null);
    setRemoteStream(null);
    setIsMuted(false);
    setIsCameraOn(true);
    setIncomingSdp(null);
  }

  async function startCall(type: "audio" | "video") {
    console.log("[Call] button pressed, type=", type, "platform=", Platform.OS, "callState=", callStateRef.current);
    if (callStateRef.current !== "idle") return;
    setCallType(type);
    callStateRef.current = "calling";
    setCallState("calling");
    setCallDuration(0);
    // On web: just open the "not supported" modal (CallScreen web stub) and return
    if (Platform.OS === "web") {
      return;
    }
    if (!citizen) { cleanupCallState(); return; }
    const svc = webrtcRef.current;
    try {
      const stream = await svc.initLocalStream(type === "video");
      setLocalStream(stream);
      setIsCameraOn(type === "video");
      svc.onIceCandidate = (c) => {
        wsRef.current?.send(JSON.stringify({ type: "call:ice-candidate", toCitizenId: peerId, candidate: (c as unknown as { toJSON: () => RTCIceCandidateInit }).toJSON() }));
      };
      svc.onRemoteStream = (s) => setRemoteStream(s);
      svc.onConnectionStateChange = (state) => {
        if (state === "connected") {
          callStateRef.current = "connected";
          setCallState("connected");
          callTimerRef.current = setInterval(() => setCallDuration((d) => d + 1), 1000);
        } else if (state === "disconnected" || state === "failed" || state === "closed") {
          cleanupCallState();
        }
      };
      const offer = await svc.createOffer();
      wsRef.current?.send(JSON.stringify({ type: "call:offer", toCitizenId: peerId, sdp: offer, callType: type }));
    } catch (e) {
      Alert.alert("Ошибка", "Не удалось начать вызов: " + String(e instanceof Error ? e.message : e));
      cleanupCallState();
    }
  }

  async function acceptCall() {
    if (callStateRef.current !== "incoming" || !incomingSdp || !citizen) return;
    callStateRef.current = "connecting";
    setCallState("connecting");
    const svc = webrtcRef.current;
    try {
      const stream = await svc.initLocalStream(incomingCallType === "video");
      setLocalStream(stream);
      setCallType(incomingCallType);
      setIsCameraOn(incomingCallType === "video");
      svc.onIceCandidate = (c) => {
        wsRef.current?.send(JSON.stringify({ type: "call:ice-candidate", toCitizenId: peerId, candidate: (c as unknown as { toJSON: () => RTCIceCandidateInit }).toJSON() }));
      };
      svc.onRemoteStream = (s) => setRemoteStream(s);
      svc.onConnectionStateChange = (state) => {
        if (state === "connected") {
          callStateRef.current = "connected";
          setCallState("connected");
          callTimerRef.current = setInterval(() => setCallDuration((d) => d + 1), 1000);
        } else if (state === "disconnected" || state === "failed" || state === "closed") {
          cleanupCallState();
        }
      };
      const answer = await svc.createAnswer(incomingSdp);
      wsRef.current?.send(JSON.stringify({ type: "call:answer", toCitizenId: peerId, sdp: answer }));
    } catch (e) {
      Alert.alert("Ошибка", "Не удалось принять вызов: " + String(e instanceof Error ? e.message : e));
      cleanupCallState();
    }
  }

  function rejectCall() {
    wsRef.current?.send(JSON.stringify({ type: "call:reject", toCitizenId: peerId }));
    cleanupCallState();
  }

  function endCall() {
    // Only send WS message on native (no real call was started on web)
    if (Platform.OS !== "web") {
      wsRef.current?.send(JSON.stringify({ type: "call:end", toCitizenId: peerId }));
    }
    cleanupCallState();
  }

  // ── Send text message ─────────────────────────────────────────────────────
  async function sendMessage() {
    if ((!input.trim() && pendingFiles.length === 0) || !citizen) return;
    const text = input.trim();

    // ── Optimistic UI: показываем сообщение мгновенно ─────────────────────
    const tempId = -Date.now();
    const tempMsg: DecryptedMessage = {
      id: tempId,
      from_citizen_id: citizen.id,
      to_citizen_id: peerId,
      ciphertext: "",
      nonce: "",
      msg_type: "text",
      darmin_amount: null,
      forwarded_from_id: null,
      reply_to_id: replyTo?.id ?? null,
      reply_sender_name: replyTo?.senderName ?? null,
      reply_content: replyTo?.text.slice(0, 400) ?? null,
      attachments: null,
      created_at: new Date().toISOString(),
      delivered_at: null,
      read_at: null,
      reactions: [],
      plaintext: text,
    };
    setMessages((prev) => [...prev, tempMsg]);
    setInput("");
    setReplyTo(null);
    const capturedFiles = pendingFiles;
    setPendingFiles([]);
    setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 80);

    setSending(true);
    try {
      const hdrs = await getStoredAuthHeaders();
      if (!hdrs.Authorization) {
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        setInput(text);
        Alert.alert("Сессия истекла", "Выйдите и войдите снова");
        return;
      }
      const rawToken = hdrs.Authorization.replace(/^Bearer\s+/i, "").trim();

      // ── Загружаем файлы-вложения ──────────────────────────────────────────
      let uploadedAttachments: AttachmentMeta[] | undefined;
      if (capturedFiles.length > 0) {
        try {
          uploadedAttachments = await uploadPendingFiles(rawToken);
        } catch (uploadErr) {
          setMessages((prev) => prev.filter((m) => m.id !== tempId));
          setPendingFiles(capturedFiles);
          Alert.alert("Ошибка загрузки", String(uploadErr instanceof Error ? uploadErr.message : uploadErr));
          return;
        }
      }

      // ── Получаем ключ peer (fetch on-demand если ещё не загружен) ────────
      if (!peerPubKeyRef.current) {
        await fetchPeerKey();
      }
      const peerPub = peerPubKeyRef.current;
      const sk = secretKeyRef.current;

      if (!peerPub || !sk) {
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        setInput(text);
        Alert.alert("Ошибка ключа", "Не удалось загрузить ключ шифрования. Попробуйте ещё раз.");
        return;
      }

      // ── Шифруем ──────────────────────────────────────────────────────────
      let ciphertext: string, nonce: string;
      try {
        const enc = encryptMsg(text || "[вложение]", peerPub, sk);
        ciphertext = enc.ciphertext;
        nonce = enc.nonce;
      } catch (encErr) {
        console.error("SEND_MESSAGE_ENCRYPT_ERROR:", encErr);
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        setInput(text);
        Alert.alert("Ошибка шифрования", String(encErr instanceof Error ? encErr.message : encErr));
        return;
      }

      // ── Отправляем на сервер ─────────────────────────────────────────────
      const res = await fetch(`${BASE_URL}/api/chat/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...hdrs },
        body: JSON.stringify({
          toCitizenId: peerId, ciphertext, nonce,
          ...(replyTo ? { replyToId: replyTo.id, replySenderName: replyTo.senderName, replyContent: replyTo.text.slice(0, 400) } : {}),
          ...(uploadedAttachments && uploadedAttachments.length > 0 ? { attachments: uploadedAttachments } : {}),
        }),
      });
      if (!res.ok) {
        const errBody = (await res.json().catch(() => ({}))) as { error?: string };
        console.error("SEND_MESSAGE_SERVER_ERROR:", res.status, errBody);
        setMessages((prev) => prev.filter((m) => m.id !== tempId));
        setInput(text);
        Alert.alert("Ошибка", errBody.error ?? `Ошибка сервера ${res.status}`);
        return;
      }
      const { message: sent } = (await res.json()) as { message: RawMessage };
      // Заменяем временное сообщение реальным
      setMessages((prev) => prev.map((m) => m.id === tempId ? { ...sent, plaintext: text } : m));
    } catch (err) {
      console.error("SEND_MESSAGE_ERROR:", err);
      setMessages((prev) => prev.filter((m) => m.id !== tempId));
      setInput(text);
      Alert.alert("Ошибка", "Сетевая ошибка при отправке");
    } finally {
      setSending(false);
    }
  }

  // ── Reactions ─────────────────────────────────────────────────────────────
  async function toggleReaction(messageId: number, emoji: string) {
    if (!citizen) return;
    const msg = messages.find((m) => m.id === messageId);
    if (!msg) return;
    const myId = citizen.id;
    const hasIt = msg.reactions.some((r) => r.citizenId === myId && r.emoji === emoji);
    const hdrs = await getStoredAuthHeaders();
    if (hasIt) {
      await fetch(`${BASE_URL}/api/chat/reactions/${messageId}/${encodeURIComponent(emoji)}`, { method: "DELETE", headers: hdrs });
    } else {
      await fetch(`${BASE_URL}/api/chat/reactions`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...hdrs },
        body: JSON.stringify({ messageId, emoji }),
      });
    }
    setSelectedMsg(null);
  }

  // ── File attachment picker ────────────────────────────────────────────────
  async function pickAttachment() {
    if (pendingFiles.length >= 5) { Alert.alert("Лимит", "Максимум 5 файлов за раз"); return; }
    try {
      // Dynamic import to avoid require at module level
      const DocumentPicker = await import("expo-document-picker");
      const result = await DocumentPicker.getDocumentAsync({
        type: "*/*",
        copyToCacheDirectory: true,
        multiple: false,
      });
      if (result.canceled || !result.assets?.[0]) return;
      const asset = result.assets[0];
      const sizeBytes = asset.size ?? 0;
      if (sizeBytes > 10 * 1024 * 1024) {
        Alert.alert("Файл слишком большой", "Максимальный размер — 10 МБ");
        return;
      }
      setPendingFiles((prev) => [
        ...prev,
        {
          uri: asset.uri,
          name: asset.name ?? "file",
          size: sizeBytes,
          mimeType: asset.mimeType ?? "application/octet-stream",
        },
      ]);
    } catch { /* user cancelled or permission denied */ }
  }

  // ── Upload pending files to server, return AttachmentMeta[] ──────────────
  async function uploadPendingFiles(token: string): Promise<AttachmentMeta[]> {
    const results: AttachmentMeta[] = [];
    for (const pf of pendingFiles) {
      const form = new FormData();
      form.append("file", {
        uri: pf.uri,
        name: pf.name,
        type: pf.mimeType,
      } as unknown as Blob);
      const res = await fetch(`${BASE_URL}/api/chat/upload`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      if (!res.ok) {
        const err = await res.json().catch(() => ({})) as { error?: string };
        throw new Error(err.error ?? `Ошибка загрузки файла (${res.status})`);
      }
      const meta = await res.json() as AttachmentMeta;
      results.push(meta);
    }
    return results;
  }

  // ── Forward message ───────────────────────────────────────────────────────
  async function openForward() {
    try {
      const res = await fetch(`${BASE_URL}/api/citizens`);
      const all = (await res.json()) as CitizenItem[];
      setForwardCitizens(all.filter((c) => c.id !== citizen?.id).slice(0, 100));
    } catch { setForwardCitizens([]); }
    setShowForwardModal(true);
  }

  async function forwardTo(targetId: number) {
    const msg = forwardMsgRef.current;
    if (!msg || !citizen) return;
    const sk = secretKeyRef.current;
    if (!sk) return;

    setForwardingTo(targetId);
    try {
      const keyRes = await fetch(`${BASE_URL}/api/chat/key/${targetId}`);
      if (!keyRes.ok) { Alert.alert("Ошибка", "Получатель не подключил E2EE"); return; }
      const keyData = (await keyRes.json()) as { publicKey: string };
      const targetPub = decodeBase64(keyData.publicKey);

      const hdrs = await getStoredAuthHeaders();
      const { ciphertext, nonce } = encryptMsg(msg.plaintext, targetPub, sk);
      await fetch(`${BASE_URL}/api/chat/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...hdrs },
        body: JSON.stringify({ toCitizenId: targetId, ciphertext, nonce, forwardedFromId: msg.id }),
      });
      setShowForwardModal(false);
      setForwardSearch("");
      Alert.alert("✓", "Сообщение переслано");
    } catch { Alert.alert("Ошибка", "Не удалось переслать"); }
    finally { setForwardingTo(null); }
  }

  // ── Voice message ─────────────────────────────────────────────────────────
  async function startRecording() {
    if (Platform.OS === "web") { Alert.alert("Недоступно", "Запись голоса доступна только в мобильном приложении"); return; }
    const peerPub = peerPubKeyRef.current;
    const sk = secretKeyRef.current;
    if (!peerPub || !sk) return;
    try {
      const { status } = await Audio.requestPermissionsAsync();
      if (status !== "granted") { Alert.alert("Нет доступа", "Разрешите доступ к микрофону"); return; }
      await Audio.setAudioModeAsync({ allowsRecordingIOS: true, playsInSilentModeIOS: true });
      const rec = new Audio.Recording();
      await rec.prepareToRecordAsync(Audio.RecordingOptionsPresets.HIGH_QUALITY);
      await rec.startAsync();
      recordingRef.current = rec;
      setIsRecording(true);
      setRecordingDuration(0);
      durationTimerRef.current = setInterval(() => setRecordingDuration((d) => d + 1), 1000);
    } catch { Alert.alert("Ошибка", "Не удалось начать запись"); }
  }

  async function stopAndSendRecording() {
    if (durationTimerRef.current) { clearInterval(durationTimerRef.current); durationTimerRef.current = null; }
    setIsRecording(false);
    const rec = recordingRef.current;
    if (!rec) return;
    recordingRef.current = null;
    const sk = secretKeyRef.current;
    const peerPub = peerPubKeyRef.current;
    if (!sk || !peerPub || !citizen) return;

    setSending(true);
    try {
      await rec.stopAndUnloadAsync();
      const uri = rec.getURI();
      if (!uri) { setSending(false); return; }

      let base64Audio = "";
      if (Platform.OS !== "web") {
        const FS = await import("expo-file-system");
        const readFn = (FS as unknown as { readAsStringAsync: typeof import("expo-file-system").readAsStringAsync }).readAsStringAsync;
        base64Audio = await readFn(uri, { encoding: "base64" as "base64" });
      }

      const hdrs = await getStoredAuthHeaders();
      const { ciphertext, nonce } = encryptMsg(base64Audio || "voice", peerPub, sk);
      const res = await fetch(`${BASE_URL}/api/chat/messages`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...hdrs },
        body: JSON.stringify({ toCitizenId: peerId, ciphertext, nonce, msgType: "voice" }),
      });
      if (!res.ok) { Alert.alert("Ошибка", "Не удалось отправить голосовое"); return; }
      const { message: sent } = (await res.json()) as { message: RawMessage };
      setMessages((prev) => [...prev, { ...sent, plaintext: "__voice__" }]);
      setTimeout(() => flatRef.current?.scrollToEnd({ animated: true }), 80);
    } catch { Alert.alert("Ошибка", "Сетевая ошибка"); }
    finally { setSending(false); }
  }

  async function playVoice(m: DecryptedMessage) {
    const sk = secretKeyRef.current;
    const pub = peerPubKeyRef.current;
    if (!sk || !pub) { Alert.alert("Нет ключа", "Невозможно воспроизвести"); return; }
    const decrypted = decryptMsg(m.ciphertext, m.nonce, pub, sk);
    if (!decrypted) { Alert.alert("Ошибка", "Не удалось расшифровать"); return; }
    if (Platform.OS === "web") { Alert.alert("Недоступно", "Воспроизведение голоса доступно только в мобильном приложении"); return; }
    try {
      const FS = await import("expo-file-system");
      const writeFn = (FS as unknown as { writeAsStringAsync: typeof import("expo-file-system").writeAsStringAsync }).writeAsStringAsync;
      const cacheDir = (FS as unknown as { cacheDirectory?: string }).cacheDirectory ?? "";
      const path = `${cacheDir}voice_${m.id}.aac`;
      await writeFn(path, decrypted, { encoding: "base64" as "base64" });
      const { sound } = await Audio.Sound.createAsync({ uri: path });
      await sound.playAsync();
    } catch { Alert.alert("Ошибка", "Не удалось воспроизвести"); }
  }

  // ── Transfer Darmins ──────────────────────────────────────────────────────
  async function transferDarmins() {
    const amount = parseFloat(darminAmount);
    if (!citizen || isNaN(amount) || amount <= 0) { Alert.alert("Ошибка", "Введите корректную сумму"); return; }
    setTransferring(true);
    try {
      const hdrs = await getStoredAuthHeaders();
      if (!hdrs.Authorization) { Alert.alert("Сессия истекла", "Выйдите и войдите снова"); return; }
      const txRes = await fetch(`${BASE_URL}/api/chat/transfer`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...hdrs },
        body: JSON.stringify({ toCitizenId: peerId, amount, note: darminNote || "Перевод из чата" }),
      });
      if (!txRes.ok) { const err = (await txRes.json()) as { error?: string }; Alert.alert("Ошибка", err.error ?? "Транзакция не выполнена"); return; }
      const peerPub = peerPubKeyRef.current;
      const sk = secretKeyRef.current;
      if (peerPub && sk) {
        const noteText = darminNote || `Перевод ${amount} Д`;
        const { ciphertext, nonce } = encryptMsg(noteText, peerPub, sk);
        await fetch(`${BASE_URL}/api/chat/messages`, {
          method: "POST",
          headers: { "Content-Type": "application/json", ...hdrs },
          body: JSON.stringify({ toCitizenId: peerId, ciphertext, nonce, msgType: "darmin_transfer", darminAmount: amount }),
        });
      }
      setDarminModal(false); setDarminAmount(""); setDarminNote("");
      Alert.alert("✓ Готово", `${amount} Д переведены`);
    } catch { Alert.alert("Ошибка", "Сетевая ошибка"); }
    finally { setTransferring(false); }
  }

  // ── Derived ───────────────────────────────────────────────────────────────
  if (!citizen) {
    return <SafeAreaView style={s.safe}><View style={s.center}><Text style={s.muted}>Требуется авторизация</Text></View></SafeAreaView>;
  }

  const peerName = peer?.name ?? `ID ${peerId}`;
  const canSend = !!secretKeyRef.current; // always enabled — server provides a key for any citizen
  const peerNoKey = false; // server Prekey System guarantees a key exists for all citizens

  const displayedMessages = showSearch && searchQuery.trim()
    ? messages.filter((m) => m.plaintext.toLowerCase().includes(searchQuery.toLowerCase()) || m.msg_type === "voice" || m.msg_type === "darmin_transfer")
    : messages;

  const filteredForward = forwardSearch.trim()
    ? forwardCitizens.filter((c) => (c.name ?? "").toLowerCase().includes(forwardSearch.toLowerCase()))
    : forwardCitizens;

  // Aggregate reactions for display
  const myId = citizen.id;
  function aggregateReactions(reactions: { citizenId: number; emoji: string }[]): { emoji: string; count: number; mine: boolean }[] {
    const map: Record<string, { count: number; mine: boolean }> = {};
    for (const r of reactions) {
      if (!map[r.emoji]) map[r.emoji] = { count: 0, mine: false };
      map[r.emoji].count++;
      if (r.citizenId === myId) map[r.emoji].mine = true;
    }
    return Object.entries(map).map(([emoji, v]) => ({ emoji, ...v }));
  }

  return (
    <SafeAreaView style={s.safe}>
      {/* Header */}
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7} style={{ flexShrink: 0 }}>
          <Feather name="arrow-left" size={22} color={C.primary} />
        </TouchableOpacity>

        {/* Peer info — flex: 1 + minWidth: 0 to allow truncation */}
        <View style={s.peerInfo}>
          <CitizenAvatar
            citizenId={peerId}
            name={peerName}
            hasPhoto={!!peer?.photoUrl}
            size={36}
          />
          <View style={s.peerNameBlock}>
            <Text style={s.peerName} numberOfLines={1} ellipsizeMode="tail">{peerName}</Text>
            {peer?.rank && <Text style={s.peerRank} numberOfLines={1}>{peer.rank}</Text>}
          </View>
        </View>

        {/* Action buttons — fixed, never shrink */}
        <View style={s.headerActions}>
          <TouchableOpacity
            onPress={() => { setShowSearch((v) => !v); setSearchQuery(""); }}
            activeOpacity={0.7}
            hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
          >
            <Feather name={showSearch ? "x" : "search"} size={18} color={showSearch ? C.primary : C.muted} />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => { void startCall("audio"); }}
            activeOpacity={0.6}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Feather name="phone" size={19} color={callState !== "idle" ? C.primary : C.fg} />
          </TouchableOpacity>

          <TouchableOpacity
            onPress={() => { void startCall("video"); }}
            activeOpacity={0.6}
            hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}
          >
            <Feather name="video" size={19} color={callState !== "idle" ? C.primary : C.fg} />
          </TouchableOpacity>

          {!peerNoKey && myPubKeyB64Ref.current && peerPubKeyB64Ref.current && (
            <TouchableOpacity
              onPress={() => setSafetyModal(true)}
              activeOpacity={0.7}
              hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
            >
              <Feather name="shield" size={15} color={C.primary} />
            </TouchableOpacity>
          )}

          <View style={[s.e2eeBadge, peerNoKey && s.e2eeBadgeWarn]}>
            <Feather name={peerNoKey ? "unlock" : "lock"} size={9} color={peerNoKey ? "#C97C4C" : C.primary} />
            <Text style={[s.e2eeText, peerNoKey && { color: "#C97C4C" }]}>{peerNoKey ? "Нет ключа" : "E2EE"}</Text>
          </View>
        </View>
      </View>

      {/* Search bar */}
      {showSearch && (
        <View style={s.searchBar}>
          <Feather name="search" size={14} color={C.muted} />
          <TextInput
            style={s.searchInput}
            placeholder="Поиск в переписке..."
            placeholderTextColor={C.muted}
            value={searchQuery}
            onChangeText={setSearchQuery}
            autoFocus
          />
          {searchQuery ? <Text style={s.searchCount}>{displayedMessages.length} сообщ.</Text> : null}
        </View>
      )}

      {/* No-key banner */}
      {peerNoKey && (
        <View style={s.noKeyBanner}>
          <Feather name="alert-circle" size={14} color="#C97C4C" />
          <Text style={s.noKeyText}>{peerName} ещё не открывал чат — E2EE ключ не зарегистрирован.</Text>
          <TouchableOpacity onPress={fetchPeerKey} activeOpacity={0.7} style={s.retryKeyBtn}>
            <Feather name="refresh-cw" size={12} color="#C97C4C" />
            <Text style={s.retryKeyText}>Обновить</Text>
          </TouchableOpacity>
        </View>
      )}

      {/* Messages */}
      {loading ? (
        <View style={s.center}><ActivityIndicator color={C.primary} /></View>
      ) : displayedMessages.length === 0 ? (
        <View style={s.center}>
          <Feather name="message-circle" size={36} color={C.muted} />
          <Text style={s.muted}>{showSearch ? "Ничего не найдено" : "Нет сообщений"}</Text>
        </View>
      ) : (
        <FlatList
          ref={flatRef}
          data={displayedMessages}
          keyExtractor={(m) => String(m.id)}
          contentContainerStyle={s.msgList}
          renderItem={({ item: m }) => {
            const isMine = Number(m.from_citizen_id) === Number(citizen.id);
            const isDarmin = m.msg_type === "darmin_transfer";
            const isVoice = m.msg_type === "voice";
            const isForwarded = !!m.forwarded_from_id;
            const aggReactions = aggregateReactions(m.reactions ?? []);

            return (
              <TouchableOpacity
                activeOpacity={0.85}
                onLongPress={() => setSelectedMsg(m)}
                style={[s.msgRow, isMine ? s.msgRowMine : s.msgRowTheirs]}
              >
                <View style={{ alignSelf: isMine ? "flex-end" : "flex-start", maxWidth: "82%" }}>
                  {isForwarded && (
                    <View style={[s.forwardedLabel, isMine ? { alignSelf: "flex-end" } : { alignSelf: "flex-start" }]}>
                      <Feather name="corner-up-right" size={10} color={C.muted} />
                      <Text style={s.forwardedText}>Переслано</Text>
                    </View>
                  )}
                  {isDarmin ? (
                    <View style={s.darminBubble}>
                      <Feather name="send" size={14} color={C.primary} />
                      <Text style={s.darminAmt}>{m.darmin_amount ?? "?"} Д</Text>
                      <Text style={s.darminLbl}>{isMine ? "Отправлено" : "Получено"}</Text>
                    </View>
                  ) : isVoice ? (
                    <TouchableOpacity
                      style={[s.voiceBubble, isMine ? s.voiceBubbleMine : s.voiceBubbleTheirs]}
                      onPress={() => playVoice(m)}
                      activeOpacity={0.7}
                    >
                      <Feather name="mic" size={16} color={isMine ? "#A8D8B0" : C.primary} />
                      <Text style={[s.voiceText, isMine ? { color: "#A8D8B0" } : { color: C.fg }]}>Голосовое</Text>
                      <Feather name="play" size={13} color={isMine ? "#A8D8B0" : C.muted} />
                      <View style={s.tickWrap}><Ticks msg={m} myId={citizen.id} /></View>
                    </TouchableOpacity>
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
                      {/* Attachments */}
                      {m.attachments && m.attachments.length > 0 && (
                        <View style={{ gap: 4, marginBottom: m.plaintext && m.plaintext !== "[вложение]" ? 6 : 0 }}>
                          {m.attachments.map((att: AttachmentMeta, idx: number) => (
                            <AttachmentBubble key={idx} att={att} isMine={isMine} />
                          ))}
                        </View>
                      )}
                      {m.plaintext && m.plaintext !== "[вложение]" && (
                        <Text style={[s.bubbleText, isMine ? s.bubbleTextMine : s.bubbleTextTheirs]}>{m.plaintext}</Text>
                      )}
                      <View style={s.msgMeta}>
                        <Text style={s.msgTime}>{formatTime(m.created_at)}</Text>
                        <Ticks msg={m} myId={citizen.id} />
                      </View>
                    </View>
                  )}
                  {/* Reactions */}
                  {aggReactions.length > 0 && (
                    <ScrollView horizontal style={[s.reactRow, isMine ? { alignSelf: "flex-end" } : { alignSelf: "flex-start" }]} showsHorizontalScrollIndicator={false}>
                      {aggReactions.map(({ emoji, count, mine }) => (
                        <TouchableOpacity
                          key={emoji}
                          style={[s.reactPill, mine && s.reactPillMine]}
                          onPress={() => toggleReaction(m.id, emoji)}
                          activeOpacity={0.75}
                        >
                          <Text style={s.reactEmoji}>{emoji}</Text>
                          {count > 1 && <Text style={s.reactCount}>{count}</Text>}
                        </TouchableOpacity>
                      ))}
                    </ScrollView>
                  )}
                </View>
              </TouchableOpacity>
            );
          }}
        />
      )}

      {/* Input bar */}
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
        {isRecording && (
          <View style={s.recordingBar}>
            <View style={s.recordingDot} />
            <Text style={s.recordingText}>Запись... {recordingDuration}с</Text>
            <TouchableOpacity style={s.stopRecordBtn} onPress={stopAndSendRecording} activeOpacity={0.75}>
              <Feather name="send" size={16} color="#0A0A0F" />
            </TouchableOpacity>
          </View>
        )}
        {!isRecording && (
          <>
            <AttachmentPreviewStrip files={pendingFiles} onRemove={(i) => setPendingFiles((p) => p.filter((_, idx) => idx !== i))} />
            <View style={s.inputBar}>
              <TouchableOpacity style={[s.darminBtn, peerNoKey && { opacity: 0.4 }]} onPress={() => !peerNoKey && setDarminModal(true)} disabled={peerNoKey} activeOpacity={0.75}>
                <Text style={s.darminBtnText}>Д</Text>
              </TouchableOpacity>
              <TouchableOpacity style={s.attachBtn} onPress={pickAttachment} activeOpacity={0.75} disabled={!canSend}>
                <Feather name="paperclip" size={18} color={canSend ? C.muted : C.border} />
              </TouchableOpacity>
              <TextInput
                style={[s.input, !canSend && { opacity: 0.5 }]}
                placeholder={peerNoKey ? "Собеседник не подключил чат" : "Сообщение..."}
                placeholderTextColor={C.muted}
                value={input}
                onChangeText={setInput}
                multiline
                maxLength={2000}
                editable={canSend}
                returnKeyType="send"
                onSubmitEditing={sendMessage}
              />
              {canSend && !input.trim() && pendingFiles.length === 0 && Platform.OS !== "web" && (
                <TouchableOpacity style={s.micBtn} onLongPress={startRecording} onPressOut={isRecording ? stopAndSendRecording : undefined} activeOpacity={0.75}>
                  <Feather name="mic" size={18} color={C.muted} />
                </TouchableOpacity>
              )}
              {(input.trim() || pendingFiles.length > 0 || !canSend) && (
                <TouchableOpacity
                  style={[s.sendBtn, (!canSend || (!input.trim() && pendingFiles.length === 0) || sending) && s.sendBtnDis]}
                  onPress={sendMessage}
                  disabled={!canSend || (!input.trim() && pendingFiles.length === 0) || sending}
                  activeOpacity={0.75}
                >
                  {sending ? <ActivityIndicator size="small" color="#0A0A0F" /> : <Feather name="send" size={16} color="#0A0A0F" />}
                </TouchableOpacity>
              )}
            </View>
          </>
        )}
      </KeyboardAvoidingView>

      {/* Long-press action sheet */}
      <Modal visible={!!selectedMsg} transparent animationType="fade">
        <TouchableOpacity style={s.actionOverlay} activeOpacity={1} onPress={() => setSelectedMsg(null)}>
          <View style={s.actionSheet}>
            {/* Quick reactions */}
            <View style={s.emojiRow}>
              {QUICK_EMOJIS.map((emoji) => (
                <TouchableOpacity
                  key={emoji}
                  style={s.emojiBtn}
                  onPress={() => { if (selectedMsg) toggleReaction(selectedMsg.id, emoji); }}
                  activeOpacity={0.7}
                >
                  <Text style={s.emojiText}>{emoji}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <View style={s.actionDivider} />
            {/* Forward */}
            <TouchableOpacity
              style={s.actionItem}
              onPress={() => { forwardMsgRef.current = selectedMsg; setSelectedMsg(null); openForward(); }}
              activeOpacity={0.75}
            >
              <Feather name="corner-up-right" size={18} color={C.fg} />
              <Text style={s.actionText}>Переслать</Text>
            </TouchableOpacity>
            {/* Reply */}
            <TouchableOpacity
              style={s.actionItem}
              onPress={() => {
                if (selectedMsg) {
                  const senderName = selectedMsg.from_citizen_id === citizen.id
                    ? "Вы"
                    : (peer?.name ?? `ID ${selectedMsg.from_citizen_id}`);
                  setReplyTo({ id: selectedMsg.id, text: selectedMsg.plaintext, senderName });
                  setSelectedMsg(null);
                }
              }}
              activeOpacity={0.75}
            >
              <Feather name="corner-up-left" size={18} color={C.fg} />
              <Text style={s.actionText}>Ответить</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>

      {/* Forward modal */}
      <Modal visible={showForwardModal} transparent animationType="slide">
        <View style={s.modalOverlay}>
          <View style={s.modalSheet}>
            <View style={s.modalHeader}>
              <Text style={s.modalTitle}>Переслать сообщение</Text>
              <TouchableOpacity onPress={() => { setShowForwardModal(false); setForwardSearch(""); setSelectedMsg(null); }}>
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
              data={filteredForward}
              keyExtractor={(c) => String(c.id)}
              style={{ maxHeight: 300 }}
              renderItem={({ item: c }) => (
                <TouchableOpacity
                  style={s.fwdItem}
                  onPress={() => forwardTo(c.id)}
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

      {/* Darmin modal */}
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
            <TextInput style={s.modalInput} placeholder="Сумма в Д" placeholderTextColor={C.muted} value={darminAmount} onChangeText={setDarminAmount} keyboardType="decimal-pad" autoFocus />
            <TextInput style={[s.modalInput, { marginTop: 8 }]} placeholder="Комментарий (необязательно)" placeholderTextColor={C.muted} value={darminNote} onChangeText={setDarminNote} maxLength={100} />
            <TouchableOpacity style={[s.transferBtn, transferring && { opacity: 0.5 }]} onPress={transferDarmins} disabled={transferring} activeOpacity={0.8}>
              {transferring ? <ActivityIndicator color="#0A0A0F" /> : <Text style={s.transferBtnText}>Перевести</Text>}
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* Safety Code Modal */}
      <Modal visible={safetyModal} transparent animationType="fade">
        <View style={s.modalOverlay}>
          <View style={[s.modalSheet, { alignItems: "center" }]}>
            <View style={s.modalHeader}>
              <View style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
                <Feather name="shield" size={18} color={C.primary} />
                <Text style={s.modalTitle}>Код безопасности E2EE</Text>
              </View>
              <TouchableOpacity onPress={() => setSafetyModal(false)}>
                <Feather name="x" size={20} color={C.fg} />
              </TouchableOpacity>
            </View>
            <Text style={[s.modalSubtitle, { textAlign: "center", marginBottom: 4 }]}>
              Ваш код для переписки с {peerName}:
            </Text>
            <View style={s.safetyCodeBox}>
              {(myPubKeyB64Ref.current && peerPubKeyB64Ref.current
                ? getSafetyCode(myPubKeyB64Ref.current, peerPubKeyB64Ref.current)
                : "------"
              ).split("").map((digit, i) => (
                <View key={i} style={s.safetyDigit}>
                  <Text style={s.safetyDigitText}>{digit}</Text>
                </View>
              ))}
            </View>
            <Text style={[s.modalSubtitle, { textAlign: "center", lineHeight: 19, marginTop: 8 }]}>
              Сверьте этот код с собеседником вне данного чата (лично, звонок или другой канал).{"\n"}
              Совпадение кода подтверждает отсутствие атаки «Человек посередине».
            </Text>
            <TouchableOpacity onPress={() => setSafetyModal(false)} style={s.safetyCloseBtn} activeOpacity={0.8}>
              <Text style={s.safetyCloseBtnText}>Понятно</Text>
            </TouchableOpacity>
          </View>
        </View>
      </Modal>

      {/* ── Call screen ──────────────────────────────────────────────────── */}
      <CallScreen
        visible={callState !== "idle"}
        peerName={peerName}
        callType={callType}
        callState={callState}
        duration={callDuration}
        localStream={localStream}
        remoteStream={remoteStream}
        isMuted={isMuted}
        isCameraOn={isCameraOn}
        onAccept={() => void acceptCall()}
        onReject={rejectCall}
        onMute={() => { const enabled = webrtcRef.current.toggleMute(); setIsMuted(!enabled); }}
        onCamera={() => { const enabled = webrtcRef.current.toggleVideo(); setIsCameraOn(enabled); }}
        onEnd={endCall}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#0A0A0F" },
  center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 10 },
  muted: { color: C.muted, fontSize: 15 },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border, gap: 12 },
  peerInfo: { flex: 1, flexDirection: "row", alignItems: "center", gap: 10, minWidth: 0 },
  peerAvatar: { width: 36, height: 36, borderRadius: 18, backgroundColor: "rgba(201,168,76,0.15)", borderWidth: 1, borderColor: "rgba(201,168,76,0.3)", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  peerAvatarText: { fontSize: 16, fontFamily: "Inter_700Bold", color: C.primary },
  peerNameBlock: { flex: 1, minWidth: 0 },
  peerName: { fontSize: 16, fontFamily: "Inter_600SemiBold", color: C.fg },
  peerRank: { fontSize: 10, fontFamily: "Inter_400Regular", color: C.primary },
  headerActions: { flexDirection: "row", alignItems: "center", gap: 10, flexShrink: 0 },
  e2eeBadge: { flexDirection: "row", alignItems: "center", gap: 3, backgroundColor: "rgba(201,168,76,0.1)", borderWidth: 1, borderColor: "rgba(201,168,76,0.25)", paddingHorizontal: 6, paddingVertical: 3, borderRadius: 8 },
  e2eeBadgeWarn: { backgroundColor: "rgba(201,124,76,0.1)", borderColor: "rgba(201,124,76,0.3)" },
  e2eeText: { fontSize: 9, fontFamily: "Inter_600SemiBold", color: C.primary },
  searchBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 8, borderBottomWidth: 1, borderBottomColor: C.border, gap: 8, backgroundColor: C.surface },
  searchInput: { flex: 1, color: C.fg, fontFamily: "Inter_400Regular", fontSize: 14 },
  searchCount: { fontSize: 12, fontFamily: "Inter_400Regular", color: C.muted },
  noKeyBanner: { flexDirection: "row", alignItems: "center", gap: 8, backgroundColor: C.warn, borderBottomWidth: 1, borderBottomColor: C.warnBorder, paddingHorizontal: 16, paddingVertical: 10 },
  noKeyText: { flex: 1, fontSize: 12, fontFamily: "Inter_400Regular", color: "#C97C4C", lineHeight: 17 },
  retryKeyBtn: { flexDirection: "row", alignItems: "center", gap: 4, paddingHorizontal: 8, paddingVertical: 4, borderRadius: 6, borderWidth: 1, borderColor: "rgba(201,124,76,0.4)" },
  retryKeyText: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: "#C97C4C" },
  msgList: { padding: 12, gap: 4, flexGrow: 1 },
  msgRow: { marginBottom: 6 },
  msgRowMine: { alignItems: "flex-end" },
  msgRowTheirs: { alignItems: "flex-start" },
  forwardedLabel: { flexDirection: "row", alignItems: "center", gap: 3, marginBottom: 2 },
  forwardedText: { fontSize: 10, fontFamily: "Inter_400Regular", color: C.muted, fontStyle: "italic" },
  bubble: { maxWidth: "78%", borderRadius: 16, paddingHorizontal: 12, paddingVertical: 8, borderWidth: 1 },
  bubbleMine: { backgroundColor: C.mine, borderColor: C.mineBorder, borderBottomRightRadius: 4 },
  bubbleTheirs: { backgroundColor: C.theirs, borderColor: C.theirsBorder, borderBottomLeftRadius: 4 },
  bubbleText: { fontSize: 15, fontFamily: "Inter_400Regular", lineHeight: 21 },
  bubbleTextMine: { color: "#A8D8B0" },
  bubbleTextTheirs: { color: C.fg },
  msgMeta: { flexDirection: "row", alignItems: "center", justifyContent: "flex-end", marginTop: 4 },
  msgTime: { fontSize: 10, fontFamily: "Inter_400Regular", color: C.muted },
  tickWrap: { flexDirection: "row", alignItems: "center" },
  darminBubble: { flexDirection: "row", alignItems: "center", gap: 6, backgroundColor: "rgba(201,168,76,0.12)", borderWidth: 1, borderColor: "rgba(201,168,76,0.35)", borderRadius: 14, paddingHorizontal: 14, paddingVertical: 10 },
  darminAmt: { fontSize: 18, fontFamily: "Inter_700Bold", color: C.primary },
  darminLbl: { fontSize: 11, fontFamily: "Inter_400Regular", color: C.muted },
  replyBanner: { flexDirection: "row", alignItems: "center", paddingHorizontal: 14, paddingVertical: 8, borderTopWidth: 1, borderTopColor: C.border, backgroundColor: C.bg, gap: 10 },
  replyStripe: { width: 3, alignSelf: "stretch", backgroundColor: C.primary, borderRadius: 2, flexShrink: 0 },
  replyName: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: C.primary, marginBottom: 2 },
  replyText: { fontSize: 13, fontFamily: "Inter_400Regular", color: C.muted },
  quoteBubble: { flexDirection: "row", marginBottom: 4, borderRadius: 8, overflow: "hidden", backgroundColor: "rgba(201,168,76,0.07)", paddingVertical: 4, paddingRight: 8 },
  quoteStripe: { width: 3, backgroundColor: C.primary, marginRight: 6, flexShrink: 0 },
  quoteName: { fontSize: 11, fontFamily: "Inter_600SemiBold", color: C.primary, marginBottom: 1 },
  quoteText: { fontSize: 12, fontFamily: "Inter_400Regular", color: C.muted, lineHeight: 16 },
  voiceBubble: { flexDirection: "row", alignItems: "center", gap: 8, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, borderWidth: 1, maxWidth: 200 },
  voiceBubbleMine: { backgroundColor: C.mine, borderColor: C.mineBorder },
  voiceBubbleTheirs: { backgroundColor: C.theirs, borderColor: C.theirsBorder },
  voiceText: { fontSize: 14, fontFamily: "Inter_400Regular", flex: 1 },
  reactRow: { marginTop: 4, flexDirection: "row" },
  reactPill: { flexDirection: "row", alignItems: "center", gap: 2, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 8, paddingVertical: 3, marginRight: 4 },
  reactPillMine: { borderColor: "rgba(201,168,76,0.5)", backgroundColor: "rgba(201,168,76,0.1)" },
  reactEmoji: { fontSize: 14 },
  reactCount: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: C.fg },
  inputBar: { flexDirection: "row", alignItems: "flex-end", paddingHorizontal: 12, paddingVertical: 10, borderTopWidth: 1, borderTopColor: C.border, gap: 8, backgroundColor: C.bg },
  darminBtn: { width: 40, height: 40, borderRadius: 20, borderWidth: 1.5, borderColor: C.primary, alignItems: "center", justifyContent: "center", backgroundColor: "rgba(201,168,76,0.1)", flexShrink: 0 },
  darminBtnText: { fontSize: 14, fontFamily: "Inter_700Bold", color: C.primary },
  input: { flex: 1, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 20, paddingHorizontal: 14, paddingVertical: 10, color: C.fg, fontFamily: "Inter_400Regular", fontSize: 15, maxHeight: 120 },
  micBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  attachBtn: { width: 36, height: 36, borderRadius: 18, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  sendBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.primary, alignItems: "center", justifyContent: "center", flexShrink: 0 },
  sendBtnDis: { opacity: 0.4 },
  recordingBar: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderTopWidth: 1, borderTopColor: C.border, backgroundColor: "rgba(201,168,76,0.08)", gap: 12 },
  recordingDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: "#E05252" },
  recordingText: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", color: "#E05252" },
  stopRecordBtn: { width: 40, height: 40, borderRadius: 20, backgroundColor: C.primary, alignItems: "center", justifyContent: "center" },
  actionOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.6)", justifyContent: "flex-end" },
  actionSheet: { backgroundColor: C.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 20, paddingBottom: 36 },
  emojiRow: { flexDirection: "row", justifyContent: "space-around", marginBottom: 16 },
  emojiBtn: { width: 44, height: 44, alignItems: "center", justifyContent: "center", borderRadius: 22, backgroundColor: C.bg },
  emojiText: { fontSize: 26 },
  actionDivider: { height: 1, backgroundColor: C.border, marginBottom: 12 },
  actionItem: { flexDirection: "row", alignItems: "center", gap: 12, paddingVertical: 12 },
  actionText: { fontSize: 16, fontFamily: "Inter_400Regular", color: C.fg },
  modalOverlay: { flex: 1, backgroundColor: "rgba(0,0,0,0.7)", justifyContent: "flex-end" },
  modalSheet: { backgroundColor: C.surface, borderTopLeftRadius: 20, borderTopRightRadius: 20, padding: 24, paddingBottom: 36, gap: 12 },
  modalHeader: { flexDirection: "row", justifyContent: "space-between", alignItems: "center", width: "100%" },
  modalTitle: { fontSize: 18, fontFamily: "Inter_700Bold", color: C.fg },
  modalSubtitle: { fontSize: 13, fontFamily: "Inter_400Regular", color: C.muted },
  safetyCodeBox: { flexDirection: "row", gap: 8, marginVertical: 12 },
  safetyDigit: { width: 38, height: 52, borderRadius: 10, backgroundColor: "rgba(201,168,76,0.1)", borderWidth: 1.5, borderColor: "rgba(201,168,76,0.4)", alignItems: "center", justifyContent: "center" },
  safetyDigitText: { fontSize: 26, fontFamily: "Inter_700Bold", color: C.primary },
  safetyCloseBtn: { marginTop: 8, backgroundColor: C.primary, borderRadius: 12, paddingHorizontal: 32, paddingVertical: 12, width: "100%", alignItems: "center" },
  safetyCloseBtnText: { fontSize: 15, fontFamily: "Inter_700Bold", color: "#0A0A0F" },
  modalInput: { backgroundColor: C.bg, borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: C.fg, fontFamily: "Inter_400Regular", fontSize: 16 },
  fwdItem: { flexDirection: "row", alignItems: "center", paddingVertical: 10, gap: 12 },
  fwdAvatar: { width: 38, height: 38, borderRadius: 19, backgroundColor: "rgba(201,168,76,0.12)", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  fwdAvatarText: { fontSize: 16, fontFamily: "Inter_700Bold", color: C.primary },
  fwdName: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: C.fg },
  fwdRank: { fontSize: 11, fontFamily: "Inter_400Regular", color: C.muted },
  transferBtn: { backgroundColor: C.primary, borderRadius: 14, paddingVertical: 14, alignItems: "center", marginTop: 4 },
  transferBtnText: { fontSize: 16, fontFamily: "Inter_700Bold", color: "#0A0A0F" },
});
