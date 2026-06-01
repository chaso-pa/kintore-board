import { useInfiniteQuery } from '@tanstack/react-query';
import { Link } from 'expo-router';
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '@/lib/api';
import { Colors, Spacing } from '@/constants/theme';

interface ThreadItem {
  id: string;
  type: string;
  title: string;
  category?: string;
  created_at: string;
}

async function fetchThreads({ pageParam }: { pageParam?: string }) {
  const params: Record<string, string> = { limit: '20' };
  if (pageParam) params.cursor = pageParam;
  const res = await api.get('/api/v1/threads', { params });
  return res.data;
}

export default function BoardScreen() {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    useInfiniteQuery({
      queryKey: ['threads'],
      queryFn: fetchThreads,
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (page) => page.next_cursor || undefined,
    });

  const threads = data?.pages.flatMap((p) => p.items as ThreadItem[]) ?? [];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>板</Text>
        <Link href="/board/new" asChild>
          <TouchableOpacity style={styles.newBtn}>
            <Text style={styles.newBtnText}>スレ作成</Text>
          </TouchableOpacity>
        </Link>
      </View>

      {isLoading ? (
        <ActivityIndicator color={Colors.pink} style={styles.loader} />
      ) : (
        <FlatList
          data={threads}
          keyExtractor={(item) => item.id}
          onEndReached={() => hasNextPage && fetchNextPage()}
          onEndReachedThreshold={0.3}
          ListFooterComponent={isFetchingNextPage ? <ActivityIndicator color={Colors.pink} /> : null}
          renderItem={({ item }) => (
            <Link href={`/board/${item.id}`} asChild>
              <TouchableOpacity style={styles.card}>
                {item.category && (
                  <View style={styles.categoryBadge}>
                    <Text style={styles.categoryText}>{item.category}</Text>
                  </View>
                )}
                <Text style={styles.threadTitle}>{item.title}</Text>
                <Text style={styles.meta}>{new Date(item.created_at).toLocaleDateString('ja-JP')}</Text>
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
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.three, borderBottomWidth: 2, borderBottomColor: Colors.pink },
  title: { fontSize: 22, fontWeight: 'bold', color: Colors.textPrimary },
  newBtn: { backgroundColor: Colors.hotPink, paddingHorizontal: Spacing.three, paddingVertical: Spacing.one, borderRadius: 20 },
  newBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
  loader: { marginTop: Spacing.five },
  card: { backgroundColor: Colors.surface, margin: Spacing.two, padding: Spacing.three, borderRadius: 12, borderWidth: 2, borderColor: Colors.lightCyan },
  categoryBadge: { backgroundColor: Colors.surfacePink, alignSelf: 'flex-start', paddingHorizontal: Spacing.two, paddingVertical: 2, borderRadius: 8, marginBottom: Spacing.one },
  categoryText: { color: Colors.hotPink, fontSize: 11, fontWeight: 'bold' },
  threadTitle: { color: Colors.textPrimary, fontSize: 15, fontWeight: '600' },
  meta: { color: Colors.textMuted, fontSize: 11, marginTop: Spacing.one },
});
