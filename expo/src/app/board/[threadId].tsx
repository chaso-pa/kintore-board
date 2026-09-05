import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocalSearchParams, useRouter } from 'expo-router';
import { useRef, useState } from 'react';
import { SymbolIcon } from '@/components/SymbolIcon';
import {
  ActivityIndicator,
  Alert,
  Animated,
  FlatList,
  KeyboardAvoidingView,
  Platform,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ReportSheet } from '@/components/ReportSheet';
import { Colors, Spacing } from '@/constants/theme';
import { useDeleteContent } from '@/hooks/use-delete-content';
import { api } from '@/lib/api';
import { canDelete, deletionPrompt } from '@/lib/content-deletion';
import { queryKeys } from '@/lib/query-keys';
import { type ReportTargetType } from '@/lib/reports';
import { useAuthStore } from '@/store/auth';

interface ThreadDetail {
  id: string;
  title: string;
  category?: string;
  reply_count: number;
  helpful_total: number;
  is_bookmarked: boolean;
  is_mine?: boolean;
}

interface PostItem {
  id: string;
  thread_id: string;
  anonymous_id: string;
  reply_to_id?: string | null;
  body: string;
  helpful_count: number;
  created_at: string;
  is_mine?: boolean;
}

interface RelatedThread {
  id: string;
  title: string;
  category?: string;
  reply_count: number;
  helpful_total: number;
  created_at: string;
}

async function fetchThread(threadId: string): Promise<ThreadDetail> {
  const res = await api.get(`/api/v1/threads/${threadId}`);
  return res.data;
}

async function fetchPosts({ pageParam, threadId }: { pageParam?: string; threadId: string }) {
  const params: Record<string, string> = { limit: '50' };
  if (pageParam) params.cursor = pageParam;
  const res = await api.get(`/api/v1/threads/${threadId}/posts`, { params });
  return res.data;
}

function PostCard({ item, onInsertQuote, onScrollToId, onReport, onDelete }: {
  item: PostItem;
  onInsertQuote: (id: string) => void;
  onScrollToId: (id: string) => void;
  onReport: () => void;
  onDelete: () => void;
}) {
  const role = useAuthStore((s) => s.role);
  const deletable = canDelete(role, item.is_mine);
  const scaleAnim = useRef(new Animated.Value(1)).current;
  const [liked, setLiked] = useState(false);
  const [helpfulCount, setHelpfulCount] = useState(item.helpful_count);

  function handleHelpful() {
    if (liked) return;
    setLiked(true);
    setHelpfulCount(c => c + 1);
    Animated.sequence([
      Animated.timing(scaleAnim, { toValue: 1.35, duration: 120, useNativeDriver: true }),
      Animated.spring(scaleAnim, { toValue: 1, useNativeDriver: true }),
    ]).start();
    api.post(`/api/v1/posts/${item.id}/helpful`, {}).catch(() => {
      setLiked(false);
      setHelpfulCount(c => c - 1);
    });
  }

  const bodyParts = item.body.split(/(>>[a-zA-Z0-9]{8})/g);

  return (
    <View style={styles.post}>
      <View style={styles.postHeader}>
        <Text style={styles.anonId}>ID: {item.anonymous_id}</Text>
        <View style={styles.postActions}>
          <TouchableOpacity
            style={styles.quoteBtn}
            onPress={() => onInsertQuote(item.anonymous_id)}>
            <Text style={styles.quoteBtnText}>返信</Text>
          </TouchableOpacity>
          {/* Muted and unlabelled: reporting has to be findable on every post without
              competing with 返信 for attention on posts nobody wants to report. */}
          <TouchableOpacity
            style={styles.reportBtn}
            onPress={onReport}
            hitSlop={8}
            accessibilityLabel="この投稿を通報する">
            <SymbolIcon name="flag" ionicon="flag-outline" size={13} tintColor={Colors.textMuted} />
          </TouchableOpacity>
          {deletable && (
            <TouchableOpacity
              style={styles.reportBtn}
              onPress={onDelete}
              hitSlop={8}
              accessibilityLabel="この投稿を削除する">
              <SymbolIcon name="trash" ionicon="trash-outline" size={13} tintColor={Colors.danger} />
            </TouchableOpacity>
          )}
        </View>
      </View>

      <Text style={styles.postBody}>
        {bodyParts.map((part, idx) => {
          const m = part.match(/^>>([a-zA-Z0-9]{8})$/);
          if (m) {
            return (
              <Text key={idx} style={styles.quoteLink} onPress={() => onScrollToId(m[1])}>
                {part}
              </Text>
            );
          }
          return part;
        })}
      </Text>

      <TouchableOpacity style={styles.helpfulBtn} onPress={handleHelpful} activeOpacity={0.75}>
        <Animated.View style={[styles.helpfulContent, { transform: [{ scale: scaleAnim }] }]}>
          <SymbolIcon
            name={liked ? 'hand.thumbsup.fill' : 'hand.thumbsup'}
            ionicon={liked ? 'thumbs-up' : 'thumbs-up-outline'}
            size={16}
            tintColor={liked ? Colors.hotPink : Colors.textMuted}
          />
          <Text style={[styles.helpfulText, liked && styles.helpfulTextActive]}>
            役立った {helpfulCount}
          </Text>
        </Animated.View>
      </TouchableOpacity>
    </View>
  );
}

