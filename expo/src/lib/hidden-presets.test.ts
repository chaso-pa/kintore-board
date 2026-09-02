import { exerciseKey } from '@/lib/custom-exercises';
import {
  hiddenPresetEntries,
  hidePreset,
  parseHiddenPresets,
  presetKeys,
  restorePreset,
} from './hidden-presets';

const BENCH = exerciseKey('ベンチプレス', 'BIG3');
const SQUAT = exerciseKey('スクワット', 'BIG3');

describe('hidePreset', () => {
  it('records the entry', () => {
    expect(hidePreset([], 'ベンチプレス', 'BIG3')).toEqual([BENCH]);
  });

  it('does not record the same entry twice', () => {
    expect(hidePreset([BENCH], 'ベンチプレス', 'BIG3')).toEqual([BENCH]);
  });

  it('matches through the same folding used everywhere else', () => {
    expect(hidePreset([], ' ﾍﾞﾝﾁﾌﾟﾚｽ ', 'BIG3')).toEqual([BENCH]);
  });

  // Hiding one entry must not take a same-named preset in another part with it.
  it('keys on the part as well as the name', () => {
    expect(hidePreset([], 'ベンチプレス', '胸')).not.toEqual([BENCH]);
  });
});

describe('restorePreset', () => {
  it('puts one back and leaves the rest', () => {
    expect(restorePreset([BENCH, SQUAT], BENCH)).toEqual([SQUAT]);
  });

  it('does nothing for a key that is not hidden', () => {
    expect(restorePreset([BENCH], SQUAT)).toEqual([BENCH]);
  });
});

describe('parseHiddenPresets', () => {
  it('reads a list of keys', () => {
    expect(parseHiddenPresets(JSON.stringify([BENCH]))).toEqual([BENCH]);
  });

  it('degrades to empty rather than throwing on a broken file', () => {
    expect(parseHiddenPresets('not json')).toEqual([]);
    expect(parseHiddenPresets('{"a":1}')).toEqual([]);
    expect(parseHiddenPresets('')).toEqual([]);
  });

  // A key for a preset that no longer ships would sit in the file forever hiding nothing,
  // and would show up in the restore list as an entry that cannot be restored.
  it('drops keys that no longer name a real preset', () => {
    const raw = JSON.stringify([BENCH, exerciseKey('存在しない種目', '胸')]);
    expect(parseHiddenPresets(raw)).toEqual([BENCH]);
  });

  it('drops values that are not strings, and repeats', () => {
    expect(parseHiddenPresets(JSON.stringify([BENCH, 42, null, BENCH]))).toEqual([BENCH]);
  });
});

describe('hiddenPresetEntries', () => {
  // What the restore list is built from: keys have to turn back into something with a name
  // and a part to show.
  it('turns keys back into entries', () => {
    expect(hiddenPresetEntries([BENCH])).toEqual([{ name: 'ベンチプレス', bodyPart: 'BIG3' }]);
  });

  it('ignores keys that name nothing', () => {
    expect(hiddenPresetEntries([exerciseKey('存在しない種目', '胸')])).toEqual([]);
  });

  it('is empty when nothing is hidden', () => {
    expect(hiddenPresetEntries([])).toEqual([]);
  });
});

describe('presetKeys', () => {
  it('has one key per shipped preset, all distinct', () => {
    const keys = presetKeys();
    expect(keys.length).toBeGreaterThan(40);
    expect(new Set(keys).size).toBe(keys.length);
  });
});
