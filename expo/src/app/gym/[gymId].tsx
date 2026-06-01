import { useQuery } from '@tanstack/react-query';
import { Link, useLocalSearchParams } from 'expo-router';
import { ActivityIndicator, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '@/lib/api';
import { Colors, Spacing } from '@/constants/theme';

export default function GymDetailScreen() {
  const { gymId } = useLocalSearchParams<{ gymId: string }>();

  const { data: gym, isLoading } = useQuery({
    queryKey: ['gym', gymId],
    queryFn: async () => {
      const res = await api.get(`/api/v1/gyms/${gymId}`);
      return res.data;
    },
  });

  const { data: machinesData } = useQuery({
    queryKey: ['machines', gymId],
    queryFn: async () => {
      const res = await api.get(`/api/v1/gyms/${gymId}/machines`);
      return res.data;
    },
  });

  if (isLoading) return <ActivityIndicator color={Colors.pink} style={{ marginTop: 40 }} />;
  if (!gym) return null;

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView>
        <View style={styles.section}>
          <Text style={styles.gymName}>{gym.name}</Text>
          {gym.address && <Text style={styles.address}>{gym.address}</Text>}
          <View style={styles.fees}>
            {gym.visitor_fee && <Text style={styles.feeLabel}>ビジター <Text style={styles.feeValue}>¥{gym.visitor_fee.toLocaleString()}</Text></Text>}
            {gym.monthly_fee && <Text style={styles.feeLabel}>月額 <Text style={styles.feeValue}>¥{gym.monthly_fee.toLocaleString()}</Text></Text>}
          </View>
          <View style={styles.userInfo}>
            <Text style={styles.userInfoText}>※ユーザー投稿情報</Text>
          </View>
        </View>

        {machinesData?.items?.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>マシン一覧</Text>
            {machinesData.items.map((m: { id: string; name: string; body_part?: string; manufacturer?: string }) => (
              <Link key={m.id} href={`/gym/${gymId}/machine/${m.id}`} asChild>
                <TouchableOpacity style={styles.machineCard}>
                  <Text style={styles.machineName}>{m.name}</Text>
                  {m.body_part && <Text style={styles.machineMeta}>{m.body_part}</Text>}
                </TouchableOpacity>
              </Link>
            ))}
          </View>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  section: { padding: Spacing.three, borderBottomWidth: 1, borderBottomColor: Colors.surfaceBlue },
  gymName: { fontSize: 22, fontWeight: 'bold', color: Colors.textPrimary },
  address: { color: Colors.textSecondary, fontSize: 13, marginTop: 2 },
  fees: { flexDirection: 'row', gap: Spacing.three, marginTop: Spacing.two },
  feeLabel: { color: Colors.textSecondary, fontSize: 13 },
  feeValue: { color: Colors.hotPink, fontWeight: 'bold', fontSize: 16 },
  userInfo: { marginTop: Spacing.two, backgroundColor: Colors.surfacePink, padding: Spacing.one, borderRadius: 8 },
  userInfoText: { color: Colors.hotPink, fontSize: 11 },
  sectionTitle: { fontSize: 16, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: Spacing.two },
  machineCard: { backgroundColor: Colors.surface, padding: Spacing.two, borderRadius: 10, borderWidth: 1, borderColor: Colors.lightCyan, marginBottom: Spacing.one },
  machineName: { color: Colors.textPrimary, fontWeight: '600' },
  machineMeta: { color: Colors.textMuted, fontSize: 12 },
});
