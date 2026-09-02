import { exerciseFilterParams } from './exercise-filter';

describe('exerciseFilterParams', () => {
  it('narrows to a named part', () => {
    expect(exerciseFilterParams('背中')).toEqual({ body_part: '背中' });
  });

  // An empty body_part means "every part" on the wire — the reading a client built before
  // this field would have meant. Sending the unclassified entry that way would silently
  // widen it to every part of that exercise.
  it('sends the unclassified entry as its own flag, not as an empty part', () => {
    expect(exerciseFilterParams('')).toEqual({ unclassified: true });
    expect(exerciseFilterParams('')).not.toHaveProperty('body_part');
  });

  it('passes a custom part through unchanged', () => {
    expect(exerciseFilterParams('二頭')).toEqual({ body_part: '二頭' });
  });
});
