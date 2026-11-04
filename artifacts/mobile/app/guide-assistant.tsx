import React, { useMemo, useState } from "react";
import {
  ActivityIndicator,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useAskGuideAssistant } from "@workspace/api-client-react";
import { useColors } from "@/hooks/useColors";
import { useLanguage } from "@/context/LanguageContext";

type Message = { role: "user" | "assistant"; content: string };

export default function GuideAssistantScreen() {
  const colors = useColors();
  const { lang } = useLanguage();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isRu = lang === "ru";
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState("");
  const [error, setError] = useState("");
  const ask = useAskGuideAssistant();
  const reversedMessages = useMemo(() => [...messages].reverse(), [messages]);

  const sendMessage = async () => {
    const question = draft.trim();
    if (!question || ask.isPending) return;
    const nextMessages: Message[] = [...messages, { role: "user", content: question }];
    setMessages(nextMessages);
    setDraft("");
    setError("");
    try {
      const result = await ask.mutateAsync({ data: { messages: nextMessages.slice(-8) } });
      setMessages([...nextMessages, { role: "assistant", content: result.answer }]);
    } catch (requestError) {
      const serverError = requestError && typeof requestError === "object" && "data" in requestError
        ? (requestError as { data?: { error?: unknown } }).data?.error
        : undefined;
      setError(typeof serverError === "string" ? serverError : isRu ? "Не удалось получить ответ. Проверьте соединение и попробуйте ещё раз." : "Could not get an answer. Check your connection and try again.");
    }
  };

  const renderMessage = ({ item }: { item: Message }) => {
    const fromUser = item.role === "user";
    return (
      <View style={[styles.messageRow, fromUser && styles.userMessageRow]}>
        {!fromUser && <View style={[styles.avatar, { backgroundColor: colors.primary }]}><Feather name="help-circle" size={16} color={colors.background} /></View>}
        <View style={[
          styles.bubble,
          { backgroundColor: fromUser ? colors.primary : colors.card, borderColor: colors.border },
          fromUser && styles.userBubble,
        ]}>
          <Text style={[styles.messageText, { color: fromUser ? colors.background : colors.foreground }]}>{item.content}</Text>
        </View>
      </View>
    );
  };

  return (
    <KeyboardAvoidingView
      style={[styles.screen, { backgroundColor: colors.background }]}
      behavior="padding"
      keyboardVerticalOffset={0}
    >
      <View style={[styles.header, { paddingTop: Math.max(insets.top, 16) + 8, borderBottomColor: colors.border }]}>
        <TouchableOpacity onPress={() => router.back()} style={styles.backButton} accessibilityRole="button" accessibilityLabel={isRu ? "Назад" : "Back"}>
          <Feather name="arrow-left" size={20} color={colors.foreground} />
        </TouchableOpacity>
        <View style={styles.headerText}>
          <Text style={[styles.eyebrow, { color: colors.primary }]}>TIMENATION</Text>
          <Text style={[styles.title, { color: colors.foreground }]}>
            {isRu ? "ЗаБОТливый технический специалист" : "TimeNation technical support"}
          </Text>
        </View>
        <Feather name="message-circle" size={19} color={colors.primary} />
      </View>

      <FlatList
        inverted
        data={reversedMessages}
        renderItem={renderMessage}
        keyExtractor={(_, index) => `guide-message-${index}`}
        contentContainerStyle={styles.messageList}
        keyboardShouldPersistTaps="handled"
        ListEmptyComponent={
          <View style={styles.welcome}>
            <View style={[styles.welcomeIcon, { backgroundColor: colors.primary + "1A" }]}>
              <Feather name="book-open" size={25} color={colors.primary} />
            </View>
            <Text style={[styles.welcomeTitle, { color: colors.foreground }]}>
              {isRu ? "Помогу разобраться в TimeNation" : "How can I help with TimeNation?"}
            </Text>
            <Text style={[styles.welcomeText, { color: colors.mutedForeground }]}>
              {isRu
                ? "Спрашивайте, как пользоваться разделами и функциями. Ответы основаны на Руководстве пользователя."
                : "Ask how to use app sections and features. Answers are based on the user guide."}
            </Text>
            <Text style={[styles.exampleQuestion, { color: colors.primary }]}>
              {isRu ? "Например: «Как распределить задачи по Матрице времени?»" : "For example: “How do I use the Time Matrix?”"}
            </Text>
          </View>
        }
      />

      {!!error && <Text accessibilityRole="alert" style={[styles.error, { color: colors.destructive }]}>{error}</Text>}
      {ask.isPending && (
        <View style={styles.loadingRow}><ActivityIndicator size="small" color={colors.primary} /><Text style={{ color: colors.mutedForeground }}>{isRu ? "Готовлю ответ…" : "Preparing an answer…"}</Text></View>
      )}
      <View style={[styles.composer, { borderTopColor: colors.border, paddingBottom: Math.max(insets.bottom, 10), backgroundColor: colors.background }]}>
        <TextInput
          value={draft}
          onChangeText={setDraft}
          placeholder={isRu ? "Задайте вопрос о TimeNation" : "Ask about TimeNation"}
          placeholderTextColor={colors.mutedForeground}
          accessibilityLabel={isRu ? "Ваш вопрос" : "Your question"}
          multiline
          maxLength={1200}
          returnKeyType="send"
          blurOnSubmit
          onSubmitEditing={() => void sendMessage()}
          style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
        />
        <TouchableOpacity
          onPress={() => void sendMessage()}
          disabled={!draft.trim() || ask.isPending}
          accessibilityRole="button"
          accessibilityLabel={isRu ? "Отправить вопрос" : "Send question"}
          style={[styles.sendButton, { backgroundColor: !draft.trim() || ask.isPending ? colors.muted : colors.primary }]}
        >
          {ask.isPending ? <ActivityIndicator size="small" color={colors.background} /> : <Feather name="arrow-up" size={20} color={colors.background} />}
        </TouchableOpacity>
      </View>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  header: { flexDirection: "row", alignItems: "center", gap: 12, paddingHorizontal: 18, paddingBottom: 14, borderBottomWidth: StyleSheet.hairlineWidth },
  backButton: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  headerText: { flex: 1 },
  eyebrow: { fontSize: 10, letterSpacing: 1.5, fontWeight: "700" },
  title: { fontSize: 16, lineHeight: 21, fontWeight: "700", marginTop: 3 },
  messageList: { flexGrow: 1, justifyContent: "flex-end", padding: 16, gap: 12 },
  welcome: { alignItems: "center", paddingHorizontal: 22, paddingBottom: 34, transform: [{ scaleY: -1 }] },
  welcomeIcon: { width: 54, height: 54, borderRadius: 27, alignItems: "center", justifyContent: "center", marginBottom: 14 },
  welcomeTitle: { fontSize: 20, lineHeight: 26, fontWeight: "700", textAlign: "center" },
  welcomeText: { fontSize: 14, lineHeight: 21, textAlign: "center", marginTop: 8 },
  exampleQuestion: { fontSize: 13, lineHeight: 19, textAlign: "center", marginTop: 12 },
  messageRow: { flexDirection: "row", alignItems: "flex-end", gap: 8, maxWidth: "92%", alignSelf: "flex-start" },
  userMessageRow: { alignSelf: "flex-end" },
  avatar: { width: 28, height: 28, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  bubble: { paddingHorizontal: 13, paddingVertical: 10, borderRadius: 17, borderWidth: StyleSheet.hairlineWidth, maxWidth: "100%" },
  userBubble: { borderBottomRightRadius: 5 },
  messageText: { fontSize: 14, lineHeight: 20 },
  error: { paddingHorizontal: 18, paddingVertical: 8, fontSize: 13 },
  loadingRow: { flexDirection: "row", gap: 8, alignItems: "center", paddingHorizontal: 18, paddingVertical: 8 },
  composer: { flexDirection: "row", alignItems: "flex-end", gap: 10, paddingHorizontal: 14, paddingTop: 10, borderTopWidth: StyleSheet.hairlineWidth },
  input: { flex: 1, minHeight: 44, maxHeight: 120, borderRadius: 20, borderWidth: StyleSheet.hairlineWidth, paddingHorizontal: 15, paddingTop: 11, paddingBottom: 10, fontSize: 14 },
  sendButton: { width: 42, height: 42, borderRadius: 21, alignItems: "center", justifyContent: "center", marginBottom: 1 },
});
