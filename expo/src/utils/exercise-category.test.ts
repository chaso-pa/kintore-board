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
});
