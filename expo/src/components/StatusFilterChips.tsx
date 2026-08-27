import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { Colors, Spacing } from '@/constants/theme';
import { pendingBadgeCount, shouldShowStatusFilter, STATUS_FILTERS } from '@/lib/moderation';
import type { ModerationStatusFilter } from '@/lib/query-keys';
import { useAuthStore } from '@/store/auth';

interface Props {
  value: ModerationStatusFilter;
  onChange: (value: ModerationStatusFilter) => void;
  /** Pending rows in this listing's queue; drives the dot on the 審査中 chip. */
  pendingCount?: number | null;
}

/**
 * Admin-only filter for a listing.
 *
 * This is how an admin reaches a pending row at all. The approve controls live on detail
 * pages, and pending rows are absent from the default listing — so without these chips
 * there would be a review flow with no way in, and submissions would pile up unseen.
 *
 * The count is the part that makes a backlog visible: a chip alone reads the same whether
 * the queue holds nothing or forty things.
 *
 * Ordinary users get nothing here — their listing already contains only what they may see.
 */
export function StatusFilterChips({ value, onChange, pendingCount }: Props) {
  const role = useAuthStore((s) => s.role);
  if (!shouldShowStatusFilter(role)) return null;

  const badge = pendingBadgeCount(pendingCount);

  return (
    <View style={styles.bar}>
      {STATUS_FILTERS.map((f) => {
        const active = f.value === value;
        return (
          <TouchableOpacity
            key={f.value || 'all'}
            style={[styles.chip, active && styles.chipActive]}
            onPress={() => onChange(f.value)}>
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{f.label}</Text>
            {f.value === 'pending' && badge !== null && (
              <View style={[styles.badge, active && styles.badgeActive]}>
                <Text style={[styles.badgeText, active && styles.badgeTextActive]}>{badge}</Text>
              </View>
            )}
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    gap: Spacing.one,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.lightCyan,
    backgroundColor: Colors.surface,
  },
  chipActive: { backgroundColor: Colors.cyan, borderColor: Colors.cyan },
  chipText: { color: Colors.textSecondary, fontSize: 13 },
  chipTextActive: { color: '#fff', fontWeight: 'bold' },
  badge: {
    minWidth: 18,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 9,
    backgroundColor: Colors.hotPink,
    alignItems: 'center',
  },
  badgeActive: { backgroundColor: '#fff' },
  badgeText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },
  badgeTextActive: { color: Colors.cyan },
});
