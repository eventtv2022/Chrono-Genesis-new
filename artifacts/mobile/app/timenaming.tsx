import React, { useEffect, useState } from "react";
import {
  ActivityIndicator, Alert, Linking, Platform, ScrollView, StyleSheet,
  Text, TextInput, TouchableOpacity, View,
} from "react-native";
import { Feather } from "@expo/vector-icons";
import { Stack, useRouter } from "expo-router";
import { useQueryClient } from "@tanstack/react-query";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useColors } from "@/hooks/useColors";
import { useLanguage } from "@/context/LanguageContext";
import { useCitizen } from "@/context/CitizenContext";
import {
  downloadTimenamingCertificate,
  getCheckTimenamingMinuteQueryKey,
  getListMyTimenamingLicensesQueryKey,
  useCheckTimenamingMinute,
  useGenerateTimenamingCertificate,
  useGetTimenamingConfig,
  useListMyTimenamingLicenses,
  useMintTimenamingNft,
  useReserveTimenamingMinute,
  useUpgradeTimenamingMinute,
  type TimenamingLicense,
  type TimenamingReservationInput,
  type TimenamingUpgradeInput,
} from "@workspace/api-client-react";

function minuteCoord(date: string, time: string) {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
  if (!match || !/^([01]\d|2[0-3]):[0-5]\d$/.test(time.trim())) return "";
  const [, year, month, day] = match;
  const parsed = new Date(Date.UTC(Number(year), Number(month) - 1, Number(day)));
  if (parsed.getUTCFullYear() !== Number(year) || parsed.getUTCMonth() !== Number(month) - 1 || parsed.getUTCDate() !== Number(day)) return "";
  return `${year}${month}${day}${time.slice(0, 2)}${time.slice(3, 5)}`;
}

function formatMinute(value?: string | null) {
  if (!value) return "—";
  const digits = value.replace(/\D/g, "");
  if (digits.length >= 12) return `${digits.slice(0, 4)}-${digits.slice(4, 6)}-${digits.slice(6, 8)} ${digits.slice(8, 10)}:${digits.slice(10, 12)} UTC`;
  return value;
}

