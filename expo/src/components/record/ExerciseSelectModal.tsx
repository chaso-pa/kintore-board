import { useState } from 'react';
import {
  FlatList,
  Modal,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { BODY_PARTS, PRESET_EXERCISES, type BodyPart } from '@/constants/exercises';
import { Colors, Spacing } from '@/constants/theme';

interface Props {
  visible: boolean;
  customExercises: string[];
  onSelect: (name: string) => void;
  onClose: () => void;
}

export function ExerciseSelectModal({ visible, customExercises, onSelect, onClose }: Props) {
  const [activeTab, setActiveTab] = useState<BodyPart | 'すべて'>('すべて');
  const [search, setSearch] = useState('');

  const presetNames = new Set(PRESET_EXERCISES.map(e => e.name));

  const allExercises = [
    ...PRESET_EXERCISES,
    ...customExercises
      .filter(name => !presetNames.has(name))
      .map(name => ({ name, bodyPart: 'その他' as BodyPart })),
  ];

  const filtered = allExercises.filter(e => {
    const matchTab = activeTab === 'すべて' || e.bodyPart === activeTab;
    const matchSearch = search === '' || e.name.includes(search);
    return matchTab && matchSearch;
  });

  const tabs: (BodyPart | 'すべて')[] = ['すべて', ...BODY_PARTS];

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={styles.container}>
        <View style={styles.header}>
          <Text style={styles.title}>種目を選択</Text>
          <TouchableOpacity onPress={onClose}>
            <Text style={styles.closeBtn}>閉じる</Text>
          </TouchableOpacity>
        </View>

        <TextInput
          style={styles.search}
          placeholder="種目名で検索..."
          placeholderTextColor={Colors.textMuted}
          value={search}
          onChangeText={setSearch}
        />

        <ScrollView horizontal showsHorizontalScrollIndicator={false} style={styles.tabBar} contentContainerStyle={styles.tabBarContent}>
          {tabs.map(tab => (
            <TouchableOpacity
              key={tab}
              style={[styles.tab, activeTab === tab && styles.tabActive]}
              onPress={() => setActiveTab(tab)}>
              <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>{tab}</Text>
            </TouchableOpacity>
          ))}
        </ScrollView>

        <FlatList
          data={filtered}
          keyExtractor={item => item.name}
          style={styles.listFlex}
          contentContainerStyle={styles.list}
          renderItem={({ item }) => (
            <Pressable
              style={styles.item}
              onPress={() => {
                onSelect(item.name);
                onClose();
                setSearch('');
              }}>
              <Text style={styles.itemName}>{item.name}</Text>
              <Text style={styles.itemCategory}>{item.bodyPart}</Text>
            </Pressable>
          )}
          ListEmptyComponent={<Text style={styles.empty}>種目が見つかりません</Text>}
        />
      </SafeAreaView>
    </Modal>
  );
}

const styles = StyleSheet.create({
  container: { flex: 1, backgroundColor: Colors.background },
  header: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    padding: Spacing.three,
    borderBottomWidth: 1,
    borderBottomColor: '#E8D5E8',
  },
  title: { fontSize: 17, fontWeight: 'bold', color: Colors.textPrimary },
  closeBtn: { color: Colors.pink, fontSize: 15 },
  search: {
    margin: Spacing.three,
    marginBottom: Spacing.two,
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: Spacing.two,
    color: Colors.textPrimary,
    fontSize: 14,
    borderWidth: 1,
    borderColor: '#EEE',
  },
  tabBar: { maxHeight: 48 },
  tabBarContent: { paddingHorizontal: Spacing.three, gap: Spacing.one, alignItems: 'center' },
  tab: {
    paddingHorizontal: Spacing.two,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: Colors.surface,
    borderWidth: 1,
    borderColor: '#E0E0E0',
  },
  tabActive: { backgroundColor: Colors.hotPink, borderColor: Colors.hotPink },
  tabText: { fontSize: 13, color: Colors.textSecondary },
  tabTextActive: { color: '#fff', fontWeight: 'bold' },
  listFlex: { flex: 1 },
  list: { padding: Spacing.three, gap: Spacing.one },
  item: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: Spacing.three,
    borderWidth: 1,
    borderColor: '#F0E8F0',
  },
  itemName: { fontSize: 15, color: Colors.textPrimary, fontWeight: '500' },
  itemCategory: { fontSize: 12, color: Colors.textMuted },
  empty: { textAlign: 'center', color: Colors.textMuted, marginTop: Spacing.five },
});
