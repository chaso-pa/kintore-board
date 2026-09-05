import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  FlatList,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SymbolIcon } from '@/components/SymbolIcon';
import { Colors, Spacing } from '@/constants/theme';
import { useDeleteContent } from '@/hooks/use-delete-content';
import { useModerationCounts } from '@/hooks/use-moderation';
import { useReportQueue, useResolveReports } from '@/hooks/use-report-queue';
import type { ReportQueueStatus } from '@/lib/query-keys';
import {
  canRemoveFromQueue,
  distinctReasonLabels,
  QUEUE_TABS,
  targetHref,
  targetKindLabel,
  targetStateLabel,
  waitingLabel,
  writtenDetails,
  type ReportGroup,
} from '@/lib/report-queue';
import { useAuthStore } from '@/store/auth';

function ReportCard({
  group,
  onResolve,
  onRemove,
  busy,
}: {
  group: ReportGroup;
  onResolve: (status: 'reviewed' | 'dismissed') => void;
  onRemove: () => void;
  busy: boolean;
}) {
  const router = useRouter();
  const href = targetHref(group);
  const state = targetStateLabel(group);
  const reasons = distinctReasonLabels(group.reports);
  const details = writtenDetails(group.reports);

  return (
    <View style={styles.card}>
      <View style={styles.cardHeader}>
        <Text style={styles.kind}>{targetKindLabel(group.target_type)}</Text>
        {group.report_count > 1 && (
          <View style={styles.countBadge}>
            <Text style={styles.countText}>{group.report_count}件</Text>
          </View>
        )}
        {state && (
          <View style={styles.stateBadge}>
            <Text style={styles.stateText}>{state}</Text>
          </View>
        )}
        <Text style={styles.waiting}>{waitingLabel(group)}</Text>
      </View>

      <Text style={styles.preview} numberOfLines={4}>
        {group.target_exists ? group.target_preview : 'この内容は削除されています'}
      </Text>

      <View style={styles.reasonRow}>
        {reasons.map((r) => (
          <View key={r} style={styles.reasonChip}>
            <Text style={styles.reasonChipText}>{r}</Text>
          </View>
        ))}
      </View>

      {details.length > 0 && (
        <View style={styles.details}>
          {details.map((d) => (
            <Text key={d} style={styles.detailText}>
              「{d}」
            </Text>
          ))}
        </View>
      )}

      <View style={styles.actions}>
        <TouchableOpacity
          style={[styles.viewBtn, !href && styles.viewBtnDisabled]}
          disabled={!href}
          onPress={() => href && router.push(href as never)}>
          <SymbolIcon
            name="arrow.up.right"
            ionicon="open-outline"
            size={13}
            tintColor={href ? Colors.cyan : Colors.textMuted}
          />
          <Text style={[styles.viewBtnText, !href && styles.viewBtnTextDisabled]}>内容を見る</Text>
        </TouchableOpacity>

        <View style={styles.decisions}>
          <TouchableOpacity
            style={[styles.decisionBtn, styles.dismissBtn]}
            disabled={busy}
            onPress={() => onResolve('dismissed')}>
            <Text style={styles.dismissText}>問題なし</Text>
          </TouchableOpacity>
          {/* Removing and closing the reports are one gesture here. Two buttons would let a
              moderator take content down and leave the complaints about it pending, which
              is how something reappears at the top of the queue already dealt with. */}
          {canRemoveFromQueue(group) && (
            <TouchableOpacity
              style={[styles.decisionBtn, styles.removeBtn]}
              disabled={busy}
              onPress={onRemove}>
              <Text style={styles.removeText}>削除</Text>
            </TouchableOpacity>
          )}
          <TouchableOpacity
            style={[styles.decisionBtn, styles.reviewBtn]}
            disabled={busy}
            onPress={() => onResolve('reviewed')}>
            <Text style={styles.reviewText}>対応済み</Text>
          </TouchableOpacity>
        </View>
      </View>
    </View>
  );
}

