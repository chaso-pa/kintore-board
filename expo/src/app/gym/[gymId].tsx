import * as ImagePicker from 'expo-image-picker';
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { Link, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import {
  ActivityIndicator,
  Alert,
  Image,
  Modal,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ImageViewerModal } from '@/components/ImageViewerModal';
import { SymbolIcon } from '@/components/SymbolIcon';
import { api } from '@/lib/api';
import { Colors, Spacing } from '@/constants/theme';

type RNFile = { uri: string; type: string; name: string };

const EDIT_CATEGORIES = [
  { key: 'fee', label: '料金' },
  { key: 'hours', label: '営業時間' },
  { key: 'machines', label: 'マシン情報' },
  { key: 'facilities', label: '設備情報' },
  { key: 'other', label: 'その他' },
] as const;

type EditCategory = 'fee' | 'hours' | 'machines' | 'facilities' | 'other';

interface GymDetail {
  id: string;
  name: string;
  address?: string;
  visitor_fee?: number;
  monthly_fee?: number;
  visitor_available: boolean;
  hours?: string;
  has_parking: boolean;
  has_shower: boolean;
  has_locker_room: boolean;
  dumbbell_max_kg?: number;
  barbell_type?: string;
  power_rack_count?: number;
  rating: number;
  is_favorited: boolean;
  last_updated_at: string;
}

interface MachineItem {
  id: string;
  name: string;
  body_part?: string;
  manufacturer?: string;
}

interface PhotoItem {
  id: string;
  image_url: string;
}

const BARBELL_LABELS: Record<string, string> = {
  standard: 'スタンダード',
  olympic: 'オリンピック',
  both: 'スタンダード + オリンピック',
};

export default function GymDetailScreen() {
  const { gymId } = useLocalSearchParams<{ gymId: string }>();
  const queryClient = useQueryClient();
  const [editModalVisible, setEditModalVisible] = useState(false);
  const [editCategory, setEditCategory] = useState<EditCategory>('fee');
  const [editBody, setEditBody] = useState('');
  const [viewerIndex, setViewerIndex] = useState(0);
  const [viewerVisible, setViewerVisible] = useState(false);

  const { data: gym, isLoading } = useQuery({
    queryKey: ['gym', gymId],
    queryFn: async () => {
      const res = await api.get(`/api/v1/gyms/${gymId}`);
      return res.data as GymDetail;
    },
  });

  const { data: machinesData } = useQuery({
    queryKey: ['machines', gymId],
    queryFn: async () => {
      const res = await api.get(`/api/v1/gyms/${gymId}/machines`);
      return res.data;
    },
  });

  const { data: photosData } = useQuery({
    queryKey: ['gym-photos', gymId],
    queryFn: async () => {
      const res = await api.get(`/api/v1/gyms/${gymId}/photos`);
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

      const presignRes = await api.post(`/api/v1/gyms/${gymId}/photos/presign`, {
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

      await api.post(`/api/v1/gyms/${gymId}/photos`, { image_url: public_url });
    },
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['gym-photos', gymId] }),
    onError: (e) => {
      console.error('[uploadPhoto] failed:', e);
      Alert.alert('エラー', '写真のアップロードに失敗しました');
    },
  });

  const editMutation = useMutation({
    mutationFn: async () => {
      await api.post(`/api/v1/gyms/${gymId}/edit-requests`, {
        category: editCategory,
        body: editBody,
      });
    },
    onSuccess: () => {
      setEditModalVisible(false);
      setEditBody('');
      Alert.alert('ありがとうございます', '修正提案を受け付けました。');
    },
    onError: () => Alert.alert('エラー', '送信に失敗しました'),
  });

  const favMutation = useMutation({
    mutationFn: async (isFavorited: boolean) => {
      if (isFavorited) {
        await api.delete(`/api/v1/gyms/${gymId}/favorites`);
      } else {
        await api.post(`/api/v1/gyms/${gymId}/favorites`);
      }
    },
    onMutate: async (isFavorited) => {
      await queryClient.cancelQueries({ queryKey: ['gym', gymId] });
      const previous = queryClient.getQueryData(['gym', gymId]);
      queryClient.setQueryData(['gym', gymId], (old: GymDetail | undefined) =>
        old ? { ...old, is_favorited: !isFavorited } : old
      );
      return { previous };
    },
    onError: (_err, _vars, ctx: any) => {
      if (ctx?.previous) queryClient.setQueryData(['gym', gymId], ctx.previous);
    },
    onSettled: () => {
      queryClient.invalidateQueries({ queryKey: ['gyms'] });
      queryClient.invalidateQueries({ queryKey: ['gym-favorites'] });
    },
  });

  if (isLoading) return <ActivityIndicator color={Colors.pink} style={{ marginTop: 40 }} />;
  if (!gym) return null;

  const machines: MachineItem[] = machinesData?.items ?? [];
  const photos: PhotoItem[] = photosData?.items ?? [];

  const facilities = [
    gym.has_parking && { icon: 'car', ionicon: 'car-outline', label: '駐車場' },
    gym.has_shower && { icon: 'shower', ionicon: 'water-outline', label: 'シャワー' },
    gym.has_locker_room && { icon: 'lock', ionicon: 'lock-closed-outline', label: '更衣室' },
  ].filter(Boolean) as { icon: string; ionicon: string; label: string }[];

  const hasFreeWeight = gym.dumbbell_max_kg != null || gym.barbell_type != null || gym.power_rack_count != null;

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

        {/* ヘッダー情報 */}
        <View style={styles.section}>
          <View style={styles.nameRow}>
            <Text style={styles.gymName}>{gym.name}</Text>
            <TouchableOpacity
              style={styles.favBtn}
              onPress={() => favMutation.mutate(gym.is_favorited)}
              disabled={favMutation.isPending}
            >
              <Text style={[styles.favIcon, gym.is_favorited && styles.favIconActive]}>
                {gym.is_favorited ? '♥' : '♡'}
              </Text>
            </TouchableOpacity>
          </View>
          {gym.address && <Text style={styles.address}>{gym.address}</Text>}

          {gym.rating > 0 && (
            <View style={styles.ratingRow}>
              <SymbolIcon name="star.fill" ionicon="star" size={14} tintColor={Colors.hotPink} />
              <Text style={styles.ratingText}>{gym.rating.toFixed(0)} pt</Text>
            </View>
          )}

          <View style={styles.fees}>
            {!!gym.visitor_fee && (
              <Text style={styles.feeLabel}>
                ビジター <Text style={styles.feeValue}>¥{gym.visitor_fee.toLocaleString()}</Text>
              </Text>
            )}
            {!!gym.monthly_fee && (
              <Text style={styles.feeLabel}>
                月額 <Text style={styles.feeValue}>¥{gym.monthly_fee.toLocaleString()}</Text>
              </Text>
            )}
          </View>

          {gym.hours ? (
            <View style={styles.hoursRow}>
              <SymbolIcon name="clock" ionicon="time-outline" size={13} tintColor={Colors.textSecondary} />
              <Text style={styles.hoursText}>{gym.hours}</Text>
            </View>
          ) : null}

          <View style={styles.userInfo}>
            <Text style={styles.userInfoText}>※ユーザー投稿情報</Text>
          </View>
        </View>

        {/* 設備タグ */}
        {facilities.length > 0 && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>設備・特徴</Text>
            <View style={styles.facilityRow}>
              {facilities.map((f) => (
                <View key={f.label} style={styles.facilityTag}>
                  <SymbolIcon
                    name={f.icon as never}
                    ionicon={f.ionicon as never}
                    size={14}
                    tintColor={Colors.cyan}
                  />
                  <Text style={styles.facilityLabel}>{f.label}</Text>
                </View>
              ))}
            </View>
          </View>
        )}

        {/* フリーウェイト情報 */}
        {hasFreeWeight && (
          <View style={styles.section}>
            <Text style={styles.sectionTitle}>フリーウェイト</Text>
            <View style={styles.freeWeightGrid}>
              {gym.dumbbell_max_kg != null && (
                <View style={styles.fwItem}>
                  <Text style={styles.fwLabel}>ダンベル最大</Text>
                  <Text style={styles.fwValue}>{gym.dumbbell_max_kg}kg</Text>
                </View>
              )}
              {gym.barbell_type && (
                <View style={styles.fwItem}>
                  <Text style={styles.fwLabel}>バーベル</Text>
                  <Text style={styles.fwValue}>{BARBELL_LABELS[gym.barbell_type] ?? gym.barbell_type}</Text>
                </View>
              )}
              {gym.power_rack_count != null && (
                <View style={styles.fwItem}>
                  <Text style={styles.fwLabel}>パワーラック</Text>
                  <Text style={styles.fwValue}>{gym.power_rack_count}台</Text>
                </View>
              )}
            </View>
          </View>
        )}

        {/* アクション */}
        <View style={styles.section}>
          <Link href={`/gym/${gymId}/machines` as never} asChild>
            <TouchableOpacity style={styles.actionBtn}>
              <SymbolIcon name="dumbbell" ionicon="barbell-outline" size={16} tintColor={Colors.cyan} />
              <Text style={styles.actionBtnText}>
                ジムにあるマシン{machines.length > 0 ? `（${machines.length}）` : ''}
              </Text>
            </TouchableOpacity>
          </Link>

          <Link href={`/gym/${gymId}/threads` as never} asChild>
            <TouchableOpacity style={styles.actionBtn}>
              <SymbolIcon name="bubble.left.and.bubble.right" ionicon="chatbubbles-outline" size={16} tintColor={Colors.cyan} />
              <Text style={styles.actionBtnText}>ジムのスレッドを見る</Text>
            </TouchableOpacity>
          </Link>

          <TouchableOpacity style={[styles.actionBtn, styles.actionBtnSecondary]} onPress={() => setEditModalVisible(true)}>
            <SymbolIcon name="pencil" ionicon="pencil-outline" size={16} tintColor={Colors.textMuted} />
            <Text style={[styles.actionBtnText, styles.actionBtnTextSecondary]}>
              情報の修正を提案する
            </Text>
          </TouchableOpacity>
        </View>
      </ScrollView>

      <ImageViewerModal
        images={photos.map(p => p.image_url)}
        initialIndex={viewerIndex}
        visible={viewerVisible}
        onClose={() => setViewerVisible(false)}
      />

      {/* 修正提案モーダル */}
      <Modal visible={editModalVisible} animationType="slide" presentationStyle="pageSheet">
        <SafeAreaView style={styles.modal}>
          <View style={styles.modalHeader}>
            <Text style={styles.modalTitle}>情報の修正を提案する</Text>
            <TouchableOpacity onPress={() => setEditModalVisible(false)}>
              <Text style={styles.modalClose}>閉じる</Text>
            </TouchableOpacity>
          </View>

          <ScrollView style={styles.modalBody}>
            <Text style={styles.fieldLabel}>修正カテゴリ</Text>
            <View style={styles.categoryList}>
              {EDIT_CATEGORIES.map((c) => (
                <TouchableOpacity
                  key={c.key}
                  style={[styles.categoryItem, editCategory === c.key && styles.categoryItemActive]}
                  onPress={() => setEditCategory(c.key)}>
                  <Text style={[styles.categoryItemText, editCategory === c.key && styles.categoryItemTextActive]}>
                    {c.label}
                  </Text>
                </TouchableOpacity>
              ))}
            </View>

            <Text style={styles.fieldLabel}>修正内容</Text>
            <TextInput
              style={styles.textArea}
              value={editBody}
              onChangeText={setEditBody}
              placeholder="例: ビジター料金が¥1,800に変更されました"
              placeholderTextColor={Colors.textMuted}
              multiline
              numberOfLines={4}
            />

            <TouchableOpacity
              style={[styles.submitBtn, (!editBody.trim() || editMutation.isPending) && styles.submitBtnDisabled]}
              disabled={!editBody.trim() || editMutation.isPending}
              onPress={() => editMutation.mutate()}>
              <Text style={styles.submitBtnText}>送信する</Text>
            </TouchableOpacity>
          </ScrollView>
        </SafeAreaView>
      </Modal>
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

  nameRow: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
  gymName: { fontSize: 22, fontWeight: 'bold', color: Colors.textPrimary, flex: 1 },
  favBtn: { paddingLeft: Spacing.two, paddingTop: 2 },
  favIcon: { fontSize: 26, color: Colors.textMuted },
  favIconActive: { color: Colors.hotPink },
  address: { color: Colors.textSecondary, fontSize: 13, marginTop: 2 },
  ratingRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: Spacing.one },
  ratingText: { color: Colors.hotPink, fontWeight: 'bold', fontSize: 13 },
  fees: { flexDirection: 'row', gap: Spacing.three, marginTop: Spacing.two },
  feeLabel: { color: Colors.textSecondary, fontSize: 13 },
  feeValue: { color: Colors.hotPink, fontWeight: 'bold', fontSize: 16 },
  hoursRow: { flexDirection: 'row', alignItems: 'center', gap: 4, marginTop: Spacing.one },
  hoursText: { color: Colors.textSecondary, fontSize: 13 },
  userInfo: { marginTop: Spacing.two, backgroundColor: Colors.surfacePink, padding: Spacing.one, borderRadius: 8 },
  userInfoText: { color: Colors.hotPink, fontSize: 11 },

  sectionTitle: { fontSize: 15, fontWeight: 'bold', color: Colors.textPrimary, marginBottom: Spacing.two },
  facilityRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.two },
  facilityTag: {
    flexDirection: 'row', alignItems: 'center', gap: 4,
    backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.lightCyan,
    paddingHorizontal: Spacing.two, paddingVertical: Spacing.one, borderRadius: 20,
  },
  facilityLabel: { color: Colors.textSecondary, fontSize: 12 },

  freeWeightGrid: { gap: Spacing.two },
  fwItem: {
    flexDirection: 'row', justifyContent: 'space-between',
    paddingVertical: Spacing.one,
    borderBottomWidth: 1, borderBottomColor: Colors.surfaceBlue,
  },
  fwLabel: { color: Colors.textSecondary, fontSize: 13 },
  fwValue: { color: Colors.textPrimary, fontWeight: '600', fontSize: 13 },

  actionBtn: {
    flexDirection: 'row', alignItems: 'center', gap: Spacing.two,
    backgroundColor: Colors.surfaceBlue, padding: Spacing.three,
    borderRadius: 12, marginBottom: Spacing.two,
  },
  actionBtnSecondary: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.lightCyan },
  actionBtnText: { color: Colors.cyan, fontWeight: '600', fontSize: 14 },
  actionBtnTextSecondary: { color: Colors.textMuted },

  modal: { flex: 1, backgroundColor: Colors.background },
  modalHeader: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    padding: Spacing.three, borderBottomWidth: 1, borderBottomColor: Colors.lightCyan,
  },
  modalTitle: { fontSize: 17, fontWeight: 'bold', color: Colors.textPrimary },
  modalClose: { color: Colors.hotPink, fontSize: 15 },
  modalBody: { padding: Spacing.three },
  fieldLabel: { color: Colors.textPrimary, fontWeight: 'bold', marginBottom: Spacing.one, marginTop: Spacing.two },
  categoryList: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  categoryItem: {
    paddingHorizontal: Spacing.two, paddingVertical: Spacing.one,
    borderRadius: 16, borderWidth: 1, borderColor: Colors.lightCyan,
    backgroundColor: Colors.surface,
  },
  categoryItemActive: { backgroundColor: Colors.pink, borderColor: Colors.pink },
  categoryItemText: { color: Colors.textSecondary, fontSize: 13 },
  categoryItemTextActive: { color: '#fff' },
  textArea: {
    borderWidth: 1, borderColor: Colors.lightCyan, borderRadius: 12,
    padding: Spacing.two, color: Colors.textPrimary, fontSize: 14,
    backgroundColor: Colors.surface, minHeight: 100, textAlignVertical: 'top',
  },
  submitBtn: {
    backgroundColor: Colors.hotPink, padding: Spacing.three,
    borderRadius: 24, alignItems: 'center', marginTop: Spacing.three,
  },
  submitBtnDisabled: { backgroundColor: Colors.textMuted },
  submitBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 15 },
});
