import { useQuery } from '@tanstack/react-query';
import { Link } from 'expo-router';
import {
  ActivityIndicator,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SymbolIcon } from '@/components/SymbolIcon';
import { Colors, Spacing } from '@/constants/theme';
import { useModerationCounts } from '@/hooks/use-moderation';
import { api } from '@/lib/api';
import { queryKeys } from '@/lib/query-keys';
import { useAuthStore } from '@/store/auth';

interface FavoriteGymItem {
  id: string;
  name: string;
  address?: string;
  visitor_fee?: number;
  machine_count: number;
}

async function fetchFavoriteGyms() {
  const res = await api.get('/api/v1/users/me/gym-favorites');
  return res.data.items as FavoriteGymItem[];
}

/**
 * The way into the moderation queue.
 *
 * Admin-only and deliberately the only entrance: the approve controls for gyms and machines
 * sit inline on their own listings, but a reported post has no listing to sit on, so
 * without a row here the queue would be a screen with no route to it.
 *
 * The count is what makes a backlog visible. A plain row reads the same whether nothing is
 * waiting or forty things are.
 */
function ModerationEntry() {
  const role = useAuthStore((s) => s.role);
  const { data: counts } = useModerationCounts();
  if (role !== 'admin') return null;

  const pending = counts?.reports?.pending ?? 0;

  return (
    <Link href="/moderation/reports" asChild>
      <TouchableOpacity style={styles.moderationRow}>
        <SymbolIcon name="flag" ionicon="flag-outline" size={16} tintColor={Colors.hotPink} />
        <Text style={styles.moderationLabel}>通報の確認</Text>
        {pending > 0 && (
          <View style={styles.moderationBadge}>
            <Text style={styles.moderationBadgeText}>{pending}</Text>
          </View>
        )}
        <Text style={styles.chevron}>›</Text>
      </TouchableOpacity>
    </Link>
  );
}

export default function ProfileScreen() {
  const { data: favGyms, isLoading } = useQuery({
    queryKey: queryKeys.gyms.favorites(),
    queryFn: fetchFavoriteGyms,
  });

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>マイ</Text>
      </View>

      <View style={styles.userCard}>
        <Text style={styles.userLabel}>匿名ユーザー</Text>
      </View>

      <ModerationEntry />

      <View style={styles.sectionHeader}>
        <Text style={styles.sectionTitle}>保存したジム</Text>
      </View>

      {isLoading ? (
        <ActivityIndicator color={Colors.pink} style={styles.loader} />
      ) : !favGyms || favGyms.length === 0 ? (
        <View style={styles.empty}>
          <Text style={styles.emptyIcon}>♡</Text>
          <Text style={styles.emptyText}>保存したジムはありません</Text>
          <Text style={styles.emptySubText}>ジム詳細の♡ボタンで保存できます</Text>
        </View>
      ) : (
        <FlatList
          data={favGyms}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          renderItem={({ item }) => (
            <Link href={`/gym/${item.id}`} asChild>
              <TouchableOpacity style={styles.gymCard}>
                <View style={styles.gymCardBody}>
                  <Text style={styles.gymName} numberOfLines={1}>{item.name}</Text>
                  {item.address && (
                    <Text style={styles.gymAddress} numberOfLines={1}>{item.address}</Text>
                  )}
                  <View style={styles.gymMeta}>
                    {item.visitor_fee != null && (
                      <Text style={styles.gymFee}>ビジター ¥{item.visitor_fee.toLocaleString()}</Text>
                    )}
                    {item.machine_count > 0 && (
                      <Text style={styles.gymMachines}>マシン {item.machine_count}台</Text>
                    )}
                  </View>
                </View>
                <Text style={styles.chevron}>›</Text>
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
  header: { padding: Spacing.three, borderBottomWidth: 2, borderBottomColor: Colors.pink },
  title: { fontSize: 22, fontWeight: 'bold', color: Colors.textPrimary },

  userCard: {
    margin: Spacing.three,
    padding: Spacing.three,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.lightCyan,
  },
  moderationRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginHorizontal: Spacing.three,
    marginBottom: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.lightCyan,
    backgroundColor: Colors.surface,
    minHeight: 48,
  },
  moderationLabel: { flex: 1, color: Colors.textPrimary, fontSize: 14, fontWeight: '600' },
  moderationBadge: {
    minWidth: 20,
    paddingHorizontal: 6,
    paddingVertical: 1,
    borderRadius: 10,
    backgroundColor: Colors.hotPink,
    alignItems: 'center',
  },
  moderationBadgeText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },
  userLabel: { color: Colors.textSecondary, fontSize: 15 },

  sectionHeader: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderBottomWidth: 1,
    borderBottomColor: Colors.surfaceBlue,
  },
  sectionTitle: { fontSize: 15, fontWeight: 'bold', color: Colors.textPrimary },

  loader: { marginTop: Spacing.five },
  listContent: { paddingTop: Spacing.one },

  empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: Spacing.five },
  emptyIcon: { fontSize: 40, color: Colors.textMuted, marginBottom: Spacing.two },
  emptyText: { color: Colors.textSecondary, fontSize: 15, fontWeight: '600' },
  emptySubText: { color: Colors.textMuted, fontSize: 13, marginTop: Spacing.one },

  gymCard: {
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    marginHorizontal: Spacing.two,
    marginVertical: Spacing.one,
    padding: Spacing.three,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.lightCyan,
  },
  gymCardBody: { flex: 1 },
  gymName: { color: Colors.textPrimary, fontWeight: '700', fontSize: 15 },
  gymAddress: { color: Colors.textSecondary, fontSize: 12, marginTop: 2 },
  gymMeta: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.one },
  gymFee: { color: Colors.hotPink, fontWeight: '600', fontSize: 13 },
  gymMachines: { color: Colors.cyan, fontSize: 13 },
  chevron: { color: Colors.textMuted, fontSize: 20, marginLeft: Spacing.two },
});
