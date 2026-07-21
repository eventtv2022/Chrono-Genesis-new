import React, { useEffect, useState } from "react";
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useRouter } from "expo-router";

import { useCitizen } from "@/context/CitizenContext";
import { getBaseUrl } from "@/lib/api";

const BASE_URL = getBaseUrl();

const C = {
  bg: "#0A0A0F", surface: "#12121A", border: "#1E1E2E",
  primary: "#C9A84C", fg: "#E8E8F0", muted: "#6B6B7E",
};

interface Citizen { id: number; name: string | null; rank: string | null; }

export default function NewGroupScreen() {
  const router = useRouter();
  const { citizen, authToken, authHeaders } = useCitizen();

  const [groupName, setGroupName] = useState("");
  const [groupDesc, setGroupDesc] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [allCitizens, setAllCitizens] = useState<Citizen[]>([]);
  const [selected, setSelected] = useState<Set<number>>(new Set());
  const [creating, setCreating] = useState(false);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch(`${BASE_URL}/api/citizens`);
        const all = (await res.json()) as Citizen[];
        setAllCitizens(all.filter((c) => c.id !== citizen?.id));
      } catch { /* silent */ }
    })();
  }, [citizen?.id]);

  const filtered = searchQuery.trim()
    ? allCitizens.filter((c) => (c.name ?? "").toLowerCase().includes(searchQuery.toLowerCase()))
    : allCitizens;

  function toggleSelect(id: number) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }

  async function createGroup() {
    if (!groupName.trim()) { Alert.alert("Ошибка", "Введите название группы"); return; }
    if (selected.size === 0) { Alert.alert("Ошибка", "Выберите хотя бы одного участника"); return; }
    if (!authToken) return;

    setCreating(true);
    try {
      const res = await fetch(`${BASE_URL}/api/chat/groups`, {
        method: "POST",
        headers: { "Content-Type": "application/json", ...authHeaders },
        body: JSON.stringify({ name: groupName.trim(), description: groupDesc.trim() || undefined, memberIds: [...selected] }),
      });
      if (!res.ok) {
        const err = (await res.json()) as { error?: string };
        Alert.alert("Ошибка", err.error ?? "Не удалось создать группу"); return;
      }
      const { group } = (await res.json()) as { group: { id: number } };
      router.replace(`/chat/group/${group.id}`);
    } catch { Alert.alert("Ошибка", "Сетевая ошибка"); }
    finally { setCreating(false); }
  }

  return (
    <SafeAreaView style={s.safe}>
      <View style={s.header}>
        <TouchableOpacity onPress={() => router.back()} activeOpacity={0.7}>
          <Feather name="arrow-left" size={22} color={C.primary} />
        </TouchableOpacity>
        <Text style={s.title}>Новая группа</Text>
        <TouchableOpacity onPress={createGroup} disabled={creating} activeOpacity={0.7}>
          {creating ? <ActivityIndicator color={C.primary} /> : <Text style={s.createBtn}>Создать</Text>}
        </TouchableOpacity>
      </View>

      <View style={s.form}>
        <TextInput
          style={s.nameInput}
          placeholder="Название группы *"
          placeholderTextColor={C.muted}
          value={groupName}
          onChangeText={setGroupName}
          maxLength={100}
          autoFocus
        />
        <TextInput
          style={[s.nameInput, { marginTop: 8, fontSize: 14 }]}
          placeholder="Описание (необязательно)"
          placeholderTextColor={C.muted}
          value={groupDesc}
          onChangeText={setGroupDesc}
          maxLength={500}
        />
      </View>

      <View style={s.memberSection}>
        <Text style={s.sectionLabel}>Участники ({selected.size} выбрано)</Text>
        <TextInput
          style={s.searchInput}
          placeholder="Поиск граждан..."
          placeholderTextColor={C.muted}
          value={searchQuery}
          onChangeText={setSearchQuery}
        />
      </View>

      <FlatList
        data={filtered}
        keyExtractor={(c) => String(c.id)}
        contentContainerStyle={{ paddingBottom: 24 }}
        renderItem={({ item: c }) => {
          const isSelected = selected.has(c.id);
          return (
            <TouchableOpacity
              style={s.citizenItem}
              onPress={() => toggleSelect(c.id)}
              activeOpacity={0.75}
            >
              <View style={[s.avatar, isSelected && s.avatarSelected]}>
                {isSelected
                  ? <Feather name="check" size={18} color="#0A0A0F" />
                  : <Text style={s.avatarText}>{(c.name ?? "?")[0]?.toUpperCase()}</Text>
                }
              </View>
              <View style={s.citizenInfo}>
                <Text style={s.citizenName}>{c.name ?? `ID ${c.id}`}</Text>
                {c.rank && <Text style={s.citizenRank}>{c.rank}</Text>}
              </View>
              {isSelected && <Feather name="check-circle" size={20} color={C.primary} style={{ marginLeft: "auto" }} />}
            </TouchableOpacity>
          );
        }}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe: { flex: 1, backgroundColor: "#0A0A0F" },
  header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border, gap: 12 },
  title: { flex: 1, fontSize: 20, fontFamily: "Inter_700Bold", color: C.fg },
  createBtn: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: C.primary },
  form: { paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.border },
  nameInput: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, color: C.fg, fontFamily: "Inter_400Regular", fontSize: 16 },
  memberSection: { paddingHorizontal: 16, paddingTop: 14, paddingBottom: 8 },
  sectionLabel: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: C.muted, textTransform: "uppercase", letterSpacing: 0.5, marginBottom: 8 },
  searchInput: { backgroundColor: C.surface, borderWidth: 1, borderColor: C.border, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 10, color: C.fg, fontFamily: "Inter_400Regular", fontSize: 14 },
  citizenItem: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.border, gap: 12 },
  avatar: { width: 42, height: 42, borderRadius: 21, backgroundColor: "rgba(201,168,76,0.12)", borderWidth: 1, borderColor: "rgba(201,168,76,0.25)", alignItems: "center", justifyContent: "center", flexShrink: 0 },
  avatarSelected: { backgroundColor: C.primary, borderColor: C.primary },
  avatarText: { fontSize: 17, fontFamily: "Inter_700Bold", color: C.primary },
  citizenInfo: { flex: 1 },
  citizenName: { fontSize: 15, fontFamily: "Inter_600SemiBold", color: C.fg },
  citizenRank: { fontSize: 11, fontFamily: "Inter_400Regular", color: C.muted },
});
