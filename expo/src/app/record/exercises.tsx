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
import { UNCLASSIFIED_LABEL } from '@/lib/exercise-filter';

interface ExerciseSummaryItem {
  exercise_name: string;
  /** From the record itself, not guessed from the catalog. Empty means not classified yet. */
  body_part: string;
  last_trained_on: string;
  session_count: number;
  best_e1rm: number;
}

const ALL = 'すべて' as const;
/** The chip for records with no body part. Its own option, or they would be unreachable. */
const UNCLASSIFIED = UNCLASSIFIED_LABEL;

export default function ExerciseListScreen() {
  const router = useRouter();
  const [filter, setFilter] = useState<BodyPart | typeof ALL>(ALL);
  const [search, setSearch] = useState('');
  const { bodyParts: customBodyParts } = useExerciseCatalog();

  const { data, isLoading } = useQuery<{ items: ExerciseSummaryItem[] }>({
    queryKey: queryKeys.exercises.list(),
    queryFn: () => api.get('/api/v1/workouts/exercises').then((r) => r.data),
  });

  const items = useMemo(() => data?.items ?? [], [data]);

  // Taken from the records rather than looked up in the catalog. The record is what the
  // graph is built from, and the catalog can disagree with it — an exercise refiled since,
  // or one whose custom entry was deleted, would otherwise be filtered into a chip its own
  // history does not sit under.
  const chips = useMemo(() => {
    const present = new Set(items.map((i) => i.body_part));
    const ordered = orderedBodyParts(customBodyParts).filter((p) => present.has(p));
    // The unclassified entry gets a chip of its own so it can be found at all.
    return present.has('') ? [ALL, ...ordered, UNCLASSIFIED] : [ALL, ...ordered];
  }, [items, customBodyParts]);

  const visible = useMemo(
    () =>
      items.filter((i) => {
        const matchesPart =
          filter === ALL ||
          (filter === UNCLASSIFIED ? i.body_part === '' : i.body_part === filter);
        const matchesSearch = search === '' || i.exercise_name.includes(search);
        return matchesPart && matchesSearch;
      }),
    [items, filter, search]
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
                  router.push({
                    pathname: '/record/exercise/[name]',
                    params: { name: item.exercise_name, bodyPart: item.body_part },
                  })
                }>
                <View style={styles.rowBody}>
                  <View style={styles.rowTop}>
                    <Text style={styles.rowName}>{item.exercise_name}</Text>
                    <View style={styles.partTag}>
                      <Text style={styles.partTagText}>{item.body_part || UNCLASSIFIED}</Text>
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
