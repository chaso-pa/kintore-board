import { StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useIsOnline } from '@/lib/connectivity';

export function OfflineBanner() {
  const isOnline = useIsOnline();
  const insets = useSafeAreaInsets();
  if (isOnline) return null;

  return (
    <View style={[styles.banner, { paddingTop: insets.top + 6 }]} accessibilityRole="alert">
      <Text style={styles.text}>
        オフライン中：記録は端末に保存されます。掲示板・ジムは閲覧のみです
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    backgroundColor: '#FFE66D',
    paddingBottom: 6,
    paddingHorizontal: 16,
  },
  text: {
    color: '#243044',
    fontSize: 12,
    fontWeight: '700',
    textAlign: 'center',
  },
});
