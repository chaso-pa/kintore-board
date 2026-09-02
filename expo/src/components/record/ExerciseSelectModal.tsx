import { useState } from 'react';
import {
  Alert,
  FlatList,
  Modal,
  Pressable,
  StyleSheet,
  Text,
  TextInput,
  TouchableOpacity,
  View,
} from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaView } from 'react-native-safe-area-context';

import { SymbolIcon } from '@/components/SymbolIcon';
import { useUnclassifiedExercises } from '@/hooks/use-unclassified-exercises';
import { CatalogManager } from '@/components/record/CatalogManager';
import { SwipeToDeleteRow } from '@/components/record/SwipeToDeleteRow';
import { type BodyPart } from '@/constants/exercises';
import { Colors, Spacing } from '@/constants/theme';
import {
  countExercisesIn,
  duplicateBodyPartReason,
  orderedBodyParts,
} from '@/lib/custom-body-parts';
import {
  buildExerciseList,
  duplicateReason,
  exerciseKey,
  type CustomExercise,
} from '@/lib/custom-exercises';

interface Props {
  visible: boolean;
  customExercises: CustomExercise[];
  customBodyParts: string[];
  hiddenPresets: string[];
  /**
   * The part comes back with the name. The same name can belong to two parts now, so the
   * screen cannot look it up afterwards — only the row that was tapped knows which one it
   * was.
   */
  onSelect: (name: string, bodyPart: string) => void;
  onClose: () => void;
  onCreateCustom: (entry: CustomExercise) => void;
  onDeleteCustom: (name: string, bodyPart: string) => void;
  onHidePreset: (name: string, bodyPart: string) => void;
  onRestorePreset: (key: string) => void;
  onCreateBodyPart: (name: string) => void;
  onDeleteBodyPart: (name: string) => void;
}

