import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Calendar, LocaleConfig, type DateData } from 'react-native-calendars';

import { SafeAreaView } from 'react-native-safe-area-context';

import { SymbolIcon } from '@/components/SymbolIcon';
import { TodaySummaryCard } from '@/components/record/TodaySummaryCard';
import { Colors, Spacing } from '@/constants/theme';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';

LocaleConfig.locales['ja'] = {
  monthNames: ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'],
  monthNamesShort: ['1月','2月','3月','4月','5月','6月','7月','8月','9月','10月','11月','12月'],
  dayNames: ['日曜日','月曜日','火曜日','水曜日','木曜日','金曜日','土曜日'],
  dayNamesShort: ['日','月','火','水','木','金','土'],
  today: '今日',
};
LocaleConfig.defaultLocale = 'ja';

type WorkoutDateEntry = { date: string; workout_id: string };
type WorkoutDetail = {
  // spotted is what makes the summary list every set rather than collapsing the identical
  // ones, so it has to survive the trip from the API.
  sets: {
    exercise_name: string;
    weight: number;
    reps: number;
    sets: number;
    spotted?: boolean;
  }[];
};
type WorkoutStats = { total_workouts: number; total_volume_kg: number };

function toMarkedDates(workouts: WorkoutDateEntry[], today: string) {
  const marks: Record<string, object> = {};
  const workoutDates = new Set(workouts.map(w => w.date));

  for (const w of workouts) {
    const isToday = w.date === today;
    marks[w.date] = {
      customStyles: {
        container: {
          backgroundColor: isToday ? Colors.pink : 'rgba(255, 20, 147, 0.4)',
          borderRadius: 20,
        },
        text: { color: '#fff', fontWeight: 'bold' },
      },
    };
  }

  if (!workoutDates.has(today)) {
    marks[today] = {
      customStyles: {
        container: { backgroundColor: Colors.pink, borderRadius: 20 },
        text: { color: '#fff', fontWeight: 'bold' },
      },
    };
  }

  return marks;
}

interface ExerciseSummaryItem {
  exercise_name: string;
  last_trained_on: string;
  session_count: number;
  best_e1rm: number;
}

