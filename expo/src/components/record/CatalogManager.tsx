import { ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { SymbolIcon } from '@/components/SymbolIcon';
import { SwipeToDeleteRow } from '@/components/record/SwipeToDeleteRow';
import { Colors, Spacing } from '@/constants/theme';
import { countExercisesIn } from '@/lib/custom-body-parts';
import { type CustomExercise } from '@/lib/custom-exercises';

interface Props {
  customBodyParts: string[];
  customExercises: CustomExercise[];
  onDeletePart: (name: string) => void;
  onDeleteExercise: (name: string) => void;
}

/**
 * The one place where everything the user created is visible at once, and deletable.
 *
 * Long-press was the only way to remove a body part, which is invisible until someone
 * happens to try it. Here the red minus is the affordance — the same control iOS uses in a
 * list's edit mode — and swiping a row does the same thing for anyone who reaches for that
 * first.
 *
 * Presets are absent by design: they are not the user's to remove, so listing them would
 * only raise the question of why they cannot be deleted.
 */
export function CatalogManager({
  customBodyParts,
  customExercises,
  onDeletePart,
  onDeleteExercise,
}: Props) {
  const empty = customBodyParts.length === 0 && customExercises.length === 0;

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
              row(`ex:${e.name}`, e.name, e.bodyPart, () => onDeleteExercise(e.name))
            )}
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
  emptyBox: { padding: Spacing.three },
  empty: { textAlign: 'center', color: Colors.textMuted, marginTop: Spacing.five },
  hint: { fontSize: 11, color: Colors.textMuted, marginTop: Spacing.three, lineHeight: 16 },
});
