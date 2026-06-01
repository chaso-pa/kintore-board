import { useInfiniteQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { FlatList, StyleSheet, Text, TouchableOpacity, View, Pressable } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, Spacing } from '@/constants/theme';
import { api } from '@/lib/api';

type WorkoutItem = {
  id: string;
  trained_on: string;
  memo: string;
};

type WorkoutsPage = {
  items: WorkoutItem[];
  next_cursor?: string;
};

export default function RecordScreen() {
  const router = useRouter();
  const { data, fetchNextPage, hasNextPage, isFetching } = useInfiniteQuery<WorkoutsPage>({
    queryKey: ['workouts'],
    queryFn: ({ pageParam }) =>
      api.get('/api/v1/workouts', { params: { cursor: pageParam, limit: 20 } }).then(r => r.data),
    getNextPageParam: (last) => last.next_cursor || undefined,
    initialPageParam: '',
  });

  const workouts = data?.pages.flatMap(p => p.items) ?? [];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>記録</Text>
        <TouchableOpacity style={styles.newBtn} onPress={() => router.push('/record/new')}>
          <Text style={styles.newBtnText}>+ 追加</Text>
        </TouchableOpacity>
      </View>
      {workouts.length === 0 && !isFetching ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>今日のトレーニングを記録しよう</Text>
        </View>
      ) : (
        <FlatList
          data={workouts}
          keyExtractor={item => item.id}
          onEndReached={() => hasNextPage && fetchNextPage()}
          onEndReachedThreshold={0.5}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Pressable style={styles.card} onPress={() => router.push(`/record/${item.id}`)}>
              <Text style={styles.cardDate}>
                {new Date(item.trained_on).toLocaleDateString('ja-JP', {
                  year: 'numeric',
                  month: 'long',
                  day: 'numeric',
                })}
              </Text>
              {item.memo ? <Text style={styles.cardMemo}>{item.memo}</Text> : null}
            </Pressable>
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
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: Colors.textMuted, fontSize: 15 },
  list: { padding: Spacing.three, gap: Spacing.two },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: Spacing.three,
    shadowColor: '#000',
    shadowOpacity: 0.06,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardDate: { fontSize: 16, fontWeight: 'bold', color: Colors.textPrimary },
  cardMemo: { fontSize: 13, color: Colors.textMuted, marginTop: 4 },
});
