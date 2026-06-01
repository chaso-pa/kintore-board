import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { ActivityIndicator, FlatList, KeyboardAvoidingView, Platform, StyleSheet, Text, TextInput, TouchableOpacity, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '@/lib/api';
import { Colors, Spacing } from '@/constants/theme';

interface PostItem {
  id: string;
  anonymous_id: string;
  body: string;
  helpful_count: number;
  created_at: string;
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

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } =
    useInfiniteQuery({
      queryKey: ['posts', threadId],
      queryFn: ({ pageParam }) => fetchPosts({ pageParam, threadId }),
      initialPageParam: undefined as string | undefined,
      getNextPageParam: (page) => page.next_cursor || undefined,
    });

  const postMutation = useMutation({
    mutationFn: async (text: string) => {
      await api.post(`/api/v1/threads/${threadId}/posts`, { body: text });
    },
    onSuccess: () => {
      setBody('');
      qc.invalidateQueries({ queryKey: ['posts', threadId] });
    },
  });

  const posts = data?.pages.flatMap((p) => p.items as PostItem[]) ?? [];

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={styles.flex}>
        {isLoading ? (
          <ActivityIndicator color={Colors.pink} style={styles.loader} />
        ) : (
          <FlatList
            data={posts}
            keyExtractor={(item) => item.id}
            onEndReached={() => hasNextPage && fetchNextPage()}
            onEndReachedThreshold={0.3}
            ListFooterComponent={isFetchingNextPage ? <ActivityIndicator color={Colors.pink} /> : null}
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
  post: { padding: Spacing.three, borderBottomWidth: 1, borderBottomColor: Colors.surfaceBlue },
  anonId: { color: Colors.hotPink, fontSize: 11, fontWeight: 'bold', marginBottom: 2 },
  postBody: { color: Colors.textPrimary, fontSize: 14, lineHeight: 20 },
  helpful: { color: Colors.textMuted, fontSize: 11, marginTop: Spacing.one },
  inputBar: { flexDirection: 'row', padding: Spacing.two, borderTopWidth: 1, borderTopColor: Colors.lightCyan, backgroundColor: Colors.surface, gap: Spacing.two },
  input: { flex: 1, borderWidth: 1, borderColor: Colors.lightCyan, borderRadius: 20, paddingHorizontal: Spacing.three, paddingVertical: Spacing.one, color: Colors.textPrimary, maxHeight: 100 },
  sendBtn: { backgroundColor: Colors.hotPink, paddingHorizontal: Spacing.three, borderRadius: 20, justifyContent: 'center' },
  sendBtnDisabled: { backgroundColor: Colors.textMuted },
  sendText: { color: '#fff', fontWeight: 'bold' },
});
