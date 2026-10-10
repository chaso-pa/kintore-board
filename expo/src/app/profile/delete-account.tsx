import { ActivityIndicator, Alert, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, Spacing } from '@/constants/theme';
import { useDeleteAccount } from '@/hooks/use-delete-account';
import { CONTACT_EMAIL } from '@/lib/terms';

/**
 * Account deletion, as Google Play requires of any app that creates accounts.
 *
 * The lists below are the whole contract and match AuthService.DeleteAccount on the server.
 * They are spelled out rather than summarised as "your data will be deleted" because part of
 * it is not: the gym database is shared, and saying otherwise would be a promise the server
 * does not keep.
 */
const DELETED = [
  'トレーニング記録',
  '保存したジム・保存したスレ',
  'ブロックしたユーザーの一覧',
  'あなたの投稿とスレッド（非表示になり、ほかのユーザーからは見えなくなります）',
];

const KEPT = [
  '登録したジム・マシンの情報と写真（設備情報として、ほかのユーザーと共有されています）',
  'ジム情報の修正提案と、あなたが送った通報',
];

function Bullets({ items }: { items: string[] }) {
  return (
    <View style={styles.bullets}>
      {items.map((item) => (
        <Text key={item} style={styles.bullet}>
          ・{item}
        </Text>
      ))}
    </View>
  );
}

export default function DeleteAccountScreen() {
  const deleteAccount = useDeleteAccount();

  function confirmDelete() {
    Alert.alert(
      'アカウントを削除しますか？',
      'この操作は取り消せません。削除したアカウントを元に戻すことはできません。',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除する',
          style: 'destructive',
          onPress: () =>
            deleteAccount.mutate(undefined, {
              onError: () =>
                Alert.alert('エラー', '削除できませんでした。通信環境を確認して、もう一度お試しください。'),
            }),
        },
      ]
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.content}>
        <Text style={styles.lead}>
          アカウントを削除すると、この端末の匿名アカウントは使えなくなります。
          削除後はアプリが最初の画面に戻り、利用規約に同意すると新しい匿名アカウントで始まります。
        </Text>

        <Text style={styles.heading}>削除されるもの</Text>
        <Bullets items={DELETED} />

        <Text style={styles.heading}>削除されずに残るもの</Text>
        <Bullets items={KEPT} />
        <Text style={styles.note}>
          残る情報は、あなたのアカウントとは結びつかない状態で保持されます。
          これらの削除を希望される場合は、{CONTACT_EMAIL} までご連絡ください。
        </Text>

        <Text style={styles.note}>
          端末内だけに保存されているカスタム種目・カスタム部位は、アプリを削除すると消えます。
        </Text>

        <TouchableOpacity
          style={[styles.deleteBtn, deleteAccount.isPending && styles.deleteBtnDisabled]}
          onPress={confirmDelete}
          disabled={deleteAccount.isPending}
        >
          {deleteAccount.isPending ? (
            <ActivityIndicator color="#fff" />
          ) : (
            <Text style={styles.deleteText}>アカウントを削除する</Text>
          )}
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  content: { padding: Spacing.three, paddingBottom: Spacing.five },
  lead: { color: Colors.textPrimary, fontSize: 14, lineHeight: 22 },
  heading: {
    color: Colors.textPrimary,
    fontSize: 15,
    fontWeight: 'bold',
    marginTop: Spacing.four,
    marginBottom: Spacing.two,
  },
  bullets: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.lightCyan,
    padding: Spacing.three,
    gap: Spacing.one,
  },
  bullet: { color: Colors.textSecondary, fontSize: 13, lineHeight: 20 },
  note: { color: Colors.textMuted, fontSize: 12, lineHeight: 18, marginTop: Spacing.two },
  deleteBtn: {
    marginTop: Spacing.five,
    backgroundColor: Colors.danger,
    borderRadius: 12,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  deleteBtnDisabled: { opacity: 0.6 },
  deleteText: { color: '#fff', fontSize: 15, fontWeight: 'bold' },
});
