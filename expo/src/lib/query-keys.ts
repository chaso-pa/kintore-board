/**
 * Every TanStack Query key in the app.
 *
 * These used to be written inline at each call site — 58 of them across 20 files — which
 * made two failure modes easy and invisible. The first is a read key and its matching
 * `setQueryData` drifting apart, so an optimistic update writes to a cache entry nothing
 * reads. The second arrived with moderation: the gym and machine listings gained a status
 * filter, and a key that omits it makes the filter chips inert, because TanStack sees the
 * same key and serves the cached page. Neither shows up in `tsc` or `expo lint`.
 *
 * The rule this file exists to enforce: anything that changes what the server returns
 * belongs in the key. A test asserts that, and `npm run lint:query-keys` fails the build if
 * an inline key reappears.
 *
 * Roots are exported separately so a mutation can invalidate a whole family — TanStack
 * matches keys by prefix, so `invalidateQueries({ queryKey: queryKeys.gyms.root })` covers
 * every search term, location and status variant at once.
 */

export type ModerationStatusFilter = '' | 'active' | 'pending' | 'rejected';

/** The three states a report can be in. Distinct from the row-approval vocabulary above. */
export type ReportQueueStatus = 'pending' | 'reviewed' | 'dismissed';

/** A coordinate pair, or null when location is unknown. Part of the key because the server sorts by distance. */
export type KeyLocation = { latitude: number; longitude: number } | null;

const root = <T extends string>(name: T) => [name] as const;

export const queryKeys = {
  gyms: {
    root: root('gyms'),
    /**
     * The gym listing.
     *
     * Location is in the key because supplying it switches the endpoint into proximity
     * mode, which returns a different set in a different order. Status is in the key
     * because it is what the moderation filter chip changes.
     */
    list: (search: string, location: KeyLocation, status: ModerationStatusFilter = '') =>
      ['gyms', search, location, status] as const,
    detail: (gymId: string) => ['gym', gymId] as const,
    photos: (gymId: string, status: ModerationStatusFilter = '') =>
      ['gym-photos', gymId, status] as const,
    favorites: () => ['gym-favorites'] as const,
  },

  machines: {
    root: root('machines'),
    /**
     * Machines belonging to one gym.
     *
     * Kept distinct from `search` below rather than sharing a shape: both used to start
     * `['machines', <string>]`, so a global search whose term happened to equal a gym id
     * would have collided with a gym's own list.
     */
    forGym: (gymId: string, status: ModerationStatusFilter = '') =>
      ['machines', 'gym', gymId, status] as const,
    /** The global machine catalogue, used by the search and link screens. */
    search: (q: string, bodyPart: string, status: ModerationStatusFilter = '') =>
      ['machines', 'search', q, bodyPart, status] as const,
    detail: (machineId: string) => ['machine', machineId] as const,
    photos: (machineId: string, status: ModerationStatusFilter = '') =>
      ['machine-photos', machineId, status] as const,
    threads: (machineId: string) => ['machine-threads', machineId] as const,
  },

  moderation: {
    root: root('moderation'),
    /** Pending counts behind the 審査中 chip. Admin-only; a non-admin gets 403. */
    counts: () => ['moderation', 'counts'] as const,
    /**
     * The report queue.
     *
     * Status is in the key because it is what the queue's own tabs change: without it,
     * switching to 対応済み would be served the pending page from cache and read as though
     * nothing had ever been handled.
     */
    reports: (status: ReportQueueStatus) => ['moderation', 'reports', status] as const,
  },

  threads: {
    root: root('threads'),
    list: (sort: string, category: string, bookmarksOnly: boolean) =>
      ['threads', sort, category, bookmarksOnly] as const,
    forGym: (gymId: string, machineId?: string) => ['threads', 'gym', gymId, machineId] as const,
    related: (threadId: string) => ['threads', threadId, 'related'] as const,
    bookmarks: () => ['threads', 'bookmarks'] as const,
    detail: (threadId: string) => ['thread', threadId] as const,
    posts: (threadId: string) => ['posts', threadId] as const,
  },

  workouts: {
    root: root('workouts'),
    detail: (workoutId: string) => ['workout', workoutId] as const,
    dates: (year: number, month: number) => ['workout-dates', year, month] as const,
    datesRoot: root('workout-dates'),
    stats: () => ['workout-stats'] as const,
  },

  exercises: {
    root: root('exercises'),
    /**
     * The exercise history endpoint returns the full history with every metric already
     * computed, so the client switches metric and period locally. Keeping those out of the
     * key is what makes those switches instant — adding either one here would silently
     * reintroduce a refetch per toggle.
     */
    // The part is part of the key: the same name under two parts is two histories, and
    // without it the second would be served the first one's cache.
    history: (exerciseName: string, bodyPart: string) =>
      ['exercise-history', exerciseName, bodyPart] as const,
    historyRoot: root('exercise-history'),
    list: () => ['exercises'] as const,
    /** Names the server has no body part for. See use-exercise-backfill. */
    unclassified: () => [...queryKeys.exercises.root, 'unclassified'] as const,
    maxE1RM: (workoutId: string, exerciseName: string, bodyPart: string) =>
      ['exercise-max-e1rm', workoutId, exerciseName, bodyPart] as const,
  },
} as const;

/**
 * Everything a moderation decision can affect.
 *
 * Approving a gym changes the listing, the map, that gym's page, the favourites list and
 * the pending counts. Enumerating it once here is what keeps the four approve/reject call
 * sites from each remembering a different subset.
 *
 * Note that detail keys are their own families: a detail entry is `['gym', id]`, not
 * `['gyms', …]`, so invalidating the plural root does not touch it. That singular/plural
 * split predates this work and is easy to half-remember, which is exactly why the list is
 * written out once here instead of at each call site.
 */
export function moderationInvalidationKeys(): readonly (readonly unknown[])[] {
  return [
    queryKeys.gyms.root, // ['gyms']    — listings and the map
    ['gym'], // detail pages
    ['gym-photos'],
    queryKeys.machines.root, // ['machines'] — gym-scoped and global
    ['machine'],
    ['machine-photos'],
    queryKeys.gyms.favorites(),
    queryKeys.moderation.counts(),
  ];
}
