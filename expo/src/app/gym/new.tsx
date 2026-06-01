import { useMutation, useQueryClient } from '@tanstack/react-query';
import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Alert, ScrollView, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '@/lib/api';
import { Colors, Spacing } from '@/constants/theme';

export default function NewGymScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [visitorFee, setVisitorFee] = useState('');
  const [monthlyFee, setMonthlyFee] = useState('');

  const mutation = useMutation({
    mutationFn: async () => {
      await api.post('/api/v1/gyms', {
        name,
        address,
        visitor_fee: visitorFee ? parseInt(visitorFee) : undefined,
        monthly_fee: monthlyFee ? parseInt(monthlyFee) : undefined,
        visitor_available: !!visitorFee,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['gyms'] });
      router.back();
    },
    onError: () => Alert.alert('エラー', 'ジムの登録に失敗しました'),
  });

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.form}>
        <Text style={styles.label}>ジム名 *</Text>
        <TextInput style={styles.input} value={name} onChangeText={setName} placeholder="例: フィットネスジムXX" placeholderTextColor={Colors.textMuted} />

        <Text style={styles.label}>住所</Text>
        <TextInput style={styles.input} value={address} onChangeText={setAddress} placeholder="例: 東京都渋谷区..." placeholderTextColor={Colors.textMuted} />

        <View style={styles.row}>
          <View style={styles.half}>
            <Text style={styles.label}>ビジター料金 (円)</Text>
            <TextInput style={styles.input} value={visitorFee} onChangeText={setVisitorFee} keyboardType="numeric" placeholder="例: 1500" placeholderTextColor={Colors.textMuted} />
          </View>
          <View style={styles.half}>
            <Text style={styles.label}>月額 (円)</Text>
            <TextInput style={styles.input} value={monthlyFee} onChangeText={setMonthlyFee} keyboardType="numeric" placeholder="例: 8000" placeholderTextColor={Colors.textMuted} />
          </View>
        </View>

        <View style={styles.notice}>
          <Text style={styles.noticeText}>※ 投稿する情報はユーザー提供情報として公開されます</Text>
        </View>

        <TouchableOpacity
          style={[styles.submitBtn, (!name.trim() || mutation.isPending) && styles.submitBtnDisabled]}
          disabled={!name.trim() || mutation.isPending}
          onPress={() => mutation.mutate()}>
          <Text style={styles.submitText}>登録する</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  form: { padding: Spacing.three, gap: Spacing.one },
  label: { color: Colors.textPrimary, fontWeight: 'bold', fontSize: 14, marginTop: Spacing.two },
  input: { borderWidth: 2, borderColor: Colors.lightCyan, borderRadius: 12, padding: Spacing.two, color: Colors.textPrimary, fontSize: 15, backgroundColor: Colors.surface },
  row: { flexDirection: 'row', gap: Spacing.two },
  half: { flex: 1 },
  notice: { backgroundColor: Colors.surfacePink, padding: Spacing.two, borderRadius: 8, marginTop: Spacing.two },
  noticeText: { color: Colors.hotPink, fontSize: 12 },
  submitBtn: { backgroundColor: Colors.cyan, padding: Spacing.three, borderRadius: 24, alignItems: 'center', marginTop: Spacing.three },
  submitBtnDisabled: { backgroundColor: Colors.textMuted },
  submitText: { color: Colors.textPrimary, fontWeight: 'bold', fontSize: 16 },
});
