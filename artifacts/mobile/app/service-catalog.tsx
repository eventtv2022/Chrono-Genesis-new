import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getBaseUrl } from "@/lib/api";
import { getStoredAuthHeaders } from "@/lib/authStorage";
import { useCitizen } from "@/context/CitizenContext";
import { useLanguage } from "@/context/LanguageContext";
import { useColors } from "@/hooks/useColors";

const BASE_URL = getBaseUrl();
type Listing = {
  id: number;
  citizenId: number;
  citizenName?: string;
  title: string;
  category: string;
  description: string;
  suggestedPriceDarmins: number;
  minuteRate: number;
  qualificationSummary: string;
  status?: string;
  createdAt: string;
};

export default function ServiceCatalogScreen() {
  const colors = useColors();
  const { lang } = useLanguage();
  const { citizen } = useCitizen();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isRu = lang === "ru";
  const [listings, setListings] = useState<Listing[]>([]);
  const [mine, setMine] = useState<Listing[]>([]);
  const [loading, setLoading] = useState(true);
  const [publishing, setPublishing] = useState(false);
  const [showForm, setShowForm] = useState(false);
  const [search, setSearch] = useState("");
  const [title, setTitle] = useState("");
  const [category, setCategory] = useState("");
  const [description, setDescription] = useState("");
  const [error, setError] = useState("");
  const requestKeyRef = useRef<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const headers = await getStoredAuthHeaders();
      const [publicResponse, mineResponse] = await Promise.all([
        fetch(`${BASE_URL}/api/service-catalog`),
        fetch(`${BASE_URL}/api/service-catalog/mine`, { headers }),
      ]);
      if (!publicResponse.ok) throw new Error(isRu ? "Не удалось загрузить каталог." : "Could not load the catalog.");
      const publicData = await publicResponse.json() as { listings: Listing[] };
      setListings(publicData.listings ?? []);
      if (mineResponse.ok) setMine((await mineResponse.json() as { listings: Listing[] }).listings ?? []);
    } catch (err) {
      setError(err instanceof Error ? err.message : (isRu ? "Ошибка загрузки." : "Loading failed."));
    } finally { setLoading(false); }
  }, [isRu]);

  useEffect(() => { void load(); }, [load]);

  const visible = useMemo(() => {
    const query = search.trim().toLocaleLowerCase();
    return listings.filter((item) => !query || `${item.title} ${item.category} ${item.description} ${item.citizenName ?? ""}`.toLocaleLowerCase().includes(query));
  }, [listings, search]);

  const publish = async () => {
    if (publishing) return;
    if (!title.trim() || !category.trim() || description.trim().length < 20) {
      setError(isRu ? "Заполните название, категорию и описание (не менее 20 символов)." : "Add a title, category, and description (at least 20 characters).");
      return;
    }
    setPublishing(true);
    setError("");
    try {
      const headers = await getStoredAuthHeaders();
      requestKeyRef.current ??= `${citizen?.id ?? "guest"}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const response = await fetch(`${BASE_URL}/api/service-catalog`, {
        method: "POST",
        headers: { ...headers, "Content-Type": "application/json" },
        body: JSON.stringify({
          title: title.trim(),
          category: category.trim(),
          description: description.trim(),
          lang,
          requestKey: requestKeyRef.current,
        }),
      });
      const data = await response.json() as { listing?: Listing; audit?: { suggestedAmount: number; qualificationSummary: string }; error?: string };
      if (!response.ok) throw new Error(data.error ?? (isRu ? "Не удалось опубликовать услугу." : "Could not publish the service."));
      setTitle("");
      setCategory("");
      setDescription("");
      requestKeyRef.current = null;
      setShowForm(false);
      await load();
      Alert.alert(
        isRu ? "Услуга опубликована" : "Service published",
        isRu
          ? `Списано 1 Д за размещение. Рекомендация аудитора: ${data.listing?.suggestedPriceDarmins ?? data.audit?.suggestedAmount ?? "—"} Д.`
          : `1 Д listing fee charged. Auditor recommendation: ${data.listing?.suggestedPriceDarmins ?? data.audit?.suggestedAmount ?? "—"} Д.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : (isRu ? "Не удалось опубликовать услугу." : "Could not publish the service."));
    } finally { setPublishing(false); }
  };

  const closeListing = async (id: number) => {
    try {
      const headers = await getStoredAuthHeaders();
      const response = await fetch(`${BASE_URL}/api/service-catalog/${id}`, { method: "DELETE", headers });
      if (!response.ok) throw new Error(isRu ? "Не удалось снять предложение." : "Could not close listing.");
      await load();
    } catch (err) {
      setError(err instanceof Error ? err.message : (isRu ? "Ошибка." : "Something went wrong."));
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: colors.background, paddingTop: Math.max(insets.top, 16) + 8 }]}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.header}>
          <TouchableOpacity onPress={() => router.back()} style={styles.back}>
            <Feather name="arrow-left" size={20} color={colors.foreground} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={[styles.eyebrow, { color: colors.primary }]}>{isRu ? "TIMENATION" : "TIMENATION"}</Text>
            <Text style={[styles.title, { color: colors.foreground }]}>{isRu ? "Каталог услуг" : "Service catalog"}</Text>
          </View>
          <TouchableOpacity onPress={() => { setError(""); setShowForm((value) => !value); }} style={[styles.addButton, { backgroundColor: colors.primary }]}>
            <Feather name={showForm ? "x" : "plus"} size={16} color={colors.primaryForeground} />
          </TouchableOpacity>
        </View>
        <Text style={[styles.intro, { color: colors.mutedForeground }]}>
          {isRu
            ? "Публикация стоит 1 Д. Для размещения загрузите в профиле хотя бы резюме или портфолио и согласитесь на анализ. Аудитор предложит стоимость; файлы не видны посетителям."
            : "Publishing costs 1 Д. Upload at least a resume or portfolio in your profile and consent to analysis. The auditor will recommend a price; visitors cannot see your files."}
        </Text>

        {showForm && (
          <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{isRu ? "Новое предложение" : "New service offer"}</Text>
            {[
              { value: title, setter: setTitle, placeholder: isRu ? "Название услуги" : "Service title", multiline: false },
              { value: category, setter: setCategory, placeholder: isRu ? "Категория" : "Category", multiline: false },
              { value: description, setter: setDescription, placeholder: isRu ? "Опишите услугу, объём и результат (от 20 символов)" : "Describe the service, scope, and outcome (20+ characters)", multiline: true },
            ].map((field) => (
              <TextInput
                key={field.placeholder}
                value={field.value}
                onChangeText={field.setter}
                placeholder={field.placeholder}
                placeholderTextColor={colors.mutedForeground}
                multiline={field.multiline}
                textAlignVertical={field.multiline ? "top" : "center"}
                style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }, field.multiline && styles.descriptionInput]}
              />
            ))}
            {!!error && <Text style={{ color: colors.destructive, fontSize: 12, marginBottom: 10 }}>{error}</Text>}
            <TouchableOpacity disabled={publishing} onPress={() => Alert.alert(
              isRu ? "Опубликовать за 1 Д?" : "Publish for 1 Д?",
              isRu ? "С вашего доступного баланса будет списан 1 Д. Рекомендацию цены подготовит ИИ-аудитор." : "1 Д will be deducted from your available balance. The AI auditor will recommend a price.",
              [{ text: isRu ? "Отмена" : "Cancel", style: "cancel" }, { text: isRu ? "Опубликовать" : "Publish", onPress: () => void publish() }],
            )} style={[styles.publishButton, { backgroundColor: colors.primary, opacity: publishing ? 0.7 : 1 }]}>
              {publishing ? <ActivityIndicator color={colors.primaryForeground} /> : <Feather name="send" size={15} color={colors.primaryForeground} />}
              <Text style={[styles.publishText, { color: colors.primaryForeground }]}>{isRu ? "Проверить и опубликовать · 1 Д" : "Audit and publish · 1 Д"}</Text>
            </TouchableOpacity>
          </View>
        )}

        <TextInput value={search} onChangeText={setSearch} placeholder={isRu ? "Поиск по услугам" : "Search services"} placeholderTextColor={colors.mutedForeground} style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]} />
        <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{isRu ? "Предложения граждан" : "Citizen offers"}</Text>
        {loading ? <ActivityIndicator color={colors.primary} style={{ marginVertical: 20 }} /> : visible.length === 0 ? (
          <Text style={[styles.intro, { color: colors.mutedForeground }]}>{isRu ? "Пока нет активных предложений." : "No active offers yet."}</Text>
        ) : visible.map((item) => (
          <View key={item.id} style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <View style={styles.listingTop}>
              <View style={{ flex: 1 }}>
                <Text style={[styles.listingTitle, { color: colors.foreground }]}>{item.title}</Text>
                <Text style={[styles.category, { color: colors.primary }]}>{item.category} · {item.citizenName ?? (isRu ? "Гражданин" : "Citizen")}</Text>
              </View>
              <Text style={[styles.price, { color: colors.primary }]}>{item.suggestedPriceDarmins} Д</Text>
            </View>
            <Text style={[styles.listingDescription, { color: colors.foreground }]}>{item.description}</Text>
            <Text style={[styles.qualification, { color: colors.mutedForeground }]}>{item.qualificationSummary}</Text>
            {item.citizenId === citizen?.id && (
              <TouchableOpacity onPress={() => void closeListing(item.id)} style={styles.closeButton}>
                <Feather name="archive" size={14} color={colors.destructive} />
                <Text style={{ color: colors.destructive, fontSize: 12 }}>{isRu ? "Снять с публикации" : "Close listing"}</Text>
              </TouchableOpacity>
            )}
          </View>
        ))}
        {!!error && !showForm && <Text style={{ color: colors.destructive, fontSize: 12 }}>{error}</Text>}
        {mine.length > 0 && <Text style={[styles.intro, { color: colors.mutedForeground }]}>{isRu ? `Ваших предложений: ${mine.filter((item) => item.status === "active").length}` : `Your active offers: ${mine.filter((item) => item.status === "active").length}`}</Text>}
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 20, paddingBottom: 40, gap: 13 },
  header: { flexDirection: "row", alignItems: "center", gap: 12 },
  back: { width: 38, height: 38, alignItems: "center", justifyContent: "center" },
  eyebrow: { fontSize: 10, letterSpacing: 1.5, fontWeight: "700" },
  title: { fontSize: 25, fontWeight: "700", marginTop: 3 },
  addButton: { width: 42, height: 42, borderRadius: 14, alignItems: "center", justifyContent: "center" },
  intro: { fontSize: 12, lineHeight: 18 },
  card: { borderWidth: 1, borderRadius: 16, padding: 15, gap: 10 },
  sectionTitle: { fontSize: 17, fontWeight: "700" },
  input: { borderWidth: 1, borderRadius: 11, minHeight: 44, paddingHorizontal: 12, fontSize: 13 },
  descriptionInput: { minHeight: 100, paddingTop: 12 },
  publishButton: { minHeight: 46, borderRadius: 12, flexDirection: "row", gap: 8, alignItems: "center", justifyContent: "center" },
  publishText: { fontSize: 13, fontWeight: "700" },
  listingTop: { flexDirection: "row", alignItems: "flex-start", gap: 8 },
  listingTitle: { fontSize: 16, fontWeight: "700" },
  category: { fontSize: 11, marginTop: 4 },
  price: { fontSize: 16, fontWeight: "700" },
  listingDescription: { fontSize: 13, lineHeight: 19 },
  qualification: { fontSize: 11, lineHeight: 16, borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: "#8885", paddingTop: 9 },
  closeButton: { flexDirection: "row", gap: 7, alignItems: "center", alignSelf: "flex-end", padding: 6 },
});
