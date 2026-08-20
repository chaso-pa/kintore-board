import { type CustomExercise } from '@/lib/custom-exercises';
import { availableBodyParts, bodyPartOf } from '@/utils/exercise-category';

describe('bodyPartOf', () => {
  it('resolves preset exercises', () => {
    expect(bodyPartOf('ベンチプレス')).toBe('BIG3');
    expect(bodyPartOf('ラットプルダウン')).toBe('背中');
  });

  // Free-typed exercise names must still land somewhere, otherwise they would vanish
  // from every category filter.
  it('falls back to その他 for unknown names', () => {
    expect(bodyPartOf('オリジナル種目')).toBe('その他');
    expect(bodyPartOf('')).toBe('その他');
  });

  // The regression this guards: a custom exercise filed under 背中 in the picker showed up
  // as その他 on the exercise-trend screen, because only presets were consulted.
  it('uses the body part a custom exercise was created with', () => {
    const custom: CustomExercise[] = [{ name: 'ワンハンドローイング', bodyPart: '背中' }];
    expect(bodyPartOf('ワンハンドローイング', custom)).toBe('背中');
  });

  it('matches custom names through the same normalisation used to create them', () => {
    const custom: CustomExercise[] = [{ name: 'ワンハンドローイング', bodyPart: '背中' }];
    expect(bodyPartOf('  ワンハンドローイング  ', custom)).toBe('背中');
  });

  // Presets win nothing special here, but a custom entry must not shadow a preset name —
  // creating one is blocked, so this only matters for files edited by hand.
  it('still resolves presets when a custom list is supplied', () => {
    const custom: CustomExercise[] = [{ name: 'ペックデック', bodyPart: '胸' }];
    expect(bodyPartOf('デッドリフト', custom)).toBe('BIG3');
  });
});

describe('availableBodyParts', () => {
  it('returns only parts that have exercises, in canonical order', () => {
    expect(availableBodyParts(['ラットプルダウン', 'ベンチプレス'])).toEqual(['BIG3', '背中']);
  });

  it('includes その他 when a custom exercise is present', () => {
    expect(availableBodyParts(['ベンチプレス', '謎の種目'])).toEqual(['BIG3', 'その他']);
  });

  it('returns nothing for an empty list', () => {
    expect(availableBodyParts([])).toEqual([]);
  });

  it('offers a chip for a body part that only custom exercises occupy', () => {
    const custom: CustomExercise[] = [{ name: 'ワンハンドローイング', bodyPart: '背中' }];
    expect(availableBodyParts(['ワンハンドローイング'], custom)).toEqual(['背中']);
  });
});