/**
 * The moderation queue.
 *
 * Reports were write-only before this screen existed: the endpoint accepted them and
 * nothing could read them back, so the only way to see one was to open the database. That
 * is not a moderation process, and App Store guideline 1.2 asks for one.
 *
 * Grouped by target, oldest first. The unit of work is the content, not the complaint.
 */
export default function ModerationReportsScreen() {
  const role = useAuthStore((s) => s.role);
  const [tab, setTab] = useState<ReportQueueStatus>('pending');
  const { data, isLoading, refetch, isRefetching } = useReportQueue(tab);
  const { data: counts } = useModerationCounts();
  const resolve = useResolveReports();
  const del = useDeleteContent();

  // The screen is reachable only from an admin-only row, but a route is a URL and this is
  // the last place to say no before rendering a list that would 403 anyway.
  if (role !== 'admin') {
    return (
      <SafeAreaView style={styles.container}>
        <Stack.Screen options={{ title: '通報' }} />
        <Text style={styles.empty}>この画面は管理者のみ利用できます。</Text>
      </SafeAreaView>
    );
  }

  const groups = data ?? [];
  const pending = counts?.reports?.pending ?? 0;

  function handleResolve(group: ReportGroup, status: 'reviewed' | 'dismissed') {
    const verb = status === 'reviewed' ? '対応済みにする' : '問題なしとして閉じる';
    Alert.alert(
      `${targetKindLabel(group.target_type)}の通報`,
      `この通報を${verb}。${group.report_count > 1 ? `${group.report_count}件すべてが閉じられます。` : ''}`,
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: 'OK',
          onPress: () =>
            resolve.mutate({
              targetType: group.target_type,
              targetId: group.target_id,
              status,
            }),
        },
      ]
    );
  }

  // Remove the content, then close the complaints about it. Sequenced rather than
  // parallel: if the delete fails there is nothing to mark as handled, and the reports must
  // stay pending. The reverse order would close them and then possibly leave the post up.
  function handleRemove(g: ReportGroup) {
    Alert.alert(
      `${targetKindLabel(g.target_type)}を削除しますか`,
      '運営による削除として記録され、この通報も対応済みになります。この操作は取り消せません。',
      [
        { text: 'キャンセル', style: 'cancel' },
        {
          text: '削除する',
          style: 'destructive',
          onPress: () =>
            del.mutate(
              {
                kind: g.target_type === 'thread' ? 'thread' : 'post',
                id: g.target_id,
                threadId: g.thread_id,
              },
              {
                onSuccess: () =>
                  resolve.mutate({
                    targetType: g.target_type,
                    targetId: g.target_id,
                    status: 'reviewed',
                  }),
              }
            ),
        },
      ]
    );
  }

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <Stack.Screen options={{ title: '通報' }} />

      <View style={styles.tabs}>
        {QUEUE_TABS.map((t) => {
          const active = t.value === tab;
          return (
            <TouchableOpacity
              key={t.value}
              style={[styles.tab, active && styles.tabActive]}
              onPress={() => setTab(t.value)}>
              <Text style={[styles.tabText, active && styles.tabTextActive]}>{t.label}</Text>
              {t.value === 'pending' && pending > 0 && (
                <View style={[styles.tabBadge, active && styles.tabBadgeActive]}>
                  <Text style={[styles.tabBadgeText, active && styles.tabBadgeTextActive]}>
                    {pending}
                  </Text>
                </View>
              )}
            </TouchableOpacity>
          );
        })}
      </View>

      {isLoading ? (
        <ActivityIndicator color={Colors.pink} style={styles.loader} />
      ) : (
        <FlatList
          data={groups}
          keyExtractor={(g) => `${g.target_type}:${g.target_id}`}
          contentContainerStyle={styles.list}
          onRefresh={refetch}
          refreshing={isRefetching}
          ListEmptyComponent={
            <Text style={styles.empty}>
              {tab === 'pending' ? '未対応の通報はありません。' : 'まだありません。'}
            </Text>
          }
          renderItem={({ item }) => (
            <ReportCard
              group={item}
              busy={resolve.isPending || del.isPending}
              onResolve={(status) => handleResolve(item, status)}
              onRemove={() => handleRemove(item)}
            />
          )}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  loader: { marginTop: Spacing.five },
  list: { padding: Spacing.three, gap: Spacing.three },
  empty: {
    color: Colors.textMuted,
    fontSize: 13,
    textAlign: 'center',
    marginTop: Spacing.five,
    paddingHorizontal: Spacing.three,
  },

  tabs: {
    flexDirection: 'row',
    gap: Spacing.one,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  tab: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.lightCyan,
    backgroundColor: Colors.surface,
    minHeight: 36,
  },
  tabActive: { backgroundColor: Colors.cyan, borderColor: Colors.cyan },
  tabText: { color: Colors.textSecondary, fontSize: 13 },
  tabTextActive: { color: '#fff', fontWeight: 'bold' },
  tabBadge: {
    minWidth: 18,
    paddingHorizontal: 5,
    paddingVertical: 1,
    borderRadius: 9,
    backgroundColor: Colors.hotPink,
    alignItems: 'center',
  },
  tabBadgeActive: { backgroundColor: '#fff' },
  tabBadgeText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },
  tabBadgeTextActive: { color: Colors.cyan },

  card: {
    backgroundColor: Colors.surface,
    borderRadius: 12,
    padding: Spacing.three,
    borderWidth: 1,
    borderColor: Colors.lightCyan,
    gap: Spacing.two,
  },
  cardHeader: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one },
  kind: { color: Colors.textPrimary, fontSize: 13, fontWeight: 'bold' },
  countBadge: {
    backgroundColor: Colors.hotPink,
    paddingHorizontal: Spacing.one,
    paddingVertical: 1,
    borderRadius: 8,
  },
  countText: { color: '#fff', fontSize: 11, fontWeight: 'bold' },
  stateBadge: {
    backgroundColor: Colors.surfaceBlue,
    paddingHorizontal: Spacing.one,
    paddingVertical: 1,
    borderRadius: 8,
  },
  stateText: { color: Colors.textSecondary, fontSize: 11 },
  waiting: { color: Colors.textMuted, fontSize: 11, marginLeft: 'auto' },

  preview: { color: Colors.textPrimary, fontSize: 14, lineHeight: 20 },

  reasonRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  reasonChip: {
    backgroundColor: Colors.surfacePink,
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
    borderRadius: 8,
  },
  reasonChipText: { color: Colors.hotPink, fontSize: 11, fontWeight: '600' },

  details: { gap: Spacing.half },
  detailText: { color: Colors.textSecondary, fontSize: 12, lineHeight: 18 },

  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: Spacing.one,
  },
  viewBtn: { flexDirection: 'row', alignItems: 'center', gap: Spacing.one, minHeight: 44 },
  viewBtnDisabled: { opacity: 0.5 },
  viewBtnText: { color: Colors.cyan, fontSize: 13, fontWeight: '600' },
  viewBtnTextDisabled: { color: Colors.textMuted },

  decisions: { flexDirection: 'row', gap: Spacing.two },
  decisionBtn: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: 16,
    minHeight: 36,
    justifyContent: 'center',
  },
  dismissBtn: { borderWidth: 1, borderColor: Colors.lightCyan },
  dismissText: { color: Colors.textSecondary, fontSize: 13, fontWeight: '600' },
  removeBtn: { borderWidth: 1, borderColor: Colors.danger },
  removeText: { color: Colors.danger, fontSize: 13, fontWeight: '600' },
  reviewBtn: { backgroundColor: Colors.success },
  reviewText: { color: '#fff', fontSize: 13, fontWeight: 'bold' },
});