export default function RecordScreen() {
  const router = useRouter();
  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const [currentMonth, setCurrentMonth] = useState({
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
  });

  const { data } = useQuery<{ workouts: WorkoutDateEntry[] }>({
    queryKey: queryKeys.workouts.dates(currentMonth.year, currentMonth.month),
    queryFn: () =>
      api
        .get('/api/v1/workouts/dates', { params: { year: currentMonth.year, month: currentMonth.month } })
        .then(r => r.data),
  });

  const { data: stats } = useQuery<WorkoutStats>({
    queryKey: queryKeys.workouts.stats(),
    queryFn: () => api.get('/api/v1/workouts/stats').then(r => r.data),
  });

  const { data: exercises } = useQuery<{ items: ExerciseSummaryItem[] }>({
    queryKey: queryKeys.exercises.list(),
    queryFn: () => api.get('/api/v1/workouts/exercises').then(r => r.data),
  });

  // 追加 always means today, which is not necessarily the month being browsed. Same key as
  // the query above whenever it is, so this costs nothing in the usual case.
  const { data: thisMonthData } = useQuery<{ workouts: WorkoutDateEntry[] }>({
    queryKey: queryKeys.workouts.dates(d.getFullYear(), d.getMonth() + 1),
    queryFn: () =>
      api
        .get('/api/v1/workouts/dates', {
          params: { year: d.getFullYear(), month: d.getMonth() + 1 },
        })
        .then(r => r.data),
  });

  const workouts = data?.workouts ?? [];
  const dateToWorkoutId = Object.fromEntries(workouts.map(w => [w.date, w.workout_id]));
  const markedDates = toMarkedDates(workouts, today);

  const todayWorkoutId = thisMonthData?.workouts.find(w => w.date === today)?.workout_id;

  // Written out rather than just the day number: the card is meant to leave the app as an
  // image, where "29日" alone says nothing.
  const todayLabel = d.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
    weekday: 'short',
  });

  // Only fetched once the calendar says there is something to fetch, so a rest day costs
  // no request.
  const { data: todayWorkout } = useQuery<WorkoutDetail>({
    queryKey: queryKeys.workouts.detail(todayWorkoutId ?? ''),
    queryFn: () => api.get(`/api/v1/workouts/${todayWorkoutId}`).then(r => r.data),
    enabled: !!todayWorkoutId,
  });

  // Opening a date that already has a workout must edit it, not start a second one. The
  // 追加 button used to skip this lookup entirely and always land on a blank form, so
  // adding a set to a day already logged created a duplicate workout for that day.
  const openDate = (dateString: string, workoutId: string | undefined) => {
    if (workoutId) {
      router.push(`/record/${workoutId}`);
    } else {
      router.push({ pathname: '/record/new', params: { date: dateString } });
    }
  };

  const onDayPress = (day: DateData) => openDate(day.dateString, dateToWorkoutId[day.dateString]);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>記録</Text>
        <TouchableOpacity style={styles.newBtn} onPress={() => openDate(today, todayWorkoutId)}>
          <Text style={styles.newBtnText}>+ 追加</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <Calendar
          style={styles.calendar}
          markingType="custom"
          markedDates={markedDates}
          onDayPress={onDayPress}
          onMonthChange={month => setCurrentMonth({ year: month.year, month: month.month })}
          renderHeader={date => (
            <Text style={styles.calendarHeader}>
              {date?.getFullYear()}年{(date?.getMonth() ?? 0) + 1}月
            </Text>
          )}
          theme={{
            backgroundColor: Colors.background,
            calendarBackground: Colors.background,
            todayTextColor: Colors.hotPink,
            arrowColor: Colors.hotPink,
            monthTextColor: Colors.textPrimary,
            dayTextColor: Colors.textPrimary,
            textDisabledColor: Colors.textMuted,
          }}
        />

        <View style={styles.statsRow}>
          <View style={styles.statCard}>
            <SymbolIcon name="figure.strengthtraining.traditional" ionicon="barbell-outline" size={22} tintColor={Colors.hotPink} />
            <Text style={styles.statValue}>
              {(stats?.total_volume_kg ?? 0) >= 1000
                ? `${((stats?.total_volume_kg ?? 0) / 1000).toFixed(1)}t`
                : `${Math.round(stats?.total_volume_kg ?? 0).toLocaleString('ja-JP')}kg`}
            </Text>
            <Text style={styles.statLabel}>累計総重量</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statCard}>
            <SymbolIcon name="flame" ionicon="flame-outline" size={22} tintColor={Colors.hotPink} />
            <Text style={styles.statValue}>{stats?.total_workouts ?? 0}回</Text>
            <Text style={styles.statLabel}>総トレ回数</Text>
          </View>
          <View style={styles.statDivider} />
          <View style={styles.statCard}>
            <SymbolIcon name="calendar" ionicon="calendar-outline" size={22} tintColor={Colors.cyan} />
            <Text style={styles.statValue}>{workouts.length}日</Text>
            <Text style={styles.statLabel}>今月の回数</Text>
          </View>
        </View>

        {todayWorkout && (
          <TodaySummaryCard
            dateLabel={todayLabel}
            sets={todayWorkout.sets}
          />
        )}

        <TouchableOpacity
          style={styles.trendBtn}
          onPress={() => router.push('/record/exercises')}>
          <View style={styles.trendBody}>
            <Text style={styles.trendTitle}>種目別の推移を見る</Text>
            <Text style={styles.trendMeta}>
              {(exercises?.items.length ?? 0) > 0
                ? `${exercises?.items.length}種目の記録があります`
                : 'まだ記録がありません'}
            </Text>
          </View>
          <Text style={styles.trendChevron}>›</Text>
        </TouchableOpacity>

      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  // ScrollView 自体に padding が無いので、既存カードと同じ marginHorizontal を持たせる
  trendBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    marginHorizontal: Spacing.three,
    marginBottom: Spacing.three,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.lightCyan,
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
  },
  trendBody: { flex: 1 },
  trendTitle: { color: Colors.textPrimary, fontSize: 15, fontWeight: 'bold' },
  trendMeta: { color: Colors.textMuted, fontSize: 11, marginTop: 2 },
  trendChevron: { color: Colors.textMuted, fontSize: 20 },
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
  scroll: { flexGrow: 1 },
  calendar: { marginTop: Spacing.two },
  calendarHeader: { fontSize: 16, fontWeight: 'bold', color: Colors.textPrimary },
  statsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    marginHorizontal: Spacing.three,
    marginTop: Spacing.three,
    marginBottom: Spacing.three,
    borderRadius: 16,
    padding: Spacing.three,
    borderWidth: 1,
    borderColor: Colors.lightCyan,
  },
  statCard: {
    flex: 1,
    alignItems: 'center',
    gap: 4,
  },
  statValue: { fontSize: 15, fontWeight: 'bold', color: Colors.textPrimary },
  statLabel: { fontSize: 11, color: Colors.textMuted },
  statDivider: { width: 1, height: 48, backgroundColor: Colors.lightCyan },
});
