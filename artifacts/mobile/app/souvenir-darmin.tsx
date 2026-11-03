import { getBaseUrl } from "@/lib/api";
import React, { useCallback, useEffect, useState } from "react";
import { ActivityIndicator, Alert, Image, Platform, ScrollView, Text, TextInput, TouchableOpacity, View } from "react-native";
import { useRouter } from "expo-router";
import * as ImagePicker from "expo-image-picker";
import { Feather } from "@expo/vector-icons";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { useCitizen } from "@/context/CitizenContext";
import { useColors } from "@/hooks/useColors";
import { useLanguage } from "@/context/LanguageContext";

const BASE_URL = getBaseUrl();
type Note = {
  serialNumber: number;
  slogan: string;
  status: string;
  nftTokenId: string | null;
  nftTransactionHash: string | null;
  createdAt: string;
};

export default function SouvenirDarminScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { authHeaders, citizen } = useCitizen();
  const { lang } = useLanguage();
  const isRu = lang === "ru";
  const [notes, setNotes] = useState<Note[]>([]);
  const [portrait, setPortrait] = useState<ImagePicker.ImagePickerAsset | null>(null);
  const [slogan, setSlogan] = useState("");
  const [walletAddress, setWalletAddress] = useState("");
  const [loading, setLoading] = useState(false);
  const [busyNote, setBusyNote] = useState<number | null>(null);
  const [error, setError] = useState("");

  const loadNotes = useCallback(async () => {
    if (!citizen) return;
    const response = await fetch(`${BASE_URL}/api/souvenir-darmins/me`, { headers: authHeaders });
    if (!response.ok) throw new Error("Не удалось загрузить список банкнот.");
    setNotes(await response.json() as Note[]);
  }, [authHeaders, citizen]);

  useEffect(() => { void loadNotes().catch((reason: Error) => setError(reason.message)); }, [loadNotes]);

  async function choosePortrait() {
    const permission = await ImagePicker.requestMediaLibraryPermissionsAsync();
    if (!permission.granted) {
      Alert.alert(isRu ? "Нужен доступ к фото" : "Photo access required", isRu ? "Разрешите доступ к изображениям." : "Allow access to your photos.");
      return;
    }
    const result = await ImagePicker.launchImageLibraryAsync({
      mediaTypes: ["images"],
      allowsEditing: true,
      aspect: [1, 1],
      quality: 0.9,
    });
    if (!result.canceled) setPortrait(result.assets[0] ?? null);
  }

  async function issueNote() {
    if (!citizen || !portrait || !slogan.trim()) {
      setError(isRu ? "Добавьте портрет и слоган." : "Choose a portrait and enter a slogan.");
      return;
    }
    setLoading(true);
    setError("");
    try {
      const imageResponse = await fetch(portrait.uri);
      const imageBlob = await imageResponse.blob();
      const form = new FormData();
      form.append("portrait", imageBlob, portrait.fileName ?? "portrait.jpg");
      form.append("slogan", slogan.trim());
      const response = await fetch(`${BASE_URL}/api/souvenir-darmins`, {
        method: "POST",
        headers: authHeaders,
        body: form,
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Не удалось выпустить банкноту.");
      setPortrait(null);
      setSlogan("");
      await loadNotes();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Ошибка выпуска банкноты.");
    } finally {
      setLoading(false);
    }
  }

  async function mintNft(serialNumber: number) {
    if (!walletAddress.trim()) { setError(isRu ? "Введите адрес Ethereum-кошелька." : "Enter an Ethereum wallet address."); return; }
    setBusyNote(serialNumber);
    setError("");
    try {
      const response = await fetch(`${BASE_URL}/api/souvenir-darmins/${serialNumber}/mint-nft`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ walletAddress: walletAddress.trim() }),
      });
      const data = await response.json() as { error?: string };
      if (!response.ok) throw new Error(data.error ?? "Не удалось выпустить NFT.");
      await loadNotes();
    } catch (reason) {
      setError(reason instanceof Error ? reason.message : "Ошибка выпуска NFT.");
    } finally {
      setBusyNote(null);
    }
  }

  return (
    <ScrollView style={{ flex: 1, backgroundColor: colors.background }} contentContainerStyle={{ paddingTop: Platform.OS === "web" ? 67 : insets.top + 8, paddingHorizontal: 20, paddingBottom: insets.bottom + 32, gap: 16 }}>
      <TouchableOpacity onPress={() => router.back()} style={{ flexDirection: "row", alignItems: "center", gap: 8 }}>
        <Feather name="arrow-left" size={20} color={colors.primary} />
        <Text style={{ color: colors.primary, fontSize: 14 }}>{isRu ? "Казначейство" : "Treasury"}</Text>
      </TouchableOpacity>
      <View style={{ gap: 7 }}>
        <Text style={{ fontSize: 24, fontWeight: "700", color: colors.foreground }}>{isRu ? "Печатать свой ДарМин" : "Create your DarMin"}</Text>
        <Text style={{ color: colors.mutedForeground, fontSize: 13, lineHeight: 19 }}>
          {isRu ? "Цифровая сувенирная банкнота PNG с системным номером. Выпуск стоит 1 купленный Дармин + комиссия 2%." : "A digital souvenir PNG with a system-assigned serial. Issuance costs 1 fiat-purchased Darmin plus a 2% fee."}
        </Text>
      </View>

      <View style={{ backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 16, padding: 16, gap: 12 }}>
        <TouchableOpacity onPress={() => void choosePortrait()} style={{ minHeight: 44, borderWidth: 1, borderColor: colors.border, borderRadius: 10, flexDirection: "row", alignItems: "center", justifyContent: "center", gap: 8 }}>
          <Feather name="image" size={16} color={colors.primary} />
          <Text style={{ color: colors.primary, fontWeight: "600" }}>{portrait ? (portrait.fileName ?? (isRu ? "Портрет выбран" : "Portrait selected")) : (isRu ? "Выбрать портрет" : "Choose portrait")}</Text>
        </TouchableOpacity>
        {portrait && <Image source={{ uri: portrait.uri }} style={{ width: "100%", height: 190, borderRadius: 12 }} resizeMode="cover" />}
        <TextInput
          value={slogan}
          onChangeText={setSlogan}
          maxLength={80}
          placeholder={isRu ? "Ваш слоган — до 80 символов" : "Your slogan — up to 80 characters"}
          placeholderTextColor={colors.mutedForeground}
          style={{ color: colors.foreground, borderColor: colors.border, borderWidth: 1, borderRadius: 10, padding: 12, minHeight: 48 }}
        />
        <TouchableOpacity disabled={loading} onPress={() => void issueNote()} style={{ minHeight: 48, backgroundColor: colors.primary, borderRadius: 12, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8, opacity: loading ? 0.6 : 1 }}>
          {loading && <ActivityIndicator color={colors.primaryForeground} />}
          <Text style={{ color: colors.primaryForeground, fontWeight: "700" }}>{isRu ? "Выпустить за 1 Д + 2%" : "Issue for 1 D + 2%"}</Text>
        </TouchableOpacity>
      </View>

      {!!error && <Text style={{ color: colors.destructive, fontSize: 13 }}>{error}</Text>}

      <View style={{ gap: 12 }}>
        <Text style={{ color: colors.foreground, fontSize: 18, fontWeight: "700" }}>{isRu ? "Мои сувенирные Дармины" : "My souvenir Darmins"}</Text>
        {notes.length === 0 && <Text style={{ color: colors.mutedForeground }}>{isRu ? "Пока нет выпущенных банкнот." : "No issued banknotes yet."}</Text>}
        {notes.map((note) => (
          <View key={note.serialNumber} style={{ backgroundColor: colors.card, borderColor: colors.border, borderWidth: 1, borderRadius: 14, padding: 12, gap: 10 }}>
            <Image source={{ uri: `${BASE_URL}/api/souvenir-darmins/${note.serialNumber}/image`, headers: authHeaders }} style={{ width: "100%", aspectRatio: 1.5, borderRadius: 9 }} resizeMode="cover" />
            <Text style={{ color: colors.primary, fontWeight: "700" }}>DM {String(note.serialNumber).padStart(9, "0").replace(/(\d{3})(?=\d)/g, "$1 ")}</Text>
            <Text style={{ color: colors.foreground }}>{note.slogan}</Text>
            {!note.nftTokenId && (
              <>
                <TextInput value={walletAddress} onChangeText={setWalletAddress} autoCapitalize="none" placeholder="0x… Sepolia wallet" placeholderTextColor={colors.mutedForeground} style={{ color: colors.foreground, borderColor: colors.border, borderWidth: 1, borderRadius: 9, padding: 10 }} />
                <TouchableOpacity disabled={busyNote === note.serialNumber} onPress={() => void mintNft(note.serialNumber)} style={{ minHeight: 42, borderWidth: 1, borderColor: colors.primary, borderRadius: 10, alignItems: "center", justifyContent: "center", flexDirection: "row", gap: 8 }}>
                  {busyNote === note.serialNumber && <ActivityIndicator color={colors.primary} />}
                  <Text style={{ color: colors.primary, fontWeight: "600" }}>{isRu ? "Создать NFT в Sepolia" : "Mint NFT on Sepolia"}</Text>
                </TouchableOpacity>
              </>
            )}
            {!!note.nftTokenId && <Text style={{ color: colors.mutedForeground }}>{isRu ? `NFT #${note.nftTokenId} · ${note.nftTransactionHash ?? ""}` : `NFT #${note.nftTokenId} · ${note.nftTransactionHash ?? ""}`}</Text>}
          </View>
        ))}
      </View>
    </ScrollView>
  );
}
