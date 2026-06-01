import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Colors, Spacing } from '@/constants/theme';

export default function RecordScreen() {
  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>記録</Text>
        <TouchableOpacity style={styles.newBtn}>
          <Text style={styles.newBtnText}>+ 追加</Text>
        </TouchableOpacity>
      </View>
      <View style={styles.empty}>
        <Text style={styles.emptyText}>今日のトレーニングを記録しよう</Text>
      </View>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', padding: Spacing.three, borderBottomWidth: 2, borderBottomColor: Colors.pink },
  title: { fontSize: 22, fontWeight: 'bold', color: Colors.textPrimary },
  newBtn: { backgroundColor: Colors.hotPink, paddingHorizontal: Spacing.three, paddingVertical: Spacing.one, borderRadius: 20 },
  newBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },
  empty: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  emptyText: { color: Colors.textMuted, fontSize: 15 },
});
