import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { type BodyPart } from '@/constants/exercises';
import { FilterChipRow } from '@/components/FilterChipRow';
import { Colors, Spacing } from '@/constants/theme';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import { useExerciseCatalog } from '@/hooks/use-exercise-catalog';
import { orderedBodyParts } from '@/lib/custom-body-parts';
import { availableBodyParts, bodyPartOf } from '@/utils/exercise-category';

interface ExerciseSummaryItem {
  exercise_name: string;
  last_trained_on: string;
  session_count: number;
  best_e1rm: number;
}

const ALL = 'すべて' as const;

export default function ExerciseListScreen() {
  const router = useRouter();
  const [filter, setFilter] = useState<BodyPart | typeof ALL>(ALL);
  const [search, setSearch] = useState('');
  const { exercises: customExercises, bodyParts: customBodyParts } = useExerciseCatalog();

  const { data, isLoading } = useQuery<{ items: ExerciseSummaryItem[] }>({
    queryKey: queryKeys.exercises.list(),
    queryFn: () => api.get('/api/v1/workouts/exercises').then((r) => r.data),
  });

  const items = useMemo(() => data?.items ?? [], [data]);

  // Only offer chips for parts the user actually has records in — the full list would be
  // mostly dead options.
  const chips = useMemo(
    () => [
      ALL,
      ...availableBodyParts(items.map((i) => i.exercise_name), customExercises, customBodyParts),
    ],
    [items, customExercises, customBodyParts]
  );

  const visible = useMemo(
    () =>
      items.filter((i) => {
        const matchesPart =
          filter === ALL ||
          bodyPartOf(i.exercise_name, customExercises, orderedBodyParts(customBodyParts)) === filter;
        const matchesSearch = search === '' || i.exercise_name.includes(search);
        return matchesPart && matchesSearch;
      }),
    [items, filter, search, customExercises, customBodyParts]
  );

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.backBtn} onPress={() => router.back()}>
          ← 戻る
        </Text>
        <Text style={styles.title}>種目別の推移</Text>
        <View style={styles.headerSpacer} />
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.pink} />
        </View>
      ) : items.length === 0 ? (
        <View style={styles.center}>
          <Text style={styles.emptyText}>まだ記録がありません</Text>
        </View>
      ) : (
        <>
          <TextInput
            style={styles.search}
            value={search}
            onChangeText={setSearch}
            placeholder="種目名で検索"
            placeholderTextColor={Colors.textMuted}
            clearButtonMode="while-editing"
          />

          <FilterChipRow
            options={chips.map((c) => ({ value: c, label: c }))}
            value={filter}
            onChange={setFilter}
          />

          <FlatList
            data={visible}
            keyExtractor={(item) => item.exercise_name}
            contentContainerStyle={styles.listContent}
            ListEmptyComponent={
              <Text style={styles.emptyText}>該当する種目がありません</Text>
            }
            renderItem={({ item }) => (
              <TouchableOpacity
                style={styles.row}
                onPress={() =>
                  router.push(`/record/exercise/${encodeURIComponent(item.exercise_name)}`)
                }>
                <View style={styles.rowBody}>
                  <View style={styles.rowTop}>
                    <Text style={styles.rowName}>{item.exercise_name}</Text>
                    <View style={styles.partTag}>
                      <Text style={styles.partTagText}>{bodyPartOf(item.exercise_name, customExercises)}</Text>
                    </View>
                  </View>
                  <Text style={styles.rowMeta}>
                    {item.last_trained_on} ・ {item.session_count}回
                    {item.best_e1rm > 0 ? ` ・ 最高 ${item.best_e1rm.toFixed(1)}kg` : ''}
                  </Text>
                </View>
                <Text style={styles.chevron}>›</Text>
              </TouchableOpacity>
            )}
          />
        </>
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderBottomWidth: 2,
    borderBottomColor: Colors.cyan,
  },
  backBtn: { color: Colors.pink, fontSize: 15, width: 60 },
  title: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: 'bold', color: Colors.textPrimary },
  headerSpacer: { width: 60 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  emptyText: { color: Colors.textMuted, fontSize: 13, marginTop: Spacing.four },

  search: {
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.lightCyan,
    borderRadius: 12,
    marginHorizontal: Spacing.three,
    marginTop: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    color: Colors.textPrimary,
    fontSize: 14,
  },


  listContent: { padding: Spacing.three, gap: Spacing.two },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.lightCyan,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  rowBody: { flex: 1 },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  rowName: { color: Colors.textPrimary, fontSize: 15, fontWeight: '600' },
  partTag: {
    backgroundColor: Colors.surfacePink,
    paddingHorizontal: Spacing.two,
    paddingVertical: 1,
    borderRadius: 8,
  },
  partTagText: { color: Colors.hotPink, fontSize: 10, fontWeight: 'bold' },
  rowMeta: { color: Colors.textMuted, fontSize: 11, marginTop: 2 },
  chevron: { color: Colors.textMuted, fontSize: 20 },
});
