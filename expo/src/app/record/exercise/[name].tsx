import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useMemo, useState } from 'react';
import {
  ActivityIndicator,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ExerciseChart } from '@/components/record/ExerciseChart';
import {
  deriveDisplayState,
  type ExerciseHistoryPoint,
  type MetricType,
  type Period,
} from '@/components/record/chart-scale';
import { Colors, Spacing } from '@/constants/theme';
import { api } from '@/lib/api';
import { exerciseHistoryQueryKey } from '@/lib/query-keys';

interface HistoryResponse {
  exercise_name: string;
  has_weight_data: boolean;
  points: ExerciseHistoryPoint[];
}

const METRICS: { key: MetricType; label: string }[] = [
  { key: 'e1rm', label: '推定1RM' },
  { key: 'max_weight', label: '最大重量' },
  { key: 'total_volume', label: 'ボリューム' },
];

const PERIODS: { key: Period; label: string }[] = [
  { key: '3m', label: '3ヶ月' },
  { key: '6m', label: '6ヶ月' },
  { key: '1y', label: '1年' },
  { key: 'all', label: '全期間' },
];

export default function ExerciseHistoryScreen() {
  const router = useRouter();
  const { name } = useLocalSearchParams<{ name: string }>();
  const exerciseName = name ?? '';

  const [metric, setMetric] = useState<MetricType>('e1rm');
  const [period, setPeriod] = useState<Period>('6m');
  const [selectedDate, setSelectedDate] = useState<string | null>(null);

  // The key intentionally excludes metric and period: the response already carries every
  // metric for the whole history, so both toggles are local and never refetch.
  const { data, isLoading } = useQuery<HistoryResponse>({
    queryKey: exerciseHistoryQueryKey(exerciseName),
    queryFn: async () => {
      const res = await api.get('/api/v1/workouts/exercise-history', {
        params: { exercise_name: exerciseName },
      });
      return res.data;
    },
    enabled: exerciseName.length > 0,
  });

  const display = useMemo(
    () => deriveDisplayState(data?.points ?? [], data?.has_weight_data ?? false, period),
    [data, period]
  );

  const activeMetric: MetricType = display.mode === 'reps' ? 'max_reps' : metric;
  const selected = display.drawable.find((p) => p.date === selectedDate) ?? null;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.backBtn} onPress={() => router.back()}>
          ← 戻る
        </Text>
        <Text style={styles.title} numberOfLines={1}>
          {exerciseName}
        </Text>
        <View style={styles.headerSpacer} />
      </View>

      {isLoading ? (
        <View style={styles.center}>
          <ActivityIndicator color={Colors.pink} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.scroll}>
          {display.mode === 'reps' ? (
            <View style={styles.repsNotice}>
              <Text style={styles.repsNoticeText}>
                重量の記録がない種目のため、最高レップ数の推移を表示しています
              </Text>
            </View>
          ) : (
            <View style={styles.tabRow}>
              {METRICS.map((m) => (
                <TouchableOpacity
                  key={m.key}
                  style={[styles.tab, metric === m.key && styles.tabActive]}
                  onPress={() => setMetric(m.key)}>
                  <Text style={[styles.tabText, metric === m.key && styles.tabTextActive]}>
                    {m.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>
          )}

          <View style={styles.tabRow}>
            {PERIODS.map((p) => (
              <TouchableOpacity
                key={p.key}
                style={[styles.periodTab, period === p.key && styles.periodTabActive]}
                onPress={() => setPeriod(p.key)}>
                <Text style={[styles.periodText, period === p.key && styles.periodTextActive]}>
                  {p.label}
                </Text>
              </TouchableOpacity>
            ))}
          </View>

          {display.isEmpty ? (
            <View style={styles.emptyCard}>
              <Text style={styles.emptyText}>
                {display.mode === 'weight' && (data?.points.length ?? 0) > 0
                  ? 'この期間に重量ありの記録がありません'
                  : 'この期間に記録がありません'}
              </Text>
            </View>
          ) : (
            <ExerciseChart
              points={display.drawable}
              metric={activeMetric}
              selectedDate={selectedDate}
              onSelectPoint={(p) => setSelectedDate(p.date)}
            />
          )}

          {selected && (
            <View style={styles.detailCard}>
              <Text style={styles.detailDate}>{selected.date} のセット</Text>
              {selected.sets.map((s, i) => (
                <View key={`${s.workout_id}-${i}`} style={styles.setRow}>
                  <Text style={styles.setIndex}>{i + 1}</Text>
                  <Text style={styles.setBody}>
                    {s.weight > 0 ? `${s.weight}kg × ${s.reps}回` : `自重 × ${s.reps}回`}
                    {s.sets > 1 ? ` × ${s.sets}セット` : ''}
                  </Text>
                  {s.spotted && <Text style={styles.spotted}>補助</Text>}
                </View>
              ))}
              {selected.workout_ids.length > 1 && (
                <Text style={styles.multiWorkout}>
                  この日は {selected.workout_ids.length} 回に分けて記録されています
                </Text>
              )}
            </View>
          )}

          {!display.isEmpty && !selected && (
            <Text style={styles.hint}>グラフの点をタップするとその日のセットが見られます</Text>
          )}
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
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderBottomWidth: 2,
    borderBottomColor: Colors.cyan,
  },
  backBtn: { color: Colors.pink, fontSize: 15, width: 60 },
  title: { flex: 1, textAlign: 'center', fontSize: 17, fontWeight: 'bold', color: Colors.textPrimary },
  headerSpacer: { width: 60 },
  center: { flex: 1, justifyContent: 'center', alignItems: 'center' },
  scroll: { padding: Spacing.three, gap: Spacing.two },

  tabRow: { flexDirection: 'row', gap: Spacing.one },
  tab: {
    flex: 1,
    paddingVertical: Spacing.two,
    borderRadius: 10,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.lightCyan,
    alignItems: 'center',
  },
  tabActive: { backgroundColor: Colors.hotPink, borderColor: Colors.hotPink },
  tabText: { color: Colors.textSecondary, fontSize: 13, fontWeight: '600' },
  tabTextActive: { color: Colors.surface },

  periodTab: { flex: 1, paddingVertical: Spacing.one, borderRadius: 8, alignItems: 'center' },
  periodTabActive: { backgroundColor: Colors.surfaceBlue },
  periodText: { color: Colors.textMuted, fontSize: 12 },
  periodTextActive: { color: Colors.cyan, fontWeight: 'bold' },

  repsNotice: { backgroundColor: Colors.surfaceBlue, padding: Spacing.two, borderRadius: 10 },
  repsNoticeText: { color: Colors.textSecondary, fontSize: 12 },

  emptyCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.lightCyan,
    padding: Spacing.five,
    alignItems: 'center',
  },
  emptyText: { color: Colors.textMuted, fontSize: 13 },

  detailCard: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.lightCyan,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  detailDate: { color: Colors.textPrimary, fontWeight: 'bold', fontSize: 14, marginBottom: Spacing.one },
  setRow: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  setIndex: { color: Colors.textMuted, fontSize: 12, width: 20 },
  setBody: { flex: 1, color: Colors.textPrimary, fontSize: 14 },
  spotted: { color: Colors.cyan, fontSize: 11, fontWeight: 'bold' },
  multiWorkout: { color: Colors.textMuted, fontSize: 11, marginTop: Spacing.one },

  hint: { color: Colors.textMuted, fontSize: 12, textAlign: 'center', marginTop: Spacing.one },
});
