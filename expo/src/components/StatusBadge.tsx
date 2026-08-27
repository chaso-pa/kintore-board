import { StyleSheet, Text, View } from 'react-native';

import { Colors, Spacing } from '@/constants/theme';
import { normalizeStatus, statusBadgeLabel } from '@/lib/moderation';

interface Props {
  status?: string | null;
  /** Slightly smaller type, for badges sitting inside a list row rather than a header. */
  compact?: boolean;
}

/**
 * Marks a row that is not publicly visible.
 *
 * It carries weight beyond decoration: a submitter whose gym does not appear on the map
 * has no other way to tell approval from a broken form, and "my registration vanished" is
 * the likeliest support question this feature creates.
 *
 * Renders nothing for active rows — see statusBadgeLabel.
 */
export function StatusBadge({ status, compact = false }: Props) {
  const label = statusBadgeLabel(status);
  if (!label) return null;

  const rejected = normalizeStatus(status) === 'rejected';
  return (
    <View style={[styles.badge, rejected ? styles.rejected : styles.pending]}>
      <Text style={[styles.text, compact && styles.textCompact, rejected && styles.textRejected]}>
        {label}
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  badge: {
    paddingHorizontal: Spacing.two,
    paddingVertical: 1,
    borderRadius: 8,
    alignSelf: 'flex-start',
  },
  pending: { backgroundColor: Colors.surfaceBlue },
  rejected: { backgroundColor: Colors.surfacePink },
  text: { color: Colors.cyan, fontSize: 11, fontWeight: 'bold' },
  textCompact: { fontSize: 10 },
  textRejected: { color: Colors.hotPink },
});
