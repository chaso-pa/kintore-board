import { useState } from 'react';
import {
  Alert,
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

import { type BodyPart } from '@/constants/exercises';
import { Colors, Spacing } from '@/constants/theme';
import {
  countExercisesIn,
  duplicateBodyPartReason,
  orderedBodyParts,
} from '@/lib/custom-body-parts';
import { buildExerciseList, duplicateReason, type CustomExercise } from '@/lib/custom-exercises';

interface Props {
  visible: boolean;
  customExercises: CustomExercise[];
  customBodyParts: string[];
  onSelect: (name: string) => void;
  onClose: () => void;
  onCreateCustom: (entry: CustomExercise) => void;
  onDeleteCustom: (name: string) => void;
  onCreateBodyPart: (name: string) => void;
  onDeleteBodyPart: (name: string) => void;
}

export function ExerciseSelectModal({
  visible,
  customExercises,
  customBodyParts,
  onSelect,
  onClose,
  onCreateCustom,
  onDeleteCustom,
  onCreateBodyPart,
  onDeleteBodyPart,
}: Props) {
  const [activeTab, setActiveTab] = useState<BodyPart | 'すべて'>('すべて');
  const [search, setSearch] = useState('');

  // The create form lives inline rather than in a nested modal — stacking a second
  // pageSheet on iOS behaves unpredictably.
  const [creating, setCreating] = useState(false);
  const [draftName, setDraftName] = useState('');
  const [draftBodyPart, setDraftBodyPart] = useState<BodyPart | null>(null);

  // Adding a part happens inside the exercise form, since wanting one only ever comes up
  // while filing an exercise. The half-typed exercise stays on screen throughout.
  const [addingPart, setAddingPart] = useState(false);
  const [draftPartName, setDraftPartName] = useState('');

  const bodyParts = orderedBodyParts(customBodyParts);
  const isCustomPart = (part: string) => customBodyParts.includes(part);

  const filtered = buildExerciseList(customExercises).filter((e) => {
    const matchTab = activeTab === 'すべて' || e.bodyPart === activeTab;
    const matchSearch = search === '' || e.name.includes(search);
    return matchTab && matchSearch;
  });

  const tabs: (BodyPart | 'すべて')[] = ['すべて', ...bodyParts];

  const duplicate = duplicateReason(draftName, customExercises);
  const canCreate = draftName.trim() !== '' && draftBodyPart !== null && duplicate === null;

  const partDuplicate = duplicateBodyPartReason(draftPartName, customBodyParts);
  const canCreatePart = draftPartName.trim() !== '' && partDuplicate === null;

  const resetDraft = () => {
    setCreating(false);
    setDraftName('');
    setDraftBodyPart(null);
    setAddingPart(false);
    setDraftPartName('');
  };

  // A part is created to be used, so it is selected straight away — otherwise the next tap
  // is always the chip that was just added.
  const submitPart = () => {
    if (!canCreatePart) return;
    const name = draftPartName.trim();
    onCreateBodyPart(name);
    setDraftBodyPart(name);
    setAddingPart(false);
    setDraftPartName('');
  };

  const confirmDeletePart = (part: string) => {
    const affected = countExercisesIn(customExercises, part);
    const message =
      affected > 0
        ? `この部位の種目 ${affected} 件は「その他」に移ります。記録は消えません。`
        : undefined;
    Alert.alert(`部位「${part}」を削除しますか？`, message, [
      { text: 'キャンセル', style: 'cancel' },
      {
        text: '削除',
        style: 'destructive',
        onPress: () => {
          // The form would otherwise keep pointing at a part that no longer exists, and
          // the create button would stay enabled for it.
          if (draftBodyPart === part) setDraftBodyPart(null);
          if (activeTab === part) setActiveTab('すべて');
          onDeleteBodyPart(part);
        },
      },
    ]);
  };

  // Creating an exercise is only ever a step toward logging it, so the new exercise is
  // selected and the picker closes — the same outcome as tapping an existing row.
  const submitDraft = () => {
    if (!canCreate || draftBodyPart === null) return;
    const name = draftName.trim();
    onCreateCustom({ name, bodyPart: draftBodyPart });
    onSelect(name);
    resetDraft();
    setSearch('');
    onClose();
  };

  const confirmDelete = (name: string) => {
    Alert.alert(`「${name}」を削除しますか？`, undefined, [
      { text: 'キャンセル', style: 'cancel' },
      { text: '削除', style: 'destructive', onPress: () => onDeleteCustom(name) },
    ]);
  };

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
          keyboardShouldPersistTaps="handled"
          ListHeaderComponent={
            creating ? (
              <View style={styles.createForm}>
                <Text style={styles.createLabel}>種目名</Text>
                <TextInput
                  style={styles.createInput}
                  value={draftName}
                  onChangeText={setDraftName}
                  placeholder="例: ペックデック"
                  placeholderTextColor={Colors.textMuted}
                  autoFocus
                />
                {duplicate && <Text style={styles.createError}>{duplicate}</Text>}

                <Text style={styles.createLabel}>部位</Text>
                <View style={styles.partRow}>
                  {bodyParts.map(bp => (
                    <TouchableOpacity
                      key={bp}
                      style={[styles.partChip, draftBodyPart === bp && styles.partChipActive]}
                      onPress={() => setDraftBodyPart(draftBodyPart === bp ? null : bp)}
                      // Long-press deletes, matching how custom exercises are removed in
                      // the list below. Presets are not the user's to delete.
                      onLongPress={isCustomPart(bp) ? () => confirmDeletePart(bp) : undefined}>
                      <Text style={[styles.partChipText, draftBodyPart === bp && styles.partChipTextActive]}>
                        {bp}
                      </Text>
                    </TouchableOpacity>
                  ))}
                  {!addingPart && (
                    <TouchableOpacity
                      style={[styles.partChip, styles.partAddChip]}
                      onPress={() => setAddingPart(true)}>
                      <Text style={styles.partAddChipText}>＋</Text>
                    </TouchableOpacity>
                  )}
                </View>

                {addingPart && (
                  <View style={styles.partAddForm}>
                    <TextInput
                      style={[styles.createInput, styles.partAddInput]}
                      value={draftPartName}
                      onChangeText={setDraftPartName}
                      placeholder="例: 腹筋"
                      placeholderTextColor={Colors.textMuted}
                      autoFocus
                      returnKeyType="done"
                      onSubmitEditing={submitPart}
                    />
                    <TouchableOpacity
                      style={[styles.partAddBtn, !canCreatePart && styles.createBtnDisabled]}
                      disabled={!canCreatePart}
                      onPress={submitPart}>
                      <Text style={styles.createBtnText}>追加</Text>
                    </TouchableOpacity>
                    <TouchableOpacity
                      onPress={() => {
                        setAddingPart(false);
                        setDraftPartName('');
                      }}>
                      <Text style={styles.createCancel}>やめる</Text>
                    </TouchableOpacity>
                  </View>
                )}
                {addingPart && partDuplicate && (
                  <Text style={styles.createError}>{partDuplicate}</Text>
                )}
                {customBodyParts.length > 0 && !addingPart && (
                  <Text style={styles.partHint}>自作の部位は長押しで削除できます</Text>
                )}

                <View style={styles.createActions}>
                  <TouchableOpacity onPress={resetDraft}>
                    <Text style={styles.createCancel}>キャンセル</Text>
                  </TouchableOpacity>
                  <TouchableOpacity
                    style={[styles.createBtn, !canCreate && styles.createBtnDisabled]}
                    disabled={!canCreate}
                    onPress={submitDraft}>
                    <Text style={styles.createBtnText}>作成する</Text>
                  </TouchableOpacity>
                </View>
              </View>
            ) : (
              <TouchableOpacity style={styles.addRow} onPress={() => setCreating(true)}>
                <Text style={styles.addRowText}>＋ カスタム種目を作る</Text>
              </TouchableOpacity>
            )
          }
          renderItem={({ item }) => (
            <Pressable
              style={styles.item}
              onPress={() => {
                onSelect(item.name);
                onClose();
                setSearch('');
              }}
              // Long-press deletes, but only for entries the user created — presets are
              // not theirs to remove.
              onLongPress={item.isCustom ? () => confirmDelete(item.name) : undefined}>
              <View style={styles.itemLeft}>
                <Text style={styles.itemName}>{item.name}</Text>
                {item.isCustom && (
                  <View style={styles.customBadge}>
                    <Text style={styles.customBadgeText}>自作</Text>
                  </View>
                )}
              </View>
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
  itemLeft: { flexDirection: 'row', alignItems: 'center', gap: Spacing.two, flex: 1 },
  itemName: { fontSize: 15, color: Colors.textPrimary, fontWeight: '500' },
  itemCategory: { fontSize: 12, color: Colors.textMuted },
  customBadge: {
    backgroundColor: Colors.surfacePink,
    paddingHorizontal: Spacing.two,
    paddingVertical: 1,
    borderRadius: 8,
  },
  customBadgeText: { color: Colors.hotPink, fontSize: 10, fontWeight: 'bold' },
  empty: { textAlign: 'center', color: Colors.textMuted, marginTop: Spacing.five },

  addRow: {
    backgroundColor: Colors.surfaceBlue,
    borderRadius: 10,
    padding: Spacing.three,
    alignItems: 'center',
    marginBottom: Spacing.one,
  },
  addRowText: { color: Colors.cyan, fontSize: 15, fontWeight: 'bold' },

  createForm: {
    backgroundColor: Colors.surface,
    borderRadius: 10,
    borderWidth: 1,
    borderColor: Colors.lightCyan,
    padding: Spacing.three,
    marginBottom: Spacing.two,
    gap: Spacing.one,
  },
  createLabel: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary, marginTop: Spacing.one },
  createInput: {
    backgroundColor: Colors.background,
    borderRadius: 8,
    borderWidth: 1,
    borderColor: Colors.lightCyan,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
    color: Colors.textPrimary,
    fontSize: 15,
  },
  createError: { color: Colors.danger, fontSize: 12 },
  partRow: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  partChip: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.lightCyan,
    backgroundColor: Colors.background,
  },
  partChipActive: { backgroundColor: Colors.hotPink, borderColor: Colors.hotPink },
  partChipText: { fontSize: 13, color: Colors.textSecondary },
  partChipTextActive: { color: '#fff', fontWeight: 'bold' },
  partAddChip: { borderStyle: 'dashed', borderColor: Colors.cyan },
  partAddChipText: { fontSize: 13, color: Colors.cyan, fontWeight: 'bold' },
  partAddForm: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  partAddInput: { flex: 1 },
  partAddBtn: {
    backgroundColor: Colors.cyan,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: 16,
  },
  partHint: { fontSize: 11, color: Colors.textMuted },
  createActions: {
    flexDirection: 'row',
    justifyContent: 'flex-end',
    alignItems: 'center',
    gap: Spacing.three,
    marginTop: Spacing.two,
  },
  createCancel: { color: Colors.textMuted, fontSize: 14 },
  createBtn: {
    backgroundColor: Colors.hotPink,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: 16,
  },
  createBtnDisabled: { opacity: 0.4 },
  createBtnText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
});
