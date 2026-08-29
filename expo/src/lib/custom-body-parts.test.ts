import { type CustomExercise } from '@/lib/custom-exercises';
import {
  addCustomBodyPart,
  countExercisesIn,
  duplicateBodyPartReason,
  orderedBodyParts,
  parseCustomBodyParts,
  reassignToFallback,
  removeCustomBodyPart,
} from './custom-body-parts';

const ex = (name: string, bodyPart: string): CustomExercise => ({ name, bodyPart });

describe('duplicateBodyPartReason', () => {
  it('rejects a name that is already a preset', () => {
    expect(duplicateBodyPartReason('胸', [])).toBe('この部位は最初からあります');
  });

  it('rejects one already added', () => {
    expect(duplicateBodyPartReason('腹筋', ['腹筋'])).toBe('この部位は既に登録されています');
  });

  // Same folding as exercise names: otherwise 「腹筋 」 and 「腹筋」 become two chips that
  // look identical and split the exercises filed under them.
  it('catches duplicates that differ only in spacing, width or case', () => {
    expect(duplicateBodyPartReason(' 腹筋 ', ['腹筋'])).not.toBeNull();
    expect(duplicateBodyPartReason('ﾌｫｱｱｰﾑ', ['フォアアーム'])).not.toBeNull();
    expect(duplicateBodyPartReason('forearm', ['Forearm'])).not.toBeNull();
  });

  it('allows a new name', () => {
    expect(duplicateBodyPartReason('前腕', ['腹筋'])).toBeNull();
  });

  // Blank is the button's business, not a duplicate error.
  it('says nothing about a blank name', () => {
    expect(duplicateBodyPartReason('', [])).toBeNull();
    expect(duplicateBodyPartReason('   ', [])).toBeNull();
  });
});

describe('parseCustomBodyParts', () => {
  it('reads a list of names', () => {
    expect(parseCustomBodyParts('["腹筋","前腕"]')).toEqual(['腹筋', '前腕']);
  });

  it('degrades to empty rather than throwing on a broken file', () => {
    expect(parseCustomBodyParts('not json')).toEqual([]);
    expect(parseCustomBodyParts('{"a":1}')).toEqual([]);
    expect(parseCustomBodyParts('')).toEqual([]);
  });

  it('drops entries that are not usable names', () => {
    expect(parseCustomBodyParts('["腹筋", 42, null, "", "   "]')).toEqual(['腹筋']);
  });

  // Two chips reading 胸 would be indistinguishable, and exercises would split between
  // them depending on which was tapped.
  it('drops names that collide with a preset', () => {
    expect(parseCustomBodyParts('["胸","腹筋"]')).toEqual(['腹筋']);
  });

  it('keeps only the first of a repeated name', () => {
    expect(parseCustomBodyParts('["腹筋"," 腹筋 ","前腕"]')).toEqual(['腹筋', '前腕']);
  });

  it('trims stored names', () => {
    expect(parseCustomBodyParts('["  腹筋  "]')).toEqual(['腹筋']);
  });
});

describe('orderedBodyParts', () => {
  // The picker tabs and the trend-screen chips both read this, so the order has to be one
  // thing: presets first, custom after.
  it('appends custom parts after the presets', () => {
    const all = orderedBodyParts(['腹筋']);
    expect(all[0]).toBe('BIG3');
    expect(all[all.length - 1]).toBe('腹筋');
    expect(all).toContain('その他');
  });

  it('is just the presets when nothing is custom', () => {
    expect(orderedBodyParts([])).toEqual([
      'BIG3', '胸', '背中', '脚', '肩', '腕', '腹部', '有酸素', 'その他',
    ]);
  });
});

describe('add and remove', () => {
  it('trims on add', () => {
    expect(addCustomBodyPart([], '  腹筋 ')).toEqual(['腹筋']);
  });

  it('removes by the same normalisation used to add', () => {
    expect(removeCustomBodyPart(['腹筋', '前腕'], ' 腹筋 ')).toEqual(['前腕']);
  });

  it('leaves the list alone when the name is not there', () => {
    expect(removeCustomBodyPart(['腹筋'], '肩甲骨')).toEqual(['腹筋']);
  });
});

describe('reassignToFallback', () => {
  // Deleting a part must not take the exercises with it — the name is what all of the
  // recorded history is keyed on.
  it('moves exercises off the deleted part into その他', () => {
    const list = [ex('アブサークル', '腹筋'), ex('マシンフライ', '胸')];
    expect(reassignToFallback(list, '腹筋')).toEqual([
      ex('アブサークル', 'その他'),
      ex('マシンフライ', '胸'),
    ]);
  });

  it('matches the part through normalisation', () => {
    expect(reassignToFallback([ex('アブサークル', '腹筋')], ' 腹筋 ')[0].bodyPart).toBe('その他');
  });

  it('changes nothing when no exercise used the part', () => {
    const list = [ex('マシンフライ', '胸')];
    expect(reassignToFallback(list, '腹筋')).toEqual(list);
  });
});

describe('countExercisesIn', () => {
  // Shown in the delete prompt, so it has to match what the delete will actually move.
  it('counts what a delete would move', () => {
    const list = [ex('アブサークル', '腹筋'), ex('サイドベンド', '腹筋'), ex('マシンフライ', '胸')];
    expect(countExercisesIn(list, '腹筋')).toBe(2);
    expect(countExercisesIn(list, '胸')).toBe(1);
    expect(countExercisesIn(list, '前腕')).toBe(0);
  });
});
