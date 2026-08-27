import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
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

import { api } from '@/lib/api';
import { Colors, Spacing } from '@/constants/theme';
import { queryKeys } from '@/lib/query-keys';

const BODY_PARTS = ['胸', '背中', '脚', '肩', '腕', '腹部'];
const MANUFACTURERS = ['Life Fitness', 'Technogym', 'Precor', 'Hammer Strength', 'Matrix', 'CYBEX', 'Panatta', 'Nautilus'];

export default function NewMachineScreen() {
  const router = useRouter();
  const queryClient = useQueryClient();
  // When arrived from the gym machine link screen, gym_id is set — create and link
  // the machine to that gym in one step instead of a plain global registration.
  const { gym_id: gymId } = useLocalSearchParams<{ gym_id?: string }>();

  const [name, setName] = useState('');
  const [manufacturer, setManufacturer] = useState('');
  const [bodyPart, setBodyPart] = useState('');
  const [category, setCategory] = useState('');

  const mutation = useMutation({
    mutationFn: () =>
      api.post(gymId ? `/api/v1/gyms/${gymId}/machines` : '/api/v1/machines', {
        name: name.trim(),
        ...(manufacturer.trim() && { manufacturer: manufacturer.trim() }),
        ...(bodyPart && { body_part: bodyPart }),
        ...(category.trim() && { category: category.trim() }),
      }),
    onSuccess: (res) => {
      queryClient.invalidateQueries({ queryKey: queryKeys.machines.root });
      if (gymId) {
        queryClient.invalidateQueries({ queryKey: queryKeys.machines.forGym(gymId) });
        router.replace(`/gym/${gymId}/machines`);
      } else {
        router.replace(`/machine/${res.data.id}`);
      }
    },
    onError: () => Alert.alert('エラー', '登録に失敗しました'),
  });

  const canSave = name.trim().length > 0;

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <TouchableOpacity onPress={() => router.back()}>
          <Text style={styles.cancel}>キャンセル</Text>
        </TouchableOpacity>
        <Text style={styles.title}>マシン登録</Text>
        <TouchableOpacity
          style={[styles.saveBtn, (!canSave || mutation.isPending) && styles.saveBtnDisabled]}
          onPress={() => mutation.mutate()}
          disabled={!canSave || mutation.isPending}>
          <Text style={styles.saveBtnText}>保存</Text>
        </TouchableOpacity>
      </View>

      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>マシン名 <Text style={styles.required}>*</Text></Text>
            <TextInput
              style={styles.input}
              value={name}
              onChangeText={setName}
              placeholder="例: ラットプルダウン"
              placeholderTextColor={Colors.textMuted}
              returnKeyType="next"
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>対象部位</Text>
            <View style={styles.chipRow}>
              {BODY_PARTS.map((bp) => (
                <TouchableOpacity
                  key={bp}
                  style={[styles.chip, bodyPart === bp && styles.chipSelected]}
                  onPress={() => setBodyPart(bodyPart === bp ? '' : bp)}>
                  <Text style={[styles.chipText, bodyPart === bp && styles.chipTextSelected]}>{bp}</Text>
                </TouchableOpacity>
              ))}
            </View>
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>メーカー</Text>
            <View style={styles.chipRow}>
              {MANUFACTURERS.map((m) => (
                <TouchableOpacity
                  key={m}
                  style={[styles.chip, manufacturer === m && styles.chipSelected]}
                  onPress={() => setManufacturer(manufacturer === m ? '' : m)}>
                  <Text style={[styles.chipText, manufacturer === m && styles.chipTextSelected]}>{m}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TextInput
              style={[styles.input, styles.inputSmall]}
              value={manufacturer}
              onChangeText={setManufacturer}
              placeholder="その他（自由記述）"
              placeholderTextColor={Colors.textMuted}
              returnKeyType="next"
            />
          </View>

          <View style={styles.fieldGroup}>
            <Text style={styles.label}>種目カテゴリ</Text>
            <TextInput
              style={styles.input}
              value={category}
              onChangeText={setCategory}
              placeholder="例: プル系"
              placeholderTextColor={Colors.textMuted}
              returnKeyType="done"
            />
          </View>

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
    borderBottomColor: Colors.lightCyan,
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

  scroll: { padding: Spacing.three, gap: Spacing.three, paddingBottom: Spacing.six },

  fieldGroup: { gap: Spacing.two },
  label: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  required: { color: Colors.hotPink },

  chipRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  chip: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.lightCyan,
    backgroundColor: Colors.surface,
  },
  chipSelected: { backgroundColor: Colors.hotPink, borderColor: Colors.hotPink },
  chipText: { color: Colors.textSecondary, fontSize: 13, fontWeight: '600' },
  chipTextSelected: { color: '#fff' },

  input: {
    backgroundColor: Colors.surface,
    borderRadius: 10,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    color: Colors.textPrimary,
    fontSize: 15,
    borderWidth: 1,
    borderColor: Colors.lightCyan,
  },
  inputSmall: { fontSize: 13, marginTop: Spacing.one },
});
