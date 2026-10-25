import React, { useCallback, useEffect, useState } from "react";
import {
  ActivityIndicator,
  RefreshControl,
  ScrollView,
  Share,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
  Linking,
  Platform,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import * as Clipboard from "expo-clipboard";
import * as DocumentPicker from "expo-document-picker";
import { useRouter } from "expo-router";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useLanguage } from "@/context/LanguageContext";
import { useCitizen } from "@/context/CitizenContext";
import { CitizenAvatar } from "@/components/CitizenAvatar";
import { getBaseUrl } from "@/lib/api";
import { getStoredToken } from "@/lib/authStorage";

const BASE_URL = getBaseUrl();

interface Referral {
  id: number;
  name: string;
  status: "pending" | "rewarded";
  rewardedAt: string | null;
  bonusMinutes: number;
}

interface ReferralProfile {
  referralUrl: string;
  referralCount: number;
  earnedBonusMinutes: number;
  bonusBalanceMinutes: number;
  referrals: Referral[];
}

export default function ProfileScreen() {
  const colors = useColors();
  const { lang } = useLanguage();
  const { authToken, citizen } = useCitizen();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const isRu = lang === "ru";
  const [profile, setProfile] = useState<ReferralProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  const [professionalDocs, setProfessionalDocs] = useState<{
    resume: { fileName: string; uploadedAt: string | null; visible: boolean } | null;
    portfolio: { fileName: string; uploadedAt: string | null; visible: boolean } | null;
    aiConsent: boolean;
  } | null>(null);
  const [docConsent, setDocConsent] = useState(false);
  const [docBusy, setDocBusy] = useState(false);
  const [docError, setDocError] = useState("");

  const loadProfessionalDocs = useCallback(async () => {
    try {
      const token = await getStoredToken() ?? authToken;
      if (!token) return;
      const response = await fetch(`${BASE_URL}/api/citizens/me/professional-documents`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (response.ok) setProfessionalDocs(await response.json());
    } catch { /* profile still works if document metadata is unavailable */ }
  }, [authToken]);

  useEffect(() => { void loadProfessionalDocs(); }, [loadProfessionalDocs]);

  const uploadProfessionalDoc = async (kind: "resume" | "portfolio") => {
    if (!docConsent) return;
    const result = await DocumentPicker.getDocumentAsync({ type: "application/pdf", copyToCacheDirectory: true });
    if (result.canceled || !result.assets?.[0]) return;
    const asset = result.assets[0];
    setDocBusy(true);
    setDocError("");
    try {
      const token = await getStoredToken() ?? authToken;
      if (!token) throw new Error(isRu ? "Войдите в аккаунт." : "Please sign in.");
      const form = new FormData();
      if (Platform.OS === "web") {
        const file = await fetch(asset.uri).then((response) => response.blob());
        form.append("file", file, asset.name.toLowerCase().endsWith(".pdf") ? asset.name : `${asset.name}.pdf`);
      } else {
        form.append("file", { uri: asset.uri, name: asset.name, type: asset.mimeType ?? "application/pdf" } as unknown as Blob);
      }
      form.append("aiConsent", "true");
      const response = await fetch(`${BASE_URL}/api/citizens/me/professional-documents/${kind}`, {
        method: "POST",
        headers: { Authorization: `Bearer ${token}` },
        body: form,
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? (isRu ? "Не удалось загрузить файл." : "Upload failed."));
      await loadProfessionalDocs();
    } catch (err) {
      setDocError(err instanceof Error ? err.message : (isRu ? "Не удалось загрузить файл." : "Upload failed."));
    } finally {
      setDocBusy(false);
    }
  };

  const removeProfessionalDoc = async (kind: "resume" | "portfolio") => {
    setDocBusy(true);
    setDocError("");
    try {
      const token = await getStoredToken() ?? authToken;
      if (!token) throw new Error(isRu ? "Войдите в аккаунт." : "Please sign in.");
      const response = await fetch(`${BASE_URL}/api/citizens/me/professional-documents/${kind}`, {
        method: "DELETE",
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error(isRu ? "Не удалось удалить файл." : "Could not remove file.");
      await loadProfessionalDocs();
    } catch (err) {
      setDocError(err instanceof Error ? err.message : (isRu ? "Не удалось удалить файл." : "Could not remove file."));
    } finally { setDocBusy(false); }
  };

  const setDocumentVisibility = async (kind: "resume" | "portfolio", visible: boolean) => {
    if (!professionalDocs) return;
    setDocBusy(true);
    setDocError("");
    const next = {
      resumeVisible: kind === "resume" ? visible : !!professionalDocs.resume?.visible,
      portfolioVisible: kind === "portfolio" ? visible : !!professionalDocs.portfolio?.visible,
    };
    try {
      const token = await getStoredToken() ?? authToken;
      if (!token) throw new Error(isRu ? "Войдите в аккаунт." : "Please sign in.");
      const response = await fetch(`${BASE_URL}/api/citizens/me/professional-documents/privacy`, {
        method: "PATCH",
        headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
        body: JSON.stringify(next),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? (isRu ? "Не удалось изменить видимость." : "Could not update visibility."));
      await loadProfessionalDocs();
    } catch (err) {
      setDocError(err instanceof Error ? err.message : (isRu ? "Не удалось изменить видимость." : "Could not update visibility."));
    } finally { setDocBusy(false); }
  };

  const copy = isRu ? "Скопировать ссылку" : "Copy link";
  const invite = isRu ? "Пригласить друзей" : "Invite friends";
  const telegram = isRu ? "Поделиться в Telegram" : "Share on Telegram";
  const loadMessage = isRu ? "Загружаем ваш профиль" : "Loading your profile";
  const errorMessage = isRu ? "Не удалось загрузить данные рефералов." : "Could not load referral details.";

  const loadProfile = useCallback(async (quiet = false) => {
    if (!quiet) setLoading(true);
    setError("");
    try {
      const token = await getStoredToken() ?? authToken;
      if (!token) throw new Error("Missing authorization");
      const response = await fetch(`${BASE_URL}/api/referrals/me`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!response.ok) throw new Error(`Referral request failed (${response.status})`);
      const result = await response.json() as ReferralProfile;
      setProfile(result);
    } catch {
      setError(errorMessage);
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [authToken, errorMessage]);

  useEffect(() => {
    void loadProfile();
  }, [loadProfile]);

  const refresh = () => {
    setRefreshing(true);
    void loadProfile(true);
  };

  const shareTelegram = async () => {
    if (!profile?.referralUrl) return;
    const text = isRu
      ? "Присоединяйся к TimeNation — экономике взаимного времени."
      : "Join me in TimeNation, an economy built on exchanging time.";
    const url = `https://t.me/share/url?url=${encodeURIComponent(profile.referralUrl)}&text=${encodeURIComponent(text)}`;
    try {
      await Linking.openURL(url);
    } catch {
      await Share.share({ message: `${text} ${profile.referralUrl}`, url: profile.referralUrl });
    }
  };

  const shareInvite = async () => {
    if (!profile?.referralUrl) return;
    const message = isRu
      ? `Присоединяйся к TimeNation — экономике взаимного времени. Моя ссылка: ${profile.referralUrl}`
      : `Join me in TimeNation, an economy built on exchanging time. My invite link: ${profile.referralUrl}`;
    try {
      await Share.share({ message, url: profile.referralUrl, title: isRu ? "Приглашение в TimeNation" : "TimeNation invitation" });
    } catch {
      await shareTelegram();
    }
  };

  const copyInvite = async () => {
    if (!profile?.referralUrl) return;
    try {
      await Clipboard.setStringAsync(profile.referralUrl);
      setCopied(true);
      setTimeout(() => setCopied(false), 2200);
    } catch {
      setError(isRu ? "Не удалось скопировать ссылку." : "Could not copy the link.");
    }
  };

  const formatDate = (date: string | null) => {
    if (!date) return "";
    try {
      return new Intl.DateTimeFormat(isRu ? "ru-RU" : "en-GB", {
        day: "numeric",
        month: "short",
        year: "numeric",
      }).format(new Date(date));
    } catch {
      return date;
    }
  };

  const unit = isRu ? "мин" : "min";

  return (
    <View style={[styles.screen, { backgroundColor: colors.background }]}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: Math.max(insets.top, 18) + 10, paddingBottom: insets.bottom + 112 }]}
        refreshControl={
          <RefreshControl
            refreshing={refreshing}
            onRefresh={refresh}
            tintColor={colors.primary}
            colors={[colors.primary]}
          />
        }
      >
        <View style={styles.headingRow}>
          <View>
            <Text style={[styles.eyebrow, { color: colors.primary }]}>{isRu ? "ЛИЧНЫЙ КАБИНЕТ" : "CITIZEN CONTROL ROOM"}</Text>
            <Text style={[styles.title, { color: colors.foreground }]}>{isRu ? "Профиль" : "Profile"}</Text>
          </View>
          <View
            accessible
            accessibilityLabel={isRu ? "Фотография гражданина из паспорта" : "Citizen passport photo"}
            style={[styles.headerMark, { backgroundColor: colors.goldGlow, borderColor: colors.border }]}
          >
            {citizen ? (
              <CitizenAvatar
                citizenId={citizen.id}
                name={citizen.name}
                hasPhoto={!!citizen.photoUrl}
                size={48}
              />
            ) : (
              <Feather name="user" size={20} color={colors.primary} />
            )}
          </View>
        </View>

        <View style={[styles.programCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{isRu ? "Резюме и портфолио" : "Resume & portfolio"}</Text>
          <Text style={[styles.programCopy, { color: colors.mutedForeground }]}>
            {isRu
              ? "PDF-файлы до 3 МБ по умолчанию скрыты. Можно отдельно разрешить просмотр каждому авторизованному гражданину TimeNation; открытый файл можно сохранить. ИИ использует документы только после вашего согласия."
              : "PDF files up to 3 MB are hidden by default. You can allow any signed-in TimeNation citizen to view each file; viewers can save a copy. AI uses documents only with your consent."}
          </Text>
          <TouchableOpacity onPress={() => setDocConsent((value) => !value)} style={{ flexDirection: "row", alignItems: "center", gap: 9, marginTop: 12 }}>
            <Feather name={docConsent ? "check-square" : "square"} size={18} color={colors.primary} />
            <Text style={{ color: colors.foreground, flex: 1, fontSize: 12, lineHeight: 17 }}>
              {isRu ? "Согласен на приватное хранение и анализ моих файлов ИИ-аудитором" : "I agree to private storage and AI-auditor analysis of my files"}
            </Text>
          </TouchableOpacity>
          {(["resume", "portfolio"] as const).map((kind) => {
            const item = professionalDocs?.[kind];
            const label = kind === "resume" ? (isRu ? "Резюме" : "Resume") : (isRu ? "Портфолио" : "Portfolio");
            return (
              <View key={kind} style={{ flexDirection: "row", alignItems: "center", gap: 8, marginTop: 12 }}>
                <View style={{ flex: 1 }}>
                  <Text style={{ color: colors.foreground, fontSize: 13, fontWeight: "600" }}>{label}</Text>
                  <Text numberOfLines={1} style={{ color: colors.mutedForeground, fontSize: 11, marginTop: 3 }}>
                    {item?.fileName ?? (isRu ? "Файл не загружен" : "No file uploaded")}
                  </Text>
                </View>
                {item && (
                  <TouchableOpacity
                    disabled={docBusy}
                    onPress={() => void setDocumentVisibility(kind, !item.visible)}
                    accessibilityLabel={isRu ? `${item.visible ? "Скрыть" : "Показать"} ${label.toLowerCase()}` : `${item.visible ? "Hide" : "Show"} ${label.toLowerCase()}`}
                    style={[styles.copyButton, { borderColor: colors.border, marginTop: 6, paddingHorizontal: 10, opacity: docBusy ? 0.5 : 1 }]}
                  >
                    <Feather name={item.visible ? "eye" : "eye-off"} size={14} color={item.visible ? colors.primary : colors.mutedForeground} />
                    <Text style={[styles.copyText, { color: item.visible ? colors.primary : colors.mutedForeground }]}>
                      {isRu ? (item.visible ? "Виден гражданам" : "Скрыт") : (item.visible ? "Visible to citizens" : "Hidden")}
                    </Text>
                  </TouchableOpacity>
                )}
                {item && <TouchableOpacity disabled={docBusy} onPress={() => void removeProfessionalDoc(kind)} accessibilityLabel={isRu ? "Удалить файл" : "Remove file"}><Feather name="trash-2" size={17} color={colors.destructive} /></TouchableOpacity>}
                <TouchableOpacity disabled={docBusy || !docConsent} onPress={() => void uploadProfessionalDoc(kind)} style={[styles.copyButton, { borderColor: colors.border, marginTop: 0, paddingHorizontal: 10, opacity: docConsent ? 1 : 0.45 }]}>
                  {docBusy ? <ActivityIndicator size="small" color={colors.primary} /> : <Feather name="upload" size={14} color={colors.primary} />}
                  <Text style={[styles.copyText, { color: colors.primary }]}>{isRu ? (item ? "Заменить" : "Загрузить") : (item ? "Replace" : "Upload")}</Text>
                </TouchableOpacity>
              </View>
            );
          })}
          {!!docError && <Text style={[styles.inlineError, { color: colors.destructive, marginTop: 8 }]}>{docError}</Text>}
          <TouchableOpacity onPress={() => router.push("/service-catalog")} style={[styles.copyButton, { borderColor: colors.primary, marginTop: 14 }]}>
            <Feather name="grid" size={15} color={colors.primary} />
            <Text style={[styles.copyText, { color: colors.primary }]}>{isRu ? "Каталог услуг · публикация за 1 Д" : "Service catalog · publish for 1 Д"}</Text>
          </TouchableOpacity>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={isRu ? "Открыть руководство пользователя" : "Open user guide"}
            onPress={() => router.push("/user-guide")}
            style={[styles.copyButton, { backgroundColor: colors.primary, borderColor: colors.primary, marginTop: 10, minHeight: 48, paddingHorizontal: 13 }]}
          >
            <Feather name="book-open" size={17} color={colors.primaryForeground} />
            <Text style={[styles.copyText, { color: colors.primaryForeground, flex: 1, fontSize: 14 }]}>
              {isRu ? "Руководство пользователя" : "User guide (Russian)"}
            </Text>
            <Feather name="arrow-right" size={17} color={colors.primaryForeground} />
          </TouchableOpacity>
        </View>

        <View style={[styles.programCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.programTop}>
            <View style={[styles.programIcon, { backgroundColor: colors.goldGlow }]}>
              <Feather name="users" size={19} color={colors.primary} />
            </View>
            <Text style={[styles.programKicker, { color: colors.mutedForeground }]}>{isRu ? "ПРИГЛАШЕНИЯ" : "REFERRAL PROGRAM"}</Text>
            <View style={[styles.livePip, { backgroundColor: colors.success }]} />
          </View>
          <Text style={[styles.programTitle, { color: colors.foreground }]}>
            {isRu ? "Время возвращается" : "Time comes back around"}
          </Text>
          <Text style={[styles.programCopy, { color: colors.mutedForeground }]}>
            {isRu
              ? "Приглашайте людей в сеть и получайте бонусные минуты, когда они присоединяются."
              : "Bring more people into the network and earn bonus minutes when they join."}
          </Text>
          <TouchableOpacity
            accessibilityRole="button"
            accessibilityLabel={invite}
            activeOpacity={0.82}
            onPress={() => void shareInvite()}
            disabled={!profile}
            style={[styles.primaryButton, { backgroundColor: colors.primary, opacity: profile ? 1 : 0.55 }]}
          >
            <Feather name="send" size={16} color={colors.primaryForeground} />
            <Text style={[styles.primaryButtonText, { color: colors.primaryForeground }]}>{invite}</Text>
            <Feather name="arrow-up-right" size={16} color={colors.primaryForeground} />
          </TouchableOpacity>
        </View>

        {loading && !profile ? (
          <View style={[styles.loadingCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <ActivityIndicator color={colors.primary} />
            <Text style={[styles.loadingText, { color: colors.mutedForeground }]}>{loadMessage}</Text>
            <View style={[styles.skeleton, { backgroundColor: colors.surface }]} />
            <View style={[styles.skeletonShort, { backgroundColor: colors.surface }]} />
          </View>
        ) : error && !profile ? (
          <View style={[styles.errorCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
            <Feather name="alert-circle" size={22} color={colors.destructive} />
            <Text style={[styles.errorText, { color: colors.foreground }]}>{error}</Text>
            <TouchableOpacity onPress={() => void loadProfile()} style={[styles.retryButton, { borderColor: colors.border }]}>
              <Text style={[styles.retryText, { color: colors.primary }]}>{isRu ? "Повторить" : "Try again"}</Text>
            </TouchableOpacity>
          </View>
        ) : profile ? (
          <>
            <View style={[styles.linkPanel, { backgroundColor: colors.surface, borderColor: colors.border }]}>
              <View style={styles.linkLabelRow}>
                <Feather name="link-2" size={15} color={colors.primary} />
                <Text style={[styles.sectionLabel, { color: colors.foreground }]}>{isRu ? "ВАША ПЕРСОНАЛЬНАЯ ССЫЛКА" : "YOUR PERSONAL LINK"}</Text>
              </View>
              <Text selectable style={[styles.url, { color: colors.foreground }]} numberOfLines={2}>{profile.referralUrl}</Text>
              <TouchableOpacity
                accessibilityRole="button"
                onPress={() => void copyInvite()}
                activeOpacity={0.78}
                style={[styles.copyButton, { borderColor: colors.border }]}
              >
                <Feather name={copied ? "check" : "copy"} size={15} color={colors.primary} />
                <Text style={[styles.copyText, { color: colors.primary }]}>{copied ? (isRu ? "Ссылка скопирована" : "Link copied") : copy}</Text>
              </TouchableOpacity>
              <TouchableOpacity onPress={() => void shareTelegram()} activeOpacity={0.76} style={styles.telegramButton}>
                <Feather name="send" size={14} color={colors.mutedForeground} />
                <Text style={[styles.telegramText, { color: colors.mutedForeground }]}>{telegram}</Text>
              </TouchableOpacity>
            </View>

            <View style={styles.metricsRow}>
              <MetricCard
                colors={colors}
                icon="user-plus"
                label={isRu ? "Приглашено" : "Referred"}
                value={profile.referralCount.toLocaleString(isRu ? "ru-RU" : "en-GB")}
                suffix={isRu ? "чел." : "people"}
                tone="neutral"
              />
              <MetricCard
                colors={colors}
                icon="award"
                label={isRu ? "Всего начислено" : "Earned in total"}
                value={profile.earnedBonusMinutes.toLocaleString(isRu ? "ru-RU" : "en-GB")}
                suffix={unit}
                tone="gold"
              />
            </View>

            <View style={[styles.balanceCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
              <View style={styles.balanceIcon}>
                <Feather name="clock" size={18} color={colors.primary} />
              </View>
              <View style={styles.balanceTextBlock}>
                <Text style={[styles.balanceLabel, { color: colors.mutedForeground }]}>{isRu ? "ДОСТУПНЫЙ БОНУСНЫЙ БАЛАНС" : "AVAILABLE BONUS BALANCE"}</Text>
                <View style={styles.balanceNumberRow}>
                  <Text style={[styles.balanceNumber, { color: colors.foreground }]}>{profile.bonusBalanceMinutes.toLocaleString(isRu ? "ru-RU" : "en-GB")}</Text>
                  <Text style={[styles.balanceUnit, { color: colors.primary }]}>{unit}</Text>
                </View>
              </View>
              <Feather name="chevron-right" size={18} color={colors.mutedForeground} />
            </View>

            <View style={[styles.notice, { backgroundColor: colors.goldGlow, borderColor: colors.border }]}>
              <Feather name="shield" size={17} color={colors.primary} />
              <Text style={[styles.noticeText, { color: colors.foreground }]}>
                {isRu
                  ? "Бонусы доступны только внутри TimeNation. Их нельзя вывести или обменять на деньги."
                  : "Bonuses can only be used inside TimeNation. They cannot be withdrawn or cashed out."}
              </Text>
            </View>

            <View style={styles.historyHeader}>
              <View>
                <Text style={[styles.sectionTitle, { color: colors.foreground }]}>{isRu ? "История приглашений" : "Referral history"}</Text>
                <Text style={[styles.historySub, { color: colors.mutedForeground }]}>{isRu ? "Прозрачно и по шагам" : "Every step, clearly tracked"}</Text>
              </View>
              <Text style={[styles.historyCount, { color: colors.primary }]}>{profile.referrals.length.toString().padStart(2, "0")}</Text>
            </View>

            {profile.referrals.length === 0 ? (
              <View style={[styles.emptyCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
                <View style={[styles.emptyIcon, { backgroundColor: colors.surface }]}>
                  <Feather name="users" size={21} color={colors.mutedForeground} />
                </View>
                <Text style={[styles.emptyTitle, { color: colors.foreground }]}>{isRu ? "Здесь начнётся ваша сеть" : "Your network starts here"}</Text>
                <Text style={[styles.emptyCopy, { color: colors.mutedForeground }]}>
                  {isRu
                    ? "Поделитесь ссылкой с тем, кому близка идея обмена временем. Статус приглашения появится здесь."
                    : "Share your link with someone who believes in exchanging time. Their invitation status will appear here."}
                </Text>
                <TouchableOpacity onPress={() => void shareInvite()} style={styles.emptyAction}>
                  <Text style={[styles.emptyActionText, { color: colors.primary }]}>{invite}</Text>
                  <Feather name="arrow-right" size={15} color={colors.primary} />
                </TouchableOpacity>
              </View>
            ) : (
              <View style={[styles.historyList, { borderColor: colors.border }]}>
                {profile.referrals.map((referral, index) => {
                  const rewarded = referral.status === "rewarded";
                  return (
                    <View
                      key={referral.id}
                      style={[
                        styles.referralRow,
                        { backgroundColor: colors.card },
                        index < profile.referrals.length - 1 && { borderBottomColor: colors.border, borderBottomWidth: StyleSheet.hairlineWidth },
                      ]}
                    >
                      <View style={[styles.avatar, { backgroundColor: colors.surface, borderColor: colors.border }]}>
                        <Text style={[styles.avatarText, { color: colors.primary }]}>{(referral.name.trim()[0] || "?").toLocaleUpperCase()}</Text>
                      </View>
                      <View style={styles.referralMain}>
                        <Text style={[styles.referralName, { color: colors.foreground }]} numberOfLines={1}>{referral.name}</Text>
                        <View style={styles.statusLine}>
                          <View style={[styles.statusDot, { backgroundColor: rewarded ? colors.success : colors.primary }]} />
                          <Text style={[styles.statusText, { color: colors.mutedForeground }]}>
                            {rewarded
                              ? `${isRu ? "Бонус начислен" : "Bonus awarded"}${referral.rewardedAt ? ` · ${formatDate(referral.rewardedAt)}` : ""}`
                              : (isRu ? "Ожидает подтверждения" : "Awaiting confirmation")}
                          </Text>
                        </View>
                      </View>
                      <Text style={[styles.referralBonus, { color: rewarded ? colors.primary : colors.mutedForeground }]}>
                        {rewarded ? `+${referral.bonusMinutes}` : "—"} <Text style={styles.bonusUnit}>{unit}</Text>
                      </Text>
                    </View>
                  );
                })}
              </View>
            )}
            {!!error && <Text style={[styles.inlineError, { color: colors.destructive }]}>{error}</Text>}
          </>
        ) : null}
      </ScrollView>
    </View>
  );
}

function MetricCard({
  colors, icon, label, value, suffix, tone,
}: {
  colors: ReturnType<typeof useColors>;
  icon: React.ComponentProps<typeof Feather>["name"];
  label: string;
  value: string;
  suffix: string;
  tone: "neutral" | "gold";
}) {
  return (
    <View style={[styles.metricCard, { backgroundColor: colors.card, borderColor: colors.border }]}>
      <View style={styles.metricTop}>
        <Feather name={icon} size={15} color={tone === "gold" ? colors.primary : colors.mutedForeground} />
        <Text style={[styles.metricLabel, { color: colors.mutedForeground }]} numberOfLines={1}>{label}</Text>
      </View>
      <Text style={[styles.metricValue, { color: tone === "gold" ? colors.primary : colors.foreground }]} numberOfLines={1}>{value}</Text>
      <Text style={[styles.metricSuffix, { color: colors.mutedForeground }]}>{suffix}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: { flex: 1 },
  content: { paddingHorizontal: 20, gap: 16 },
  headingRow: { flexDirection: "row", alignItems: "center", justifyContent: "space-between", marginBottom: 2 },
  eyebrow: { fontSize: 10, fontWeight: "700", letterSpacing: 1.65, marginBottom: 5 },
  title: { fontSize: 30, lineHeight: 36, fontWeight: "700", letterSpacing: -0.8 },
  headerMark: { width: 52, height: 52, borderRadius: 26, borderWidth: 1, alignItems: "center", justifyContent: "center", overflow: "hidden" },
  programCard: { borderWidth: 1, borderRadius: 20, padding: 18, overflow: "hidden" },
  programTop: { flexDirection: "row", alignItems: "center", gap: 9, marginBottom: 15 },
  programIcon: { height: 34, width: 34, borderRadius: 11, alignItems: "center", justifyContent: "center" },
  programKicker: { fontSize: 10, fontWeight: "700", letterSpacing: 1.25, flex: 1 },
  livePip: { width: 7, height: 7, borderRadius: 4 },
  programTitle: { fontSize: 22, fontWeight: "700", letterSpacing: -0.45 },
  programCopy: { marginTop: 7, fontSize: 13, lineHeight: 19, maxWidth: 320 },
  primaryButton: { height: 49, marginTop: 18, borderRadius: 13, paddingHorizontal: 15, flexDirection: "row", gap: 10, alignItems: "center", justifyContent: "center" },
  primaryButtonText: { fontSize: 14, fontWeight: "700", flex: 1 },
  linkPanel: { padding: 16, borderWidth: 1, borderRadius: 17 },
  linkLabelRow: { flexDirection: "row", alignItems: "center", gap: 8 },
  sectionLabel: { fontSize: 10, fontWeight: "700", letterSpacing: 1.05 },
  url: { fontSize: 14, lineHeight: 20, fontWeight: "600", marginTop: 12 },
  copyButton: { minHeight: 41, borderRadius: 11, borderWidth: 1, marginTop: 13, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 },
  copyText: { fontSize: 13, fontWeight: "700" },
  telegramButton: { paddingTop: 13, flexDirection: "row", justifyContent: "center", alignItems: "center", gap: 7 },
  telegramText: { fontSize: 12, fontWeight: "600" },
  metricsRow: { flexDirection: "row", gap: 11 },
  metricCard: { flex: 1, borderWidth: 1, borderRadius: 16, paddingHorizontal: 13, paddingVertical: 14, minWidth: 0 },
  metricTop: { flexDirection: "row", gap: 7, alignItems: "center" },
  metricLabel: { fontSize: 10, fontWeight: "600", flexShrink: 1 },
  metricValue: { fontSize: 25, fontWeight: "700", letterSpacing: -0.7, marginTop: 13 },
  metricSuffix: { fontSize: 11, marginTop: 1 },
  balanceCard: { borderWidth: 1, borderRadius: 16, padding: 15, flexDirection: "row", alignItems: "center", gap: 12 },
  balanceIcon: { width: 38, height: 38, borderRadius: 12, backgroundColor: "rgba(201,168,76,0.11)", alignItems: "center", justifyContent: "center" },
  balanceTextBlock: { flex: 1 },
  balanceLabel: { fontSize: 9, letterSpacing: 0.85, fontWeight: "700" },
  balanceNumberRow: { flexDirection: "row", alignItems: "baseline", gap: 6, marginTop: 3 },
  balanceNumber: { fontSize: 25, lineHeight: 30, fontWeight: "700", letterSpacing: -0.5 },
  balanceUnit: { fontSize: 12, fontWeight: "700" },
  notice: { borderWidth: 1, borderRadius: 13, paddingHorizontal: 13, paddingVertical: 12, flexDirection: "row", alignItems: "flex-start", gap: 10 },
  noticeText: { flex: 1, fontSize: 12, lineHeight: 18, fontWeight: "500" },
  historyHeader: { marginTop: 5, flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  sectionTitle: { fontSize: 18, fontWeight: "700", letterSpacing: -0.25 },
  historySub: { fontSize: 11, marginTop: 3 },
  historyCount: { fontSize: 12, fontWeight: "700", letterSpacing: 1 },
  emptyCard: { borderWidth: 1, borderRadius: 17, alignItems: "center", paddingHorizontal: 22, paddingVertical: 24 },
  emptyIcon: { width: 46, height: 46, borderRadius: 16, alignItems: "center", justifyContent: "center", marginBottom: 13 },
  emptyTitle: { fontSize: 15, fontWeight: "700", textAlign: "center" },
  emptyCopy: { fontSize: 12, lineHeight: 18, textAlign: "center", marginTop: 7, maxWidth: 285 },
  emptyAction: { flexDirection: "row", gap: 7, alignItems: "center", marginTop: 16, paddingVertical: 5 },
  emptyActionText: { fontSize: 13, fontWeight: "700" },
  historyList: { borderWidth: 1, borderRadius: 16, overflow: "hidden" },
  referralRow: { minHeight: 72, flexDirection: "row", alignItems: "center", paddingHorizontal: 13, paddingVertical: 11, gap: 11 },
  avatar: { width: 38, height: 38, borderRadius: 14, borderWidth: 1, alignItems: "center", justifyContent: "center" },
  avatarText: { fontSize: 15, fontWeight: "700" },
  referralMain: { flex: 1, minWidth: 0, gap: 5 },
  referralName: { fontSize: 13, fontWeight: "700" },
  statusLine: { flexDirection: "row", alignItems: "center", gap: 5 },
  statusDot: { width: 6, height: 6, borderRadius: 3 },
  statusText: { fontSize: 10, flexShrink: 1 },
  referralBonus: { fontSize: 13, fontWeight: "700" },
  bonusUnit: { fontSize: 10, fontWeight: "500" },
  loadingCard: { minHeight: 190, borderRadius: 18, borderWidth: 1, padding: 20, justifyContent: "center", alignItems: "center", gap: 12 },
  loadingText: { fontSize: 13, marginBottom: 4 },
  skeleton: { height: 12, width: "75%", borderRadius: 6 },
  skeletonShort: { height: 12, width: "48%", borderRadius: 6 },
  errorCard: { borderWidth: 1, borderRadius: 18, padding: 22, gap: 12, alignItems: "center" },
  errorText: { fontSize: 13, textAlign: "center", lineHeight: 19 },
  retryButton: { borderWidth: 1, borderRadius: 10, paddingVertical: 9, paddingHorizontal: 18 },
  retryText: { fontSize: 13, fontWeight: "700" },
  inlineError: { fontSize: 12, textAlign: "center" },
});
