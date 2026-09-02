import { type CustomExercise } from '@/lib/custom-exercises';
import { resolveMappings } from './exercise-backfill';

describe('resolveMappings', () => {
  it('answers for a preset from the shipped list', () => {
    expect(resolveMappings(['ベンチプレス'], [], [])).toEqual([
      { exercise_name: 'ベンチプレス', body_part: '胸' },
    ]);
  });

  // The whole reason this runs on the device: the server has never seen this name or this
  // part, and never can — both live in a file here.
  it('answers for an exercise the user invented, under a part they invented', () => {
    const custom: CustomExercise[] = [{ name: 'アブドミナル', bodyPart: '腹筋' }];
    expect(resolveMappings(['アブドミナル'], custom, ['腹筋'])).toEqual([
      { exercise_name: 'アブドミナル', body_part: '腹筋' },
    ]);
  });

  // その他 is what bodyPartOf answers when it recognises nothing, so it cannot be told apart
  // from a real answer of その他. Sending it would mark the row classified and stop it ever
  // being offered again — on this device or a better-informed one.
  it('leaves out a name it cannot place', () => {
    expect(resolveMappings(['見覚えのない種目'], [], [])).toEqual([]);
  });

  it('leaves out a name whose part has since been deleted', () => {
    // The exercise still names 腹筋, but the part is gone from the catalog.
    const custom: CustomExercise[] = [{ name: 'アブドミナル', bodyPart: '腹筋' }];
    expect(resolveMappings(['アブドミナル'], custom, [])).toEqual([]);
  });

  it('answers for the ones it knows and skips the rest', () => {
    const out = resolveMappings(['ベンチプレス', '見覚えのない種目', 'スクワット'], [], []);
    expect(out.map((m) => m.exercise_name)).toEqual(['ベンチプレス', 'スクワット']);
  });

  it('ignores blank names', () => {
    expect(resolveMappings(['', '   '], [], [])).toEqual([]);
  });

  it('is empty for nothing to do', () => {
    expect(resolveMappings([], [], [])).toEqual([]);
  });
});
