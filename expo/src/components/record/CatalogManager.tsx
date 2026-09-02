import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { SymbolIcon } from '@/components/SymbolIcon';
import { SwipeToDeleteRow } from '@/components/record/SwipeToDeleteRow';
import { Colors, Spacing } from '@/constants/theme';
import { countExercisesIn, orderedBodyParts } from '@/lib/custom-body-parts';
import { exerciseKey, type CustomExercise } from '@/lib/custom-exercises';
import { hiddenPresetEntries } from '@/lib/hidden-presets';

interface Props {
  customBodyParts: string[];
  customExercises: CustomExercise[];
  hiddenPresets: string[];
  /** Recorded names the server has no body part for. See use-unclassified-exercises. */
  unclassified: string[];
  onDeletePart: (name: string) => void;
  onDeleteExercise: (name: string, bodyPart: string) => void;
  onRestorePreset: (key: string) => void;
  onAssignBodyPart: (name: string, bodyPart: string) => void;
  assigning: boolean;
}

/**
 * The one place where everything the user created is visible at once, and deletable.
 *
 * Long-press was the only way to remove a body part, which is invisible until someone
 * happens to try it. Here the red minus is the affordance — the same control iOS uses in a
 * list's edit mode — and swiping a row does the same thing for anyone who reaches for that
 * first.
 *
 * Presets appear only once removed, under their own heading with a way back. The shipped
 * list is not the user's to lose, so removing one has to be undoable — and an undo nobody
 * can find is not one.
 */
export function CatalogManager({
  customBodyParts,
  customExercises,
  hiddenPresets,
  unclassified,
  onDeletePart,
  onDeleteExercise,
  onRestorePreset,
  onAssignBodyPart,
  assigning,
}: Props) {
  const hidden = hiddenPresetEntries(hiddenPresets);
  const empty =
    customBodyParts.length === 0 &&
    customExercises.length === 0 &&
    hidden.length === 0 &&
    unclassified.length === 0;

  if (empty) {
    return (
      <View style={styles.emptyBox}>
        <Text style={styles.empty}>自作の部位・種目はまだありません</Text>
      </View>
    );
  }

  const row = (key: string, label: string, sub: string | undefined, onDelete: () => void) => (
    <SwipeToDeleteRow key={key} onDelete={onDelete}>
      <View style={styles.row}>
        <TouchableOpacity onPress={onDelete} hitSlop={8} style={styles.minus}>
          <SymbolIcon name="minus.circle.fill" ionicon="remove-circle" size={22} tintColor={Colors.danger} />
        </TouchableOpacity>
        <Text style={styles.rowLabel}>{label}</Text>
        {sub !== undefined && <Text style={styles.rowSub}>{sub}</Text>}
      </View>
    </SwipeToDeleteRow>
  );

  return (
    <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
      {customBodyParts.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>部位</Text>
          <View style={styles.section}>
            {customBodyParts.map((part) => {
              const count = countExercisesIn(customExercises, part);
              return row(
                `part:${part}`,
                part,
                // The number the delete prompt is about to quote, shown before the tap
                // rather than only inside the dialog.
                count > 0 ? `種目 ${count}件` : undefined,
                () => onDeletePart(part)
              );
            })}
          </View>
        </>
      )}

      {customExercises.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>種目</Text>
          <View style={styles.section}>
            {customExercises.map((e) =>
              row(exerciseKey(e.name, e.bodyPart), e.name, e.bodyPart, () =>
                onDeleteExercise(e.name, e.bodyPart)
              )
            )}
          </View>
        </>
      )}

      {/* The way back. Removing a preset is not destructive, but it only reads that way if
          the removed ones are somewhere the user can find and undo. */}
      {hidden.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>一覧から消したプリセット</Text>
          <View style={styles.section}>
            {hidden.map((e) => {
              const key = exerciseKey(e.name, e.bodyPart);
              return (
                <View key={key} style={styles.row}>
                  <TouchableOpacity
                    onPress={() => onRestorePreset(key)}
                    hitSlop={8}
                    style={styles.minus}>
                    <SymbolIcon
                      name="plus.circle.fill"
                      ionicon="add-circle"
                      size={22}
                      tintColor={Colors.cyan}
                    />
                  </TouchableOpacity>
                  <Text style={styles.rowLabel}>{e.name}</Text>
                  <Text style={styles.rowSub}>{e.bodyPart}</Text>
                </View>
              );
            })}
          </View>
        </>
      )}

      {/* Asks the user for something rather than offering a tidy-up, so it gets its own
          heading and an explanation of where the question came from. */}
      {unclassified.length > 0 && (
        <>
          <Text style={styles.sectionTitle}>部位が未設定の記録</Text>
          <Text style={styles.sectionNote}>
            以前に記録した種目のうち、部位が分からなかったものです。選ぶと過去の記録にも反映されます。
          </Text>
          <View style={styles.section}>
            {unclassified.map((name) => (
              <View key={`unclassified:${name}`} style={styles.assignRow}>
                <Text style={styles.rowLabel} numberOfLines={1}>
                  {name}
                </Text>
                <View style={styles.assignChips}>
                  {orderedBodyParts(customBodyParts).map((part) => (
                    <TouchableOpacity
                      key={part}
                      style={styles.assignChip}
                      disabled={assigning}
                      onPress={() => onAssignBodyPart(name, part)}>
                      <Text style={styles.assignChipText}>{part}</Text>
                    </TouchableOpacity>
                  ))}
                </View>
              </View>
            ))}
          </View>
        </>
      )}

      <Text style={styles.hint}>
        記録済みのトレーニングは消えません。削除した部位の種目は「その他」に移ります。
      </Text>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  scroll: { padding: Spacing.three, gap: Spacing.one, paddingBottom: Spacing.five },
  sectionTitle: {
    fontSize: 13,
    fontWeight: 'bold',
    color: Colors.textSecondary,
    marginTop: Spacing.two,
  },
  section: { gap: Spacing.one },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: Spacing.three,
    borderWidth: 1,
    borderColor: '#F0E8F0',
  },
  minus: { justifyContent: 'center' },
  rowLabel: { flex: 1, fontSize: 15, color: Colors.textPrimary, fontWeight: '500' },
  rowSub: { fontSize: 12, color: Colors.textMuted },
  sectionNote: { fontSize: 11, color: Colors.textMuted, lineHeight: 16 },
  assignRow: {
    backgroundColor: Colors.surface,
    borderRadius: 10,
    padding: Spacing.three,
    borderWidth: 1,
    borderColor: Colors.lightCyan,
    gap: Spacing.two,
  },
  assignChips: { flexDirection: 'row', flexWrap: 'wrap', gap: Spacing.one },
  assignChip: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: 14,
    borderWidth: 1,
    borderColor: Colors.lightCyan,
    backgroundColor: Colors.background,
  },
  assignChipText: { fontSize: 13, color: Colors.textSecondary },
  emptyBox: { padding: Spacing.three },
  empty: { textAlign: 'center', color: Colors.textMuted, marginTop: Spacing.five },
  hint: { fontSize: 11, color: Colors.textMuted, marginTop: Spacing.three, lineHeight: 16 },
});
