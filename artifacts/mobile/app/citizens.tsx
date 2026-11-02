import { getBaseUrl } from "@/lib/api";
import React, { useState } from "react";
import {
  View,
  Text,
  StyleSheet,
  FlatList,
  TextInput,
  ActivityIndicator,
  RefreshControl,
  Platform,
  TouchableOpacity,
} from "react-native";
import { useSafeAreaInsets } from "react-native-safe-area-context";
import { Feather } from "@expo/vector-icons";
import { useQuery } from "@tanstack/react-query";
import { useRouter } from "expo-router";
import { useColors } from "@/hooks/useColors";

const BASE_URL = getBaseUrl();

interface Citizen {
  citizenNumber: string;
}

export default function CitizensScreen() {
  const colors = useColors();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const topPad = Platform.OS === "web" ? 67 : insets.top;

  const [query, setQuery] = useState("");

  const { data: citizens, isLoading, refetch, isRefetching } = useQuery<Citizen[]>({
    queryKey: ["citizens"],
    queryFn: async () => {
      const res = await fetch(`${BASE_URL}/api/citizens`);
      if (!res.ok) throw new Error("Ошибка загрузки");
      return res.json() as Promise<Citizen[]>;
    },
    refetchInterval: 60000,
  });

  const filtered = (citizens ?? []).filter(
    (c) =>
      !query ||
      c.citizenNumber.includes(query.trim())
  );

  const styles = getStyles(colors);

  const renderItem = ({ item: c, index }: { item: Citizen; index: number }) => {
    return (
      <View style={styles.row}>
        <Text style={styles.idx}>{index + 1}</Text>
        <Text style={styles.name} numberOfLines={1}>№{c.citizenNumber}</Text>
      </View>
    );
  };

  return (
    <View style={[styles.container, { paddingTop: topPad }]}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()} hitSlop={{ top: 10, bottom: 10, left: 10, right: 10 }}>
          <Feather name="arrow-left" size={22} color={colors.foreground} />
        </TouchableOpacity>
        <View style={{ flex: 1, marginLeft: 12 }}>
          <Text style={styles.title}>Реестр граждан</Text>
          <Text style={styles.subtitle}>
            Только номера паспортов · {citizens?.length ?? "…"} граждан
          </Text>
        </View>
      </View>

      <View style={styles.searchRow}>
        <Feather name="search" size={16} color={colors.mutedForeground} style={{ marginRight: 8 }} />
        <TextInput
          style={styles.searchInput}
          value={query}
          onChangeText={setQuery}
          placeholder="Поиск по номеру паспорта…"
          placeholderTextColor={colors.mutedForeground}
        />
        {query.length > 0 && (
          <TouchableOpacity onPress={() => setQuery("")} hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}>
            <Feather name="x" size={16} color={colors.mutedForeground} />
          </TouchableOpacity>
        )}
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator size="large" color={colors.primary} />
        </View>
      ) : filtered.length === 0 ? (
        <View style={styles.center}>
          <Feather name="users" size={40} color={colors.mutedForeground} />
          <Text style={styles.empty}>Граждан не найдено</Text>
        </View>
      ) : (
        <FlatList
          data={filtered}
          keyExtractor={(c) => c.citizenNumber}
          renderItem={renderItem}
          contentContainerStyle={{ paddingBottom: 40, paddingTop: 4 }}
          showsVerticalScrollIndicator={false}
          ItemSeparatorComponent={() => <View style={{ height: 1, backgroundColor: colors.border + "44", marginHorizontal: 16 }} />}
          refreshControl={<RefreshControl refreshing={isRefetching} onRefresh={refetch} tintColor={colors.primary} />}
        />
      )}
    </View>
  );
}

function getStyles(colors: ReturnType<typeof useColors>) {
  return StyleSheet.create({
    container: { flex: 1, backgroundColor: colors.background },
    header: { flexDirection: "row", alignItems: "center", paddingHorizontal: 16, paddingVertical: 12, borderBottomWidth: StyleSheet.hairlineWidth, borderBottomColor: colors.border },
    title: { fontSize: 18, fontFamily: "Inter_700Bold", color: colors.foreground },
    subtitle: { fontSize: 11, fontFamily: "Inter_400Regular", color: colors.mutedForeground, marginTop: 1 },
    searchRow: { flexDirection: "row", alignItems: "center", margin: 12, paddingHorizontal: 12, paddingVertical: 10, backgroundColor: colors.card, borderRadius: 10, borderWidth: StyleSheet.hairlineWidth, borderColor: colors.border },
    searchInput: { flex: 1, fontSize: 14, fontFamily: "Inter_400Regular", color: colors.foreground },
    center: { flex: 1, alignItems: "center", justifyContent: "center", gap: 12 },
    empty: { fontSize: 15, fontFamily: "Inter_400Regular", color: colors.mutedForeground },
    row: { flexDirection: "row", alignItems: "center", paddingHorizontal: 12, paddingVertical: 10, gap: 6 },
    idx: { fontSize: 12, fontFamily: "Inter_400Regular", color: colors.mutedForeground, width: 22, textAlign: "right" },
    rowMain: { flexDirection: "row", alignItems: "center", flex: 1, gap: 8, minWidth: 0 },
    avatar: { width: 30, height: 30, borderRadius: 15, backgroundColor: colors.muted, alignItems: "center", justifyContent: "center", flexShrink: 0 },
    avatarText: { fontSize: 13, fontFamily: "Inter_700Bold" },
    nameBlock: { flex: 1, minWidth: 0 },
    name: { fontSize: 13, fontFamily: "Inter_500Medium", color: colors.foreground },
    phone: { fontSize: 10, fontFamily: "Inter_400Regular", color: colors.mutedForeground },
    rankPill: { paddingHorizontal: 6, paddingVertical: 2, borderRadius: 6, borderWidth: 1, maxWidth: 90, flexShrink: 0 },
    rankText: { fontSize: 9, fontFamily: "Inter_600SemiBold", textAlign: "center" },
    stats: { alignItems: "center", flexShrink: 0, minWidth: 34 },
    meritScore: { fontSize: 13, fontFamily: "Inter_700Bold" },
    statNum: { fontSize: 12, fontFamily: "Inter_600SemiBold", color: colors.foreground },
    statLabel: { fontSize: 9, fontFamily: "Inter_400Regular", color: colors.mutedForeground },
  });
}
