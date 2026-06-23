import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '@/lib/api';
import { Colors, Spacing } from '@/constants/theme';

const CATEGORIES = ['BIG3', '胸', '背中', '脚', '肩', '腕', 'サプリ', 'プロテイン', '食事', '減量', '増量', 'マシン沼', '筋トレあるある'];

export default function NewThreadScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const { machine_id, machine_name } = useLocalSearchParams<{ machine_id?: string; machine_name?: string }>();
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('');
  const [firstPost, setFirstPost] = useState('');

  const isDisabled = !title.trim() || !firstPost.trim() || (!machine_id && !category);

  const mutation = useMutation({
    mutationFn: async () => {
      if (machine_id) {
        const res = await api.post('/api/v1/threads', { type: 'machine', title, machine_id, first_post: firstPost });
        return res.data;
      } else {
        const res = await api.post('/api/v1/threads', { type: 'category', title, category, first_post: firstPost });
        return res.data;
      }
    },
    onSuccess: (data) => {
      qc.invalidateQueries({ queryKey: ['threads'] });
      router.push(`/board/${data.id}`);
    },
    onError: () => Alert.alert('エラー', 'スレの作成に失敗しました'),
  });

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.form}>
        {machine_name && (
          <View style={styles.machineBadge}>
            <Text style={styles.machineBadgeText}>🤖 {machine_name} のスレ</Text>
          </View>
        )}

        <Text style={styles.label}>スレタイトル</Text>
        <TextInput
          style={styles.input}
          value={title}
          onChangeText={setTitle}
          placeholder="例: このラットプルの軌道どうなん"
          placeholderTextColor={Colors.textMuted}
          maxLength={200}
        />

        {!machine_id && (
          <>
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
          </>
        )}

        <Text style={styles.label}>最初の発言</Text>
        <TextInput
          style={[styles.input, styles.postInput]}
          value={firstPost}
          onChangeText={setFirstPost}
          placeholder="スレの最初の投稿を書いてください"
          placeholderTextColor={Colors.textMuted}
          multiline
          maxLength={2000}
        />

        <TouchableOpacity
          style={[styles.submitBtn, (isDisabled || mutation.isPending) && styles.submitBtnDisabled]}
          disabled={isDisabled || mutation.isPending}
          onPress={() => mutation.mutate()}>
          <Text style={styles.submitText}>スレ作成</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  form: { padding: Spacing.three, gap: Spacing.two, paddingBottom: Spacing.six },
  machineBadge: { backgroundColor: Colors.surfaceBlue, borderRadius: 10, padding: Spacing.two, alignSelf: 'flex-start' },
  machineBadgeText: { color: Colors.textPrimary, fontSize: 13, fontWeight: '600' },
  label: { color: Colors.textPrimary, fontWeight: 'bold', fontSize: 14, marginTop: Spacing.two },
  input: { borderWidth: 2, borderColor: Colors.lightCyan, borderRadius: 12, padding: Spacing.two, color: Colors.textPrimary, fontSize: 15, backgroundColor: Colors.surface },
  postInput: { minHeight: 100, textAlignVertical: 'top' },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  chip: { paddingHorizontal: Spacing.two, paddingVertical: Spacing.one, borderRadius: 16, borderWidth: 1, borderColor: Colors.pink, backgroundColor: Colors.surface },
  chipSelected: { backgroundColor: Colors.pink },
  chipText: { color: Colors.hotPink, fontSize: 12 },
  chipTextSelected: { color: '#fff' },
  submitBtn: { backgroundColor: Colors.hotPink, padding: Spacing.three, borderRadius: 24, alignItems: 'center', marginTop: Spacing.three },
  submitBtnDisabled: { backgroundColor: Colors.textMuted },
  submitText: { color: '#fff', fontWeight: 'bold', fontSize: 16 },
});
