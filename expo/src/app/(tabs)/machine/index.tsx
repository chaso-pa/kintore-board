import { useQuery } from '@tanstack/react-query';
import { Link } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MachineThumb } from '@/components/MachineThumb';
import { SymbolIcon } from '@/components/SymbolIcon';
import { api } from '@/lib/api';
import { Colors, Spacing } from '@/constants/theme';
import { queryKeys, type ModerationStatusFilter } from '@/lib/query-keys';
import { StatusFilterChips } from '@/components/StatusFilterChips';
import { StatusBadge } from '@/components/StatusBadge';
import { ModerationActions } from '@/components/ModerationActions';
import { useModerationCounts } from '@/hooks/use-moderation';

interface MachineItem {
  id: string;
  name: string;
  manufacturer?: string;
  body_part?: string;
  thread_count: number;
  thumbnail_url?: string;
  status?: string;
}

const BODY_PARTS = [
  { value: '', label: '全て' },
  { value: '胸', label: '胸' },
  { value: '背中', label: '背中' },
  { value: '脚', label: '脚' },
  { value: '肩', label: '肩' },
  { value: '腕', label: '腕' },
  { value: '腹部', label: '腹部' },
];

export default function MachineScreen() {
  const [search, setSearch] = useState('');
  const [bodyPart, setBodyPart] = useState('');
  const [statusFilter, setStatusFilter] = useState<ModerationStatusFilter>('');
  const counts = useModerationCounts();

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.machines.search(search, bodyPart, statusFilter),
    queryFn: async () => {
      const res = await api.get('/api/v1/machines', {
        params: { q: search, body_part: bodyPart, ...(statusFilter && { status: statusFilter }) },
      });
      return res.data;
    },
  });

  const machines: MachineItem[] = data?.items ?? [];

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>マシン</Text>
        <Link href="/machine/new" asChild>
          <TouchableOpacity style={styles.newBtn}>
            <Text style={styles.newBtnText}>登録</Text>
          </TouchableOpacity>
        </Link>
      </View>

      <StatusFilterChips
        value={statusFilter}
        onChange={setStatusFilter}
        pendingCount={counts.data?.machines.pending}
      />

      <View style={styles.searchWrap}>
        <SymbolIcon name="magnifyingglass" ionicon="search-outline" size={16} tintColor={Colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="マシン名で検索"
          placeholderTextColor={Colors.textMuted}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
      </View>

      <ScrollView
        horizontal
        showsHorizontalScrollIndicator={false}
        style={styles.chipScroll}
        contentContainerStyle={styles.chipContent}>
        {BODY_PARTS.map((bp) => {
          const selected = bodyPart === bp.value;
          return (
            <TouchableOpacity
              key={bp.value}
              onPress={() => setBodyPart(bp.value)}
              style={[styles.chip, selected && styles.chipSelected]}>
              <Text style={[styles.chipText, selected && styles.chipTextSelected]}>
                {bp.label}
              </Text>
            </TouchableOpacity>
          );
        })}
      </ScrollView>

      {isLoading ? (
        <ActivityIndicator color={Colors.pink} style={styles.loader} />
      ) : (
        <FlatList
          data={machines}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={
            <Text style={styles.emptyText}>マシンが見つかりませんでした</Text>
          }
          renderItem={({ item }) => (
            <Link href={`/machine/${item.id}`} asChild>
              <TouchableOpacity style={styles.card}>
                <View style={styles.thumbWrap}>
                  <MachineThumb uri={item.thumbnail_url} />
                </View>
                <View style={styles.cardBody}>
                  <Text style={styles.machineName} numberOfLines={2}>{item.name}</Text>
                  <View style={styles.tagRow}>
                    {item.manufacturer && (
                      <View style={styles.tagManufacturer}>
                        <Text style={styles.tagManufacturerText}>{item.manufacturer}</Text>
                      </View>
                    )}
                    {item.body_part && (
                      <View style={styles.tagBodyPart}>
                        <Text style={styles.tagBodyPartText}>{item.body_part}</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.threadCountRow}>
                    <SymbolIcon name="bubble.left" ionicon="chatbubble-outline" size={12} tintColor={Colors.textMuted} />
                    <Text style={styles.threadCountText}>{item.thread_count}</Text>
                  </View>
                  <StatusBadge status={item.status} compact />
                  {/* Outside the Link would be cleaner, but the card is the Link's only
                      child; the actions render nothing except for an admin on a pending
                      row, so the overlap is limited to exactly that case. */}
                  <ModerationActions
                    target={{ kind: 'machine', machineId: item.id }}
                    status={item.status}
                    label={item.name}
                  />
                </View>
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
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.three,
    borderBottomWidth: 2,
    borderBottomColor: Colors.cyan,
  },
  title: { fontSize: 22, fontWeight: 'bold', color: Colors.textPrimary },
  newBtn: {
    backgroundColor: Colors.cyan,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: 20,
  },
  newBtnText: { color: Colors.textPrimary, fontWeight: 'bold', fontSize: 13 },

  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    margin: Spacing.two,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.lightCyan,
  },
  searchInput: {
    flex: 1,
    color: Colors.textPrimary,
    fontSize: 14,
  },

  chipScroll: { flexGrow: 0 },
  chipContent: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
  },

  loader: { marginTop: Spacing.five },
  listContent: { paddingTop: Spacing.one, paddingBottom: Spacing.five },
  emptyText: {
    color: Colors.textMuted,
    fontSize: 14,
    textAlign: 'center',
    marginTop: Spacing.five,
  },

  chip: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: 20,
    marginRight: Spacing.one,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: Colors.lightCyan,
  },
  chipSelected: { backgroundColor: Colors.hotPink, borderColor: Colors.hotPink },
  chipText: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary },
  chipTextSelected: { color: '#fff' },

  card: {
    backgroundColor: Colors.surface,
    margin: Spacing.two,
    marginVertical: Spacing.one,
    padding: Spacing.two,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.lightCyan,
    flexDirection: 'row',
    gap: Spacing.two,
  },
  thumbWrap: { flexShrink: 0 },
  cardBody: { flex: 1, gap: 4 },
  machineName: { color: Colors.textPrimary, fontSize: 15, fontWeight: '700' },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  tagManufacturer: {
    backgroundColor: Colors.surfacePink,
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
    borderRadius: 8,
  },
  tagManufacturerText: { color: Colors.hotPink, fontSize: 11, fontWeight: '600' },
  tagBodyPart: {
    backgroundColor: Colors.surfaceBlue,
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
    borderRadius: 8,
  },
  tagBodyPartText: { color: Colors.cyan, fontSize: 11, fontWeight: '600' },
  threadCountRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: 2 },
  threadCountText: { color: Colors.textMuted, fontSize: 12 },
});
