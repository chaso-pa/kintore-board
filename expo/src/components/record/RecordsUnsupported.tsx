import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, Spacing } from '@/constants/theme';

/** Shown in place of every record screen on web, which has no local records DB (plan §3.8). */
export function RecordsUnsupported() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.center}>
        <Text style={styles.text}>記録機能はアプリ版でご利用ください</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.four },
  text: { color: Colors.textMuted, fontSize: 15, fontWeight: '600', textAlign: 'center' },
});
