import { useInfiniteQuery } from '@tanstack/react-query';
import { Link } from 'expo-router';
import { ActivityIndicator, FlatList, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '@/lib/api';
import { Colors, Spacing } from '@/constants/theme';

interface GymItem {
  id: string;
  name: string;
  address?: string;
  visitor_fee?: number;
  visitor_available: boolean;
}

async function fetchGyms({ pageParam }: { pageParam?: string }) {
  const params: Record<string, string> = { limit: '20' };
  if (pageParam) params.cursor = pageParam;
  const res = await api.get('/api/v1/gyms', { params });
  return res.data;
}

export default function GymScreen() {
  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    useInfiniteQuery({
      queryKey: ['gyms'],
      queryFn: fetchGyms,
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

      {isLoading ? (
        <ActivityIndicator color={Colors.pink} style={styles.loader} />
      ) : (
        <FlatList
          data={gyms}
          keyExtractor={(item) => item.id}
          onEndReached={() => hasNextPage && fetchNextPage()}
          onEndReachedThreshold={0.3}
          ListFooterComponent={isFetchingNextPage ? <ActivityIndicator color={Colors.pink} /> : null}
          renderItem={({ item }) => (
            <Link href={`/gym/${item.id}`} asChild>
              <TouchableOpacity style={styles.card}>
                <Text style={styles.gymName}>{item.name}</Text>
                {item.address && <Text style={styles.address}>{item.address}</Text>}
                <View style={styles.row}>
                  {item.visitor_fee != null && (
                    <Text style={styles.fee}>ビジター ¥{item.visitor_fee.toLocaleString()}</Text>
                  )}
                  {item.visitor_available && (
                    <View style={styles.visitorBadge}>
                      <Text style={styles.visitorText}>ビジター可</Text>
                    </View>
                  )}
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
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.three, borderBottomWidth: 2, borderBottomColor: Colors.cyan },
  title: { fontSize: 22, fontWeight: 'bold', color: Colors.textPrimary },
  newBtn: { backgroundColor: Colors.cyan, paddingHorizontal: Spacing.three, paddingVertical: Spacing.one, borderRadius: 20 },
  newBtnText: { color: Colors.textPrimary, fontWeight: 'bold', fontSize: 13 },
  loader: { marginTop: Spacing.five },
  card: { backgroundColor: Colors.surface, margin: Spacing.two, padding: Spacing.three, borderRadius: 12, borderWidth: 2, borderColor: Colors.lightCyan },
  gymName: { color: Colors.textPrimary, fontSize: 16, fontWeight: '700' },
  address: { color: Colors.textSecondary, fontSize: 12, marginTop: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, marginTop: Spacing.one },
  fee: { color: Colors.hotPink, fontWeight: 'bold', fontSize: 14 },
  visitorBadge: { backgroundColor: Colors.yellowPOP, paddingHorizontal: Spacing.two, paddingVertical: 2, borderRadius: 8 },
  visitorText: { color: Colors.textPrimary, fontSize: 11, fontWeight: 'bold' },
});
