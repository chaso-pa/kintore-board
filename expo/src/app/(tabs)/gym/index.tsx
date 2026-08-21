import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as Location from 'expo-location';
import { Link, useRouter } from 'expo-router';
import { memo, useCallback, useEffect, useRef, useState } from 'react';
import {
  ActivityIndicator,
  FlatList,
  Image,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import MapView, { Callout, Marker, Region } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SymbolIcon } from '@/components/SymbolIcon';
import { Colors, Spacing } from '@/constants/theme';
import { api } from '@/lib/api';

interface GymItem {
  id: string;
  name: string;
  address?: string;
  latitude?: number;
  longitude?: number;
  visitor_fee?: number;
  visitor_available: boolean;
  has_parking: boolean;
  has_shower: boolean;
  has_locker_room: boolean;
  machine_count: number;
  thumbnail_url?: string;
  is_favorited: boolean;
}

const JAPAN_REGION: Region = {
  latitude: 36.5,
  longitude: 138.0,
  latitudeDelta: 10,
  longitudeDelta: 10,
};

interface Coord {
  latitude: number;
  longitude: number;
}

interface GymListItem extends GymItem {
  distanceKm?: number;
}

/** 座標が入っているか。未登録のジムは 0 が入っている */
const hasCoord = (g: GymItem) =>
  g.latitude != null && g.longitude != null && g.latitude !== 0;

const EARTH_RADIUS_KM = 6371;

function distanceKm(from: Coord, to: Coord): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(to.latitude - from.latitude);
  const dLng = toRad(to.longitude - from.longitude);
  const h =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(from.latitude)) * Math.cos(toRad(to.latitude)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.sqrt(h));
}

function formatDistance(km: number): string {
  return km < 1 ? `${Math.round(km * 1000)}m` : `${km.toFixed(1)}km`;
}

const GymThumb = memo(({ uri }: { uri?: string }) => {
  const [failed, setFailed] = useState(false);
  if (uri && !failed) {
    return (
      <Image
        source={{ uri }}
        style={styles.thumbnail}
        resizeMode="cover"
        onError={() => setFailed(true)}
      />
    );
  }
  return <View style={styles.thumbnailPlaceholder} />;
});

const FACILITY_TAGS: { key: keyof GymItem; label: string }[] = [
  { key: 'visitor_available', label: 'ビジター可' },
  { key: 'has_parking', label: '駐車場' },
  { key: 'has_shower', label: 'シャワー' },
  { key: 'has_locker_room', label: '更衣室' },
];

async function fetchGyms({
  pageParam,
  search,
  near,
}: {
  pageParam?: string;
  search: string;
  near: Coord | null;
}) {
  const params: Record<string, string> = { limit: '50' };
  if (pageParam) params.cursor = pageParam;
  if (search) params.search = search;
  // With a location the server sorts by distance and returns the nearest gyms. Without
  // it the list is newest-first, which would cut off nearby gyms once there are more
  // than a page of them.
  if (near) {
    params.lat = String(near.latitude);
    params.lng = String(near.longitude);
  }
  const res = await api.get('/api/v1/gyms', { params });
  return res.data;
}

