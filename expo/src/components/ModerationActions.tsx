import { ActivityIndicator, Alert, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { Colors, Spacing } from '@/constants/theme';
import { shouldShowModerationActions } from '@/lib/moderation';
import { useModerationDecision, type ModerationTarget } from '@/hooks/use-moderation';
import { useAuthStore } from '@/store/auth';

interface Props {
  target: ModerationTarget;
  status?: string | null;
  /** What the confirmation dialog calls this thing, e.g. 「ゴールドジム渋谷」. */
  label: string;
}

/**
 * The approve / reject pair, shown inline on whatever is being reviewed.
 *
 * Inline rather than on a dedicated queue screen: reviewing a gym means looking at its
 * name, address and photos, and a separate list would show none of that. The listings
 * carry a 審査中 filter so pending rows are still reachable — without it these buttons
 * would sit on pages an admin had no route to.
 *
 * Renders nothing unless the viewer is an admin and the row is pending. That is a
 * rendering decision only; the server checks the role again on every call.
 */
export function ModerationActions({ target, status, label }: Props) {
  const role = useAuthStore((s) => s.role);
  const decide = useModerationDecision();

  if (!shouldShowModerationActions(role, status)) return null;

  const confirmReject = () => {
    // Rejection is the one direction with no way back in the app: a rejected row leaves
    // every listing, including the admin's. Worth a confirmation step.
    Alert.alert(
      `「${label}」を却下しますか？`,
      '却下すると投稿者を含め誰にも表示されなくなります。アプリからは元に戻せません。',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '却下する',
          style: 'destructive',
          onPress: () => decide.mutate({ target, status: 'rejected' }),
        },
      ]
    );
  };

  return (
    <View style={styles.row}>
      {decide.isPending ? (
        <ActivityIndicator color={Colors.cyan} />
      ) : (
        <>
          <TouchableOpacity
            style={[styles.button, styles.approve]}
            onPress={() => decide.mutate({ target, status: 'active' })}>
            <Text style={styles.approveText}>✓ 承認</Text>
          </TouchableOpacity>
          <TouchableOpacity style={[styles.button, styles.reject]} onPress={confirmReject}>
            <Text style={styles.rejectText}>✕ 却下</Text>
          </TouchableOpacity>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginTop: Spacing.two,
  },
  button: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: 16,
    borderWidth: 1,
  },
  approve: { backgroundColor: Colors.cyan, borderColor: Colors.cyan },
  approveText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
  reject: { backgroundColor: Colors.surface, borderColor: Colors.hotPink },
  rejectText: { color: Colors.hotPink, fontWeight: 'bold', fontSize: 13 },
});
