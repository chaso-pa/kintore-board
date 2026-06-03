import { useInfiniteQuery } from '@tanstack/react-query';
import { Link } from 'expo-router';
import { useState, memo } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SymbolIcon } from '@/components/SymbolIcon';
import { api } from '@/lib/api';
import { Colors, Spacing } from '@/constants/theme';

interface GymItem {
  id: string;
  name: string;
  address?: string;
  visitor_fee?: number;
  visitor_available: boolean;
  has_parking: boolean;
  has_shower: boolean;
  has_locker_room: boolean;
  machine_count: number;
  thumbnail_url?: string;
}

const GymThumb = memo(({ uri }: { uri?: string }) => {
  const [failed, setFailed] = useState(false);
  if (uri && !failed) {
    return (
      <Image
        source={{ uri }}
        style={styles.thumbnail}
        resizeMode="cover"
        onError={() => setFailed(true)}
      />
    );
  }
  return <View style={styles.thumbnailPlaceholder} />;
});

const FACILITY_TAGS: { key: keyof GymItem; label: string }[] = [
  { key: 'visitor_available', label: 'ビジター可' },
  { key: 'has_parking', label: '駐車場' },
  { key: 'has_shower', label: 'シャワー' },
  { key: 'has_locker_room', label: '更衣室' },
];

async function fetchGyms({ pageParam, search }: { pageParam?: string; search: string }) {
  const params: Record<string, string> = { limit: '20' };
  if (pageParam) params.cursor = pageParam;
  if (search) params.search = search;
  const res = await api.get('/api/v1/gyms', { params });
  return res.data;
}

export default function GymScreen() {
  const [search, setSearch] = useState('');

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    useInfiniteQuery({
      queryKey: ['gyms', search],
      queryFn: ({ pageParam }) => fetchGyms({ pageParam, search }),
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (page) => page.next_cursor || undefined,
    });

  const gyms = data?.pages.flatMap((p) => p.items as GymItem[]) ?? [];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>ジム</Text>
        <Link href="/gym/new" asChild>
          <TouchableOpacity style={styles.newBtn}>
            <Text style={styles.newBtnText}>登録</Text>
          </TouchableOpacity>
        </Link>
      </View>

      <View style={styles.searchWrap}>
        <SymbolIcon name="magnifyingglass" ionicon="search-outline" size={16} tintColor={Colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="ジム名で検索"
          placeholderTextColor={Colors.textMuted}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
      </View>

      {isLoading ? (
        <ActivityIndicator color={Colors.pink} style={styles.loader} />
      ) : (
        <FlatList
          data={gyms}
          keyExtractor={(item) => item.id}
          onEndReached={() => hasNextPage && fetchNextPage()}
          onEndReachedThreshold={0.3}
          contentContainerStyle={styles.listContent}
          ListFooterComponent={isFetchingNextPage ? <ActivityIndicator color={Colors.pink} /> : null}
          renderItem={({ item }) => (
            <Link href={`/gym/${item.id}`} asChild>
              <TouchableOpacity style={styles.card}>
                <View style={styles.thumbWrap}>
                  <GymThumb uri={item.thumbnail_url} />
                </View>
                <View style={styles.cardBody}>
                  <View style={styles.cardTop}>
                    <Text style={styles.gymName} numberOfLines={2}>{item.name}</Text>
                    {item.machine_count > 0 && (
                      <View style={styles.machineBadge}>
                        <Text style={styles.machineBadgeText}>マシン {item.machine_count}台</Text>
                      </View>
                    )}
                  </View>
                  {item.address && <Text style={styles.address} numberOfLines={1}>{item.address}</Text>}
                  <View style={styles.row}>
                    {item.visitor_fee != null && (
                      <Text style={styles.fee}>ビジター ¥{item.visitor_fee.toLocaleString()}</Text>
                    )}
                  </View>
                  <View style={styles.tagRow}>
                    {FACILITY_TAGS.filter((t) => item[t.key]).map((t) => (
                      <View key={t.key} style={styles.facilityTag}>
                        <Text style={styles.facilityTagText}>{t.label}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              </TouchableOpacity>
            </Link>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.three,
    borderBottomWidth: 2,
    borderBottomColor: Colors.cyan,
  },
  title: { fontSize: 22, fontWeight: 'bold', color: Colors.textPrimary },
  newBtn: {
    backgroundColor: Colors.cyan,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: 20,
  },
  newBtnText: { color: Colors.textPrimary, fontWeight: 'bold', fontSize: 13 },

  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    margin: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.lightCyan,
  },
  searchInput: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: 14,
  },

  loader: { marginTop: Spacing.five },
  listContent: { paddingTop: Spacing.one },

  card: {
    backgroundColor: Colors.surface,
    margin: Spacing.two,
    padding: Spacing.two,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.lightCyan,
    flexDirection: 'row',
    gap: Spacing.two,
  },
  thumbWrap: { flexShrink: 0 },
  thumbnail: { width: 72, height: 72, borderRadius: 8 },
  thumbnailPlaceholder: {
    width: 72,
    height: 72,
    borderRadius: 8,
    backgroundColor: Colors.surfaceBlue,
  },
  cardBody: { flex: 1, gap: 2 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  gymName: { color: Colors.textPrimary, fontSize: 16, fontWeight: '700', flex: 1 },
  machineBadge: {
    backgroundColor: Colors.surfaceBlue,
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
    borderRadius: 8,
    marginLeft: Spacing.one,
  },
  machineBadgeText: { color: Colors.cyan, fontSize: 11, fontWeight: 'bold' },
  address: { color: Colors.textSecondary, fontSize: 12, marginTop: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, marginTop: Spacing.one },
  fee: { color: Colors.hotPink, fontWeight: 'bold', fontSize: 14 },

  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one, marginTop: Spacing.one },
  facilityTag: {
    backgroundColor: Colors.surfacePink,
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
    borderRadius: 8,
  },
  facilityTagText: { color: Colors.hotPink, fontSize: 11, fontWeight: '600' },
});