export default function TimenamingScreen() {
  const colors = useColors();
  const { lang } = useLanguage();
  const { citizen, authToken, refreshCitizen } = useCitizen();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const queryClient = useQueryClient();
  const ru = lang === "ru";
  const [date, setDate] = useState("");
  const [time, setTime] = useState("");
  const [checkedCoord, setCheckedCoord] = useState("");
  const [purchaseType, setPurchaseType] = useState<"TIMELINE_ONLY" | "ALL_INCLUSIVE">("TIMELINE_ONLY");
  const [ownerName, setOwnerName] = useState(citizen?.name ?? "");
  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [wallet, setWallet] = useState(citizen?.walletAddress ?? "");
  const [busy, setBusy] = useState("");
  const [error, setError] = useState("");
  const [success, setSuccess] = useState("");
  const configQuery = useGetTimenamingConfig();
  const mineQuery = useListMyTimenamingLicenses({ query: { queryKey: getListMyTimenamingLicensesQueryKey(), enabled: Boolean(authToken), retry: false } });
  const checkQuery = useCheckTimenamingMinute(checkedCoord, { query: { queryKey: getCheckTimenamingMinuteQueryKey(checkedCoord), enabled: Boolean(checkedCoord), retry: false } });
  const reserveMutation = useReserveTimenamingMinute();
  const upgradeMutation = useUpgradeTimenamingMinute();
  const mintMutation = useMintTimenamingNft();
  const certificateMutation = useGenerateTimenamingCertificate();
  const config = configQuery.data ?? null;
  const licenses = mineQuery.data?.licenses ?? [];
  const availability = checkQuery.data ?? null;
  const loadingConfig = configQuery.isLoading;
  const loadingMine = mineQuery.isLoading;
  const checking = checkQuery.isFetching;
  const configError = configQuery.error instanceof Error ? configQuery.error.message : "";
  const mineError = mineQuery.error instanceof Error ? mineQuery.error.message : "";
  const checkError = checkQuery.error instanceof Error ? checkQuery.error.message : "";
  const needsNft = Boolean(availability?.ownedByMe || purchaseType === "ALL_INCLUSIVE");
  const purchaseCost = needsNft ? 2.04 : 1;
  const enoughBalance = (citizen?.balanceMinutes ?? 0) - purchaseCost >= 1;
  const text = {
    title: ru ? "Именование времени" : "Timenaming",
    subtitle: ru ? "Закрепите минуту в истории и оформите лицензию или NFT." : "Reserve a historical minute and create a placement license or NFT.",
    network: ru ? "Сеть" : "Network", royalty: ru ? "Роялти" : "Royalty",
    date: ru ? "Дата · ГГГГ-ММ-ДД" : "Date · YYYY-MM-DD", time: ru ? "Время · UTC" : "Time · UTC",
    check: ru ? "Проверить минуту" : "Check minute", checking: ru ? "Проверяем…" : "Checking…",
    available: ru ? "Минута доступна" : "Minute available", taken: ru ? "Минута уже занята" : "Minute already reserved",
    myMinute: ru ? "Эта минута уже закреплена за вами" : "This minute is already yours",
    choose: ru ? "Выберите оформление" : "Choose a package",
    timeline: ru ? "Запись в истории · 1 Д" : "Timeline record · 1 Д",
    nftPackage: ru ? "Лицензия и выпуск NFT · 2,04 Д" : "License and NFT mint · 2.04 Д",
    owner: ru ? "Имя в записи" : "Name on record", moment: ru ? "Название момента" : "Moment title",
    note: ru ? "Описание · необязательно" : "Description · optional", wallet: ru ? "Публичный EVM-адрес получателя" : "Public EVM recipient address",
    publicNote: ru ? "Название, описание и адрес кошелька могут быть публичными. Не вводите секреты или личные данные." : "The title, description, and wallet address may be public. Do not enter secrets or private information.",
    reserve: ru ? "Оформить" : "Continue",
    placements: ru ? "Мои минуты" : "My minutes", empty: ru ? "Пока нет оформленных минут." : "No minutes yet.",
    certificate: ru ? "Скачать лицензию" : "Download license", mint: ru ? "Выпустить NFT · 2,04 Д" : "Mint NFT · 2.04 Д",
    minted: ru ? "NFT выпущен" : "NFT minted", pending: ru ? "Ожидает подтверждения" : "Pending confirmation",
    claimed: ru ? "Запись оформлена" : "Reserved", signIn: ru ? "Войдите в аккаунт гражданина, чтобы оформить минуту." : "Sign in as a citizen to reserve a minute.",
    retry: ru ? "Повторить" : "Retry", error: ru ? "Не удалось выполнить запрос." : "Request failed.",
    dateInvalid: ru ? "Укажите дату и время UTC." : "Enter a valid date and UTC time.",
    walletInvalid: ru ? "Укажите корректный адрес EVM, начинающийся с 0x." : "Enter a valid EVM address starting with 0x.",
  };

  useEffect(() => { if (citizen?.name) setOwnerName(citizen.name); }, [citizen?.name]);
  useEffect(() => { if (citizen?.walletAddress) setWallet(citizen.walletAddress); }, [citizen?.walletAddress]);

  const check = async () => {
    setError(""); setSuccess(""); setCheckedCoord("");
    const coord = minuteCoord(date, time);
    if (!coord) { setError(text.dateInvalid); return; }
    setCheckedCoord(coord);
    void queryClient.invalidateQueries({ queryKey: getCheckTimenamingMinuteQueryKey(coord), exact: true });
  };

  const submit = async () => {
    const coord = minuteCoord(date, time);
    if (!authToken || !citizen) { setError(text.signIn); return; }
    if (!coord || !availability || (!availability.ownedByMe && (!availability.available || availability.reserved))) { setError(text.dateInvalid); return; }
    const needsLicense = availability.ownedByMe || purchaseType === "ALL_INCLUSIVE";
    if (needsLicense && (!/^0x[a-fA-F0-9]{40}$/.test(wallet) || !title.trim() || !ownerName.trim())) { setError(text.walletInvalid); return; }
    setBusy("reserve"); setError(""); setSuccess("");
    try {
      const upgrade = Boolean(availability.ownedByMe);
      const details = needsLicense ? {
        ownerName: ownerName.trim(),
        customTitle: title.trim(),
        customDescription: description.trim(),
        walletAddress: wallet.trim(),
      } : {};
      const result = upgrade
        ? await upgradeMutation.mutateAsync({ data: { minuteTimestamp: `${date.trim()} ${time.trim()}`, ...details } as TimenamingUpgradeInput })
        : await reserveMutation.mutateAsync({ data: { minuteTimestamp: `${date.trim()} ${time.trim()}`, purchaseType, ...details } as TimenamingReservationInput });
      setSuccess(result.status === "MINTED" ? text.minted : result.status === "MINT_PENDING" ? text.pending : text.claimed);
      setCheckedCoord(""); setDate(""); setTime(""); setTitle(""); setDescription("");
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getListMyTimenamingLicensesQueryKey() }),
        refreshCitizen(),
      ]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : text.error); }
    finally { setBusy(""); }
  };

  const mint = async (license: TimenamingLicense) => {
    const id = license.certificateId ?? license.id;
    if (!authToken || !id) return;
    setBusy(`mint-${id}`); setError("");
    try {
      await mintMutation.mutateAsync({ certificateId: String(id) });
      await Promise.all([
        queryClient.invalidateQueries({ queryKey: getListMyTimenamingLicensesQueryKey() }),
        refreshCitizen(),
      ]);
    } catch (cause) { setError(cause instanceof Error ? cause.message : text.error); }
    finally { setBusy(""); }
  };

  const downloadCertificate = async (license: TimenamingLicense) => {
    const id = license.certificateId ?? license.id;
    if (!authToken || !id) return;
    setBusy(`pdf-${id}`); setError("");
    try {
      const generated = await certificateMutation.mutateAsync({ certificateId: String(id) });
      const file = await downloadTimenamingCertificate(generated.certificateId);
      if (Platform.OS === "web") {
        const objectUrl = URL.createObjectURL(file);
        const anchor = document.createElement("a");
        anchor.href = objectUrl; anchor.download = `timenation-license-${generated.certificateId}.pdf`; anchor.click();
        window.setTimeout(() => URL.revokeObjectURL(objectUrl), 1000);
      } else {
        const [{ cacheDirectory, writeAsStringAsync, EncodingType }, { shareAsync }] = await Promise.all([
          import("expo-file-system/legacy"), import("expo-sharing"),
        ]);
        if (!cacheDirectory) throw new Error(text.error);
        const base64 = await blobToBase64(file);
        const fileUri = `${cacheDirectory}timenation-license-${generated.certificateId}.pdf`;
        await writeAsStringAsync(fileUri, base64, { encoding: EncodingType.Base64 });
        await shareAsync(fileUri, { mimeType: "application/pdf", dialogTitle: text.certificate });
      }
      await queryClient.invalidateQueries({ queryKey: getListMyTimenamingLicensesQueryKey() });
    } catch (cause) { setError(cause instanceof Error ? cause.message : text.error); }
    finally { setBusy(""); }
  };

  const heading = (label: string) => <Text style={[styles.heading, { color: colors.foreground }]}>{label}</Text>;
  const button = (label: string, onPress: () => void, disabled = false, icon = "arrow-right") => (
    <TouchableOpacity accessibilityRole="button" onPress={onPress} disabled={disabled} style={[styles.button, { backgroundColor: colors.primary, opacity: disabled ? 0.55 : 1 }]}>
      {busy ? <ActivityIndicator color={colors.primaryForeground} /> : <Feather name={icon as never} size={17} color={colors.primaryForeground} />}
      <Text style={[styles.buttonText, { color: colors.primaryForeground }]}>{label}</Text>
    </TouchableOpacity>
  );

  return (
    <View style={[styles.root, { backgroundColor: colors.background }]}>
      <ScrollView contentContainerStyle={{ padding: 18, paddingTop: Math.max(insets.top, 16) + 12, paddingBottom: insets.bottom + 36, gap: 14 }}>
        <View style={styles.topRow}>
          <TouchableOpacity accessibilityRole="button" accessibilityLabel={ru ? "Назад" : "Back"} onPress={() => router.back()} style={[styles.back, { borderColor: colors.border }]}>
            <Feather name="arrow-left" size={19} color={colors.foreground} />
          </TouchableOpacity>
          <View style={{ flex: 1 }}>
            <Text style={[styles.kicker, { color: colors.primary }]}>{ru ? "ЗАПИСЬ ГРАЖДАНИНА · TIME NATION" : "CITIZEN RECORD · TIME NATION"}</Text>
            <Text style={[styles.title, { color: colors.foreground }]}>{text.title}</Text>
          </View>
        </View>
        <Text style={[styles.copy, { color: colors.mutedForeground }]}>{text.subtitle}</Text>
        {!!configError && <View style={[styles.errorBox, { backgroundColor: colors.destructive + "18" }]}>
          <Text style={{ color: colors.destructive, flex: 1 }}>{configError}</Text>
          <TouchableOpacity accessibilityRole="button" onPress={() => void configQuery.refetch()}><Text style={[styles.smallText, { color: colors.destructive }]}>{text.retry}</Text></TouchableOpacity>
        </View>}

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.facts}>
            <View style={{ flex: 1 }}>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>{text.network.toUpperCase()}</Text>
              <Text style={[styles.fact, { color: colors.foreground }]}>{loadingConfig ? "…" : config?.network ?? "Sepolia"}</Text>
              <Text style={[styles.caption, { color: colors.mutedForeground }]}>Chain ID {config?.chainId ?? 11155111}</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>{text.royalty.toUpperCase()}</Text>
              <Text style={[styles.fact, { color: colors.foreground }]}>{(config?.royaltyBps ?? 200) / 100}%</Text>
              <Text style={[styles.caption, { color: colors.mutedForeground }]}>{ru ? "Только на совместимых площадках" : "On compatible marketplaces"}</Text>
            </View>
          </View>
          <Text style={[styles.caption, { color: colors.mutedForeground, marginTop: 12 }]}>
            {ru ? `Баланс: ${citizen?.balanceMinutes ?? "—"} Д · Родовая минута защищена` : `Balance: ${citizen?.balanceMinutes ?? "—"} Д · Ancestral minute protected`}
          </Text>
        </View>

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          {heading(ru ? "Выберите минуту" : "Choose a minute")}
          <Text style={[styles.copy, { color: colors.mutedForeground }]}>{ru ? "Сначала проверьте доступность даты и времени по UTC." : "Check the UTC date and time before reserving."}</Text>
          <Text style={[styles.label, { color: colors.mutedForeground }]}>{text.date}</Text>
          <TextInput value={date} onChangeText={(v) => { setDate(v); setCheckedCoord(""); }} placeholder="YYYY-MM-DD" placeholderTextColor={colors.mutedForeground} keyboardType="numbers-and-punctuation" style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]} />
          <Text style={[styles.label, { color: colors.mutedForeground }]}>{text.time}</Text>
          <TextInput value={time} onChangeText={(v) => { setTime(v); setCheckedCoord(""); }} placeholder="HH:mm" placeholderTextColor={colors.mutedForeground} keyboardType="numbers-and-punctuation" maxLength={5} style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]} />
          {button(checking ? text.checking : text.check, () => void check(), checking, "search")}
          {!!checkError && <Text style={[styles.notice, { color: colors.destructive }]}>{checkError}</Text>}
          {availability && <View style={[styles.status, { borderColor: availability.available && !availability.reserved ? colors.success : colors.border }]}>
            <Feather name={availability.available && !availability.reserved ? "check-circle" : "lock"} size={18} color={availability.available && !availability.reserved ? colors.success : colors.primary} />
            <Text style={[styles.statusText, { color: colors.foreground }]}>{availability.ownedByMe ? text.myMinute : availability.available && !availability.reserved ? text.available : text.taken}{` · ${formatMinute(minuteCoord(date, time))}`}</Text>
          </View>}
          {!!success && <Text style={[styles.notice, { color: colors.success }]}>{success}</Text>}
          {availability && (availability.ownedByMe || (availability.available && !availability.reserved)) && <>
            {!availability.ownedByMe && <>
              <Text style={[styles.label, { color: colors.mutedForeground, marginTop: 8 }]}>{text.choose}</Text>
              {(["TIMELINE_ONLY", "ALL_INCLUSIVE"] as const).map((option) => (
                <TouchableOpacity key={option} onPress={() => setPurchaseType(option)} style={[styles.option, { borderColor: purchaseType === option ? colors.primary : colors.border, backgroundColor: colors.background }]}>
                  <Feather name={purchaseType === option ? "check-circle" : "circle"} size={17} color={colors.primary} />
                  <Text style={[styles.optionText, { color: colors.foreground }]}>{option === "TIMELINE_ONLY" ? text.timeline : text.nftPackage}</Text>
                </TouchableOpacity>
              ))}
            </>}
            {(availability.ownedByMe || purchaseType === "ALL_INCLUSIVE") && <>
              <Text style={[styles.notice, { color: colors.mutedForeground }]}>{text.publicNote}</Text>
              <TextInput value={ownerName} onChangeText={setOwnerName} placeholder={text.owner} placeholderTextColor={colors.mutedForeground} maxLength={120} style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]} />
              <TextInput value={title} onChangeText={setTitle} placeholder={text.moment} placeholderTextColor={colors.mutedForeground} maxLength={160} style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]} />
              <TextInput value={description} onChangeText={setDescription} placeholder={text.note} placeholderTextColor={colors.mutedForeground} maxLength={2000} multiline style={[styles.input, styles.multiline, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]} />
              <TextInput value={wallet} onChangeText={setWallet} placeholder="0x…" placeholderTextColor={colors.mutedForeground} autoCapitalize="none" maxLength={42} style={[styles.input, { color: colors.foreground, borderColor: colors.border, backgroundColor: colors.background }]} />
              <Text style={[styles.caption, { color: colors.mutedForeground }]}>{text.wallet}</Text>
            </>}
            {!citizen && <Text style={[styles.notice, { color: colors.mutedForeground }]}>{text.signIn}</Text>}
            {citizen && !enoughBalance && <Text style={[styles.notice, { color: colors.destructive }]}>{ru ? `Нужно ${purchaseCost.toLocaleString("ru-RU")} Д сверх защищённой родовой минуты.` : `You need ${purchaseCost} Д beyond the protected ancestral minute.`}</Text>}
            {button(
              busy === "reserve" ? (ru ? "Обрабатываем…" : "Processing…") : text.reserve,
              () => void submit(),
              busy !== "" || !citizen || !enoughBalance || (needsNft && (!config?.contractConfigured || !config?.ipfsPinningConfigured)),
              "shield",
            )}
          </>}
        </View>

        <View style={[styles.card, { backgroundColor: colors.card, borderColor: colors.border }]}>
          <View style={styles.listHeader}>{heading(text.placements)}<TouchableOpacity onPress={() => void mineQuery.refetch()} disabled={!authToken || loadingMine}><Feather name="refresh-cw" size={17} color={colors.primary} /></TouchableOpacity></View>
          {loadingMine ? <ActivityIndicator color={colors.primary} /> : !authToken ? <Text style={[styles.copy, { color: colors.mutedForeground }]}>{text.signIn}</Text> : mineError ? <Text style={[styles.copy, { color: colors.destructive }]}>{mineError}</Text> : licenses.length === 0 ? <Text style={[styles.copy, { color: colors.mutedForeground }]}>{text.empty}</Text> : licenses.map((license, index) => {
            const id = license.certificateId ?? license.id ?? index;
            const minted = license.status === "MINTED" || license.status === "ACTIVE_NFT" || !!license.tokenId;
            const pending = license.status === "MINT_PENDING";
            return <View key={String(id)} style={[styles.license, { borderTopColor: colors.border }]}>
              <Text style={[styles.label, { color: colors.mutedForeground }]}>{formatMinute(license.timelineCoord)}</Text>
              <Text style={[styles.licenseTitle, { color: colors.foreground }]}>{license.customTitle || (ru ? "Запись без названия" : "Untitled minute")}</Text>
              <Text style={[styles.caption, { color: colors.mutedForeground }]}>{license.ownerName ?? ""} · {minted ? text.minted : pending ? text.pending : text.claimed}</Text>
              <View style={styles.actions}>
                <TouchableOpacity disabled={busy !== ""} onPress={() => void downloadCertificate(license)} style={[styles.smallButton, { borderColor: colors.border }]}>
                  {busy === `pdf-${id}` ? <ActivityIndicator size="small" color={colors.primary} /> : <Feather name="download" size={15} color={colors.primary} />}
                  <Text style={[styles.smallText, { color: colors.primary }]}>{text.certificate}</Text>
                </TouchableOpacity>
                {!minted && !pending && <TouchableOpacity disabled={busy !== "" || !config?.contractConfigured || !config?.ipfsPinningConfigured} onPress={() => void mint(license)} style={[styles.smallButton, { borderColor: colors.primary, opacity: config?.contractConfigured && config.ipfsPinningConfigured ? 1 : 0.5 }]}>
                  {busy === `mint-${id}` ? <ActivityIndicator size="small" color={colors.primary} /> : <Feather name="zap" size={15} color={colors.primary} />}
                  <Text style={[styles.smallText, { color: colors.primary }]}>{text.mint}</Text>
                </TouchableOpacity>}
              </View>
              {!!license.transactionHash && <TouchableOpacity onPress={() => void Linking.openURL(license.explorerUrl ?? `https://sepolia.etherscan.io/tx/${license.transactionHash}`)}>
                <Text style={[styles.link, { color: colors.primary }]}>{ru ? "Открыть транзакцию в Sepolia Explorer" : "View transaction in Sepolia Explorer"}</Text>
              </TouchableOpacity>}
              {!!license.certificateIpfsUri && <Text style={[styles.caption, { color: colors.mutedForeground }]}>{license.certificateIpfsUri}</Text>}
            </View>;
          })}
        </View>
        {!!error && <View style={[styles.errorBox, { backgroundColor: colors.destructive + "18" }]}><Text style={{ color: colors.destructive, flex: 1 }}>{error}</Text><TouchableOpacity onPress={() => setError("")}><Feather name="x" size={18} color={colors.destructive} /></TouchableOpacity></View>}
      </ScrollView>
    </View>
  );
}

