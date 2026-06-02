import { useInfiniteQuery } from '@tanstack/react-query';
import { Link } from 'expo-router';
import { SymbolIcon } from '@/components/SymbolIcon';
import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, Spacing } from '@/constants/theme';
import { api } from '@/lib/api';

const CATEGORIES = [
  '全て', 'BIG3', '胸', '背中', '脚', '肩', '腕',
  'サプリ', '食事', '減量', '増量', 'マシン沼', '筋トレあるある',
];

const SORTS = [
  { key: 'hot', label: '勢い' },
  { key: 'new', label: '新着' },
  { key: 'bookmarks', label: 'お気に入り' },
] as const;

type SortKey = 'hot' | 'new' | 'bookmarks';

interface ThreadItem {
  id: string;
  title: string;
  category?: string;
  reply_count: number;
  helpful_total: number;
  created_at: string;
}

async function fetchThreads({
  pageParam,
  sort,
  category,
}: {
  pageParam?: string;
  sort: SortKey;
  category: string;
}) {
  const params: Record<string, string> = { limit: '20' };
  if (pageParam) params.cursor = pageParam;
  if (category !== '全て') params.category = category;

  if (sort === 'bookmarks') {
    const res = await api.get('/api/v1/threads/bookmarks', { params });
    return res.data;
  }

  params.sort = sort;
  const res = await api.get('/api/v1/threads', { params });
  return res.data;
}

function ThreadCard({ item }: { item: ThreadItem }) {
  return (
    <Link href={`/board/${item.id}`} asChild>
      <TouchableOpacity style={styles.card}>
        {item.category && (
          <View style={styles.categoryBadge}>
            <Text style={styles.categoryText}>{item.category}</Text>
          </View>
        )}
        <Text style={styles.threadTitle} numberOfLines={2}>
          {item.title}
        </Text>
        <View style={styles.cardMeta}>
          <View style={styles.metaItem}>
            <SymbolIcon name="bubble.left" ionicon="chatbubble-outline" size={12} tintColor={Colors.textMuted} />
            <Text style={styles.metaCount}>{item.reply_count}</Text>
          </View>
          <View style={styles.metaItem}>
            <SymbolIcon name="hand.thumbsup" ionicon="thumbs-up-outline" size={12} tintColor={Colors.textMuted} />
            <Text style={styles.metaCount}>{item.helpful_total}</Text>
          </View>
          <Text style={styles.metaDate}>
            {new Date(item.created_at).toLocaleDateString('ja-JP')}
          </Text>
        </View>
      </TouchableOpacity>
    </Link>
  );
}

export default function BoardScreen() {
  const [category, setCategory] = useState('全て');
  const [sort, setSort] = useState<SortKey>('hot');

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    useInfiniteQuery({
      queryKey: ['threads', sort, category],
      queryFn: ({ pageParam }) => fetchThreads({ pageParam, sort, category }),
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (page) => page.next_cursor || undefined,
    });

  const threads = data?.pages.flatMap((p) => p.items as ThreadItem[]) ?? [];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>スレッド</Text>
        <Link href="/board/new" asChild>
          <TouchableOpacity style={styles.newBtn}>
            <Text style={styles.newBtnText}>スレ作成</Text>
          </TouchableOpacity>
        </Link>
      </View>

      <View style={styles.categoryWrap}>
        {CATEGORIES.map((cat) => (
          <TouchableOpacity
            key={cat}
            style={[styles.catTab, category === cat && styles.catTabActive]}
            onPress={() => setCategory(cat)}>
            <Text style={[styles.catTabText, category === cat && styles.catTabTextActive]}>
              {cat}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      <View style={styles.sortRow}>
        {SORTS.map((s) => (
          <TouchableOpacity
            key={s.key}
            style={[styles.sortTab, sort === s.key && styles.sortTabActive]}
            onPress={() => setSort(s.key)}>
            <Text style={[styles.sortTabText, sort === s.key && styles.sortTabTextActive]}>
              {s.label}
            </Text>
          </TouchableOpacity>
        ))}
      </View>

      {isLoading ? (
        <ActivityIndicator color={Colors.pink} style={styles.loader} />
      ) : (
        <FlatList
          data={threads}
          keyExtractor={(item) => item.id}
          onEndReached={() => hasNextPage && fetchNextPage()}
          onEndReachedThreshold={0.3}
          contentContainerStyle={styles.listContent}
          ListFooterComponent={
            isFetchingNextPage ? <ActivityIndicator color={Colors.pink} style={styles.loader} /> : null
          }
          renderItem={({ item }) => <ThreadCard item={item} />}
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
    borderBottomColor: Colors.pink,
  },
  title: { fontSize: 22, fontWeight: 'bold', color: Colors.textPrimary },
  newBtn: {
    backgroundColor: Colors.hotPink,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: 20,
  },
  newBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },

  categoryWrap: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    gap: Spacing.one,
  },
  catTab: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.lightCyan,
    backgroundColor: Colors.surface,
  },
  catTabActive: { backgroundColor: Colors.pink, borderColor: Colors.pink },
  catTabText: { color: Colors.textSecondary, fontSize: 12, fontWeight: '600' },
  catTabTextActive: { color: '#fff' },

  sortRow: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: Colors.lightCyan,
    backgroundColor: Colors.surface,
  },
  sortTab: { flex: 1, paddingVertical: Spacing.two, alignItems: 'center' },
  sortTabActive: { borderBottomWidth: 2, borderBottomColor: Colors.hotPink },
  sortTabText: { color: Colors.textMuted, fontSize: 13, fontWeight: '600' },
  sortTabTextActive: { color: Colors.hotPink },

  loader: { marginTop: Spacing.five },
  listContent: { paddingTop: Spacing.two },

  card: {
    backgroundColor: Colors.surface,
    marginHorizontal: Spacing.two,
    marginBottom: Spacing.two,
    padding: Spacing.three,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.lightCyan,
  },
  categoryBadge: {
    backgroundColor: Colors.surfacePink,
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
    borderRadius: 8,
    marginBottom: Spacing.one,
  },
  categoryText: { color: Colors.hotPink, fontSize: 11, fontWeight: 'bold' },
  threadTitle: { color: Colors.textPrimary, fontSize: 15, fontWeight: '600', lineHeight: 22 },
  cardMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.one,
    gap: Spacing.two,
  },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaCount: { color: Colors.textMuted, fontSize: 12 },
  metaDate: { color: Colors.textMuted, fontSize: 11, marginLeft: 'auto' },
});