export default function GymScreen() {
  const [search, setSearch] = useState('');
  const [region, setRegion] = useState<Region>(JAPAN_REGION);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  // 並び替えの基準。地図を動かしても変わらないよう region とは別に持つ
  const [userLocation, setUserLocation] = useState<Coord | null>(null);
  const listRef = useRef<FlatList<GymListItem>>(null);
  const queryClient = useQueryClient();
  const router = useRouter();

  useEffect(() => {
    (async () => {
      try {
        const { status } = await Location.requestForegroundPermissionsAsync();
        if (status !== 'granted') return;
        const loc = await Location.getCurrentPositionAsync({});
        setUserLocation({ latitude: loc.coords.latitude, longitude: loc.coords.longitude });
        setRegion({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          latitudeDelta: 0.1,
          longitudeDelta: 0.1,
        });
      } catch {
        // 権限があっても端末側で位置を取得できないことがある（シミュレータで
        // 位置未設定の場合など）。距離順ソートと地図初期位置が JAPAN_REGION の
        // ままフォールバックするだけなので、静かに諦める。
      }
    })();
  }, []);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useInfiniteQuery({
    queryKey: ['gyms', search, userLocation],
    queryFn: ({ pageParam }) => fetchGyms({ pageParam, search, near: userLocation }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.next_cursor || undefined,
  });

  const allGyms = data?.pages.flatMap((p) => p.items as GymItem[]) ?? [];

  // リストは地図の表示範囲で絞り込まない。全件出して現在地から近い順に並べる。
  // 絞り込むと「近くに無い」と「登録が無い」が区別できず、地図を少し動かしただけで
  // 空になってしまうため。件数が増えたら絞り込みを入れ直す想定。
  const listGyms: GymListItem[] = allGyms
    .map((g) => ({
      ...g,
      distanceKm:
        userLocation && hasCoord(g)
          ? distanceKm(userLocation, { latitude: g.latitude!, longitude: g.longitude! })
          : undefined,
    }))
    .sort((a, b) => {
      // 座標が無いジムは末尾へ
      const da = a.distanceKm ?? Infinity;
      const db = b.distanceKm ?? Infinity;
      return da === db ? 0 : da - db;
    });

  const handleMarkerPress = useCallback(
    (gymId: string) => {
      setSelectedId(gymId);
      const idx = listGyms.findIndex((g) => g.id === gymId);
      if (idx >= 0 && listRef.current) {
        listRef.current.scrollToIndex({ index: idx, animated: true });
      }
    },
    [listGyms]
  );

  // 1回目のタップで選択して地図を寄せ、2回目で詳細へ移動する
  const handleCardPress = useCallback(
    (gym: GymItem) => {
      if (selectedId === gym.id) {
        router.push(`/gym/${gym.id}`);
        return;
      }

      setSelectedId(gym.id);

      // ズームは変えず中心だけ動かす
      if (hasCoord(gym)) {
        setRegion((prev) => ({
          ...prev,
          latitude: gym.latitude!,
          longitude: gym.longitude!,
        }));
      }
    },
    [selectedId, router]
  );

  const favMutation = useMutation({
    mutationFn: async ({ gymId, isFavorited }: { gymId: string; isFavorited: boolean }) => {
      if (isFavorited) {
        await api.delete(`/api/v1/gyms/${gymId}/favorites`);
      } else {
        await api.post(`/api/v1/gyms/${gymId}/favorites`);
      }
    },
    onMutate: async ({ gymId, isFavorited }) => {
      await queryClient.cancelQueries({ queryKey: ['gyms', search, userLocation] });
      const previous = queryClient.getQueryData(['gyms', search, userLocation]);
      queryClient.setQueryData(['gyms', search, userLocation], (old: any) => ({
        ...old,
        pages: old?.pages?.map((page: any) => ({
          ...page,
          items: page.items.map((g: GymItem) =>
            g.id === gymId ? { ...g, is_favorited: !isFavorited } : g
          ),
        })),
      }));
      return { previous };
    },
    onError: (_err, _vars, ctx: any) => {
      if (ctx?.previous) queryClient.setQueryData(['gyms', search, userLocation], ctx.previous);
    },
    onSettled: (_data, _err, { gymId }) => {
      queryClient.invalidateQueries({ queryKey: ['gym', gymId] });
      queryClient.invalidateQueries({ queryKey: ['gym-favorites'] });
    },
  });

  const mapGyms = allGyms.filter(hasCoord);

  return (
    <SafeAreaView style={styles.container}>
      <View style={styles.header}>
        <Text style={styles.title}>ジム</Text>
        <Link href="/gym/new" asChild>
          <TouchableOpacity style={styles.newBtn}>
            <Text style={styles.newBtnText}>登録</Text>
          </TouchableOpacity>
        </Link>
      </View>

      {/* 上部: マップ */}
      <View style={styles.mapContainer}>
        <MapView
          style={styles.map}
          region={region}
          onRegionChangeComplete={setRegion}
          showsUserLocation
        >
          {mapGyms.map((gym) => (
            <Marker
              key={gym.id}
              coordinate={{ latitude: gym.latitude!, longitude: gym.longitude! }}
              pinColor={gym.is_favorited ? Colors.hotPink : Colors.cyan}
              onPress={() => handleMarkerPress(gym.id)}
            >
              <Callout>
                <View style={styles.callout}>
                  <Text style={styles.calloutName} numberOfLines={2}>{gym.name}</Text>
                  {gym.visitor_fee != null && (
                    <Text style={styles.calloutFee}>ビジター ¥{gym.visitor_fee.toLocaleString()}</Text>
                  )}
                  <TouchableOpacity
                    style={styles.calloutFav}
                    onPress={() => favMutation.mutate({ gymId: gym.id, isFavorited: gym.is_favorited })}
                  >
                    <Text style={[styles.calloutFavText, gym.is_favorited && styles.calloutFavActive]}>
                      {gym.is_favorited ? '♥ 保存済み' : '♡ 保存'}
                    </Text>
                  </TouchableOpacity>
                </View>
              </Callout>
            </Marker>
          ))}
        </MapView>
      </View>

      {/* 検索バー */}
      <View style={styles.searchWrap}>
        <SymbolIcon name="magnifyingglass" ionicon="search-outline" size={16} tintColor={Colors.textMuted} />
        <TextInput
          style={styles.searchInput}
          value={search}
          onChangeText={setSearch}
          placeholder="ジム名で検索"
          placeholderTextColor={Colors.textMuted}
          returnKeyType="search"
          clearButtonMode="while-editing"
        />
        <Text style={styles.countLabel}>{listGyms.length}件</Text>
      </View>

      {/* 下部: リスト */}
      {isLoading ? (
        <ActivityIndicator color={Colors.pink} style={styles.loader} />
      ) : (
        <FlatList
          ref={listRef}
          data={listGyms}
          keyExtractor={(item) => item.id}
          onEndReached={() => hasNextPage && fetchNextPage()}
          onEndReachedThreshold={0.3}
          contentContainerStyle={styles.listContent}
          onScrollToIndexFailed={() => {}}
          ListFooterComponent={isFetchingNextPage ? <ActivityIndicator color={Colors.pink} /> : null}
          renderItem={({ item }) => {
            const isSelected = selectedId === item.id;
            return (
              <TouchableOpacity
                style={[styles.card, isSelected && styles.cardSelected]}
                onPress={() => handleCardPress(item)}
                accessibilityHint={
                  isSelected ? 'もう一度タップで詳細を開きます' : 'タップで地図をこのジムに移動します'
                }
              >
                <View style={styles.thumbWrap}>
                  <GymThumb uri={item.thumbnail_url} />
                </View>
                <View style={styles.cardBody}>
                  <View style={styles.cardTop}>
                    <Text style={styles.gymName} numberOfLines={2}>{item.name}</Text>
                    <TouchableOpacity
                      style={styles.heartBtn}
                      onPress={(e) => {
                        e.stopPropagation?.();
                        favMutation.mutate({ gymId: item.id, isFavorited: item.is_favorited });
                      }}
                    >
                      <Text style={[styles.heartIcon, item.is_favorited && styles.heartIconActive]}>
                        {item.is_favorited ? '♥' : '♡'}
                      </Text>
                    </TouchableOpacity>
                  </View>
                  {item.address && <Text style={styles.address} numberOfLines={1}>{item.address}</Text>}
                  <View style={styles.row}>
                    {item.distanceKm != null && (
                      <Text style={styles.distance}>{formatDistance(item.distanceKm)}</Text>
                    )}
                    {item.visitor_fee != null && (
                      <Text style={styles.fee}>ビジター ¥{item.visitor_fee.toLocaleString()}</Text>
                    )}
                    {item.machine_count > 0 && (
                      <View style={styles.machineBadge}>
                        <Text style={styles.machineBadgeText}>マシン {item.machine_count}台</Text>
                      </View>
                    )}
                  </View>
                  <View style={styles.tagRow}>
                    {FACILITY_TAGS.filter((t) => item[t.key]).map((t) => (
                      <View key={t.key} style={styles.facilityTag}>
                        <Text style={styles.facilityTagText}>{t.label}</Text>
                      </View>
                    ))}
                  </View>
                  {isSelected && <Text style={styles.selectedHint}>もう一度タップで詳細へ</Text>}
                </View>
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

  mapContainer: { height: '42%', borderBottomWidth: 1, borderBottomColor: Colors.surfaceBlue },
  map: { flex: 1 },

  callout: { width: 180, padding: Spacing.two },
  calloutName: { color: '#000', fontWeight: '700', fontSize: 13, marginBottom: 2 },
  calloutFee: { color: '#c0392b', fontWeight: '600', fontSize: 12, marginBottom: 4 },
  calloutFav: { paddingVertical: 2 },
  calloutFavText: { color: Colors.textMuted, fontSize: 12 },
  calloutFavActive: { color: Colors.hotPink },

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
  searchInput: { flex: 1, color: Colors.textPrimary, fontSize: 14 },
  countLabel: { color: Colors.textMuted, fontSize: 12 },

  loader: { marginTop: Spacing.five },
  listContent: { paddingTop: Spacing.one },

  card: {
    backgroundColor: Colors.surface,
    margin: Spacing.two,
    padding: Spacing.two,
    borderRadius: 12,
    borderWidth: 1,
    borderColor: Colors.lightCyan,
    flexDirection: 'row',
    gap: Spacing.two,
  },
  cardSelected: {
    borderColor: Colors.hotPink,
    borderWidth: 2,
    backgroundColor: Colors.surfacePink,
  },
  selectedHint: { color: Colors.hotPink, fontSize: 11, fontWeight: '600', marginTop: Spacing.one },
  thumbWrap: { flexShrink: 0 },
  thumbnail: { width: 72, height: 72, borderRadius: 8 },
  thumbnailPlaceholder: { width: 72, height: 72, borderRadius: 8, backgroundColor: Colors.surfaceBlue },
  cardBody: { flex: 1, gap: 2 },
  cardTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start' },
  gymName: { color: Colors.textPrimary, fontSize: 16, fontWeight: '700', flex: 1 },
  heartBtn: { paddingLeft: Spacing.one },
  heartIcon: { fontSize: 18, color: Colors.textMuted },
  heartIconActive: { color: Colors.hotPink },
  address: { color: Colors.textSecondary, fontSize: 12, marginTop: 2 },
  row: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, marginTop: Spacing.one },
  fee: { color: Colors.hotPink, fontWeight: 'bold', fontSize: 14 },
  distance: { color: Colors.textMuted, fontSize: 12, fontWeight: '600' },
  machineBadge: {
    backgroundColor: Colors.surfaceBlue,
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
    borderRadius: 8,
  },
  machineBadgeText: { color: Colors.cyan, fontSize: 11, fontWeight: 'bold' },
  tagRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one, marginTop: Spacing.one },
  facilityTag: {
    backgroundColor: Colors.surfacePink,
    paddingHorizontal: Spacing.two,
    paddingVertical: 2,
    borderRadius: 8,
  },
  facilityTagText: { color: Colors.hotPink, fontSize: 11, fontWeight: '600' },
});
