import { useInfiniteQuery } from '@tanstack/react-query';
import { Link, useLocalSearchParams } from 'expo-router';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SymbolIcon } from '@/components/SymbolIcon';
import { api } from '@/lib/api';
import { Colors, Spacing } from '@/constants/theme';
import { queryKeys } from '@/lib/query-keys';

interface ThreadItem {
  id: string;
  title: string;
  category?: string;
  reply_count: number;
  helpful_total: number;
  created_at: string;
}

export default function GymThreadsScreen() {
  const { gymId, machine_id } = useLocalSearchParams<{ gymId: string; machine_id?: string }>();

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    useInfiniteQuery({
      queryKey: queryKeys.threads.forGym(gymId, machine_id),
      queryFn: async ({ pageParam }) => {
        const params: Record<string, string> = { limit: '20', sort: 'new' };
        if (pageParam) params.cursor = pageParam as string;
        if (machine_id) {
          params.machine_id = machine_id;
        } else {
          params.gym_id = gymId;
        }
        const res = await api.get('/api/v1/threads', { params });
        return res.data;
      },
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (page) => page.next_cursor || undefined,
    });

  const threads = data?.pages.flatMap((p) => p.items as ThreadItem[]) ?? [];
  const title = machine_id ? 'マシンのスレッド' : 'ジムのスレッド';

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>{title}</Text>
      </View>

      {isLoading ? (
        <ActivityIndicator color={Colors.pink} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={threads}
          keyExtractor={(item) => item.id}
          onEndReached={() => hasNextPage && fetchNextPage()}
          onEndReachedThreshold={0.3}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <Text style={styles.empty}>スレッドがまだありません</Text>
          }
          ListFooterComponent={
            isFetchingNextPage ? <ActivityIndicator color={Colors.pink} /> : null
          }
          renderItem={({ item }) => (
            <Link href={`/board/${item.id}`} asChild>
              <TouchableOpacity style={styles.card}>
                {item.category && (
                  <View style={styles.categoryBadge}>
                    <Text style={styles.categoryText}>{item.category}</Text>
                  </View>
                )}
                <Text style={styles.threadTitle} numberOfLines={2}>{item.title}</Text>
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
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    padding: Spacing.three,
    borderBottomWidth: 1,
    borderBottomColor: Colors.lightCyan,
  },
  headerTitle: { fontSize: 18, fontWeight: 'bold', color: Colors.textPrimary },
  listContent: { paddingTop: Spacing.two },
  empty: { textAlign: 'center', color: Colors.textMuted, marginTop: 40, fontSize: 14 },
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
    backgroundColor: Colors.surfacePink, alignSelf: 'flex-start',
    paddingHorizontal: Spacing.two, paddingVertical: 2,
    borderRadius: 8, marginBottom: Spacing.one,
  },
  categoryText: { color: Colors.hotPink, fontSize: 11, fontWeight: 'bold' },
  threadTitle: { color: Colors.textPrimary, fontSize: 15, fontWeight: '600', lineHeight: 22 },
  cardMeta: { flexDirection: 'row', alignItems: 'center', marginTop: Spacing.one, gap: Spacing.two },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaCount: { color: Colors.textMuted, fontSize: 12 },
  metaDate: { color: Colors.textMuted, fontSize: 11, marginLeft: 'auto' },
});
