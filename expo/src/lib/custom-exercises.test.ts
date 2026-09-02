import {
  addCustomExercise,
  buildExerciseList,
  duplicateReason,
  exerciseKey,
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
  it('rejects a name that matches a preset in the same body part', () => {
    expect(duplicateReason('ベンチプレス', '胸', [])).toBe(
      'この部位に同じ名前のプリセットがあります'
    );
  });

  // The whole point of normalising: these would otherwise become a second entry whose
  // training history is tracked separately from the preset's.
  it('rejects a preset match written differently', () => {
    expect(duplicateReason('  ﾍﾞﾝﾁﾌﾟﾚｽ ', '胸', [])).toBe(
      'この部位に同じ名前のプリセットがあります'
    );
  });

  // A pullover trained as chest work and one trained as back work are different entries.
  // Blocking the second on the name alone is what made that impossible to record.
  it('allows a preset name under a different body part', () => {
    expect(duplicateReason('ベンチプレス', '背中', [])).toBeNull();
  });

  it('rejects a name already registered as custom in the same part', () => {
    expect(duplicateReason('ケトルベルスイング', '胸', [custom('ケトルベルスイング')])).toBe(
      'この部位に同じ名前の種目があります'
    );
  });

  it('allows the same custom name under a different part', () => {
    expect(duplicateReason('ケトルベルスイング', '背中', [custom('ケトルベルスイング')])).toBeNull();
  });

  // Having removed a preset, being told it already exists would be a dead end with no way
  // forward.
  it('allows a hidden preset name to be reused', () => {
    const hidden = [exerciseKey('ベンチプレス', '胸')];
    // Same part it was hidden under — a different one would be free anyway and the test
    // would pass whether hiding was honoured or not.
    expect(duplicateReason('ベンチプレス', '胸', [], hidden)).toBeNull();
    expect(duplicateReason('ベンチプレス', '胸', [])).not.toBeNull();
  });

  it('accepts a genuinely new name', () => {
    expect(duplicateReason('ケトルベルスイング', '胸', [custom('マシンフライ')])).toBeNull();
  });

  // Blankness is surfaced by disabling the button, not as a duplicate message.
  it('does not report blank input as a duplicate', () => {
    expect(duplicateReason('   ', '胸', [])).toBeNull();
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

  it('removes by normalised name and part', () => {
    const list = [custom('ケトルベルスイング'), custom('マシンフライ')];
    expect(removeCustomExercise(list, ' ケトルベルスイング ', '胸')).toEqual([custom('マシンフライ')]);
  });

  // Two entries can share a name now, so removing one must not take the other with it.
  it('leaves the same name under another part alone', () => {
    const list = [custom('プルオーバー', '胸'), custom('プルオーバー', '背中')];
    expect(removeCustomExercise(list, 'プルオーバー', '胸')).toEqual([
      custom('プルオーバー', '背中'),
    ]);
  });
});

// A preset added in a later release can collide with an exercise someone already created.
// Both rows carry the same name, and the picker keys its list by name, so the collision
// would surface as duplicate React keys on a row the user cannot delete.
describe('a custom exercise that a later release turned into a preset', () => {
  // A preset added later can land on a name someone already used under the same part —
  // チェストプレス did. Both rows would sit in one tab under one name, and the picker keys
  // its list by name and part, so they would collide there too.
  it('appears once, as the preset', () => {
    const list = buildExerciseList([custom('チェストプレス', '胸')]);
    const rows = list.filter((e) => e.name === 'チェストプレス');
    expect(rows).toHaveLength(1);
    expect(rows[0]).toEqual({ name: 'チェストプレス', bodyPart: '胸', isCustom: false });
  });

  it('does not take the user other exercises with it', () => {
    const list = buildExerciseList([custom('チェストプレス', '胸'), custom('マシンフライ', '胸')]);
    expect(list.filter((e) => e.isCustom).map((e) => e.name)).toEqual(['マシンフライ']);
  });

  it('matches through the same folding used everywhere else', () => {
    const list = buildExerciseList([custom(' ﾁｪｽﾄﾌﾟﾚｽ ', '胸')]);
    expect(list.filter((e) => e.isCustom)).toHaveLength(0);
  });

  // Filed under a different part it is a different entry, and survives.
  it('keeps a same-named entry the user filed elsewhere', () => {
    const list = buildExerciseList([custom('チェストプレス', '背中')]);
    const rows = list.filter((e) => e.name === 'チェストプレス');
    expect(rows.map((r) => [r.bodyPart, r.isCustom])).toEqual([
      ['胸', false],
      ['背中', true],
    ]);
  });
});

describe('the same name under two body parts', () => {
  it('lists both', () => {
    const list = buildExerciseList([custom('プルオーバー', '胸'), custom('プルオーバー', '背中')]);
    const rows = list.filter((e) => e.name === 'プルオーバー');
    expect(rows.map((r) => r.bodyPart)).toEqual(['胸', '背中']);
  });

  // The picker keys its rows by this. Two rows sharing a key is a React warning and a list
  // that behaves oddly when one of them is removed.
  it('gives them different keys', () => {
    expect(exerciseKey('プルオーバー', '胸')).not.toBe(exerciseKey('プルオーバー', '背中'));
  });

  it('still folds the same pair written differently onto one key', () => {
    expect(exerciseKey(' ﾌﾟﾙｵｰﾊﾞｰ ', '胸')).toBe(exerciseKey('プルオーバー', '胸'));
  });
});

describe('hidden presets', () => {
  it('drops a hidden preset from the list', () => {
    const hidden = [exerciseKey('ベンチプレス', '胸')];
    const names = buildExerciseList([], hidden).map((e) => e.name);
    expect(names).not.toContain('ベンチプレス');
    expect(names).toContain('スクワット');
  });

  // Hiding one entry must not take a same-named preset in another part with it.
  it('hides only the entry with that name and part', () => {
    const hidden = [exerciseKey('チェストプレス', '胸')];
    const list = buildExerciseList([custom('チェストプレス', '背中')], hidden);
    const rows = list.filter((e) => e.name === 'チェストプレス');
    expect(rows.map((r) => r.bodyPart)).toEqual(['背中']);
  });

  // With the preset gone, the user's own entry of the same name is no longer a duplicate of
  // anything, so it has to show.
  it('lets a custom entry take a hidden preset place', () => {
    const hidden = [exerciseKey('ディップス', '胸')];
    const list = buildExerciseList([custom('ディップス', '胸')], hidden);
    const rows = list.filter((e) => e.name === 'ディップス');
    expect(rows).toHaveLength(1);
    expect(rows[0].isCustom).toBe(true);
  });
});
