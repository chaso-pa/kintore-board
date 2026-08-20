import { useQuery } from '@tanstack/react-query';
import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MachineThumb } from '@/components/MachineThumb';
import { SymbolIcon } from '@/components/SymbolIcon';
import { api } from '@/lib/api';
import { Colors, Spacing } from '@/constants/theme';

interface MachineItem {
  id: string;
  name: string;
  manufacturer?: string;
  body_part?: string;
  thumbnail_url?: string;
}

export default function GymMachinesScreen() {
  const { gymId } = useLocalSearchParams<{ gymId: string }>();
  const router = useRouter();

  const { data, isLoading } = useQuery({
    queryKey: ['machines', gymId],
    queryFn: async () => {
      const res = await api.get(`/api/v1/gyms/${gymId}/machines`);
      return res.data;
    },
  });

  const machines: MachineItem[] = data?.items ?? [];

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>ジムにあるマシン</Text>
        <TouchableOpacity
          style={styles.addBtn}
          onPress={() => router.push(`/gym/${gymId}/machines/link`)}>
          <Text style={styles.addBtnText}>+ 追加</Text>
        </TouchableOpacity>
      </View>

      {isLoading ? (
        <ActivityIndicator color={Colors.pink} style={{ marginTop: 40 }} />
      ) : machines.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyText}>まだマシンが登録されていません</Text>
          <TouchableOpacity
            style={styles.emptyBtn}
            onPress={() => router.push(`/gym/${gymId}/machines/link`)}>
            <Text style={styles.emptyBtnText}>マシンを追加する</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={machines}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <Link href={`/machine/${item.id}`} asChild>
              <TouchableOpacity style={styles.row}>
                <MachineThumb uri={item.thumbnail_url} size={60} />
                <View style={styles.rowBody}>
                  <View style={styles.rowTop}>
                    <Text style={styles.rowName} numberOfLines={1}>{item.name}</Text>
                    {item.body_part && (
                      <View style={styles.partTag}>
                        <Text style={styles.partTagText}>{item.body_part}</Text>
                      </View>
                    )}
                  </View>
                  {item.manufacturer && <Text style={styles.rowMeta}>{item.manufacturer}</Text>}
                </View>
                <SymbolIcon
                  name="chevron.right"
                  ionicon="chevron-forward-outline"
                  size={16}
                  tintColor={Colors.textMuted}
                />
              </TouchableOpacity>
            </Link>
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  headerTitle: { fontSize: 17, fontWeight: 'bold', color: Colors.textPrimary },
  addBtn: {
    backgroundColor: Colors.hotPink,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: 16,
  },
  addBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 13 },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: Spacing.three, padding: Spacing.five },
  emptyText: { color: Colors.textMuted, fontSize: 13 },
  emptyBtn: {
    backgroundColor: Colors.surfaceBlue,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    borderRadius: 20,
  },
  emptyBtnText: { color: Colors.cyan, fontWeight: '600', fontSize: 14 },

  listContent: { padding: Spacing.three, gap: Spacing.two },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.lightCyan,
    // Two lines of text felt squeezed at Spacing.two; a taller row with more room
    // between the name and the manufacturer line reads less cramped.
    paddingVertical: Spacing.three,
    paddingHorizontal: Spacing.three,
  },
  rowBody: { flex: 1, gap: Spacing.half },
  rowTop: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two },
  rowName: { flexShrink: 1, color: Colors.textPrimary, fontSize: 16, fontWeight: '600' },
  partTag: {
    backgroundColor: Colors.surfacePink,
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
    borderRadius: 8,
  },
  partTagText: { color: Colors.hotPink, fontSize: 11, fontWeight: 'bold' },
  rowMeta: { color: Colors.textMuted, fontSize: 13 },
});
