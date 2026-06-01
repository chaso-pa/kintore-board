import { useQuery } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '@/lib/api';
import { Colors, Spacing } from '@/constants/theme';

export default function MachineDetailScreen() {
  const { machineId } = useLocalSearchParams<{ machineId: string }>();

  const { data: machine, isLoading } = useQuery({
    queryKey: ['machine', machineId],
    queryFn: async () => {
      const res = await api.get(`/api/v1/machines/${machineId}`);
      return res.data;
    },
  });

  if (isLoading) return <ActivityIndicator color={Colors.pink} style={{ marginTop: 40 }} />;
  if (!machine) return null;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView>
        <View style={styles.section}>
          <Text style={styles.machineName}>{machine.name}</Text>
          {machine.manufacturer && (
            <View style={styles.badge}>
              <Text style={styles.badgeText}>{machine.manufacturer}</Text>
            </View>
          )}
          {machine.body_part && (
            <View style={[styles.badge, styles.badgeBlue]}>
              <Text style={styles.badgeText}>{machine.body_part}</Text>
            </View>
          )}
        </View>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  section: { padding: Spacing.three },
  machineName: { fontSize: 22, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: Spacing.two },
  badge: { alignSelf: 'flex-start', backgroundColor: Colors.surfacePink, paddingHorizontal: Spacing.two, paddingVertical: Spacing.one, borderRadius: 8, marginBottom: Spacing.one },
  badgeBlue: { backgroundColor: Colors.surfaceBlue },
  badgeText: { color: Colors.textPrimary, fontSize: 12, fontWeight: '600' },
});
