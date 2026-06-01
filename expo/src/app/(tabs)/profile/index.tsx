import { StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, Spacing } from '@/constants/theme';

export default function ProfileScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>マイ</Text>
      </View>
      <View style={styles.body}>
        <Text style={styles.label}>匿名ユーザー</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { padding: Spacing.three, borderBottomWidth: 2, borderBottomColor: Colors.pink },
  title: { fontSize: 22, fontWeight: 'bold', color: Colors.textPrimary },
  body: { padding: Spacing.three },
  label: { color: Colors.textSecondary, fontSize: 15 },
});
