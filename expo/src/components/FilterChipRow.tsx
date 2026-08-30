import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { Colors, Spacing } from '@/constants/theme';

export interface FilterChipOption<T extends string> {
  value: T;
  label: string;
}

interface Props<T extends string> {
  options: readonly FilterChipOption<T>[];
  value: T;
  onChange: (value: T) => void;
}

/**
 * Category chips that wrap onto a second row instead of running off the edge.
 *
 * Four screens had their own copy of this as a horizontal ScrollView. Scrolling hides the
 * chips past the edge, and there is nothing to say more exist — with the body parts grown
 * to nine, the later ones were simply unreachable-looking. Wrapping shows every option at
 * once, which is what a filter row is for.
 *
 * `flexWrap` does the work: one row while they fit, two or more when they do not, so short
 * lists are unaffected.
 */
export function FilterChipRow<T extends string>({ options, value, onChange }: Props<T>) {
  return (
    <View style={styles.row}>
      {options.map((o) => {
        const active = o.value === value;
        return (
          <TouchableOpacity
            key={o.value || 'all'}
            style={[styles.chip, active && styles.chipActive]}
            onPress={() => onChange(o.value)}>
            <Text style={[styles.chipText, active && styles.chipTextActive]}>{o.label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  row: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.one,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  chip: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.lightCyan,
    backgroundColor: Colors.surface,
  },
  chipActive: { backgroundColor: Colors.hotPink, borderColor: Colors.hotPink },
  chipText: { color: Colors.textSecondary, fontSize: 13 },
  chipTextActive: { color: Colors.surface, fontWeight: 'bold' },
});
