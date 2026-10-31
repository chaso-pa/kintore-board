jest.mock('@/lib/api', () => ({ api: { get: jest.fn() } }));

import { api } from '@/lib/api';
import {
  fetchWorkoutDetail,
  hasPendingWorkoutWrites,
  newWorkoutId,
  trackWorkoutWrite,
} from './workout-writes';

const get = api.get as jest.Mock;

function deferred() {
  let resolve!: () => void;
  let reject!: (e: unknown) => void;
  const promise = new Promise<void>((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

const flush = () => new Promise(r => setImmediate(r));

beforeEach(() => get.mockReset().mockResolvedValue({ data: { id: 'w1' } }));

describe('reading a workout while a save is in flight', () => {
  // Leaving the record screen does not wait for its last write. A read sent in that gap
  // was answered from before it, and the edit form then saved that stale copy back.
  it('waits for the write before fetching', async () => {
    const write = deferred();
    trackWorkoutWrite(write.promise);

    const read = fetchWorkoutDetail('w1');
    await flush();
    expect(get).not.toHaveBeenCalled();

    write.resolve();
    await read;
    expect(get).toHaveBeenCalledWith('/api/v1/workouts/w1');
    expect(hasPendingWorkoutWrites()).toBe(false);
  });

  it('still reads after a write that failed', async () => {
    const write = deferred();
    trackWorkoutWrite(write.promise).catch(() => {});

    const read = fetchWorkoutDetail('w1');
    write.reject(new Error('offline'));
    await read;
    expect(get).toHaveBeenCalledTimes(1);
  });

  it('reads straight away when nothing is pending', async () => {
    await fetchWorkoutDetail('w1');
    expect(get).toHaveBeenCalledTimes(1);
  });
});

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
