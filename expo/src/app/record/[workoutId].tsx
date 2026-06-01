import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, Spacing } from '@/constants/theme';
import { api } from '@/lib/api';

type SetItem = {
  id: string;
  exercise_name: string;
  weight: number;
  reps: number;
  sets: number;
  memo?: string;
};

type WorkoutDetail = {
  id: string;
  trained_on: string;
  memo?: string;
  sets: SetItem[];
};

export default function WorkoutDetailScreen() {
  const { workoutId } = useLocalSearchParams<{ workoutId: string }>();
  const router = useRouter();

  const { data, isLoading } = useQuery<WorkoutDetail>({
    queryKey: ['workout', workoutId],
    queryFn: () => api.get(`/api/v1/workouts/${workoutId}`).then(r => r.data),
  });

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
        <View style={{ width: 60 }} />
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.pink} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          {data?.memo ? <Text style={styles.memo}>{data.memo}</Text> : null}

          {data?.sets.length === 0 && (
            <Text style={styles.empty}>種目がありません</Text>
          )}

          {data?.sets.map((s, i) => (
            <View key={s.id} style={styles.setCard}>
              <Text style={styles.setName}>{s.exercise_name}</Text>
              <View style={styles.numRow}>
                <View style={styles.numCol}>
                  <Text style={styles.numVal}>{s.weight > 0 ? s.weight : '—'}</Text>
                  <Text style={styles.numLabel}>重量(kg)</Text>
                </View>
                <View style={styles.numCol}>
                  <Text style={styles.numVal}>{s.reps > 0 ? s.reps : '—'}</Text>
                  <Text style={styles.numLabel}>回数</Text>
                </View>
                <View style={styles.numCol}>
                  <Text style={styles.numVal}>{s.sets}</Text>
                  <Text style={styles.numLabel}>セット</Text>
                </View>
              </View>
              {s.memo ? <Text style={styles.setMemo}>{s.memo}</Text> : null}
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
  title: { fontSize: 15, fontWeight: 'bold', color: Colors.textPrimary, flex: 1, textAlign: 'center' },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  scroll: { padding: Spacing.three, gap: Spacing.two, paddingBottom: Spacing.six },
  memo: {
    color: Colors.textSecondary,
    fontSize: 14,
    backgroundColor: Colors.surfacePink,
    borderRadius: 8,
    padding: Spacing.two,
    marginBottom: Spacing.one,
  },
  empty: { color: Colors.textMuted, textAlign: 'center', marginTop: Spacing.five },
  setCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: Spacing.three,
    shadowColor: Colors.pink,
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  setName: { fontSize: 16, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: Spacing.two },
  numRow: { flexDirection: 'row' },
  numCol: { flex: 1, alignItems: 'center' },
  numVal: { fontSize: 26, fontWeight: 'bold', color: Colors.hotPink },
  numLabel: { fontSize: 11, color: Colors.textMuted, marginTop: 2 },
  setMemo: { color: Colors.textMuted, fontSize: 13, marginTop: Spacing.one },
});
