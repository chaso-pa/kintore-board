import { useQuery } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { Calendar, type DateData } from 'react-native-calendars';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, Spacing } from '@/constants/theme';
import { api } from '@/lib/api';

type WorkoutDateEntry = { date: string; workout_id: string };

function toMarkedDates(workouts: WorkoutDateEntry[], today: string) {
  const marks: Record<string, object> = {};
  for (const w of workouts) {
    marks[w.date] = { marked: true, dotColor: Colors.hotPink };
  }
  marks[today] = { ...marks[today], selected: true, selectedColor: Colors.pink };
  return marks;
}

export default function RecordScreen() {
  const router = useRouter();
  const today = new Date().toISOString().slice(0, 10);
  const [currentMonth, setCurrentMonth] = useState({ year: new Date().getFullYear(), month: new Date().getMonth() + 1 });

  const { data } = useQuery<{ workouts: WorkoutDateEntry[] }>({
    queryKey: ['workout-dates', currentMonth.year, currentMonth.month],
    queryFn: () =>
      api.get('/api/v1/workouts/dates', { params: { year: currentMonth.year, month: currentMonth.month } }).then(r => r.data),
  });

  const workouts = data?.workouts ?? [];
  const dateToWorkoutId = Object.fromEntries(workouts.map(w => [w.date, w.workout_id]));
  const markedDates = toMarkedDates(workouts, today);

  const onDayPress = (day: DateData) => {
    const workoutId = dateToWorkoutId[day.dateString];
    if (workoutId) {
      router.push(`/record/${workoutId}`);
    } else {
      router.push({ pathname: '/record/new', params: { date: day.dateString } });
    }
  };

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>記録</Text>
        <TouchableOpacity style={styles.newBtn} onPress={() => router.push('/record/new')}>
          <Text style={styles.newBtnText}>+ 追加</Text>
        </TouchableOpacity>
      </View>

      <Calendar
        style={styles.calendar}
        markedDates={markedDates}
        onDayPress={onDayPress}
        onMonthChange={month => setCurrentMonth({ year: month.year, month: month.month })}
        theme={{
          backgroundColor: Colors.background,
          calendarBackground: Colors.background,
          selectedDayBackgroundColor: Colors.pink,
          selectedDayTextColor: '#fff',
          todayTextColor: Colors.hotPink,
          dotColor: Colors.hotPink,
          arrowColor: Colors.hotPink,
          monthTextColor: Colors.textPrimary,
          dayTextColor: Colors.textPrimary,
          textDisabledColor: Colors.textMuted,
        }}
      />
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
  calendar: { marginTop: Spacing.two },
});
