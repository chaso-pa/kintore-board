import { useCallback, useRef, useState } from 'react';
import {
  Dimensions,
  FlatList,
  Image,
  Modal,
  StyleSheet,
  Text,
  TouchableOpacity,
  View,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { SymbolIcon } from '@/components/SymbolIcon';

const { width, height } = Dimensions.get('window');

interface Props {
  images: string[];
  initialIndex: number;
  visible: boolean;
  onClose: () => void;
}

export function ImageViewerModal({ images, initialIndex, visible, onClose }: Props) {
  const flatRef = useRef<FlatList>(null);
  const insets = useSafeAreaInsets();
  const [currentIndex, setCurrentIndex] = useState(initialIndex);

  // visible / initialIndex の変化に合わせて描画中に index をリセットする
  const [prevKey, setPrevKey] = useState({ visible, initialIndex });
  if (prevKey.visible !== visible || prevKey.initialIndex !== initialIndex) {
    setPrevKey({ visible, initialIndex });
    if (visible) setCurrentIndex(initialIndex);
  }

  const onViewableItemsChanged = useCallback(({ viewableItems }: { viewableItems: { index: number | null }[] }) => {
    if (viewableItems[0]?.index != null) {
      setCurrentIndex(viewableItems[0].index);
    }
  }, []);

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={onClose}>
      <View style={styles.backdrop}>
        <FlatList
          ref={flatRef}
          data={images}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          initialScrollIndex={initialIndex}
          getItemLayout={(_, index) => ({ length: width, offset: width * index, index })}
          keyExtractor={(_, i) => String(i)}
          onViewableItemsChanged={onViewableItemsChanged}
          viewabilityConfig={{ itemVisiblePercentThreshold: 50 }}
          renderItem={({ item }) => (
            <View style={styles.page}>
              <Image source={{ uri: item }} style={styles.image} resizeMode="contain" />
            </View>
          )}
        />

        {/* ヘッダーをFlatListの上にオーバーレイ */}
        <View style={[styles.header, { paddingTop: insets.top + 8 }]}>
          <Text style={styles.counter}>{images.length > 1 ? `${currentIndex + 1} / ${images.length}` : ''}</Text>
          <TouchableOpacity onPress={onClose} hitSlop={16} style={styles.closeBtn}>
            <SymbolIcon name="xmark" ionicon="close" size={22} tintColor="#fff" />
          </TouchableOpacity>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: { flex: 1, backgroundColor: 'rgba(0,0,0,0.95)' },
  header: {
    position: 'absolute',
    top: 0,
    left: 0,
    right: 0,
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    paddingHorizontal: 16,
    paddingBottom: 12,
  },
  counter: { color: 'rgba(255,255,255,0.7)', fontSize: 14 },
  closeBtn: { padding: 4 },
  page: { width, height, justifyContent: 'center', alignItems: 'center' },
  image: { width, height: height * 0.85 },
});
