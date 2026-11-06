import { QueryClient } from '@tanstack/react-query';

import { blockInvalidationKeys, moderationInvalidationKeys, queryKeys } from './query-keys';

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
    ['the exercise list', queryKeys.records.exercises('u1')],
    ['local records', queryKeys.records.stats('u1')],
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

describe('blockInvalidationKeys', () => {
  // App Store guideline 1.2 requires blocked content to leave the feed instantly. The server
  // stops returning it the moment the block is written; the only thing that can still put it
  // on screen is a cache entry nobody invalidated. Each of these is a screen that would
  // otherwise keep showing the person who was just blocked.
  const affected: [string, readonly unknown[]][] = [
    ['the board feed', queryKeys.threads.list('new', '', false)],
    ['the hot tab', queryKeys.threads.list('hot', '', false)],
    ['a category feed', queryKeys.threads.list('new', 'BIG3', false)],
    ['the saved threads list', queryKeys.threads.bookmarks()],
    ['related threads', queryKeys.threads.related('t1')],
    ['a thread detail page', queryKeys.threads.detail('t1')],
    ['the replies in a thread', queryKeys.threads.posts('t1')],
    ['the block management list', queryKeys.blocks.list()],
  ];

  it.each(affected)('invalidates %s', (_label, key) => {
    const qc = clientSeededWith([key]);
    for (const k of blockInvalidationKeys()) {
      qc.invalidateQueries({ queryKey: k });
    }
    expect(qc.getQueryState(key)?.isInvalidated).toBe(true);
  });

  // The same singular/plural trap the moderation keys have, one family over: posts live
  // under ['posts', threadId] and thread detail under ['thread', id], so neither is reached
  // by invalidating ['threads']. Asserted so the list above cannot be trimmed to look tidier.
  it('does not reach thread detail or posts from the threads root', () => {
    const detail = queryKeys.threads.detail('t1');
    const posts = queryKeys.threads.posts('t1');
    const qc = clientSeededWith([detail, posts]);
    qc.invalidateQueries({ queryKey: queryKeys.threads.root });
    expect(qc.getQueryState(detail)?.isInvalidated).toBe(false);
    expect(qc.getQueryState(posts)?.isInvalidated).toBe(false);
  });
});

describe('records keys', () => {
  const r = queryKeys.records;
  const all = (owner: string) => [
    r.detail(owner, 'w1'),
    r.dates(owner, 2026, 8),
    r.stats(owner),
    r.exercises(owner),
    r.history(owner, 'bench', '胸'),
    r.maxE1RM(owner, 'w1', 'bench', '胸'),
    r.lastSets(owner, 'bench', '胸'),
    r.unclassified(owner),
    r.importState(owner),
  ];

  // The owner leads every key, so one account's cache can be dropped without touching another's.
  it('reaches every records key of an owner from its root, and no other owner\'s', () => {
    const mine = all('u1');
    const theirs = all('u2');
    const qc = clientSeededWith([...mine, ...theirs]);
    qc.invalidateQueries({ queryKey: r.root('u1') });
    for (const key of mine) expect(qc.getQueryState(key)?.isInvalidated).toBe(true);
    for (const key of theirs) expect(qc.getQueryState(key)?.isInvalidated).toBe(false);
  });

  it('reaches every month from datesRoot and every entry from historyRoot', () => {
    const months = [r.dates('u1', 2026, 8), r.dates('u1', 2025, 1)];
    const histories = [r.history('u1', 'bench', '胸'), r.history('u1', 'bench', '')];
    const qc = clientSeededWith([...months, ...histories, r.stats('u1')]);
    qc.invalidateQueries({ queryKey: r.datesRoot('u1') });
    qc.invalidateQueries({ queryKey: r.historyRoot('u1') });
    for (const key of [...months, ...histories]) expect(qc.getQueryState(key)?.isInvalidated).toBe(true);
    expect(qc.getQueryState(r.stats('u1'))?.isInvalidated).toBe(false);
  });

  // The same name under two parts is two entries; '' (unclassified) is one of them.
  it('separates entries by part', () => {
    expect(r.history('u1', 'bench', '胸')).not.toEqual(r.history('u1', 'bench', ''));
    expect(r.lastSets('u1', 'bench', '胸')).not.toEqual(r.lastSets('u1', 'bench', '背中'));
    expect(r.maxE1RM('u1', 'w1', 'bench', '胸')).not.toEqual(r.maxE1RM('u1', 'w1', 'bench', ''));
  });
});
