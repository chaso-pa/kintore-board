import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, Spacing } from '@/constants/theme';
import { useBlockedUsers, useUnblockUser, type BlockedUser } from '@/hooks/use-block';

/**
 * The list of people this account has blocked, and the way back.
 *
 * Blocking has to be reversible to be worth offering — a control that only goes one way gets
 * used hesitantly, or not at all. It is also what App Store review looks for after the block
 * itself: somewhere the state is visible rather than invisible and permanent.
 *
 * Nobody is named here, because nobody has a name. The excerpt of the post the block was made
 * from is the only handle a person has on which block is which, which is why it is stored at
 * block time rather than looked up — the post is often the first thing to be deleted.
 */
function formatDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return `${d.getFullYear()}/${d.getMonth() + 1}/${d.getDate()}`;
}

function BlockRow({ item, onUnblock }: { item: BlockedUser; onUnblock: () => void }) {
  return (
    <View style={styles.row}>
      <View style={styles.rowBody}>
        <Text style={styles.excerpt} numberOfLines={2}>
          {item.source_excerpt || '（投稿は削除されました）'}
        </Text>
        <Text style={styles.date}>{formatDate(item.created_at)} にブロック</Text>
      </View>
      <TouchableOpacity style={styles.unblockBtn} onPress={onUnblock}>
        <Text style={styles.unblockText}>解除</Text>
      </TouchableOpacity>
    </View>
  );
}

export default function BlockedUsersScreen() {
  const { data: blocks, isLoading } = useBlockedUsers();
  const unblock = useUnblockUser();

  function confirmUnblock(item: BlockedUser) {
    Alert.alert(
      'ブロックを解除しますか？',
      'この投稿者の投稿とスレッドがふたたび表示されるようになります。',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '解除する',
          onPress: () =>
            unblock.mutate(item.blocked_user_id, {
              onError: () => Alert.alert('エラー', '解除できませんでした。'),
            }),
        },
      ]
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Text style={styles.lead}>
        ブロックした投稿者の投稿とスレッドは表示されません。相手からもあなたの投稿は
        見えません。
      </Text>

      {isLoading ? (
        <ActivityIndicator color={Colors.pink} style={styles.loader} />
      ) : !blocks || blocks.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>ブロックしたユーザーはいません</Text>
          <Text style={styles.emptySubText}>
            投稿の 🚫 ボタンから、その投稿者をブロックできます
          </Text>
        </View>
      ) : (
        <FlatList
          data={blocks}
          keyExtractor={(item) => item.blocked_user_id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <BlockRow item={item} onUnblock={() => confirmUnblock(item)} />
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  lead: {
    color: Colors.textSecondary,
    fontSize: 13,
    lineHeight: 20,
    padding: Spacing.three,
  },
  loader: { marginTop: Spacing.five },
  listContent: { paddingHorizontal: Spacing.three, paddingBottom: Spacing.four },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.lightCyan,
    padding: Spacing.three,
    marginBottom: Spacing.two,
    gap: Spacing.two,
  },
  rowBody: { flex: 1 },
  excerpt: { color: Colors.textPrimary, fontSize: 14, lineHeight: 20 },
  date: { color: Colors.textMuted, fontSize: 11, marginTop: Spacing.one },
  unblockBtn: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.pink,
  },
  unblockText: { color: Colors.pink, fontSize: 13, fontWeight: '600' },
  empty: { alignItems: 'center', marginTop: Spacing.six, paddingHorizontal: Spacing.four },
  emptyText: { color: Colors.textSecondary, fontSize: 15, fontWeight: '600' },
  emptySubText: {
    color: Colors.textMuted,
    fontSize: 13,
    marginTop: Spacing.two,
    textAlign: 'center',
    lineHeight: 20,
  },
});
