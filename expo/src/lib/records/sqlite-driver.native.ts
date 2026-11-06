/**
 * expo-sqlite implementation of SqlDriver (iOS/Android). See `sqlite-driver.ts` for the
 * web stub that shares these exports.
 */
import * as SQLite from 'expo-sqlite';

import type { SqlDriver, SqlExecutor, SqlParams } from '@/lib/records/sql-driver';

export const isRecordsSupported: boolean = true;

/** Open handles by file name, so deleteDatabase can close one before removing its file. */
const openHandles = new Map<string, SQLite.SQLiteDatabase>();

function executor(db: SQLite.SQLiteDatabase): SqlExecutor {
  return {
    exec: (sql) => db.execAsync(sql),
    run: async (sql, params: SqlParams = []) => {
      const r = await db.runAsync(sql, params);
      return { changes: r.changes };
    },
    getAll: <T>(sql: string, params: SqlParams = []) => db.getAllAsync<T>(sql, params),
    getFirst: <T>(sql: string, params: SqlParams = []) => db.getFirstAsync<T>(sql, params),
  };
}

export async function openDriver(name: string): Promise<SqlDriver> {
  const db = await SQLite.openDatabaseAsync(name);
  openHandles.set(name, db);
  let closed = false;
  return {
    ...executor(db),
    // withExclusiveTransactionAsync runs on its own connection; queries must use `txn`.
    // That connection does not inherit PRAGMA foreign_keys, so the repository deletes child
    // rows explicitly instead of relying on ON DELETE CASCADE.
    exclusiveTransaction: async <T>(fn: (tx: SqlExecutor) => Promise<T>) => {
      let result: T | undefined;
      await db.withExclusiveTransactionAsync(async (txn) => {
        result = await fn(executor(txn));
      });
      return result as T;
    },
    close: async () => {
      if (closed) return;
      closed = true;
      if (openHandles.get(name) === db) openHandles.delete(name);
      await db.closeAsync();
    },
  };
}

export async function deleteDatabase(name: string): Promise<void> {
  const db = openHandles.get(name);
  if (db) {
    openHandles.delete(name);
    await db.closeAsync();
  }
  await SQLite.deleteDatabaseAsync(name);
}
