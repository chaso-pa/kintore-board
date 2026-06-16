import { useInfiniteQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import * as Location from 'expo-location';
import { Link } from 'expo-router';
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

async function fetchGyms({ pageParam, search }: { pageParam?: string; search: string }) {
  const params: Record<string, string> = { limit: '50' };
  if (pageParam) params.cursor = pageParam;
  if (search) params.search = search;
  const res = await api.get('/api/v1/gyms', { params });
  return res.data;
}

export default function GymScreen() {
  const [search, setSearch] = useState('');
  const [region, setRegion] = useState<Region>(JAPAN_REGION);
  const listRef = useRef<FlatList<GymItem>>(null);
  const queryClient = useQueryClient();

  useEffect(() => {
    (async () => {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status === 'granted') {
        const loc = await Location.getCurrentPositionAsync({});
        setRegion({
          latitude: loc.coords.latitude,
          longitude: loc.coords.longitude,
          latitudeDelta: 0.1,
          longitudeDelta: 0.1,
        });
      }
    })();
  }, []);

  const { data, fetchNextPage, hasNextPage, isFetchingNextPage, isLoading } = useInfiniteQuery({
    queryKey: ['gyms', search],
    queryFn: ({ pageParam }) => fetchGyms({ pageParam, search }),
    initialPageParam: undefined as string | undefined,
    getNextPageParam: (page) => page.next_cursor || undefined,
  });

  const allGyms = data?.pages.flatMap((p) => p.items as GymItem[]) ?? [];

  const viewportGyms = allGyms.filter((g) => {
    if (g.latitude == null || g.longitude == null || g.latitude === 0) return true;
    const latHalf = region.latitudeDelta / 2;
    const lngHalf = region.longitudeDelta / 2;
    return (
      g.latitude >= region.latitude - latHalf &&
      g.latitude <= region.latitude + latHalf &&
      g.longitude >= region.longitude - lngHalf &&
      g.longitude <= region.longitude + lngHalf
    );
  });

  const handleMarkerPress = useCallback(
    (gymId: string) => {
      const idx = viewportGyms.findIndex((g) => g.id === gymId);
      if (idx >= 0 && listRef.current) {
        listRef.current.scrollToIndex({ index: idx, animated: true });
      }
    },
    [viewportGyms]
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
      await queryClient.cancelQueries({ queryKey: ['gyms', search] });
      const previous = queryClient.getQueryData(['gyms', search]);
      queryClient.setQueryData(['gyms', search], (old: any) => ({
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
      if (ctx?.previous) queryClient.setQueryData(['gyms', search], ctx.previous);
    },
    onSettled: (_data, _err, { gymId }) => {
      queryClient.invalidateQueries({ queryKey: ['gym', gymId] });
      queryClient.invalidateQueries({ queryKey: ['gym-favorites'] });
    },
  });

  const mapGyms = allGyms.filter((g) => g.latitude != null && g.longitude != null && g.latitude !== 0);

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
        <Text style={styles.countLabel}>{viewportGyms.length}件</Text>
      </View>

      {/* 下部: リスト */}
      {isLoading ? (
        <ActivityIndicator color={Colors.pink} style={styles.loader} />
      ) : (
        <FlatList
          ref={listRef}
          data={viewportGyms}
          keyExtractor={(item) => item.id}
          onEndReached={() => hasNextPage && fetchNextPage()}
          onEndReachedThreshold={0.3}
          contentContainerStyle={styles.listContent}
          onScrollToIndexFailed={() => {}}
          ListFooterComponent={isFetchingNextPage ? <ActivityIndicator color={Colors.pink} /> : null}
          renderItem={({ item }) => (
            <Link href={`/gym/${item.id}`} asChild>
              <TouchableOpacity style={styles.card}>
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
