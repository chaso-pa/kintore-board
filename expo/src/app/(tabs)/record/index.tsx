import { useQueries, useQuery, useQueryClient } from '@tanstack/react-query';
import { useFocusEffect, useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Calendar, LocaleConfig, type DateData } from 'react-native-calendars';

import { SafeAreaView } from 'react-native-safe-area-context';

import { SymbolIcon } from '@/components/SymbolIcon';
import { ImportStatusCard } from '@/components/record/ImportStatusCard';
import { RecordsUnsupported } from '@/components/record/RecordsUnsupported';
import { TodaySummaryCard } from '@/components/record/TodaySummaryCard';
import { Colors, Spacing, TabScreenBottomBorder, TabScreenEdges } from '@/constants/theme';
import { useIsOnline } from '@/lib/connectivity';
import { queryKeys } from '@/lib/query-keys';
import { filterForPart } from '@/lib/records/compute';
import { isDateComplete } from '@/lib/records/coverage';
import { invalidateExercises } from '@/lib/records/invalidate';
import {
  getExerciseList,
  getExerciseMaxE1RM,
  getWorkoutDates,
  getWorkoutDetail,
  getWorkoutStats,
} from '@/lib/records/queries';
import { recordsQueryDefaults } from '@/lib/records/query-options';
import { isRecordsSupported } from '@/lib/records/sqlite-driver';
import { useRecords } from '@/lib/records/use-records';
import { formatVolume } from '@/lib/weight-unit';
import { useWeightUnit } from '@/store/weight-unit';
import { useExerciseBackfill } from '@/hooks/use-exercise-backfill';
import { useExerciseCatalog } from '@/hooks/use-exercise-catalog';

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
    body_part?: string;
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

export default function RecordRoute() {
  return isRecordsSupported ? <RecordScreen /> : <RecordsUnsupported />;
}

