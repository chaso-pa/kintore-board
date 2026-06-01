import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, Spacing } from '@/constants/theme';
import { api } from '@/lib/api';

type SetRow = {
  exercise_name: string;
  weight: string;
  reps: string;
  sets: string;
};

const emptyRow = (): SetRow => ({ exercise_name: '', weight: '', reps: '', sets: '3' });

export default function NewWorkoutScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const [memo, setMemo] = useState('');
  const [rows, setRows] = useState<SetRow[]>([emptyRow()]);

  const mutation = useMutation({
    mutationFn: () =>
      api.post('/api/v1/workouts', {
        trained_on: new Date().toISOString(),
        memo,
        sets: rows
          .filter(r => r.exercise_name.trim())
          .map(r => ({
            exercise_name: r.exercise_name.trim(),
            weight: parseFloat(r.weight) || 0,
            reps: parseInt(r.reps, 10) || 0,
            sets: parseInt(r.sets, 10) || 1,
            memo: '',
          })),
      }),
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['workouts'] });
      router.back();
    },
    onError: () => Alert.alert('エラー', '記録の保存に失敗しました'),
  });

  const update = (i: number, field: keyof SetRow, val: string) =>
    setRows(prev => prev.map((r, idx) => (idx === i ? { ...r, [field]: val } : r)));

  const canSave = rows.some(r => r.exercise_name.trim());

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.cancel}>キャンセル</Text>
        </TouchableOpacity>
        <Text style={styles.title}>今日の記録</Text>
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
            placeholder="メモ（任意）"
            placeholderTextColor={Colors.textMuted}
            value={memo}
            onChangeText={setMemo}
          />

          {rows.map((row, i) => (
            <View key={i} style={styles.card}>
              <View style={styles.cardHeader}>
                <Text style={styles.cardLabel}>種目 {i + 1}</Text>
                {rows.length > 1 && (
                  <TouchableOpacity onPress={() => setRows(prev => prev.filter((_, idx) => idx !== i))}>
                    <Text style={styles.removeText}>削除</Text>
                  </TouchableOpacity>
                )}
              </View>
              <TextInput
                style={styles.exInput}
                placeholder="種目名（例: ベンチプレス）"
                placeholderTextColor={Colors.textMuted}
                value={row.exercise_name}
                onChangeText={v => update(i, 'exercise_name', v)}
              />
              <View style={styles.numRow}>
                <View style={styles.numCol}>
                  <Text style={styles.numLabel}>重量(kg)</Text>
                  <TextInput
                    style={styles.numInput}
                    keyboardType="decimal-pad"
                    placeholder="0"
                    placeholderTextColor={Colors.textMuted}
                    value={row.weight}
                    onChangeText={v => update(i, 'weight', v)}
                  />
                </View>
                <View style={styles.numCol}>
                  <Text style={styles.numLabel}>回数</Text>
                  <TextInput
                    style={styles.numInput}
                    keyboardType="number-pad"
                    placeholder="0"
                    placeholderTextColor={Colors.textMuted}
                    value={row.reps}
                    onChangeText={v => update(i, 'reps', v)}
                  />
                </View>
                <View style={styles.numCol}>
                  <Text style={styles.numLabel}>セット</Text>
                  <TextInput
                    style={styles.numInput}
                    keyboardType="number-pad"
                    placeholder="3"
                    placeholderTextColor={Colors.textMuted}
                    value={row.sets}
                    onChangeText={v => update(i, 'sets', v)}
                  />
                </View>
              </View>
            </View>
          ))}

          <TouchableOpacity style={styles.addBtn} onPress={() => setRows(prev => [...prev, emptyRow()])}>
            <Text style={styles.addBtnText}>＋ 種目を追加</Text>
          </TouchableOpacity>
        </ScrollView>
      </KeyboardAvoidingView>
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
  title: { fontSize: 16, fontWeight: 'bold', color: Colors.textPrimary },
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
    marginBottom: Spacing.one,
  },
  card: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: Spacing.three,
    shadowColor: Colors.pink,
    shadowOpacity: 0.08,
    shadowRadius: 6,
    shadowOffset: { width: 0, height: 2 },
    elevation: 2,
  },
  cardHeader: { flexDirection: 'row', justifyContent: 'space-between', marginBottom: Spacing.two },
  cardLabel: { fontSize: 13, fontWeight: 'bold', color: Colors.hotPink },
  removeText: { fontSize: 13, color: Colors.danger },
  exInput: {
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    color: Colors.textPrimary,
    fontSize: 16,
    paddingVertical: 6,
    marginBottom: Spacing.two,
  },
  numRow: { flexDirection: 'row', gap: Spacing.two },
  numCol: { flex: 1, alignItems: 'center' },
  numLabel: { fontSize: 11, color: Colors.textMuted, marginBottom: 4 },
  numInput: {
    fontSize: 22,
    fontWeight: 'bold',
    color: Colors.textPrimary,
    textAlign: 'center',
    borderBottomWidth: 1,
    borderBottomColor: '#E0E0E0',
    paddingVertical: 4,
    width: '100%',
  },
  addBtn: {
    borderWidth: 1.5,
    borderColor: Colors.pink,
    borderRadius: 12,
    padding: Spacing.two,
    alignItems: 'center',
    marginTop: Spacing.one,
  },
  addBtnText: { color: Colors.pink, fontWeight: 'bold', fontSize: 14 },
});
