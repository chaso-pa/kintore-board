import { useInfiniteQuery, useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { SymbolIcon } from '@/components/SymbolIcon';
import {
  ActivityIndicator,
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

import { Colors, Spacing } from '@/constants/theme';
import { api } from '@/lib/api';

interface ThreadDetail {
  id: string;
  title: string;
  category?: string;
  reply_count: number;
  helpful_total: number;
  is_bookmarked: boolean;
}

interface PostItem {
  id: string;
  anonymous_id: string;
  body: string;
  helpful_count: number;
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

export default function ThreadDetailScreen() {
  const { threadId } = useLocalSearchParams<{ threadId: string }>();
  const [body, setBody] = useState('');
  const qc = useQueryClient();

  const { data: thread } = useQuery({
    queryKey: ['thread', threadId],
    queryFn: () => fetchThread(threadId),
    refetchInterval: 15_000,
  });

  const bookmarkMutation = useMutation({
    mutationFn: async (isBookmarked: boolean) => {
      if (isBookmarked) {
        await api.delete(`/api/v1/threads/${threadId}/bookmark`);
      } else {
        await api.post(`/api/v1/threads/${threadId}/bookmark`, {});
      }
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: ['thread', threadId] });
      qc.invalidateQueries({ queryKey: ['threads', 'bookmarks'] });
    },
  });

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    useInfiniteQuery({
      queryKey: ['posts', threadId],
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
      qc.invalidateQueries({ queryKey: ['posts', threadId] });
      qc.invalidateQueries({ queryKey: ['thread', threadId] });
    },
  });

  const posts = data?.pages.flatMap((p) => p.items as PostItem[]) ?? [];
  const isBookmarked = thread?.is_bookmarked ?? false;

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
            data={posts}
            keyExtractor={(item) => item.id}
            onEndReached={() => hasNextPage && fetchNextPage()}
            onEndReachedThreshold={0.3}
            ListHeaderComponent={ListHeader}
            ListFooterComponent={
              isFetchingNextPage ? <ActivityIndicator color={Colors.pink} /> : null
            }
            renderItem={({ item }) => (
              <View style={styles.post}>
                <Text style={styles.anonId}>ID: {item.anonymous_id}</Text>
                <Text style={styles.postBody}>{item.body}</Text>
                <Text style={styles.helpful}>役立った {item.helpful_count}</Text>
              </View>
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
  divider: { height: 1, backgroundColor: Colors.lightCyan, marginTop: Spacing.two },

  post: { padding: Spacing.three, borderBottomWidth: 1, borderBottomColor: Colors.surfaceBlue },
  anonId: { color: Colors.hotPink, fontSize: 11, fontWeight: 'bold', marginBottom: 2 },
  postBody: { color: Colors.textPrimary, fontSize: 14, lineHeight: 20 },
  helpful: { color: Colors.textMuted, fontSize: 11, marginTop: Spacing.one },

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
