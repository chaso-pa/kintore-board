import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SymbolIcon } from '@/components/SymbolIcon';
import { ExerciseSelectModal } from '@/components/record/ExerciseSelectModal';
import { useCustomExercises } from '@/hooks/use-custom-exercises';
import { Colors, Spacing } from '@/constants/theme';
import { api } from '@/lib/api';
import { formatRM } from '@/utils/rm';
import { queryKeys } from '@/lib/query-keys';

type SetRow = {
  weight: string;
  reps: string;
  spotted: boolean;
  memo: string;
};

type ExerciseGroup = {
  id: string;
  exercise_name: string;
  rows: SetRow[];
};

type LastRecord = {
  date: string;
  sets: Array<{ weight: number; reps: number }>;
};

const emptyRow = (): SetRow => ({ weight: '', reps: '', spotted: false, memo: '' });

let _gid = 0;
const nextId = () => String(++_gid);

export default function NewWorkoutScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const { date } = useLocalSearchParams<{ date?: string }>();

  const trainedOn = date ? new Date(date) : new Date();
  const [workoutMemo, setWorkoutMemo] = useState('');
  const [groups, setGroups] = useState<ExerciseGroup[]>([
    { id: nextId(), exercise_name: '', rows: [emptyRow()] },
  ]);
  const [lastRecords, setLastRecords] = useState<Record<string, LastRecord>>({});
  const [modalVisible, setModalVisible] = useState(false);
  const {
    exercises: customExercises,
    create: createCustomExercise,
    remove: removeCustomExercise,
  } = useCustomExercises();
  const [editingGroupIdx, setEditingGroupIdx] = useState(0);

  const mutation = useMutation({
    mutationFn: () =>
      api.post('/api/v1/workouts', {
        trained_on: trainedOn.toISOString(),
        memo: workoutMemo,
        sets: groups.flatMap(g =>
          g.exercise_name.trim()
            ? g.rows.map(r => ({
                exercise_name: g.exercise_name.trim(),
                weight: parseFloat(r.weight) || 0,
                reps: parseInt(r.reps, 10) || 0,
                sets: 1,
                memo: r.memo,
                spotted: r.spotted,
              }))
            : []
        ),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.workouts.root });
      qc.invalidateQueries({ queryKey: queryKeys.workouts.datesRoot });
      // The chart caches the full history per exercise, and staleTime is 60s, so
      // without this a set logged now would not appear until the cache expires.
      qc.invalidateQueries({ queryKey: queryKeys.exercises.historyRoot });
      qc.invalidateQueries({ queryKey: queryKeys.exercises.root });
      // Never invalidated before this: the stats card kept showing the values from
      // the first fetch, so a freshly logged workout left it reading 0.
      qc.invalidateQueries({ queryKey: queryKeys.workouts.stats() });
      router.back();
    },
    onError: () => Alert.alert('エラー', '記録の保存に失敗しました'),
  });

  const openModal = (idx: number) => {
    setEditingGroupIdx(idx);
    setModalVisible(true);
  };

  const onSelectExercise = async (name: string) => {
    setGroups(prev =>
      prev.map((g, i) => (i === editingGroupIdx ? { ...g, exercise_name: name } : g))
    );
    if (lastRecords[name]) return;
    try {
      const res = await api.get('/api/v1/workouts/last-exercise-sets', {
        params: { exercise_name: name },
      });
      setLastRecords(prev => ({ ...prev, [name]: res.data }));
    } catch {
      // no previous record — silently ignore
    }
  };

  const copyPrev = (gi: number, ri: number) => {
    setGroups(prev =>
      prev.map((g, idx) => {
        if (idx !== gi) return g;
        const lr = lastRecords[g.exercise_name];
        const source: SetRow =
          ri === 0
            ? lr?.sets[0]
              ? { weight: String(lr.sets[0].weight), reps: String(lr.sets[0].reps), spotted: false, memo: '' }
              : emptyRow()
            : { ...g.rows[ri - 1] };
        return { ...g, rows: g.rows.map((r, ridx) => (ridx === ri ? source : r)) };
      })
    );
  };

  const updateRow = (gi: number, ri: number, field: keyof SetRow, val: string | boolean) =>
    setGroups(prev =>
      prev.map((g, idx) =>
        idx === gi
          ? { ...g, rows: g.rows.map((r, ridx) => (ridx === ri ? { ...r, [field]: val } : r)) }
          : g
      )
    );

  const addRow = (gi: number) =>
    setGroups(prev =>
      prev.map((g, idx) =>
        idx === gi ? { ...g, rows: [...g.rows, { ...g.rows[g.rows.length - 1] }] } : g
      )
    );

  const removeRow = (gi: number, ri: number) =>
    setGroups(prev =>
      prev.map((g, idx) =>
        idx === gi && g.rows.length > 1
          ? { ...g, rows: g.rows.filter((_, ridx) => ridx !== ri) }
          : g
      )
    );

  const addGroup = () =>
    setGroups(prev => [...prev, { id: nextId(), exercise_name: '', rows: [emptyRow()] }]);

  const removeGroup = (gi: number) =>
    setGroups(prev => (prev.length > 1 ? prev.filter((_, idx) => idx !== gi) : prev));

  const canSave = groups.some(g => g.exercise_name.trim());
  const dateLabel = trainedOn.toLocaleDateString('ja-JP', {
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  });

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.cancel}>キャンセル</Text>
        </TouchableOpacity>
        <Text style={styles.title}>{dateLabel}</Text>
        <TouchableOpacity
          style={[styles.saveBtn, (!canSave || mutation.isPending) && styles.saveBtnDisabled]}
          onPress={() => mutation.mutate()}
          disabled={!canSave || mutation.isPending}>
          <Text style={styles.saveBtnText}>保存</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          <TextInput
            style={styles.memoInput}
            placeholder="ワークアウトメモ（任意）"
            placeholderTextColor={Colors.textMuted}
            value={workoutMemo}
            onChangeText={setWorkoutMemo}
          />

          {groups.map((group, gi) => {
            const lr = lastRecords[group.exercise_name];
            return (
              <View key={group.id} style={styles.groupCard}>
                <View style={styles.groupHeader}>
                  <TouchableOpacity style={styles.exerciseBtn} onPress={() => openModal(gi)}>
                    <Text style={group.exercise_name ? styles.exerciseName : styles.exercisePlaceholder}>
                      {group.exercise_name || '種目を選択...'}
                    </Text>
                    <Text style={styles.exerciseArrow}>›</Text>
                  </TouchableOpacity>
                  {groups.length > 1 && (
                    <Pressable onPress={() => removeGroup(gi)} hitSlop={8}>
                      <Text style={styles.removeGroupText}>削除</Text>
                    </Pressable>
                  )}
                </View>

                {lr && (
                  <View style={styles.lastRecordCard}>
                    <Text style={styles.lastRecordTitle}>前回: {lr.date}</Text>
                    <Text style={styles.lastRecordSets}>
                      {lr.sets.map(s => `${s.weight}kg×${s.reps}`).join('  ')}
                    </Text>
                  </View>
                )}

                {group.rows.map((row, ri) => {
                  const rm = formatRM(parseFloat(row.weight) || 0, parseInt(row.reps, 10) || 0);
                  return (
                    <View key={ri} style={styles.setRow}>
                      <View style={styles.setRowTop}>
                        <Text style={styles.setNum}>{ri + 1}</Text>

                        <TouchableOpacity onPress={() => copyPrev(gi, ri)} style={styles.copyBtn}>
                          <SymbolIcon name="arrow.clockwise" ionicon="refresh" size={13} tintColor={Colors.pink} />
                        </TouchableOpacity>

                        <View style={styles.setRowInputs}>
                          <TextInput
                            style={styles.numInput}
                            keyboardType="decimal-pad"
                            placeholder="0"
                            placeholderTextColor={Colors.textMuted}
                            value={row.weight}
                            onChangeText={v => updateRow(gi, ri, 'weight', v)}
                          />
                          <Text style={styles.unit}>kg</Text>

                          <TextInput
                            style={[styles.numInput, { marginLeft: Spacing.two }]}
                            keyboardType="number-pad"
                            placeholder="0"
                            placeholderTextColor={Colors.textMuted}
                            value={row.reps}
                            onChangeText={v => updateRow(gi, ri, 'reps', v)}
                          />
                          <Text style={styles.unit}>回</Text>

                          <TouchableOpacity
                            onPress={() => updateRow(gi, ri, 'spotted', !row.spotted)}
                            style={[styles.spottedBtn, row.spotted && styles.spottedBtnOn]}
                            hitSlop={8}>
                            <Text style={[styles.spottedText, row.spotted && styles.spottedTextOn]}>補</Text>
                          </TouchableOpacity>
                        </View>

                        {group.rows.length > 1 && (
                          <Pressable onPress={() => removeRow(gi, ri)} hitSlop={8} style={styles.removeRowBtn}>
                            <Text style={styles.removeRowText}>×</Text>
                          </Pressable>
                        )}
                      </View>

                      {rm && <Text style={styles.rmText}>{rm}</Text>}

                      <TextInput
                        style={styles.noteInput}
                        placeholder="メモ"
                        placeholderTextColor={Colors.textMuted}
                        value={row.memo}
                        onChangeText={v => updateRow(gi, ri, 'memo', v)}
                      />
                    </View>
                  );
                })}

                <TouchableOpacity style={styles.addRowBtn} onPress={() => addRow(gi)}>
                  <Text style={styles.addRowBtnText}>＋ セット追加</Text>
                </TouchableOpacity>
              </View>
            );
          })}

          <TouchableOpacity style={styles.addGroupBtn} onPress={addGroup}>
            <Text style={styles.addGroupBtnText}>＋ 種目追加</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>

      <ExerciseSelectModal
        visible={modalVisible}
        customExercises={customExercises}
        onSelect={onSelectExercise}
        onClose={() => setModalVisible(false)}
        onCreateCustom={createCustomExercise}
        onDeleteCustom={removeCustomExercise}
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
    borderBottomWidth: 1,
    borderBottomColor: '#E8D5E8',
  },
  title: { fontSize: 15, fontWeight: 'bold', color: Colors.textPrimary },
  cancel: { color: Colors.textMuted, fontSize: 15 },
  saveBtn: {
    backgroundColor: Colors.hotPink,
    paddingHorizontal: Spacing.three,
    paddingVertical: 6,
    borderRadius: 16,
  },
  saveBtnDisabled: { opacity: 0.4 },
  saveBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
  scroll: { padding: Spacing.three, gap: Spacing.two, paddingBottom: Spacing.six },
  memoInput: {
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: Spacing.two,
    color: Colors.textPrimary,
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#EEE',
  },
  groupCard: {
    backgroundColor: Colors.surface,
    borderRadius: 14,
    padding: Spacing.three,
    gap: Spacing.two,
    shadowColor: Colors.pink,
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  groupHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  exerciseBtn: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    paddingVertical: 6,
  },
  exerciseName: { fontSize: 16, color: Colors.textPrimary, fontWeight: '600' },
  exercisePlaceholder: { fontSize: 16, color: Colors.textMuted },
  exerciseArrow: { fontSize: 20, color: Colors.textMuted },
  removeGroupText: { color: Colors.danger, fontSize: 13 },
  lastRecordCard: {
    backgroundColor: '#F5F0FF',
    borderRadius: 8,
    padding: Spacing.two,
    borderLeftWidth: 3,
    borderLeftColor: Colors.pink,
  },
  lastRecordTitle: { fontSize: 11, color: Colors.textMuted, marginBottom: 2 },
  lastRecordSets: { fontSize: 13, color: Colors.textPrimary, fontWeight: '500' },
  setRow: {
    borderTopWidth: 1,
    borderTopColor: '#F0F0F0',
    paddingTop: Spacing.two,
    gap: 4,
  },
  setRowTop: { flexDirection: 'row', alignItems: 'center', gap: 6 },
  setRowInputs: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 6 },
  setNum: {
    fontSize: 14,
    fontWeight: 'bold',
    color: Colors.hotPink,
    width: 18,
    textAlign: 'center',
  },
  copyBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: '#F0EAF8',
    alignItems: 'center',
    justifyContent: 'center',
  },
  numInput: {
    fontSize: 18,
    fontWeight: 'bold',
    color: Colors.textPrimary,
    textAlign: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    paddingVertical: 2,
    minWidth: 44,
  },
  unit: { fontSize: 11, color: Colors.textMuted },
  spottedBtn: {
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 1.5,
    borderColor: Colors.textMuted,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: 2,
  },
  spottedBtnOn: { backgroundColor: Colors.cyan, borderColor: Colors.cyan },
  spottedText: { fontSize: 9, color: Colors.textMuted, fontWeight: 'bold' },
  spottedTextOn: { color: '#fff' },
  removeRowBtn: { marginLeft: 2 },
  removeRowText: { fontSize: 18, color: Colors.textMuted, lineHeight: 20 },
  rmText: { fontSize: 11, color: Colors.cyan, textAlign: 'right' },
  noteInput: {
    fontSize: 13,
    color: Colors.textPrimary,
    borderBottomWidth: 1,
    borderBottomColor: '#F0F0F0',
    paddingVertical: 4,
    paddingLeft: 24,
  },
  addRowBtn: {
    borderWidth: 1,
    borderColor: Colors.pink,
    borderRadius: 10,
    paddingVertical: 6,
    alignItems: 'center',
    marginTop: 4,
  },
  addRowBtnText: { color: Colors.pink, fontSize: 13, fontWeight: 'bold' },
  addGroupBtn: {
    borderWidth: 1.5,
    borderColor: Colors.hotPink,
    borderRadius: 12,
    padding: Spacing.two,
    alignItems: 'center',
  },
  addGroupBtnText: { color: Colors.hotPink, fontWeight: 'bold', fontSize: 14 },
});
