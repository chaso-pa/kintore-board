/**
 * The smallest SQL surface the records repository needs.
 *
 * The repository is written against this rather than expo-sqlite so the same code runs on
 * the device (expo-sqlite, `sqlite-driver.native.ts`) and in jest (sql.js,
 * `__testutils__/sqljs-driver.ts`).
 */

export type SqlValue = string | number | null;
export type SqlParams = SqlValue[];

export interface SqlRunResult {
  /** Rows changed by the statement (`sqlite3_changes()`). */
  changes: number;
}

export interface SqlExecutor {
  /** Runs one or more statements without parameters. */
  exec(sql: string): Promise<void>;
  run(sql: string, params?: SqlParams): Promise<SqlRunResult>;
  getAll<T>(sql: string, params?: SqlParams): Promise<T[]>;
  getFirst<T>(sql: string, params?: SqlParams): Promise<T | null>;
}

export interface SqlDriver extends SqlExecutor {
  /**
   * Runs `fn` in a transaction that no other query can interleave with. Every query inside
   * must go through `tx`, not the driver. Commits when `fn` resolves, rolls back when it
   * throws.
   */
  exclusiveTransaction<T>(fn: (tx: SqlExecutor) => Promise<T>): Promise<T>;
  close(): Promise<void>;
}
