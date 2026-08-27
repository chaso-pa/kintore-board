import { Image, ScrollView, StyleSheet, Text, TouchableOpacity, View } from 'react-native';

import { SymbolIcon } from '@/components/SymbolIcon';
import { Colors, Spacing } from '@/constants/theme';
import { pickPhotos, type PickedPhoto } from '@/lib/photo-upload';

interface Props {
  photos: PickedPhoto[];
  onChange: (photos: PickedPhoto[]) => void;
  /** Guards against a first submission that would take minutes on a phone connection. */
  max?: number;
  disabled?: boolean;
  /** Explains where the photos end up. Registration forms set this to mention review. */
  hint?: string;
}

const DEFAULT_MAX = 5;

/**
 * Chooses photos before the thing they belong to exists.
 *
 * Registration is the only moment someone has the gym in front of them, so it is the
 * moment they are most likely to have photos worth attaching; asking them to save first
 * and come back means most gyms never get one. Nothing is uploaded here — a photo needs
 * an id to attach to — so the picks are held and uploaded by the form once the row is
 * created.
 */
export function PhotoPickerField({ photos, onChange, max = DEFAULT_MAX, disabled, hint }: Props) {
  const remaining = max - photos.length;

  const add = async () => {
    const picked = await pickPhotos({ multiple: remaining > 1 });
    if (picked.length === 0) return;
    // Silently taking the first N is better than an error here: the picker allows more
    // than the limit, and the cap is ours rather than something the user did wrong.
    onChange([...photos, ...picked].slice(0, max));
  };

  const removeAt = (index: number) => onChange(photos.filter((_, i) => i !== index));

  return (
    <View style={styles.group}>
      <View style={styles.labelRow}>
        <Text style={styles.label}>写真</Text>
        <Text style={styles.count}>
          {photos.length} / {max}
        </Text>
      </View>

      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.strip}>
        {photos.map((p, i) => (
          <View key={`${p.uri}-${i}`} style={styles.cell}>
            <Image source={{ uri: p.uri }} style={styles.thumb} />
            <TouchableOpacity
              style={styles.removeBtn}
              onPress={() => removeAt(i)}
              disabled={disabled}
              accessibilityLabel={`${i + 1}枚目の写真を削除`}
              hitSlop={8}>
              <Text style={styles.removeText}>✕</Text>
            </TouchableOpacity>
          </View>
        ))}

        {remaining > 0 && (
          <TouchableOpacity style={styles.addBtn} onPress={add} disabled={disabled}>
            <SymbolIcon
              name="photo.badge.plus"
              ionicon="images-outline"
              size={22}
              tintColor={Colors.cyan}
            />
            <Text style={styles.addText}>追加</Text>
          </TouchableOpacity>
        )}
      </ScrollView>

      {hint && <Text style={styles.hint}>{hint}</Text>}
    </View>
  );
}

const styles = StyleSheet.create({
  group: { marginBottom: Spacing.four },
  labelRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  label: { fontSize: 13, fontWeight: '600', color: Colors.textSecondary, marginBottom: Spacing.one },
  count: { fontSize: 12, color: Colors.textMuted },
  strip: { gap: Spacing.two, paddingVertical: Spacing.one },
  cell: { position: 'relative' },
  thumb: { width: 88, height: 88, borderRadius: 8, backgroundColor: Colors.surface },
  removeBtn: {
    position: 'absolute',
    top: -6,
    right: -6,
    width: 22,
    height: 22,
    borderRadius: 11,
    backgroundColor: Colors.hotPink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  removeText: { color: '#fff', fontSize: 12, fontWeight: 'bold', lineHeight: 14 },
  addBtn: {
    width: 88,
    height: 88,
    borderRadius: 8,
    borderWidth: 1,
    borderStyle: 'dashed',
    borderColor: Colors.lightCyan,
    backgroundColor: Colors.surfaceBlue,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 2,
  },
  addText: { color: Colors.cyan, fontSize: 12, fontWeight: 'bold' },
  hint: { fontSize: 11, color: Colors.textMuted, marginTop: Spacing.one, lineHeight: 16 },
});