function RecordScreen() {
  const router = useRouter();
  const { repo, owner } = useRecords();
  const isOnline = useIsOnline();

  // Sets recorded before the body part existed have none, and only this device holds the
  // catalog that can say what it should be. Done here rather than at app start because this
  // is the tab that owns records, and the catalog is already read from disk for the picker.
  const { exercises: customExercises, bodyParts: customBodyParts } = useExerciseCatalog();
  useExerciseBackfill(customExercises, customBodyParts, true);
  const d = new Date();
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  const qc = useQueryClient();
  const unit = useWeightUnit();
  const [currentMonth, setCurrentMonth] = useState({
    year: new Date().getFullYear(),
    month: new Date().getMonth() + 1,
  });

  const { data } = useQuery<{ workouts: WorkoutDateEntry[] }>({
    queryKey: queryKeys.records.dates(owner, currentMonth.year, currentMonth.month),
    queryFn: () => getWorkoutDates(repo!, currentMonth.year, currentMonth.month),
    enabled: !!repo,
    ...recordsQueryDefaults,
  });

  const { data: stats } = useQuery<WorkoutStats>({
    queryKey: queryKeys.records.stats(owner),
    queryFn: () => getWorkoutStats(repo!),
    enabled: !!repo,
    ...recordsQueryDefaults,
  });

  const { data: exercises } = useQuery<{ items: ExerciseSummaryItem[] }>({
    queryKey: queryKeys.records.exercises(owner),
    queryFn: () => getExerciseList(repo!),
    enabled: !!repo,
    ...recordsQueryDefaults,
  });

  // Autosave leaves the exercise list alone; it is brought up to date when this tab is shown.
  useFocusEffect(useCallback(() => invalidateExercises(qc, owner), [qc, owner]));

  // 追加 always means today, which is not necessarily the month being browsed. Same key as
  // the query above whenever it is, so this costs nothing in the usual case.
  const { data: thisMonthData } = useQuery<{ workouts: WorkoutDateEntry[] }>({
    queryKey: queryKeys.records.dates(owner, d.getFullYear(), d.getMonth() + 1),
    queryFn: () => getWorkoutDates(repo!, d.getFullYear(), d.getMonth() + 1),
    enabled: !!repo,
    ...recordsQueryDefaults,
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

  // Only read once the calendar says there is something to read.
  const { data: todayWorkout } = useQuery<WorkoutDetail | null>({
    queryKey: queryKeys.records.detail(owner, todayWorkoutId ?? ''),
    queryFn: () => getWorkoutDetail(repo!, todayWorkoutId ?? ''),
    enabled: !!repo && !!todayWorkoutId,
    ...recordsQueryDefaults,
  });

  // The best each exercise has ever reached in some *other* workout, which is what makes
  // today's number a record or not. One query per exercise, and only for the exercises
  // actually trained today.
  // Keyed by name and part, because a record belongs to one entry in the picker: beating a
  // pullover done as back work is not a record on the chest one.
  const todayExercises = [
    ...new Map(
      (todayWorkout?.sets ?? []).map(s => {
        const name = s.exercise_name.trim();
        const part = s.body_part ?? '';
        return [`${name}\u0000${part}`, { name, part }] as const;
      })
    ).values(),
  ];
  const previousBestQueries = useQueries({
    queries: todayExercises.map(({ name, part }) => ({
      queryKey: queryKeys.records.maxE1RM(owner, todayWorkoutId ?? '', name, part),
      queryFn: () =>
        getExerciseMaxE1RM(repo!, name, todayWorkoutId ?? '', filterForPart(part)).then(r => r.max_e1rm),
      enabled: !!repo && !!todayWorkoutId,
      ...recordsQueryDefaults,
    })),
  });

  // Only settled entries go in. A name left out reads as "not known yet", which is what
  // keeps a PR badge from flashing on before the comparison has arrived.
  const previousBests: Record<string, number> = {};
  todayExercises.forEach(({ name }, i) => {
    const value = previousBestQueries[i]?.data;
    if (typeof value === 'number') previousBests[name] = value;
  });

  // Opening a date that already has a workout must edit it, not start a second one. The
  // 追加 button used to skip this lookup entirely and always land on a blank form, so
  // adding a set to a day already logged created a duplicate workout for that day.
  //
  // A save can still be finishing when a day is tapped — leaving the record screen does not
  // wait for its last write — so a day the cache has nothing for is looked up again. The
  // repository orders the read after queued writes, so it sees that save.
  //
  // A day the initial import has not fully covered may still have a server record on its
  // way; starting a blank one there would make a duplicate, so it is refused (plan §3.5).
  // The one exception: offline before the first page has arrived, today can be recorded.
  const openDate = async (dateString: string, cachedId: string | undefined) => {
    if (!repo) return;
    let workoutId = cachedId;
    if (!workoutId) {
      const [year, month] = dateString.split('-').map(Number);
      const fresh = await qc.fetchQuery({
        queryKey: queryKeys.records.dates(owner, year, month),
        queryFn: () => getWorkoutDates(repo, year, month),
        ...recordsQueryDefaults,
        staleTime: 0,
      });
      workoutId = fresh.workouts.find(w => w.date === dateString)?.workout_id;
    }
    if (workoutId) {
      router.push(`/record/${workoutId}`);
      return;
    }
    const coverage = await repo.getCoverageState();
    const firstLaunchOffline = !isOnline && !coverage.coveredFrom && dateString === today;
    if (!isDateComplete(dateString, coverage) && !firstLaunchOffline) {
      Alert.alert('この日の記録を取り込み中です', '取り込みが終わるまでお待ちください。');
      return;
    }
    router.push({ pathname: '/record/new', params: { date: dateString } });
  };

  const onDayPress = (day: DateData) => void openDate(day.dateString, dateToWorkoutId[day.dateString]);

  return (
    <SafeAreaView style={styles.container} edges={TabScreenEdges}>
      <View style={styles.header}>
        <Text style={styles.title}>記録</Text>
        <TouchableOpacity style={styles.newBtn} onPress={() => void openDate(today, todayWorkoutId)}>
          <Text style={styles.newBtnText}>+ 追加</Text>
        </TouchableOpacity>
      </View>

      <ScrollView contentContainerStyle={styles.scroll}>
        <ImportStatusCard style={styles.importCard} />
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
              {formatVolume(stats?.total_volume_kg ?? 0, unit)}
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
            previousBests={previousBests}
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
  container: { flex: 1, backgroundColor: Colors.background, ...TabScreenBottomBorder },
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
  importCard: { marginHorizontal: Spacing.three, marginTop: Spacing.two },
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
