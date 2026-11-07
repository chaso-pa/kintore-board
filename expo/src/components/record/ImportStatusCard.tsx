import { StyleSheet, Text, View, type StyleProp, type ViewStyle } from 'react-native';

import { Colors, Spacing } from '@/constants/theme';
import { useIsOnline } from '@/lib/connectivity';
import { useImportState } from '@/lib/records/import-state';

/** Initial import progress (plan §3.5 U5). Hidden once done, and on web. */
export function ImportStatusCard({ style }: { style?: StyleProp<ViewStyle> }) {
  const { importState, importCount } = useImportState();
  const isOnline = useIsOnline();

  let message: string | null = null;
  // 'running' survives a kill mid-import, so offline it means "will resume", not "in progress".
  if (importState === 'running' && isOnline) message = `過去の記録を取り込んでいます（${importCount} 件）`;
  else if (importState !== 'done' && importState !== null && !isOnline)
    message = 'オンラインになると過去の記録を取り込みます';
  if (!message) return null;

  return (
    <View style={[styles.card, style]} accessibilityRole="summary">
      <Text style={styles.text}>{message}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    backgroundColor: Colors.surfaceBlue,
    borderRadius: 12,
    paddingVertical: Spacing.two,
    paddingHorizontal: Spacing.three,
  },
  text: { color: Colors.textPrimary, fontSize: 13, fontWeight: '700' },
});
