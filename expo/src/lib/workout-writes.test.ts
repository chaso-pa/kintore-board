import { newWorkoutId } from './workout-writes';

describe('newWorkoutId', () => {
  // The server only accepts a UUID-shaped id; anything else is rejected before it can
  // de-duplicate a retried create.
  it('is UUID-shaped and different every time', () => {
    const ids = Array.from({ length: 50 }, newWorkoutId);
    for (const id of ids) {
      expect(id).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/);
    }
    expect(new Set(ids).size).toBe(ids.length);
  });
});
