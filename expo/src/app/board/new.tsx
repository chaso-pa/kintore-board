import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '@/lib/api';
import { Colors, Spacing } from '@/constants/theme';

const CATEGORIES = ['BIG3', '胸', '背中', '脚', '肩', '腕', 'サプリ', '食事', '減量', '増量', 'マシン沼', '筋トレあるある'];

export default function NewThreadScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');

  const mutation = useMutation({
    mutationFn: async () => {
      await api.post('/api/v1/threads', { type: 'category', title, category });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['threads'] });
      router.back();
    },
    onError: () => Alert.alert('エラー', 'スレの作成に失敗しました'),
  });

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.form}>
        <Text style={styles.label}>スレタイトル</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="例: このラットプルの軌道どうなん"
          placeholderTextColor={Colors.textMuted}
          maxLength={200}
        />

        <Text style={styles.label}>カテゴリ</Text>
        <View style={styles.chips}>
          {CATEGORIES.map((cat) => (
            <TouchableOpacity
              key={cat}
              style={[styles.chip, category === cat && styles.chipSelected]}
              onPress={() => setCategory(cat === category ? '' : cat)}>
              <Text style={[styles.chipText, category === cat && styles.chipTextSelected]}>{cat}</Text>
            </TouchableOpacity>
          ))}
        </View>

        <TouchableOpacity
          style={[styles.submitBtn, (!title.trim() || mutation.isPending) && styles.submitBtnDisabled]}
          disabled={!title.trim() || mutation.isPending}
          onPress={() => mutation.mutate()}>
          <Text style={styles.submitText}>スレ作成</Text>
        </TouchableOpacity>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  form: { padding: Spacing.three, gap: Spacing.two },
  label: { color: Colors.textPrimary, fontWeight: 'bold', fontSize: 14, marginTop: Spacing.two },
  input: { borderWidth: 2, borderColor: Colors.lightCyan, borderRadius: 12, padding: Spacing.two, color: Colors.textPrimary, fontSize: 15, backgroundColor: Colors.surface },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  chip: { paddingHorizontal: Spacing.two, paddingVertical: Spacing.one, borderRadius: 16, borderWidth: 1, borderColor: Colors.pink, backgroundColor: Colors.surface },
  chipSelected: { backgroundColor: Colors.pink },
  chipText: { color: Colors.hotPink, fontSize: 12 },
  chipTextSelected: { color: '#fff' },
  submitBtn: { backgroundColor: Colors.hotPink, padding: Spacing.three, borderRadius: 24, alignItems: 'center', marginTop: Spacing.three },
  submitBtnDisabled: { backgroundColor: Colors.textMuted },
  submitText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
});
