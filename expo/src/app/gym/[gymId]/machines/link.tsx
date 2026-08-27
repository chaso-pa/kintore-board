import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams, useRouter } from 'expo-router';
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
import { queryKeys } from '@/lib/query-keys';
import { isLinkable } from '@/lib/moderation';

interface MachineItem {
  id: string;
  name: string;
  manufacturer?: string;
  body_part?: string;
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

export default function LinkMachineScreen() {
  const { gymId } = useLocalSearchParams<{ gymId: string }>();
  const router = useRouter();
  const queryClient = useQueryClient();

  const [search, setSearch] = useState('');
  const [bodyPart, setBodyPart] = useState('');

  // Same query key as the gym machine list screen, so the "already linked" set is
  // warm from cache when arriving via the "+ 追加" button.
  const { data: gymMachines } = useQuery({
    queryKey: queryKeys.machines.forGym(gymId),
    queryFn: async () => {
      const res = await api.get(`/api/v1/gyms/${gymId}/machines`);
      return res.data;
    },
  });
  const linkedIds = new Set<string>((gymMachines?.items ?? []).map((m: MachineItem) => m.id));

  const { data, isLoading } = useQuery({
    queryKey: queryKeys.machines.search(search, bodyPart),
    queryFn: async () => {
      const res = await api.get('/api/v1/machines', {
        params: { q: search, body_part: bodyPart },
      });
      return res.data;
    },
  });
  // Only approved machines may be attached. The catalogue includes the caller's own
  // pending submissions — that is what would otherwise let someone inject an unreviewed
  // machine into any gym, where it would then be counted in that gym's machine total.
  // The server refuses it too; filtering here keeps the optimistic update from showing a
  // link that is about to be undone.
  const machines: MachineItem[] = (data?.items ?? []).filter((m: MachineItem) =>
    isLinkable(m.status)
  );

  // Tap toggles: linked -> DELETE, not linked -> POST. Cache is updated optimistically
  // so the row flips immediately instead of waiting for the round trip.
  const toggleMutation = useMutation({
    mutationFn: ({ machineId, linked }: { machineId: string; linked: boolean }) =>
      linked
        ? api.delete(`/api/v1/gyms/${gymId}/machines/${machineId}/link`)
        : api.post(`/api/v1/gyms/${gymId}/machines/${machineId}/link`),
    onMutate: async ({ machineId, linked }) => {
      await queryClient.cancelQueries({ queryKey: queryKeys.machines.forGym(gymId) });
      const previous = queryClient.getQueryData(queryKeys.machines.forGym(gymId));
      queryClient.setQueryData(queryKeys.machines.forGym(gymId), (old: any) => {
        if (!old) return old;
        const item = machines.find((m) => m.id === machineId);
        return {
          ...old,
          items: linked
            ? old.items.filter((m: MachineItem) => m.id !== machineId)
            : item
              ? [...old.items, item]
              : old.items,
        };
      });
      return { previous };
    },
    onError: (_err, _vars, ctx) => {
      if (ctx?.previous) queryClient.setQueryData(queryKeys.machines.forGym(gymId), ctx.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: queryKeys.machines.forGym(gymId) });
    },
  });

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <View style={styles.header}>
        <Text style={styles.headerTitle}>マシンを追加</Text>
      </View>

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
        style={styles.chipBar}
        contentContainerStyle={styles.chipBarContent}>
        {BODY_PARTS.map((bp) => (
          <TouchableOpacity
            key={bp.value}
            style={[styles.chip, bodyPart === bp.value && styles.chipActive]}
            onPress={() => setBodyPart(bp.value)}>
            <Text style={[styles.chipText, bodyPart === bp.value && styles.chipTextActive]}>
              {bp.label}
            </Text>
          </TouchableOpacity>
        ))}
      </ScrollView>

      {isLoading ? (
        <ActivityIndicator color={Colors.pink} style={{ marginTop: 40 }} />
      ) : (
        <FlatList
          data={machines}
          keyExtractor={(item) => item.id}
          contentContainerStyle={styles.listContent}
          ListEmptyComponent={<Text style={styles.emptyText}>該当するマシンがありません</Text>}
          ListFooterComponent={
            <TouchableOpacity
              style={styles.createBtn}
              onPress={() => router.push(`/machine/new?gym_id=${gymId}`)}>
              <Text style={styles.createBtnText}>見つからない場合はここから新規作成</Text>
            </TouchableOpacity>
          }
          renderItem={({ item }) => {
            const isLinked = linkedIds.has(item.id);
            const isPending =
              toggleMutation.isPending && toggleMutation.variables?.machineId === item.id;
            return (
              <TouchableOpacity
                style={[styles.row, isLinked && styles.rowLinked]}
                disabled={isPending}
                onPress={() => toggleMutation.mutate({ machineId: item.id, linked: isLinked })}>
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
                {isPending ? (
                  <ActivityIndicator size="small" color={Colors.cyan} />
                ) : isLinked ? (
                  <View style={styles.linkedBadge}>
                    <SymbolIcon name="checkmark" ionicon="checkmark" size={14} tintColor="#fff" />
                  </View>
                ) : (
                  <Text style={styles.addLabel}>追加</Text>
                )}
              </TouchableOpacity>
            );
          }}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: { paddingHorizontal: Spacing.three, paddingVertical: Spacing.two },
  headerTitle: { fontSize: 17, fontWeight: 'bold', color: Colors.textPrimary },

  searchWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginHorizontal: Spacing.three,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.lightCyan,
  },
  searchInput: { flex: 1, color: Colors.textPrimary, fontSize: 14 },

  chipBar: { flexGrow: 0, marginTop: Spacing.two },
  chipBarContent: { paddingHorizontal: Spacing.three, gap: Spacing.one },
  chip: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.lightCyan,
    backgroundColor: Colors.surface,
  },
  chipActive: { backgroundColor: Colors.hotPink, borderColor: Colors.hotPink },
  chipText: { color: Colors.textSecondary, fontSize: 13 },
  chipTextActive: { color: '#fff', fontWeight: 'bold' },

  listContent: { padding: Spacing.three, gap: Spacing.two },
  emptyText: { color: Colors.textMuted, fontSize: 13, textAlign: 'center', marginTop: Spacing.four },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    backgroundColor: Colors.surface,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.lightCyan,
    // Matches the same fix applied to gym/[gymId]/machines.tsx: two lines of text felt
    // squeezed at Spacing.two.
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
  rowLinked: { backgroundColor: Colors.surfacePink, borderColor: Colors.hotPink },
  addLabel: { color: Colors.cyan, fontWeight: 'bold', fontSize: 13 },
  linkedBadge: {
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: Colors.hotPink,
    alignItems: 'center',
    justifyContent: 'center',
  },

  createBtn: {
    alignItems: 'center',
    paddingVertical: Spacing.three,
    marginTop: Spacing.two,
  },
  createBtnText: { color: Colors.hotPink, fontSize: 13, fontWeight: '600' },
});
