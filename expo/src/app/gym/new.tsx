import { useMutation, useQueryClient } from '@tanstack/react-query';
import * as Location from 'expo-location';
import { useRouter } from 'expo-router';
import { useCallback, useState } from 'react';
import {
  Alert,
  ScrollView,
  StyleSheet,
  Switch,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import MapView, { MapPressEvent, Marker, Region } from 'react-native-maps';
import { SafeAreaView } from 'react-native-safe-area-context';

import { api } from '@/lib/api';
import { Colors, Spacing } from '@/constants/theme';
import { queryKeys } from '@/lib/query-keys';

interface Coord {
  latitude: number;
  longitude: number;
}

const JAPAN_REGION: Region = {
  latitude: 36.5,
  longitude: 138.0,
  latitudeDelta: 10,
  longitudeDelta: 10,
};

export default function NewGymScreen() {
  const router = useRouter();
  const qc = useQueryClient();
  const [name, setName] = useState('');
  const [address, setAddress] = useState('');
  const [visitorFee, setVisitorFee] = useState('');
  const [monthlyFee, setMonthlyFee] = useState('');
  const [hours, setHours] = useState('');
  const [hasParking, setHasParking] = useState(false);
  const [hasShower, setHasShower] = useState(false);
  const [hasLockerRoom, setHasLockerRoom] = useState(false);
  const [coord, setCoord] = useState<Coord | null>(null);
  const [region, setRegion] = useState<Region>(JAPAN_REGION);
  const [geocoding, setGeocoding] = useState(false);

  // 座標を確定しつつ、その地点に地図を寄せる
  const applyCoord = useCallback((next: Coord) => {
    setCoord(next);
    setRegion({ ...next, latitudeDelta: 0.01, longitudeDelta: 0.01 });
  }, []);

  const geocodeAddress = useCallback(async () => {
    const query = address.trim();
    if (!query || geocoding) return;

    setGeocoding(true);
    try {
      // Android では geocodeAsync に位置情報の許可が必要
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') {
        Alert.alert(
          '位置情報の許可が必要です',
          '住所からの取得ができません。地図をタップして手動で位置を指定してください。'
        );
        return;
      }

      const results = await Location.geocodeAsync(query);
      if (results.length === 0) {
        Alert.alert(
          '住所が見つかりません',
          '地図をタップして手動で位置を指定してください。'
        );
        return;
      }
      applyCoord({ latitude: results[0].latitude, longitude: results[0].longitude });
    } catch {
      Alert.alert('エラー', '住所から位置を取得できませんでした');
    } finally {
      setGeocoding(false);
    }
  }, [address, geocoding, applyCoord]);

  const mutation = useMutation({
    mutationFn: async () => {
      await api.post('/api/v1/gyms', {
        name,
        address: address || undefined,
        latitude: coord?.latitude,
        longitude: coord?.longitude,
        visitor_fee: visitorFee ? parseInt(visitorFee) : undefined,
        monthly_fee: monthlyFee ? parseInt(monthlyFee) : undefined,
        visitor_available: !!visitorFee,
        hours: hours || undefined,
        has_parking: hasParking,
        has_shower: hasShower,
        has_locker_room: hasLockerRoom,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries({ queryKey: queryKeys.gyms.root });
      router.back();
    },
    onError: () => Alert.alert('エラー', 'ジムの登録に失敗しました'),
  });

  return (
    <SafeAreaView style={styles.container} edges={['bottom']}>
      <ScrollView contentContainerStyle={styles.form}>
        <Text style={styles.label}>ジム名 *</Text>
        <TextInput
          style={styles.input}
          value={name}
          onChangeText={setName}
          placeholder="例: フィットネスジムXX"
          placeholderTextColor={Colors.textMuted}
        />

        <Text style={styles.label}>住所</Text>
        <TextInput
          style={styles.input}
          value={address}
          onChangeText={setAddress}
          onBlur={() => {
            // まだ位置未設定のときだけ自動で引く。手で直した位置を上書きしない
            if (!coord) geocodeAddress();
          }}
          placeholder="例: 東京都渋谷区..."
          placeholderTextColor={Colors.textMuted}
        />

        <Text style={styles.label}>地図の位置</Text>
        <Text style={styles.hint}>
          位置を設定しないと、このジムは地図に表示されません。地図をタップ、またはピンをドラッグして調整できます。
        </Text>

        <TouchableOpacity
          style={[styles.geocodeBtn, (!address.trim() || geocoding) && styles.geocodeBtnDisabled]}
          disabled={!address.trim() || geocoding}
          onPress={geocodeAddress}>
          <Text style={styles.geocodeText}>
            {geocoding ? '取得中…' : '住所から位置を取得'}
          </Text>
        </TouchableOpacity>

        <View style={styles.mapWrapper}>
          <MapView
            style={styles.map}
            region={region}
            onRegionChangeComplete={setRegion}
            onPress={(e: MapPressEvent) => applyCoord(e.nativeEvent.coordinate)}>
            {coord && (
              <Marker
                coordinate={coord}
                draggable
                pinColor={Colors.hotPink}
                onDragEnd={(e) => setCoord(e.nativeEvent.coordinate)}
              />
            )}
          </MapView>
        </View>

        {coord ? (
          <View style={styles.coordRow}>
            <Text style={styles.coordText}>
              {coord.latitude.toFixed(5)}, {coord.longitude.toFixed(5)}
            </Text>
            <TouchableOpacity onPress={() => setCoord(null)}>
              <Text style={styles.coordClear}>クリア</Text>
            </TouchableOpacity>
          </View>
        ) : (
          <Text style={styles.coordMissing}>位置が未設定です</Text>
        )}

        <View style={styles.row}>
          <View style={styles.half}>
            <Text style={styles.label}>ビジター料金 (円)</Text>
            <TextInput
              style={styles.input}
              value={visitorFee}
              onChangeText={setVisitorFee}
              keyboardType="numeric"
              placeholder="例: 1500"
              placeholderTextColor={Colors.textMuted}
            />
          </View>
          <View style={styles.half}>
            <Text style={styles.label}>月額 (円)</Text>
            <TextInput
              style={styles.input}
              value={monthlyFee}
              onChangeText={setMonthlyFee}
              keyboardType="numeric"
              placeholder="例: 8000"
              placeholderTextColor={Colors.textMuted}
            />
          </View>
        </View>

        <Text style={styles.label}>営業時間</Text>
        <TextInput
          style={styles.input}
          value={hours}
          onChangeText={setHours}
          placeholder="例: 24時間営業 / 年中無休"
          placeholderTextColor={Colors.textMuted}
        />

        <Text style={[styles.label, { marginTop: Spacing.three }]}>設備</Text>
        <View style={styles.toggleCard}>
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>駐車場</Text>
            <Switch
              value={hasParking}
              onValueChange={setHasParking}
              trackColor={{ true: Colors.hotPink }}
            />
          </View>
          <View style={styles.divider} />
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>シャワー</Text>
            <Switch
              value={hasShower}
              onValueChange={setHasShower}
              trackColor={{ true: Colors.hotPink }}
            />
          </View>
          <View style={styles.divider} />
          <View style={styles.toggleRow}>
            <Text style={styles.toggleLabel}>更衣室</Text>
            <Switch
              value={hasLockerRoom}
              onValueChange={setHasLockerRoom}
              trackColor={{ true: Colors.hotPink }}
            />
          </View>
        </View>

        <View style={styles.notice}>
          <Text style={styles.noticeText}>※ 投稿する情報はユーザー提供情報として公開されます</Text>
        </View>

        <TouchableOpacity
          style={[styles.submitBtn, (!name.trim() || mutation.isPending) && styles.submitBtnDisabled]}
          disabled={!name.trim() || mutation.isPending}
          onPress={() => mutation.mutate()}>
          <Text style={styles.submitText}>登録する</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  form: { padding: Spacing.three, gap: Spacing.one },
  label: { color: Colors.textPrimary, fontWeight: 'bold', fontSize: 14, marginTop: Spacing.two },
  input: {
    borderWidth: 2, borderColor: Colors.lightCyan, borderRadius: 12,
    padding: Spacing.two, color: Colors.textPrimary, fontSize: 15,
    backgroundColor: Colors.surface,
  },
  row: { flexDirection: 'row', gap: Spacing.two },
  half: { flex: 1 },
  hint: { color: Colors.textSecondary, fontSize: 12, lineHeight: 18, marginTop: Spacing.half },
  geocodeBtn: {
    backgroundColor: Colors.surfaceBlue, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.lightCyan,
    paddingVertical: Spacing.two, alignItems: 'center', marginTop: Spacing.two,
  },
  geocodeBtnDisabled: { opacity: 0.5 },
  geocodeText: { color: Colors.textPrimary, fontWeight: 'bold', fontSize: 14 },
  mapWrapper: {
    height: 220, borderRadius: 12, overflow: 'hidden',
    borderWidth: 2, borderColor: Colors.lightCyan, marginTop: Spacing.two,
  },
  map: { flex: 1 },
  coordRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    marginTop: Spacing.one,
  },
  coordText: { color: Colors.textSecondary, fontSize: 12 },
  coordClear: { color: Colors.hotPink, fontSize: 12, fontWeight: 'bold' },
  coordMissing: { color: Colors.textMuted, fontSize: 12, marginTop: Spacing.one },
  toggleCard: {
    backgroundColor: Colors.surface, borderRadius: 12,
    borderWidth: 1, borderColor: Colors.lightCyan, overflow: 'hidden',
    marginTop: Spacing.one,
  },
  toggleRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center',
    paddingHorizontal: Spacing.three, paddingVertical: Spacing.two,
  },
  toggleLabel: { color: Colors.textPrimary, fontSize: 15 },
  divider: { height: 1, backgroundColor: Colors.lightCyan },
  notice: { backgroundColor: Colors.surfacePink, padding: Spacing.two, borderRadius: 8, marginTop: Spacing.two },
  noticeText: { color: Colors.hotPink, fontSize: 12 },
  submitBtn: {
    backgroundColor: Colors.cyan, padding: Spacing.three,
    borderRadius: 24, alignItems: 'center', marginTop: Spacing.three,
  },
  submitBtnDisabled: { backgroundColor: Colors.textMuted },
  submitText: { color: Colors.textPrimary, fontWeight: 'bold', fontSize: 16 },
});
