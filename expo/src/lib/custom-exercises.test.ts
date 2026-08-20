import {
  addCustomExercise,
  buildExerciseList,
  duplicateReason,
  normalizeExerciseName,
  parseCustomExercises,
  removeCustomExercise,
  type CustomExercise,
} from '@/lib/custom-exercises';
import { type BodyPart } from '@/constants/exercises';

const custom = (name: string, bodyPart: BodyPart = '胸'): CustomExercise => ({ name, bodyPart });

describe('normalizeExerciseName', () => {
  it.each([
    ['  ベンチプレス  ', 'ベンチプレス'],
    ['ﾍﾞﾝﾁﾌﾟﾚｽ', 'ベンチプレス'],
    ['Bench Press', 'bench press'],
    ['ＢＩＧ３', 'big3'],
  ])('folds %s', (input, want) => {
    expect(normalizeExerciseName(input)).toBe(want);
  });
});

describe('duplicateReason', () => {
  it('rejects a name that matches a preset', () => {
    expect(duplicateReason('ベンチプレス', [])).toBe('この種目はプリセットに既にあります');
  });

  // The whole point of normalising: these would otherwise become a second entry whose
  // training history is tracked separately from the preset's.
  it('rejects a preset match written differently', () => {
    expect(duplicateReason('  ﾍﾞﾝﾁﾌﾟﾚｽ ', [])).toBe('この種目はプリセットに既にあります');
  });

  it('rejects a name already registered as custom', () => {
    expect(duplicateReason('ペックデック', [custom('ペックデック')])).toBe(
      'この種目は既に登録されています'
    );
  });

  it('accepts a genuinely new name', () => {
    expect(duplicateReason('ペックデック', [custom('マシンフライ')])).toBeNull();
  });

  // Blankness is surfaced by disabling the button, not as a duplicate message.
  it('does not report blank input as a duplicate', () => {
    expect(duplicateReason('   ', [])).toBeNull();
  });
});

describe('parseCustomExercises', () => {
  it('reads a well-formed file', () => {
    expect(parseCustomExercises('[{"name":"ペックデック","bodyPart":"胸"}]')).toEqual([
      { name: 'ペックデック', bodyPart: '胸' },
    ]);
  });

  it.each([
    ['malformed JSON', 'not json at all'],
    ['a non-array value', '{"name":"x"}'],
  ])('falls back to empty on %s', (_label, raw) => {
    expect(parseCustomExercises(raw)).toEqual([]);
  });

  // A hand-edited or partially written file should lose only the bad rows.
  it('drops entries with a missing or unknown body part', () => {
    const raw = JSON.stringify([
      { name: '正常', bodyPart: '背中' },
      { name: '部位なし' },
      { name: '未知の部位', bodyPart: '首' },
      { name: '   ', bodyPart: '胸' },
    ]);
    expect(parseCustomExercises(raw)).toEqual([{ name: '正常', bodyPart: '背中' }]);
  });
});

describe('buildExerciseList', () => {
  it('marks which entries are custom', () => {
    const list = buildExerciseList([custom('ペックデック')]);
    expect(list.at(-1)).toEqual({ name: 'ペックデック', bodyPart: '胸', isCustom: true });
    expect(list[0].isCustom).toBe(false);
  });

  // The modal filters this list by body part without re-sorting, so this ordering is what
  // actually places custom exercises below the presets in each tab.
  it('puts every preset before every custom entry', () => {
    const list = buildExerciseList([custom('ペックデック')]);
    const firstCustom = list.findIndex((e) => e.isCustom);
    const lastPreset = list.map((e) => e.isCustom).lastIndexOf(false);
    expect(lastPreset).toBeLessThan(firstCustom);
  });

  it('keeps the custom body part instead of forcing その他', () => {
    const list = buildExerciseList([custom('リバースフライ', '背中')]);
    expect(list.at(-1)?.bodyPart).toBe('背中');
  });
});

describe('add / remove', () => {
  it('trims the name on add', () => {
    expect(addCustomExercise([], custom('  ペックデック  '))).toEqual([
      { name: 'ペックデック', bodyPart: '胸' },
    ]);
  });

  it('removes by normalised name', () => {
    const list = [custom('ペックデック'), custom('マシンフライ')];
    expect(removeCustomExercise(list, ' ペックデック ')).toEqual([custom('マシンフライ')]);
  });
});
