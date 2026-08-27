import { QueryClient } from '@tanstack/react-query';

import { moderationInvalidationKeys, queryKeys } from './query-keys';

/**
 * TanStack matches keys by prefix, and the app's key families do not divide the way their
 * names suggest: a listing is `['gyms', …]` while a detail page is `['gym', id]`, so
 * invalidating the plural root leaves every detail page stale. That singular/plural split
 * predates this work and is exactly the kind of thing that gets half-remembered.
 *
 * These tests use a real QueryClient rather than comparing arrays, because what matters is
 * TanStack's own matching, not our reading of it.
 */

// Each client holds a cache with garbage-collection timers, and jest will not exit while
// they are alive. They are tracked and cleared rather than left to expire.
const clients: QueryClient[] = [];

afterEach(() => {
  while (clients.length) clients.pop()!.clear();
});

/** Seeds one entry per key and returns the client, so invalidation can be observed. */
function clientSeededWith(keys: readonly (readonly unknown[])[]) {
  const qc = new QueryClient();
  clients.push(qc);
  keys.forEach((k, i) => qc.setQueryData(k, { seeded: i }));
  return qc;
}

function invalidateAll(qc: QueryClient) {
  for (const key of moderationInvalidationKeys()) {
    qc.invalidateQueries({ queryKey: key });
  }
}

describe('moderationInvalidationKeys', () => {
  // Every read key a decision can change. Approving a gym moves it into the listing and
  // the map, changes its own page, may change a favourites list, and changes the counts.
  const affected: [string, readonly unknown[]][] = [
    ['gym listing', queryKeys.gyms.list('', null, '')],
    ['gym listing, filtered to pending', queryKeys.gyms.list('', null, 'pending')],
    ['gym listing with a search term and a location',
      queryKeys.gyms.list('ゴールド', { latitude: 35.6, longitude: 139.7 }, '')],
    ['gym detail', queryKeys.gyms.detail('g1')],
    ['gym photos', queryKeys.gyms.photos('g1', '')],
    ['gym favourites', queryKeys.gyms.favorites()],
    ['machines within a gym', queryKeys.machines.forGym('g1', '')],
    ['the global machine catalogue', queryKeys.machines.search('', '', '')],
    ['machine detail', queryKeys.machines.detail('m1')],
    ['machine photos', queryKeys.machines.photos('m1', '')],
    ['moderation counts', queryKeys.moderation.counts()],
  ];

  it.each(affected)('invalidates %s', (_label, key) => {
    const qc = clientSeededWith([key]);
    invalidateAll(qc);
    expect(qc.getQueryState(key)?.isInvalidated).toBe(true);
  });

  // Thread and workout caches are untouched by a decision: a thread's own visibility does
  // not depend on the moderation status of the gym it points at. Invalidating them anyway
  // would turn every approval into an app-wide refetch.
  const untouched: [string, readonly unknown[]][] = [
    ['the board listing', queryKeys.threads.list('hot', '', false)],
    ['a thread detail', queryKeys.threads.detail('t1')],
    ['workout stats', queryKeys.workouts.stats()],
    ['the exercise list', queryKeys.exercises.list()],
    // A machine's threads do not change when the machine is approved or rejected: if it
    // is rejected the machine page 404s and the list is unreachable anyway.
    ['a machine\'s threads', queryKeys.machines.threads('m1')],
  ];

  it.each(untouched)('leaves %s alone', (_label, key) => {
    const qc = clientSeededWith([key]);
    invalidateAll(qc);
    expect(qc.getQueryState(key)?.isInvalidated).toBe(false);
  });
});

describe('key shapes', () => {
  // The status filter must be part of the key. Without it TanStack answers the second
  // request from the first one's cache, so the filter chips change nothing — and neither
  // tsc nor the linter has anything to say about it.
  it('separates gym listings by status filter', () => {
    expect(queryKeys.gyms.list('', null, '')).not.toEqual(queryKeys.gyms.list('', null, 'pending'));
  });

  it('separates machine listings by status filter', () => {
    expect(queryKeys.machines.forGym('g1', '')).not.toEqual(
      queryKeys.machines.forGym('g1', 'pending')
    );
    expect(queryKeys.machines.search('', '', '')).not.toEqual(
      queryKeys.machines.search('', '', 'pending')
    );
  });

  it('separates gym listings by location, which changes the endpoint mode', () => {
    // Supplying a coordinate switches the server to proximity mode: a different set, in a
    // different order, from a different SQL statement.
    expect(queryKeys.gyms.list('', null, '')).not.toEqual(
      queryKeys.gyms.list('', { latitude: 35.6, longitude: 139.7 }, '')
    );
  });

  // Both used to begin ['machines', <string>], so a global search whose term happened to
  // equal a gym id would have collided with that gym's own machine list.
  it('keeps a gym-scoped machine list distinct from a global search', () => {
    const gymScoped = queryKeys.machines.forGym('abc', '');
    const globalSearch = queryKeys.machines.search('abc', '', '');
    expect(gymScoped).not.toEqual(globalSearch);

    const qc = clientSeededWith([gymScoped, globalSearch]);
    qc.invalidateQueries({ queryKey: gymScoped });
    expect(qc.getQueryState(gymScoped)?.isInvalidated).toBe(true);
    expect(qc.getQueryState(globalSearch)?.isInvalidated).toBe(false);
  });

  it('reaches every machine family from the machines root', () => {
    const forGym = queryKeys.machines.forGym('g1', '');
    const search = queryKeys.machines.search('q', '', '');
    const qc = clientSeededWith([forGym, search]);
    qc.invalidateQueries({ queryKey: queryKeys.machines.root });
    expect(qc.getQueryState(forGym)?.isInvalidated).toBe(true);
    expect(qc.getQueryState(search)?.isInvalidated).toBe(true);
  });

  // The plural root does not reach the singular detail family. This is asserted rather
  // than merely commented, because it is the reason moderationInvalidationKeys has to
  // list both.
  it('does not reach gym detail from the gyms root', () => {
    const detail = queryKeys.gyms.detail('g1');
    const qc = clientSeededWith([detail]);
    qc.invalidateQueries({ queryKey: queryKeys.gyms.root });
    expect(qc.getQueryState(detail)?.isInvalidated).toBe(false);
  });
});
