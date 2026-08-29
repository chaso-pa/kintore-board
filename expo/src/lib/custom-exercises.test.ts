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
    expect(duplicateReason('ケトルベルスイング', [custom('ケトルベルスイング')])).toBe(
      'この種目は既に登録されています'
    );
  });

  it('accepts a genuinely new name', () => {
    expect(duplicateReason('ケトルベルスイング', [custom('マシンフライ')])).toBeNull();
  });

  // Blankness is surfaced by disabling the button, not as a duplicate message.
  it('does not report blank input as a duplicate', () => {
    expect(duplicateReason('   ', [])).toBeNull();
  });
});

describe('parseCustomExercises', () => {
  it('reads a well-formed file', () => {
    expect(parseCustomExercises('[{"name":"ケトルベルスイング","bodyPart":"胸"}]')).toEqual([
      { name: 'ケトルベルスイング', bodyPart: '胸' },
    ]);
  });

  it.each([
    ['malformed JSON', 'not json at all'],
    ['a non-array value', '{"name":"x"}'],
  ])('falls back to empty on %s', (_label, raw) => {
    expect(parseCustomExercises(raw)).toEqual([]);
  });

  // A hand-edited or partially written file should lose only the bad rows.
  it('drops entries with a missing or blank body part', () => {
    const raw = JSON.stringify([
      { name: '正常', bodyPart: '背中' },
      { name: '部位なし' },
      { name: '空の部位', bodyPart: '  ' },
      { name: '   ', bodyPart: '胸' },
    ]);
    expect(parseCustomExercises(raw)).toEqual([{ name: '正常', bodyPart: '背中' }]);
  });

  // Was previously rejected, when the presets were the only valid parts. A custom part is
  // stored in its own file, so an exercise can legitimately be read back before — or after
  // — the part it names; whether the part still exists is bodyPartOf's decision, not this
  // one, and dropping the row here would delete the exercise instead of recategorising it.
  it('keeps an entry naming a part that is not a preset', () => {
    const raw = JSON.stringify([{ name: 'ケトルベルスイング', bodyPart: '腹筋' }]);
    expect(parseCustomExercises(raw)).toEqual([{ name: 'ケトルベルスイング', bodyPart: '腹筋' }]);
  });
});

describe('buildExerciseList', () => {
  it('marks which entries are custom', () => {
    const list = buildExerciseList([custom('ケトルベルスイング')]);
    expect(list.at(-1)).toEqual({ name: 'ケトルベルスイング', bodyPart: '胸', isCustom: true });
    expect(list[0].isCustom).toBe(false);
  });

  // The modal filters this list by body part without re-sorting, so this ordering is what
  // actually places custom exercises below the presets in each tab.
  it('puts every preset before every custom entry', () => {
    const list = buildExerciseList([custom('ケトルベルスイング')]);
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
    expect(addCustomExercise([], custom('  ケトルベルスイング  '))).toEqual([
      { name: 'ケトルベルスイング', bodyPart: '胸' },
    ]);
  });

  it('removes by normalised name', () => {
    const list = [custom('ケトルベルスイング'), custom('マシンフライ')];
    expect(removeCustomExercise(list, ' ケトルベルスイング ')).toEqual([custom('マシンフライ')]);
  });
});

// A preset added in a later release can collide with an exercise someone already created.
// Both rows carry the same name, and the picker keys its list by name, so the collision
// would surface as duplicate React keys on a row the user cannot delete.
describe('a custom exercise that a later release turned into a preset', () => {
  it('appears once, as the preset', () => {
    const list = buildExerciseList([custom('チェストプレス', '背中')]);
    const rows = list.filter((e) => e.name === 'チェストプレス');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({ name: 'チェストプレス', bodyPart: '胸', isCustom: false });
  });

  it('does not take the user other exercises with it', () => {
    const list = buildExerciseList([custom('チェストプレス', '背中'), custom('マシンフライ', '胸')]);
    expect(list.filter((e) => e.isCustom).map((e) => e.name)).toEqual(['マシンフライ']);
  });

  it('matches through the same folding used everywhere else', () => {
    const list = buildExerciseList([custom(' ﾁｪｽﾄﾌﾟﾚｽ ', '背中')]);
    expect(list.filter((e) => e.isCustom)).toHaveLength(0);
  });
});
