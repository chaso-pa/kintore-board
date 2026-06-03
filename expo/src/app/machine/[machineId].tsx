import * as ImagePicker from 'expo-image-picker';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  ScrollView,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ImageViewerModal } from '@/components/ImageViewerModal';
import { SymbolIcon } from '@/components/SymbolIcon';
import { api } from '@/lib/api';
import { Colors, Spacing } from '@/constants/theme';

type RNFile = { uri: string; type: string; name: string };

interface MachineDetail {
  id: string;
  name: string;
  manufacturer?: string;
  body_part?: string;
  category?: string;
  helpful_total: number;
  reply_count: number;
}

interface PhotoItem {
  id: string;
  image_url: string;
}

interface ThreadItem {
  id: string;
  title: string;
  reply_count: number;
  helpful_total: number;
  created_at: string;
}

export default function MachineDetailScreen() {
  const { machineId } = useLocalSearchParams<{ machineId: string }>();
  const [viewerIndex, setViewerIndex] = useState(0);
  const [viewerVisible, setViewerVisible] = useState(false);
  const queryClient = useQueryClient();

  const { data: machine, isLoading } = useQuery({
    queryKey: ['machine', machineId],
    queryFn: async () => {
      const res = await api.get(`/api/v1/machines/${machineId}`);
      return res.data as MachineDetail;
    },
  });

  const { data: photosData } = useQuery({
    queryKey: ['machine-photos', machineId],
    queryFn: async () => {
      const res = await api.get(`/api/v1/machines/${machineId}/photos`);
      return res.data;
    },
  });

  const { data: threadsData } = useQuery({
    queryKey: ['machine-threads', machineId],
    queryFn: async () => {
      const res = await api.get('/api/v1/threads', { params: { machine_id: machineId, limit: '20' } });
      return res.data;
    },
  });

  const uploadPhotoMutation = useMutation({
    mutationFn: async () => {
      const result = await ImagePicker.launchImageLibraryAsync({
        mediaTypes: 'images',
        quality: 0.8,
      });
      if (result.canceled || !result.assets[0]) return;

      const asset = result.assets[0];
      const filename = asset.uri.split('/').pop() ?? 'photo.jpg';
      const contentType = asset.mimeType ?? 'image/jpeg';

      const presignRes = await api.post(`/api/v1/machines/${machineId}/photos/presign`, {
        filename,
        content_type: contentType,
      });
      const { upload_url, public_url } = presignRes.data;

      await new Promise<void>((resolve, reject) => {
        const xhr = new XMLHttpRequest();
        xhr.open('PUT', upload_url);
        xhr.setRequestHeader('Content-Type', contentType);
        xhr.timeout = 30000;
        xhr.onload = () => {
          if (xhr.status >= 200 && xhr.status < 300) resolve();
          else reject(new Error(`MinIO PUT failed: ${xhr.status} ${xhr.responseText}`));
        };
        xhr.onerror = () => reject(new Error('Network error during upload'));
        xhr.ontimeout = () => reject(new Error('Upload timed out'));
        xhr.send({ uri: asset.uri, type: contentType, name: filename } as unknown as RNFile & XMLHttpRequestBodyInit);
      });

      await api.post(`/api/v1/machines/${machineId}/photos`, { image_url: public_url });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['machine-photos', machineId] }),
    onError: (e) => {
      console.error('[uploadPhoto] failed:', e);
      Alert.alert('エラー', '写真のアップロードに失敗しました');
    },
  });

  if (isLoading) return <ActivityIndicator color={Colors.pink} style={{ marginTop: 40 }} />;
  if (!machine) return null;

  const photos: PhotoItem[] = photosData?.items ?? [];
  const threads: ThreadItem[] = threadsData?.items ?? [];

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView>
        {/* 写真ギャラリー */}
        <View style={styles.photoSection}>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.photoScroll}>
            {photos.length === 0 && (
              <View style={styles.photoPlaceholder}>
                <SymbolIcon name="photo" ionicon="image-outline" size={32} tintColor={Colors.textMuted} />
                <Text style={styles.photoPlaceholderText}>写真なし</Text>
              </View>
            )}
            {photos.map((p, i) => (
              <TouchableOpacity key={p.id} onPress={() => { setViewerIndex(i); setViewerVisible(true); }}>
                <Image source={{ uri: p.image_url }} style={styles.photo} />
              </TouchableOpacity>
            ))}
          </ScrollView>
          <TouchableOpacity
            style={styles.addPhotoBtn}
            onPress={() => uploadPhotoMutation.mutate()}
            disabled={uploadPhotoMutation.isPending}
          >
            <SymbolIcon name="plus.circle" ionicon="add-circle-outline" size={14} tintColor={Colors.cyan} />
            <Text style={styles.addPhotoBtnText}>
              {uploadPhotoMutation.isPending ? 'アップロード中...' : '写真を追加'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* マシン基本情報 */}
        <View style={styles.section}>
          <Text style={styles.machineName}>{machine.name}</Text>

          <View style={styles.badgeRow}>
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
            {machine.category && (
              <View style={[styles.badge, styles.badgeCyan]}>
                <Text style={styles.badgeText}>{machine.category}</Text>
              </View>
            )}
          </View>

          <View style={styles.statsRow}>
            <View style={styles.statItem}>
              <SymbolIcon name="hand.thumbsup" ionicon="thumbs-up-outline" size={14} tintColor={Colors.hotPink} />
              <Text style={styles.statValue}>{machine.helpful_total}</Text>
            </View>
            <View style={styles.statItem}>
              <SymbolIcon name="bubble.left" ionicon="chatbubble-outline" size={14} tintColor={Colors.textMuted} />
              <Text style={styles.statValue}>{machine.reply_count}</Text>
            </View>
          </View>
        </View>

        {/* スレッド一覧 */}
        <View style={styles.section}>
          <Text style={styles.sectionTitle}>スレッド</Text>
          {threads.length === 0 ? (
            <Text style={styles.emptyText}>まだスレッドがありません</Text>
          ) : (
            <View style={styles.threadList}>
              {threads.map((t) => (
                <Link key={t.id} href={{ pathname: '/board/[threadId]', params: { threadId: t.id } }} asChild>
                  <TouchableOpacity style={styles.threadCard}>
                    <Text style={styles.threadTitle} numberOfLines={2}>{t.title}</Text>
                    <View style={styles.threadMeta}>
                      <View style={styles.metaItem}>
                        <SymbolIcon name="bubble.left" ionicon="chatbubble-outline" size={11} tintColor={Colors.textMuted} />
                        <Text style={styles.metaText}>{t.reply_count}</Text>
                      </View>
                      <View style={styles.metaItem}>
                        <SymbolIcon name="hand.thumbsup" ionicon="thumbs-up-outline" size={11} tintColor={Colors.textMuted} />
                        <Text style={styles.metaText}>{t.helpful_total}</Text>
                      </View>
                    </View>
                  </TouchableOpacity>
                </Link>
              ))}
            </View>
          )}
        </View>
      </ScrollView>

      <ImageViewerModal
        images={photos.map(p => p.image_url)}
        initialIndex={viewerIndex}
        visible={viewerVisible}
        onClose={() => setViewerVisible(false)}
      />
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  section: { padding: Spacing.three, borderBottomWidth: 1, borderBottomColor: Colors.surfaceBlue },

  photoSection: { borderBottomWidth: 1, borderBottomColor: Colors.surfaceBlue },
  photoScroll: { padding: Spacing.two, gap: Spacing.two },
  photo: { width: 120, height: 90, borderRadius: 8 },
  photoPlaceholder: {
    width: 120, height: 90, borderRadius: 8,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.lightCyan,
    justifyContent: 'center', alignItems: 'center', gap: 4,
  },
  photoPlaceholderText: { color: Colors.textMuted, fontSize: 11 },
  addPhotoBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    paddingHorizontal: Spacing.three, paddingVertical: Spacing.two,
  },
  addPhotoBtnText: { color: Colors.cyan, fontSize: 13, fontWeight: '600' },

  machineName: { fontSize: 22, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: Spacing.two },
  badgeRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  badge: {
    alignSelf: 'flex-start', backgroundColor: Colors.surfacePink,
    paddingHorizontal: Spacing.two, paddingVertical: Spacing.one, borderRadius: 8,
  },
  badgeBlue: { backgroundColor: Colors.surfaceBlue },
  badgeCyan: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.lightCyan },
  badgeText: { color: Colors.textPrimary, fontSize: 12, fontWeight: '600' },
  statsRow: { flexDirection: 'row', gap: Spacing.three, marginTop: Spacing.two },
  statItem: { flexDirection: 'row', alignItems: 'center', gap: 4 },
  statValue: { color: Colors.textMuted, fontSize: 13, fontWeight: '600' },

  sectionTitle: { fontSize: 15, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: Spacing.two },
  emptyText: { color: Colors.textMuted, fontSize: 13 },
  threadList: { gap: Spacing.one },
  threadCard: {
    backgroundColor: Colors.surface, padding: Spacing.two, borderRadius: 10,
    borderWidth: 1, borderColor: Colors.lightCyan,
  },
  threadTitle: { color: Colors.textPrimary, fontSize: 14, fontWeight: '600', lineHeight: 20 },
  threadMeta: { flexDirection: 'row', gap: Spacing.two, marginTop: Spacing.one },
  metaItem: { flexDirection: 'row', alignItems: 'center', gap: 3 },
  metaText: { color: Colors.textMuted, fontSize: 11 },
});
