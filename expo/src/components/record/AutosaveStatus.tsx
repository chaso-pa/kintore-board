import { StyleSheet, Text, View } from 'react-native';

import { Colors, Spacing } from '@/constants/theme';
import type { AutosaveStatus as Status } from '@/hooks/use-autosave';

/**
 * Says nothing while autosave is working, and speaks up only when it fails.
 *
 * Saving is meant to feel like it is not happening at all, so 保存中 / 保存済み / 未保存
 * are deliberately not shown: a label that narrates every keystroke turns a background
 * process into something to watch.
 *
 * A failure is the one case that still has to surface. Silence there would read exactly
 * like success while the entry is not actually stored anywhere.
 */
export function AutosaveStatusLabel({ status }: { status: Status }) {
  if (status !== 'error') return null;

  return (
    <View style={styles.row}>
      <Text style={styles.error}>保存できませんでした</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one, justifyContent: 'flex-end' },
  error: { fontSize: 12, color: Colors.danger, fontWeight: 'bold' },
});