function RelatedThreadsSection({ threads }: { threads: RelatedThread[] }) {
  return (
    <View style={styles.relatedSection}>
      <Text style={styles.relatedTitle}>関連スレ</Text>
      {threads.map(t => (
        <Link key={t.id} href={`/board/${t.id}`} asChild>
          <TouchableOpacity style={styles.relatedCard}>
            <Text style={styles.relatedThreadTitle} numberOfLines={2}>{t.title}</Text>
            <View style={styles.relatedMeta}>
              <SymbolIcon name="bubble.left" ionicon="chatbubble-outline" size={11} tintColor={Colors.textMuted} />
              <Text style={styles.relatedMetaText}>{t.reply_count}</Text>
            </View>
          </TouchableOpacity>
        </Link>
      ))}
    </View>
  );
}

export default function ThreadDetailScreen() {
  const { threadId } = useLocalSearchParams<{ threadId: string }>();
  const [body, setBody] = useState('');
  const qc = useQueryClient();
  const flatListRef = useRef<FlatList<PostItem>>(null);

  // The target outlives the sheet's visibility on purpose: clearing it on close would
  // blank the header's noun while the dismiss animation is still running.
  const [reportTarget, setReportTarget] = useState<
    { type: ReportTargetType; id: string } | null
  >(null);
  const [reportVisible, setReportVisible] = useState(false);

  function openReport(type: ReportTargetType, id: string) {
    setReportTarget({ type, id });
    setReportVisible(true);
  }

  const router = useRouter();
  const role = useAuthStore((s) => s.role);
  // Deleting the thread leaves this screen showing something that no longer exists, so it
  // navigates away. Deleting a post does not — the list refreshes underneath.
  const del = useDeleteContent((kind) => {
    if (kind === 'thread') router.back();
  });

  function confirmDelete(kind: 'post' | 'thread', id: string, isMine?: boolean) {
    const prompt = deletionPrompt(kind, role, isMine);
    Alert.alert(prompt.title, prompt.message, [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: prompt.confirmLabel,
        style: 'destructive',
        onPress: () => del.mutate({ kind, id, threadId }),
      },
    ]);
  }

  const { data: thread } = useQuery({
    queryKey: queryKeys.threads.detail(threadId),
    queryFn: () => fetchThread(threadId),
    refetchInterval: 15_000,
  });

  const { data: relatedData } = useQuery({
    queryKey: queryKeys.threads.related(threadId),
    queryFn: async () => {
      const res = await api.get(`/api/v1/threads/${threadId}/related`);
      return res.data.items as RelatedThread[];
    },
    enabled: !!thread?.category,
  });
  const relatedThreads = relatedData ?? [];

  const bookmarkMutation = useMutation({
    mutationFn: async (isBookmarked: boolean) => {
      if (isBookmarked) {
        await api.delete(`/api/v1/threads/${threadId}/bookmark`);
      } else {
        await api.post(`/api/v1/threads/${threadId}/bookmark`, {});
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.threads.detail(threadId) });
      qc.invalidateQueries({ queryKey: queryKeys.threads.bookmarks() });
    },
  });

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    useInfiniteQuery({
      queryKey: queryKeys.threads.posts(threadId),
      queryFn: ({ pageParam }) => fetchPosts({ pageParam, threadId }),
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (page) => page.next_cursor || undefined,
      refetchInterval: 15_000,
    });

  const postMutation = useMutation({
    mutationFn: async (text: string) => {
      await api.post(`/api/v1/threads/${threadId}/posts`, { body: text });
    },
    onSuccess: () => {
      setBody('');
      qc.invalidateQueries({ queryKey: queryKeys.threads.posts(threadId) });
      qc.invalidateQueries({ queryKey: queryKeys.threads.detail(threadId) });
    },
  });

  const posts = data?.pages.flatMap((p) => p.items as PostItem[]) ?? [];
  const isBookmarked = thread?.is_bookmarked ?? false;

  function handleInsertQuote(anonymousId: string) {
    setBody(prev => `${prev}>>${anonymousId} `);
  }

  function handleScrollToId(anonymousId: string) {
    const index = posts.findIndex(p => p.anonymous_id === anonymousId);
    if (index >= 0 && flatListRef.current) {
      flatListRef.current.scrollToIndex({ index, animated: true });
    }
  }

  const ListHeader = thread ? (
    <View style={styles.threadHeader}>
      {thread.category && (
        <View style={styles.categoryBadge}>
          <Text style={styles.categoryText}>{thread.category}</Text>
        </View>
      )}
      <Text style={styles.threadTitle}>{thread.title}</Text>
      <View style={styles.threadMeta}>
        <View style={styles.metaItem}>
          <SymbolIcon name="bubble.left" ionicon="chatbubble-outline" size={12} tintColor={Colors.textMuted} />
          <Text style={styles.metaCount}>{thread.reply_count}</Text>
        </View>
        <View style={styles.metaItem}>
          <SymbolIcon name="hand.thumbsup" ionicon="thumbs-up-outline" size={12} tintColor={Colors.textMuted} />
          <Text style={styles.metaCount}>{thread.helpful_total}</Text>
        </View>
        <TouchableOpacity
          style={styles.bookmarkBtn}
          onPress={() => bookmarkMutation.mutate(isBookmarked)}
          disabled={bookmarkMutation.isPending}>
          <SymbolIcon
            name={isBookmarked ? 'bookmark.fill' : 'bookmark'}
            ionicon={isBookmarked ? 'bookmark' : 'bookmark-outline'}
            size={15}
            tintColor={Colors.pink}
          />
          <Text style={styles.bookmarkLabel}>{isBookmarked ? '保存済み' : '保存'}</Text>
        </TouchableOpacity>
        {/* The thread itself needs its own report: a title can be the objectionable part
            while every reply under it is fine. */}
        <TouchableOpacity
          style={styles.threadReportBtn}
          onPress={() => openReport('thread', threadId)}
          hitSlop={8}
          accessibilityLabel="このスレッドを通報する">
          <SymbolIcon name="flag" ionicon="flag-outline" size={14} tintColor={Colors.textMuted} />
        </TouchableOpacity>
        {canDelete(role, thread.is_mine) && (
          <TouchableOpacity
            style={styles.threadReportBtn}
            onPress={() => confirmDelete('thread', threadId, thread.is_mine)}
            hitSlop={8}
            accessibilityLabel="このスレッドを削除する">
            <SymbolIcon name="trash" ionicon="trash-outline" size={14} tintColor={Colors.danger} />
          </TouchableOpacity>
        )}
      </View>
      <View style={styles.divider} />
    </View>
  ) : null;

  return (
    <SafeAreaView style={styles.container}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        {isLoading ? (
          <ActivityIndicator color={Colors.pink} style={styles.loader} />
        ) : (
          <FlatList
            ref={flatListRef}
            data={posts}
            keyExtractor={(item) => item.id}
            onEndReached={() => hasNextPage && fetchNextPage()}
            onEndReachedThreshold={0.3}
            ListHeaderComponent={ListHeader}
            ListFooterComponent={
              <>
                {isFetchingNextPage && <ActivityIndicator color={Colors.pink} style={styles.loader} />}
                {relatedThreads.length > 0 && <RelatedThreadsSection threads={relatedThreads} />}
              </>
            }
            onScrollToIndexFailed={() => { }}
            renderItem={({ item }) => (
              <PostCard
                item={item}
                onInsertQuote={handleInsertQuote}
                onScrollToId={handleScrollToId}
                onReport={() => openReport('post', item.id)}
                onDelete={() => confirmDelete('post', item.id, item.is_mine)}
              />
            )}
          />
        )}

        <View style={styles.inputBar}>
          <TextInput
            style={styles.input}
            value={body}
            onChangeText={setBody}
            placeholder="返信する..."
            placeholderTextColor={Colors.textMuted}
            multiline
          />
          <TouchableOpacity
            style={[styles.sendBtn, !body.trim() && styles.sendBtnDisabled]}
            disabled={!body.trim() || postMutation.isPending}
            onPress={() => postMutation.mutate(body.trim())}>
            <Text style={styles.sendText}>送信</Text>
          </TouchableOpacity>
        </View>
      </KeyboardAvoidingView>

      {reportTarget && (
        <ReportSheet
          visible={reportVisible}
          targetType={reportTarget.type}
          targetId={reportTarget.id}
          onClose={() => setReportVisible(false)}
        />
      )}
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  flex: { flex: 1 },
  loader: { marginTop: Spacing.five },

  threadHeader: { padding: Spacing.three, backgroundColor: Colors.surface },
  categoryBadge: {
    backgroundColor: Colors.surfacePink,
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
    borderRadius: 8,
    marginBottom: Spacing.one,
  },
  categoryText: { color: Colors.hotPink, fontSize: 11, fontWeight: 'bold' },
  threadTitle: { color: Colors.textPrimary, fontSize: 16, fontWeight: 'bold', lineHeight: 24 },
  threadMeta: {
    flexDirection: 'row',
    alignItems: 'center',
    marginTop: Spacing.two,
    gap: Spacing.two,
  },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaCount: { color: Colors.textMuted, fontSize: 13 },
  bookmarkBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    marginLeft: 'auto',
    gap: 4,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: 16,
    borderWidth: 1,
    borderColor: Colors.pink,
  },
  bookmarkLabel: { fontSize: 12, color: Colors.pink, fontWeight: '600' },
  threadReportBtn: { padding: Spacing.one },
  divider: { height: 1, backgroundColor: Colors.lightCyan, marginTop: Spacing.two },

  post: { padding: Spacing.three, borderBottomWidth: 1, borderBottomColor: Colors.surfaceBlue },
  postHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 4 },
  anonId: { color: Colors.hotPink, fontSize: 11, fontWeight: 'bold' },
  postActions: { flexDirection: 'row', alignItems: 'center' },
  quoteBtn: { paddingHorizontal: Spacing.two, paddingVertical: Spacing.one },
  quoteBtnText: { color: Colors.textMuted, fontSize: 11 },
  reportBtn: { paddingHorizontal: Spacing.two, paddingVertical: Spacing.one },
  postBody: { color: Colors.textPrimary, fontSize: 14, lineHeight: 20 },
  quoteLink: { color: Colors.pink, fontWeight: '600' },

  helpfulBtn: { minWidth: 44, minHeight: 44, alignSelf: 'flex-start', justifyContent: 'center', marginTop: Spacing.one },
  helpfulContent: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  helpfulText: { color: Colors.textMuted, fontSize: 12 },
  helpfulTextActive: { color: Colors.hotPink, fontWeight: '600' },

  relatedSection: {
    margin: Spacing.three,
    marginTop: Spacing.four,
    paddingTop: Spacing.three,
    borderTopWidth: 2,
    borderTopColor: Colors.lightCyan,
  },
  relatedTitle: { color: Colors.textMuted, fontSize: 12, fontWeight: 'bold', marginBottom: Spacing.two, letterSpacing: 0.5 },
  relatedCard: {
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: Spacing.two,
    marginBottom: Spacing.two,
    borderWidth: 1,
    borderColor: Colors.lightCyan,
  },
  relatedThreadTitle: { color: Colors.textPrimary, fontSize: 13, fontWeight: '600', lineHeight: 18 },
  relatedMeta: { flexDirection: 'row', alignItems: 'center', gap: 3, marginTop: 4 },
  relatedMetaText: { color: Colors.textMuted, fontSize: 11 },

  inputBar: {
    flexDirection: 'row',
    padding: Spacing.two,
    borderTopWidth: 1,
    borderTopColor: Colors.lightCyan,
    backgroundColor: Colors.surface,
    gap: Spacing.two,
  },
  input: {
    flex: 1,
    borderWidth: 1,
    borderColor: Colors.lightCyan,
    borderRadius: 20,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    color: Colors.textPrimary,
    maxHeight: 100,
  },
  sendBtn: {
    backgroundColor: Colors.hotPink,
    paddingHorizontal: Spacing.three,
    borderRadius: 20,
    justifyContent: 'center',
  },
  sendBtnDisabled: { backgroundColor: Colors.textMuted },
  sendText: { color: '#fff', fontWeight: 'bold' },
});
