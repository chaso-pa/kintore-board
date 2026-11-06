/**
 * SqlDriver over sql.js, for jest. Not bundled into the app.
 */
import type { Database, SqlJsStatic } from 'sql.js';

import type { RecordsDriverFactory } from '@/lib/records/records-store';
import type { SqlDriver, SqlExecutor, SqlParams } from '@/lib/records/sql-driver';

let sqlJs: Promise<SqlJsStatic> | null = null;

function loadSqlJs(): Promise<SqlJsStatic> {
  if (!sqlJs) {
    // The node build, not the "browser" export jest-expo's conditions might pick.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const initSqlJs = require('sql.js/dist/sql-wasm.js') as typeof import('sql.js');
    const wasm = require.resolve('sql.js/dist/sql-wasm.wasm');
    // jest-expo installs a JS TextDecoder polyfill that ignores a view's byteOffset, which
    // garbles every string sql.js reads out of wasm memory (sqlite3_open fails with
    // CANTOPEN). sql.js captures its decoder at init, so give it node's for that moment.
    const g = globalThis as { TextDecoder: typeof TextDecoder };
    const polyfill = g.TextDecoder;
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    g.TextDecoder = require('node:util').TextDecoder;
    sqlJs = initSqlJs({ locateFile: () => wasm }).finally(() => {
      g.TextDecoder = polyfill;
    });
  }
  return sqlJs;
}

function all<T>(db: Database, sql: string, params: SqlParams = []): T[] {
  const stmt = db.prepare(sql);
  try {
    stmt.bind(params);
    const rows: T[] = [];
    while (stmt.step()) rows.push(stmt.getAsObject() as T);
    return rows;
  } finally {
    stmt.free();
  }
}

export interface SqlJsDriver extends SqlDriver {
  /** Serialized DB file contents. */
  export(): Uint8Array;
  readonly closed: boolean;
}

export async function createSqlJsDriver(data?: Uint8Array): Promise<SqlJsDriver> {
  const SQL = await loadSqlJs();
  const db = new SQL.Database(data);
  let closed = false;
  const exec: SqlExecutor = {
    exec: async (sql) => {
      db.exec(sql);
    },
    run: async (sql, params = []) => {
      db.run(sql, params);
      return { changes: db.getRowsModified() };
    },
    getAll: async <T>(sql: string, params?: SqlParams) => all<T>(db, sql, params),
    getFirst: async <T>(sql: string, params?: SqlParams) => all<T>(db, sql, params)[0] ?? null,
  };
  return {
    ...exec,
    exclusiveTransaction: async (fn) => {
      db.exec('BEGIN EXCLUSIVE');
      try {
        const result = await fn(exec);
        db.exec('COMMIT');
        return result;
      } catch (e) {
        db.exec('ROLLBACK');
        throw e;
      }
    },
    close: async () => {
      if (closed) return;
      closed = true;
      db.close();
    },
    export: () => db.export(),
    get closed() {
      return closed;
    },
  };
}

/**
 * A fake file system of sql.js DBs: closing a driver saves it under its name, opening
 * loads it back. Lets tests reopen and delete "files" the way the store does on device.
 */
export function createSqlJsFactory() {
  const files = new Map<string, Uint8Array>();
  const open = new Map<string, SqlJsDriver>();
  const opened: string[] = [];
  const factory: RecordsDriverFactory = {
    isSupported: true,
    open: async (name) => {
      const inner = await createSqlJsDriver(files.get(name));
      opened.push(name);
      const driver: SqlJsDriver = {
        ...inner,
        exclusiveTransaction: inner.exclusiveTransaction,
        export: inner.export,
        get closed() {
          return inner.closed;
        },
        close: async () => {
          if (!inner.closed) files.set(name, inner.export());
          open.delete(name);
          await inner.close();
        },
      };
      open.set(name, driver);
      return driver;
    },
    remove: async (name) => {
      await open.get(name)?.close();
      files.delete(name);
    },
  };
  return { factory, files, open, opened };
}
