import type { SqlDriver } from '@/lib/records/sql-driver';

/**
 * Schema migrations, indexed by `PRAGMA user_version`: MIGRATIONS[n] takes a database from
 * version n to n + 1. Append only; never edit a shipped entry.
 */
export const MIGRATIONS: readonly string[] = [
  // v1 (plan §3.1)
  `
CREATE TABLE meta (key TEXT PRIMARY KEY, value TEXT NOT NULL);

CREATE TABLE workouts (
  id               TEXT PRIMARY KEY,
  trained_on       TEXT NOT NULL,
  memo             TEXT,
  created_at       TEXT NOT NULL,
  updated_at       TEXT NOT NULL,
  deleted_at       TEXT,
  local_version    INTEGER NOT NULL DEFAULT 1,
  synced_version   INTEGER NOT NULL DEFAULT 0,
  sync_attempts    INTEGER NOT NULL DEFAULT 0,
  next_attempt_at  TEXT,
  last_error       TEXT,
  origin           TEXT NOT NULL DEFAULT 'local'
);
CREATE INDEX idx_workouts_trained_on ON workouts(trained_on, id) WHERE deleted_at IS NULL;
CREATE INDEX idx_workouts_dirty ON workouts(next_attempt_at) WHERE local_version > synced_version;

CREATE TABLE workout_sets (
  id TEXT PRIMARY KEY,
  workout_id TEXT NOT NULL REFERENCES workouts(id) ON DELETE CASCADE,
  sort_order INTEGER NOT NULL,
  exercise_name TEXT NOT NULL,
  weight REAL, reps INTEGER, sets INTEGER, memo TEXT,
  spotted INTEGER NOT NULL DEFAULT 0,
  body_part TEXT
);
CREATE INDEX idx_sets_exercise ON workout_sets(exercise_name, body_part);
CREATE INDEX idx_sets_workout ON workout_sets(workout_id, sort_order);

CREATE TABLE pending_classifications (
  exercise_name TEXT PRIMARY KEY,
  body_part     TEXT NOT NULL,
  created_at    TEXT NOT NULL,
  attempts      INTEGER NOT NULL DEFAULT 0,
  next_attempt_at TEXT
);
`,
];

export async function getUserVersion(driver: SqlDriver): Promise<number> {
  const row = await driver.getFirst<{ user_version: number }>('PRAGMA user_version');
  return row?.user_version ?? 0;
}

/**
 * Applies every pending migration in order, each in its own exclusive transaction together
 * with its user_version bump, so a crash leaves the database at a whole version.
 */
export async function runMigrations(
  driver: SqlDriver,
  migrations: readonly string[] = MIGRATIONS
): Promise<number> {
  // journal_mode cannot change inside a transaction; foreign_keys is per connection.
  await driver.exec('PRAGMA journal_mode = WAL; PRAGMA foreign_keys = ON;');
  let version = await getUserVersion(driver);
  if (version > migrations.length) {
    throw new Error(`Records DB version ${version} is newer than this app (${migrations.length})`);
  }
  while (version < migrations.length) {
    const next = version + 1;
    await driver.exclusiveTransaction(async (tx) => {
      await tx.exec(migrations[version]);
      await tx.exec(`PRAGMA user_version = ${next}`);
    });
    version = next;
  }
  return version;
}