export function ExerciseSelectModal({
  visible,
  customExercises,
  customBodyParts,
  hiddenPresets,
  onSelect,
  onClose,
  onCreateCustom,
  onDeleteCustom,
  onHidePreset,
  onRestorePreset,
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

  // Management replaces the picker's body rather than opening on top of it, for the same
  // reason the create form is inline: a second pageSheet over this one misbehaves on iOS.
  const [managing, setManaging] = useState(false);

  // Only fetched while the picker is open. Nothing outside it can act on the answer, and a
  // request on every screen that renders this modal closed would be for nothing.
  const { unclassified, assign, assigning } = useUnclassifiedExercises(visible);

  // Management mode is left on the way out, so reopening the picker to log a set does not
  // land on the management screen instead.
  const closeModal = () => {
    setManaging(false);
    onClose();
  };

  const bodyParts = orderedBodyParts(customBodyParts);
  const isCustomPart = (part: string) => customBodyParts.includes(part);

  // The manage entry point is hidden until there is something to manage — an empty screen
  // reached through a button is worse than no button.
  // Unclassified records count. Without them, a user whose only reason to open the manager
  // is an old record with no body part would find no way in — the fix would exist behind a
  // button that never appears.
  const hasAnythingCustom =
    customBodyParts.length > 0 ||
    customExercises.length > 0 ||
    hiddenPresets.length > 0 ||
    unclassified.length > 0;

  const filtered = buildExerciseList(customExercises, hiddenPresets).filter((e) => {
    const matchTab = activeTab === 'すべて' || e.bodyPart === activeTab;
    const matchSearch = search === '' || e.name.includes(search);
    return matchTab && matchSearch;
  });

  const tabs: (BodyPart | 'すべて')[] = ['すべて', ...bodyParts];

  // Checked against the part being chosen, not against the name alone: the same name under
  // a different part is a different entry now.
  const duplicate = duplicateReason(
    draftName,
    draftBodyPart ?? '',
    customExercises,
    hiddenPresets
  );
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
    onSelect(name, draftBodyPart);
    resetDraft();
    setSearch('');
    closeModal();
  };

  // Presets are hidden rather than erased, and the wording says so — "削除" on something the
  // app shipped would imply it is gone for good, when it is one tap away in the manager.
  const confirmDelete = (name: string, bodyPart: string, isCustom: boolean) => {
    if (isCustom) {
      Alert.alert(`「${name}」を削除しますか？`, `部位: ${bodyPart}`, [
        { text: 'キャンセル', style: 'cancel' },
        { text: '削除', style: 'destructive', onPress: () => onDeleteCustom(name, bodyPart) },
      ]);
      return;
    }
    Alert.alert(
      `「${name}」を一覧から消しますか？`,
      '記録済みのトレーニングは残ります。カスタム種目の管理からいつでも戻せます。',
      [
        { text: 'キャンセル', style: 'cancel' },
        { text: '消す', style: 'destructive', onPress: () => onHidePreset(name, bodyPart) },
      ]
    );
  };

  return (
    <Modal visible={visible} animationType="slide" presentationStyle="pageSheet" onRequestClose={closeModal}>
      {/* Gestures inside a React Native Modal are outside the app's root view, so the
          swipe rows below need their own root here. */}
      <GestureHandlerRootView style={styles.container}>
        <SafeAreaView style={styles.container}>
          <View style={styles.header}>
            <Text style={styles.title}>{managing ? 'カスタム種目の管理' : '種目を選択'}</Text>
            <TouchableOpacity onPress={managing ? () => setManaging(false) : closeModal}>
              <Text style={styles.closeBtn}>{managing ? '完了' : '閉じる'}</Text>
            </TouchableOpacity>
          </View>

          {managing ? (
            <CatalogManager
              customBodyParts={customBodyParts}
              customExercises={customExercises}
              hiddenPresets={hiddenPresets}
              unclassified={unclassified}
              onAssignBodyPart={assign}
              assigning={assigning}
              onDeletePart={confirmDeletePart}
              onDeleteExercise={(name, bodyPart) => confirmDelete(name, bodyPart, true)}
              onRestorePreset={onRestorePreset}
            />
          ) : (
            <>
              <TextInput
                style={styles.search}
                placeholder="種目名で検索..."
                placeholderTextColor={Colors.textMuted}
                value={search}
                onChangeText={setSearch}
              />

              <View style={styles.tabBar}>
                {tabs.map(tab => (
                  <TouchableOpacity
                    key={tab}
                    style={[styles.tab, activeTab === tab && styles.tabActive]}
                    onPress={() => setActiveTab(tab)}>
                    <Text style={[styles.tabText, activeTab === tab && styles.tabTextActive]}>{tab}</Text>
                  </TouchableOpacity>
                ))}
              </View>

              <FlatList
                data={filtered}
                // Keyed by name *and* part: the same name can now appear under two parts,
                // and keying by name alone would give React two rows with one key.
                keyExtractor={item => exerciseKey(item.name, item.bodyPart)}
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
                        <TouchableOpacity onPress={() => setManaging(true)}>
                          <Text style={styles.partHint}>
                            自作の部位は長押しで削除できます・
                            <Text style={styles.partHintLink}>まとめて管理</Text>
                          </Text>
                        </TouchableOpacity>
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
                    <View style={styles.headerActions}>
                      {hasAnythingCustom && (
                        <TouchableOpacity
                          style={styles.manageRow}
                          onPress={() => setManaging(true)}
                          // The tap target stays finger-sized while the text itself is small:
                          // this is a rarely-used escape hatch, not something to draw the eye
                          // away from picking an exercise.
                          hitSlop={10}>
                          <Text style={styles.manageRowText}>カスタム種目の管理</Text>
                          <SymbolIcon
                            name="square.and.pencil"
                            ionicon="create-outline"
                            size={13}
                            tintColor={Colors.textMuted}
                          />
                        </TouchableOpacity>
                      )}
                      <TouchableOpacity style={styles.addRow} onPress={() => setCreating(true)}>
                        <Text style={styles.addRowText}>＋ カスタム種目を作る</Text>
                      </TouchableOpacity>
                    </View>
                  )
                }
                renderItem={({ item }) => {
                  const row = (
                    <Pressable
                      style={styles.item}
                      onPress={() => {
                        onSelect(item.name, item.bodyPart);
                        closeModal();
                        setSearch('');
                      }}
                      // Long-press removes any row. A preset is hidden rather than deleted,
                      // so nothing here is destructive beyond undoing.
                      onLongPress={() => confirmDelete(item.name, item.bodyPart, item.isCustom)}>
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
                  );

                  return (
                    <SwipeToDeleteRow
                      onDelete={() => confirmDelete(item.name, item.bodyPart, item.isCustom)}>
                      {row}
                    </SwipeToDeleteRow>
                  );
                }}
                ListEmptyComponent={<Text style={styles.empty}>種目が見つかりません</Text>}
              />
            </>
          )}
        </SafeAreaView>
      </GestureHandlerRootView>
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
  // Wraps rather than scrolling sideways. With nine body parts plus whatever the user
  // added, the last tabs sat off the edge with nothing to say they were there.
  tabBar: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    paddingHorizontal: Spacing.three,
    gap: Spacing.one,
  },
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

  headerActions: { gap: Spacing.two, marginBottom: Spacing.one },
  addRow: {
    backgroundColor: Colors.surfaceBlue,
    borderRadius: 10,
    padding: Spacing.three,
    alignItems: 'center',
  },
  addRowText: { color: Colors.cyan, fontSize: 15, fontWeight: 'bold' },
  manageRow: {
    alignSelf: 'flex-end',
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingVertical: Spacing.half,
  },
  manageRowText: { color: Colors.textMuted, fontSize: 12 },

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
  partHintLink: { color: Colors.cyan, fontWeight: 'bold' },
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