function blobToBase64(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => {
      const value = String(reader.result ?? "");
      const comma = value.indexOf(",");
      if (comma < 0) reject(new Error("Could not read the certificate file."));
      else resolve(value.slice(comma + 1));
    };
    reader.onerror = () => reject(new Error("Could not read the certificate file."));
    reader.readAsDataURL(blob);
  });
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  topRow: { flexDirection: "row", alignItems: "center", gap: 12 },
  back: { width: 42, height: 42, borderWidth: 1, alignItems: "center", justifyContent: "center", borderRadius: 12 },
  kicker: { fontSize: 9, letterSpacing: 1.4, fontWeight: "700" },
  title: { fontSize: 25, fontWeight: "800", marginTop: 3 },
  heading: { fontSize: 19, fontWeight: "700" },
  copy: { fontSize: 13, lineHeight: 19, marginTop: 7, marginBottom: 10 },
  card: { borderWidth: 1, borderRadius: 16, padding: 16 },
  facts: { flexDirection: "row", gap: 12 },
  label: { fontSize: 10, letterSpacing: 1, fontWeight: "700", marginTop: 8, marginBottom: 6 },
  fact: { fontSize: 17, fontWeight: "700", marginTop: 4 },
  caption: { fontSize: 11, lineHeight: 16 },
  input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 11, fontSize: 14, marginTop: 3, marginBottom: 6 },
  multiline: { minHeight: 84, textAlignVertical: "top" },
  button: { minHeight: 48, borderRadius: 12, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 9, paddingHorizontal: 14, marginTop: 10 },
  buttonText: { fontSize: 14, fontWeight: "700" },
  status: { flexDirection: "row", alignItems: "center", gap: 8, borderWidth: 1, padding: 11, borderRadius: 10, marginTop: 10 },
  statusText: { flex: 1, fontSize: 12, fontWeight: "600" },
  notice: { fontSize: 12, lineHeight: 17, marginVertical: 6 },
  option: { flexDirection: "row", alignItems: "center", gap: 9, borderWidth: 1, borderRadius: 10, padding: 12, marginTop: 7 },
  optionText: { flex: 1, fontSize: 13, fontWeight: "600" },
  listHeader: { flexDirection: "row", alignItems: "center", justifyContent: "space-between" },
  license: { borderTopWidth: 1, paddingTop: 13, marginTop: 13 },
  licenseTitle: { fontSize: 15, fontWeight: "700", marginTop: 5 },
  actions: { flexDirection: "row", flexWrap: "wrap", gap: 8, marginTop: 10 },
  smallButton: { borderWidth: 1, borderRadius: 9, minHeight: 38, paddingHorizontal: 10, flexDirection: "row", alignItems: "center", gap: 6 },
  smallText: { fontSize: 11, fontWeight: "700" },
  link: { fontSize: 12, fontWeight: "600", marginTop: 10 },
  errorBox: { flexDirection: "row", alignItems: "center", gap: 8, padding: 12, borderRadius: 10 },
});
