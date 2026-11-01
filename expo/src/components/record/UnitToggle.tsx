import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { Colors } from '@/constants/theme';
import { unitLabel, type WeightUnit } from '@/lib/weight-unit';

const OPTIONS: WeightUnit[] = ['kg', 'lb'];

/** A two-way [kg|lbs] switch. `compact` is the size that fits beside an exercise name. */
export function UnitToggle({
  value,
  onChange,
  compact = false,
}: {
  value: WeightUnit;
  onChange: (unit: WeightUnit) => void;
  compact?: boolean;
}) {
  return (
    <View style={styles.toggle} accessibilityRole="radiogroup">
      {OPTIONS.map((u) => {
        const on = value === u;
        return (
          <TouchableOpacity
            key={u}
            style={[styles.option, compact && styles.optionCompact, on && styles.optionOn]}
            onPress={() => onChange(u)}
            hitSlop={compact ? 6 : undefined}
            accessibilityRole="radio"
            accessibilityState={{ selected: on }}>
            <Text style={[styles.text, compact && styles.textCompact, on && styles.textOn]}>
              {unitLabel(u)}
            </Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const styles = StyleSheet.create({
  toggle: {
    flexDirection: 'row',
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.pink,
    overflow: 'hidden',
  },
  // Fixed widths, so "kg" and "lbs" take the same space and nothing moves when switching.
  option: { width: 48, alignItems: 'center', paddingVertical: 4 },
  optionCompact: { width: 36, paddingVertical: 2 },
  optionOn: { backgroundColor: Colors.pink },
  text: { color: Colors.pink, fontSize: 13, fontWeight: '600' },
  textCompact: { fontSize: 12 },
  textOn: { color: '#fff' },
});
