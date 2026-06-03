import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, Spacing } from '@/constants/theme';
import { api } from '@/lib/api';
import { estimateOneRM } from '@/utils/rm';

type SetItem = {
  id: string;
  exercise_name: string;
  weight: number;
  reps: number;
  sets: number;
  memo?: string;
  spotted?: boolean;
};

type WorkoutDetail = {
  id: string;
  trained_on: string;
  memo?: string;
  sets: SetItem[];
};

type ExerciseGroup = { name: string; sets: SetItem[] };

function groupByExercise(sets: SetItem[]): ExerciseGroup[] {
  const order: string[] = [];
  const map: Record<string, SetItem[]> = {};
  for (const s of sets) {
    if (!map[s.exercise_name]) {
      order.push(s.exercise_name);
      map[s.exercise_name] = [];
    }
    map[s.exercise_name].push(s);
  }
  return order.map(name => ({ name, sets: map[name] }));
}

export default function WorkoutDetailScreen() {
  const { workoutId } = useLocalSearchParams<{ workoutId: string }>();
  const router = useRouter();

  const { data, isLoading } = useQuery<WorkoutDetail>({
    queryKey: ['workout', workoutId],
    queryFn: () => api.get(`/api/v1/workouts/${workoutId}`).then(r => r.data),
  });

  const groups = data ? groupByExercise(data.sets) : [];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.backBtn} onPress={() => router.back()}>
          ← 戻る
        </Text>
        <Text style={styles.title}>
          {data
            ? new Date(data.trained_on).toLocaleDateString('ja-JP', {
              year: 'numeric',
              month: 'long',
              day: 'numeric',
            })
            : '記録詳細'}
        </Text>
        <TouchableOpacity onPress={() => router.push(`/record/edit/${workoutId}` as never)}>
          <Text style={styles.editBtn}>編集</Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.pink} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          {data?.memo ? <Text style={styles.memo}>{data.memo}</Text> : null}

          {groups.length === 0 && (
            <Text style={styles.empty}>種目がありません</Text>
          )}

          {groups.map(group => (
            <View key={group.name} style={styles.exerciseCard}>
              <Text style={styles.exerciseName}>{group.name}</Text>

              <View style={styles.tableHeader}>
                <Text style={[styles.colSet, styles.headerText]}>SET</Text>
                <Text style={[styles.colWeight, styles.headerText]}>重量</Text>
                <Text style={[styles.colReps, styles.headerText]}>回数</Text>
                <Text style={[styles.colRm, styles.headerText]}>1RM</Text>
                <Text style={[styles.colSpotted, styles.headerText]}>補</Text>
              </View>

              {group.sets.map((s, i) => {
                const rm = estimateOneRM(s.weight, s.reps);
                return (
                  <View key={s.id}>
                    <View style={styles.tableRow}>
                      <Text style={[styles.colSet, styles.setNum]}>{i + 1}</Text>
                      <Text style={[styles.colWeight, styles.setVal]}>
                        {s.weight > 0 ? `${s.weight}kg` : '—'}
                      </Text>
                      <Text style={[styles.colReps, styles.setVal]}>
                        {s.reps > 0 ? `${s.reps}回` : '—'}
                      </Text>
                      <Text style={[styles.colRm, styles.rmVal]}>
                        {rm !== null ? `${rm.toFixed(1)}` : '—'}
                      </Text>
                      <Text style={[styles.colSpotted, styles.spottedCheck]}>
                        {s.spotted ? '✓' : ''}
                      </Text>
                    </View>
                    {s.memo ? (
                      <View style={styles.flagRow}>
                        <Text style={styles.setMemo}>{s.memo}</Text>
                      </View>
                    ) : null}
                  </View>
                );
              })}
            </View>
          ))}
        </ScrollView>
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
    padding: Spacing.three,
    borderBottomWidth: 1,
    borderBottomColor: '#E8D5E8',
  },
  backBtn: { color: Colors.pink, fontSize: 15, width: 60 },
  editBtn: { color: Colors.hotPink, fontSize: 15, fontWeight: '600', width: 40, textAlign: 'right' },
  title: { fontSize: 15, fontWeight: 'bold', color: Colors.textPrimary, flex: 1, textAlign: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: Spacing.three, gap: Spacing.two, paddingBottom: Spacing.six },
  memo: {
    color: Colors.textSecondary,
    fontSize: 14,
    backgroundColor: Colors.surfacePink,
    borderRadius: 8,
    padding: Spacing.two,
  },
  empty: { color: Colors.textMuted, textAlign: 'center', marginTop: Spacing.five },
  exerciseCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: Spacing.three,
    shadowColor: Colors.pink,
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  exerciseName: { fontSize: 16, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: Spacing.two },
  tableHeader: {
    flexDirection: 'row',
    borderBottomWidth: 1,
    borderBottomColor: '#F0EAF8',
    paddingBottom: 4,
    marginBottom: 4,
  },
  headerText: { fontSize: 11, color: Colors.textMuted, fontWeight: '600' },
  tableRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: 5 },
  colSet: { width: 28, textAlign: 'center' },
  colWeight: { flex: 2, textAlign: 'center' },
  colReps: { flex: 2, textAlign: 'center' },
  colRm: { flex: 1.5, textAlign: 'right' },
  colSpotted: { width: 28, textAlign: 'center' },
  setNum: { fontSize: 13, fontWeight: 'bold', color: Colors.hotPink },
  setVal: { fontSize: 16, fontWeight: '600', color: Colors.textPrimary },
  rmVal: { fontSize: 11, color: Colors.cyan, fontWeight: '600' },
  spottedCheck: { fontSize: 13, color: Colors.cyan, fontWeight: 'bold' },
  flagRow: { paddingLeft: 32, paddingBottom: 2 },
  setMemo: { color: Colors.textMuted, fontSize: 12, flex: 1 },
});
