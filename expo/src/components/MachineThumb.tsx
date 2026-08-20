import { memo, useState } from 'react';
import { Image, StyleSheet, View } from 'react-native';

import { SymbolIcon } from '@/components/SymbolIcon';
import { Colors } from '@/constants/theme';

interface Props {
  uri?: string;
  size?: number;
}

/**
 * Machine cover photo with a placeholder fallback on load failure.
 * Shared by the machine list tab, the gym machine list, and the machine link screen —
 * previously duplicated as an inline `memo` in each, which also meant three separate
 * `react/display-name` lint findings for the same component.
 */
export const MachineThumb = memo(function MachineThumb({ uri, size = 72 }: Props) {
  const [failed, setFailed] = useState(false);
  const dimension = { width: size, height: size, borderRadius: 8, flexShrink: 0 };

  if (uri && !failed) {
    return (
      <Image
        source={{ uri }}
        style={dimension}
        resizeMode="cover"
        onError={() => setFailed(true)}
      />
    );
  }
  return (
    <View style={[dimension, styles.placeholder]}>
      <SymbolIcon
        name="photo"
        ionicon="image-outline"
        // Fixed 18/20px looked lost inside a larger frame; scale with the box instead.
        size={Math.round(size * 0.4)}
        tintColor={Colors.textMuted}
      />
    </View>
  );
});

const styles = StyleSheet.create({
  placeholder: {
    backgroundColor: Colors.surfaceBlue,
    justifyContent: 'center',
    alignItems: 'center',
  },
});
