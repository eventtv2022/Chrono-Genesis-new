import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ActivityIndicator, Alert, Platform, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from "react-native";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { getBaseUrl } from "@/lib/api";
import { getStoredAuthHeaders } from "@/lib/authStorage";
import { useCitizen } from "@/context/CitizenContext";
import { useLanguage } from "@/context/LanguageContext";
import { useColors } from "@/hooks/useColors";
import { previewServiceCatalogListing, publishServiceCatalogListing } from "@workspace/api-client-react";

const BASE_URL = getBaseUrl();
type Listing = {
  id: number;
  citizenId: number;
  citizenName?: string;
  title: string;
  category: string;
  description: string;
  sourceLang?: string;
  titleEn?: string | null;
  categoryEn?: string | null;
  descriptionEn?: string | null;
  suggestedPriceDarmins: number;
  minuteRate: number;
  qualificationSummary: string;
  resumeVisible?: boolean | null;
  portfolioVisible?: boolean | null;
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
  const [priceText, setPriceText] = useState("");
  const [auditToken, setAuditToken] = useState<string | null>(null);
  const [auditSuggestedAmount, setAuditSuggestedAmount] = useState<number | null>(null);
  const [auditSummary, setAuditSummary] = useState("");
  const [englishPreview, setEnglishPreview] = useState<{ title: string; category: string; description: string } | null>(null);
  const [error, setError] = useState("");
  const [openingDocument, setOpeningDocument] = useState<string | null>(null);
  const requestKeyRef = useRef<string | null>(null);

  const showNotice = (title: string, message: string) => {
    if (Platform.OS === "web") window.alert(`${title}\n\n${message}`);
    else Alert.alert(title, message);
  };

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const headers = await getStoredAuthHeaders();
      const [publicResponse, mineResponse, documentsResponse] = await Promise.all([
        fetch(`${BASE_URL}/api/service-catalog`),
        fetch(`${BASE_URL}/api/service-catalog/mine`, { headers }),
        fetch(`${BASE_URL}/api/service-catalog/visible-documents`, { headers }),
      ]);
      if (!publicResponse.ok) throw new Error(isRu ? "Не удалось загрузить каталог." : "Could not load the catalog.");
      const publicData = await publicResponse.json() as { listings: Listing[] };
      const visibleDocuments = documentsResponse.ok
        ? (await documentsResponse.json() as { documents: Array<{ citizenId: number; resumeVisible: boolean; portfolioVisible: boolean }> }).documents
        : [];
      const visibilityByCitizen = new Map(visibleDocuments.map((document) => [document.citizenId, document]));
      setListings((publicData.listings ?? []).map((listing) => ({
        ...listing,
        resumeVisible: visibilityByCitizen.get(listing.citizenId)?.resumeVisible ?? false,
        portfolioVisible: visibilityByCitizen.get(listing.citizenId)?.portfolioVisible ?? false,
      })));
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

  const clearAuditPreview = () => {
    setAuditToken(null);
    setAuditSuggestedAmount(null);
    setAuditSummary("");
    setEnglishPreview(null);
    setPriceText("");
  };

  const previewPrice = async () => {
    if (publishing) return;
    if (!title.trim() || !category.trim() || description.trim().length < 20) {
      setError(isRu ? "Заполните название, категорию и описание (не менее 20 символов)." : "Add a title, category, and description (at least 20 characters).");
      return;
    }
    setPublishing(true);
    setError("");
    try {
      requestKeyRef.current ??= `${citizen?.id ?? "guest"}-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
      const data = await previewServiceCatalogListing({
        title: title.trim(),
        category: category.trim(),
        description: description.trim(),
        lang,
        requestKey: requestKeyRef.current,
      });
      setAuditToken(data.auditToken);
      setAuditSuggestedAmount(data.audit.suggestedAmount);
      setAuditSummary(data.audit.summary);
      setEnglishPreview(data.audit.englishTranslation);
      setPriceText(String(data.audit.suggestedAmount));
    } catch (err) {
      setError(err instanceof Error ? err.message : (isRu ? "Не удалось проверить стоимость." : "Could not estimate the price."));
    } finally { setPublishing(false); }
  };

  const publish = async () => {
    if (publishing) return;
    if (!auditToken) {
      await previewPrice();
      return;
    }
    const priceDarmins = Number(priceText);
    if (!Number.isInteger(priceDarmins) || priceDarmins < 1 || priceDarmins > 1000) {
      setError(isRu ? "Укажите целую цену от 1 до 1000 Д." : "Enter a whole-number price from 1 to 1000 Д.");
      return;
    }
    setPublishing(true);
    setError("");
    try {
      const data = await publishServiceCatalogListing({
        requestKey: requestKeyRef.current!,
        auditToken,
        priceDarmins,
      });
      setTitle("");
      setCategory("");
      setDescription("");
      clearAuditPreview();
      requestKeyRef.current = null;
      setShowForm(false);
      await load();
      showNotice(
        isRu ? "Услуга опубликована" : "Service published",
        isRu
          ? `Цена услуги: ${data.listing.suggestedPriceDarmins} Д. Списано 1 Д за размещение. Рекомендация аудитора: ${data.audit?.suggestedAmount ?? auditSuggestedAmount ?? "—"} Д.`
          : `Service price: ${data.listing.suggestedPriceDarmins} Д. 1 Д listing fee charged. Auditor recommendation: ${data.audit?.suggestedAmount ?? auditSuggestedAmount ?? "—"} Д.`,
      );
    } catch (err) {
      if (typeof err === "object" && err !== null && "status" in err && Number(err.status) === 400) {
        clearAuditPreview();
      }
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

  const openProfessionalDocument = async (citizenId: number, kind: "resume" | "portfolio") => {
    const key = `${citizenId}-${kind}`;
    setOpeningDocument(key);
    try {
      const headers = await getStoredAuthHeaders();
      const documentUrl = `${BASE_URL}/api/citizens/${citizenId}/professional-documents/${kind}`;
      if (Platform.OS === "web") {
        const response = await fetch(documentUrl, { headers });
        if (!response.ok) {
          const data = await response.json().catch(() => ({})) as { error?: string };
          throw new Error(data.error ?? (isRu ? "Не удалось открыть документ." : "Could not open document."));
        }
        const url = URL.createObjectURL(await response.blob());
        const link = document.createElement("a");
        link.href = url;
        link.target = "_blank";
        link.rel = "noopener noreferrer";
        link.click();
        setTimeout(() => URL.revokeObjectURL(url), 60_000);
      } else {
        const [{ cacheDirectory }, { shareAsync }] = await Promise.all([
          import("expo-file-system/legacy"),
          import("expo-sharing"),
        ]);
        if (!cacheDirectory) throw new Error(isRu ? "Нет временного хранилища." : "Temporary storage is unavailable.");
        const fileUri = `${cacheDirectory}citizen-${citizenId}-${kind}-${Date.now()}.pdf`;
        const { downloadAsync } = await import("expo-file-system/legacy");
        const download = await downloadAsync(documentUrl, fileUri, { headers });
        if (download.status < 200 || download.status >= 300) throw new Error(isRu ? "Документ скрыт или недоступен." : "This document is hidden or unavailable.");
        await shareAsync(download.uri, {
          mimeType: "application/pdf",
          dialogTitle: isRu ? "Открыть PDF" : "Open PDF",
        });
      }
    } catch (err) {
      showNotice(isRu ? "Документ недоступен" : "Document unavailable", err instanceof Error ? err.message : "");
    } finally { setOpeningDocument(null); }
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
            ? "Публикация стоит 1 Д. Перед публикацией появится английский перевод. Для размещения загрузите в профиле хотя бы резюме или портфолио и согласитесь на анализ. Аудитор предложит стоимость. Файлы скрыты, пока вы не разрешите просмотр гражданам TimeNation."
            : "Publishing costs 1 Д. An English translation is prepared before publishing. Upload at least a resume or portfolio in your profile and consent to analysis. The auditor will recommend a price. Files stay hidden until you allow signed-in TimeNation citizens to view them."}
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
                onChangeText={(value) => { field.setter(value); clearAuditPreview(); }}
                placeholder={field.placeholder}
                placeholderTextColor={colors.mutedForeground}
                multiline={field.multiline}
                textAlignVertical={field.multiline ? "top" : "center"}
                style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }, field.multiline && styles.descriptionInput]}
              />
            ))}
            {auditToken && auditSuggestedAmount !== null && (
              <View style={{ gap: 7, padding: 11, borderRadius: 11, backgroundColor: colors.background }}>
                <Text style={{ color: colors.primary, fontSize: 13, fontWeight: "700" }}>
                  {isRu ? `Рекомендация аудитора: ${auditSuggestedAmount} Д` : `Auditor recommendation: ${auditSuggestedAmount} Д`}
                </Text>
                {!!auditSummary && <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 16 }}>{auditSummary}</Text>}
                {!!englishPreview && lang !== "en" && (
                  <View style={{ borderTopWidth: StyleSheet.hairlineWidth, borderTopColor: colors.border, paddingTop: 8, gap: 3 }}>
                    <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "700" }}>English translation</Text>
                    <Text style={{ color: colors.foreground, fontSize: 12 }}>{englishPreview.title} · {englishPreview.category}</Text>
                    <Text style={{ color: colors.mutedForeground, fontSize: 11, lineHeight: 15 }}>{englishPreview.description}</Text>
                  </View>
                )}
                <Text style={{ color: colors.foreground, fontSize: 12, fontWeight: "600" }}>
                  {isRu ? "Стоимость вашей услуги" : "Your service price"}
                </Text>
                <TextInput
                  value={priceText}
                  onChangeText={(value) => setPriceText(value.replace(/[^0-9]/g, ""))}
                  placeholder={`${auditSuggestedAmount}`}
                  placeholderTextColor={colors.mutedForeground}
                  keyboardType="number-pad"
                  testID="service-price-input"
                  style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.card }]}
                />
                <Text style={{ color: colors.mutedForeground, fontSize: 11 }}>
                  {isRu ? "Можно изменить на целое значение от 1 до 1000 Д." : "Edit to any whole number from 1 to 1000 Д."}
                </Text>
              </View>
            )}
            {!!error && <Text style={{ color: colors.destructive, fontSize: 12, marginBottom: 10 }}>{error}</Text>}
            <TouchableOpacity disabled={publishing} onPress={() => {
              if (!auditToken) {
                void previewPrice();
                return;
              }
              const selectedPrice = Number(priceText);
              if (!Number.isInteger(selectedPrice) || selectedPrice < 1 || selectedPrice > 1000) {
                setError(isRu ? "Укажите целую цену от 1 до 1000 Д." : "Enter a whole-number price from 1 to 1000 Д.");
                return;
              }
              const confirmationTitle = isRu ? "Опубликовать за 1 Д?" : "Publish for 1 Д?";
              const confirmationMessage = isRu
                ? `С вашего доступного баланса будет списан 1 Д. Цена услуги: ${selectedPrice} Д.`
                : `1 Д will be deducted from your available balance. Service price: ${selectedPrice} Д.`;
              if (Platform.OS === "web") {
                if (window.confirm(`${confirmationTitle}\n\n${confirmationMessage}`)) void publish();
              } else {
                Alert.alert(confirmationTitle, confirmationMessage, [
                  { text: isRu ? "Отмена" : "Cancel", style: "cancel" },
                  { text: isRu ? "Опубликовать" : "Publish", onPress: () => void publish() },
                ]);
              }
            }} style={[styles.publishButton, { backgroundColor: colors.primary, opacity: publishing ? 0.7 : 1 }]}>
              {publishing ? <ActivityIndicator color={colors.primaryForeground} /> : <Feather name={auditToken ? "send" : "search"} size={15} color={colors.primaryForeground} />}
              <Text style={[styles.publishText, { color: colors.primaryForeground }]}>
                {publishing
                  ? (isRu ? "Проверяем…" : "Checking…")
                  : auditToken
                    ? (isRu ? "Опубликовать · 1 Д" : "Publish · 1 Д")
                    : (isRu ? "Рассчитать цену" : "Get price recommendation")}
              </Text>
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
                <Text style={[styles.listingTitle, { color: colors.foreground }]}>
                  {lang === "en" ? item.titleEn ?? item.title : item.title}
                </Text>
                {item.sourceLang !== "en" && (item.titleEn || item.categoryEn) && (
                  <Text style={{ color: colors.mutedForeground, fontSize: 12, marginTop: 2 }}>
                    {lang === "en" ? item.title : item.titleEn} · {lang === "en" ? item.category : item.categoryEn}
                  </Text>
                )}
                <Text style={[styles.category, { color: colors.primary }]}>
                  {lang === "en" ? item.categoryEn ?? item.category : item.category} · {item.citizenName ?? (isRu ? "Гражданин" : "Citizen")}
                </Text>
              </View>
              <Text style={[styles.price, { color: colors.primary }]}>{item.suggestedPriceDarmins} Д</Text>
            </View>
            <Text style={[styles.listingDescription, { color: colors.foreground }]}>
              {lang === "en" ? item.descriptionEn ?? item.description : item.description}
            </Text>
            {item.sourceLang !== "en" && (lang === "en" ? item.description : item.descriptionEn) && (
              <Text style={[styles.listingDescription, { color: colors.mutedForeground, fontSize: 11 }]}>
                {lang === "en" ? item.description : item.descriptionEn}
              </Text>
            )}
            <Text style={[styles.qualification, { color: colors.mutedForeground }]}>{item.qualificationSummary}</Text>
            {citizen && (item.resumeVisible || item.portfolioVisible) && (
              <View style={{ flexDirection: "row", flexWrap: "wrap", gap: 8 }}>
                {item.resumeVisible && (
                  <TouchableOpacity disabled={!!openingDocument} onPress={() => void openProfessionalDocument(item.citizenId, "resume")} style={[styles.closeButton, { alignSelf: "auto", borderColor: colors.border, borderWidth: 1, borderRadius: 9 }]}>
                    <Feather name="file-text" size={14} color={colors.primary} />
                    <Text style={{ color: colors.primary, fontSize: 12 }}>{openingDocument === `${item.citizenId}-resume` ? (isRu ? "Открываем…" : "Opening…") : (isRu ? "Резюме" : "Resume")}</Text>
                  </TouchableOpacity>
                )}
                {item.portfolioVisible && (
                  <TouchableOpacity disabled={!!openingDocument} onPress={() => void openProfessionalDocument(item.citizenId, "portfolio")} style={[styles.closeButton, { alignSelf: "auto", borderColor: colors.border, borderWidth: 1, borderRadius: 9 }]}>
                    <Feather name="briefcase" size={14} color={colors.primary} />
                    <Text style={{ color: colors.primary, fontSize: 12 }}>{openingDocument === `${item.citizenId}-portfolio` ? (isRu ? "Открываем…" : "Opening…") : (isRu ? "Портфолио" : "Portfolio")}</Text>
                  </TouchableOpacity>
                )}
              </View>
            )}
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
