/**
 * Default (web) driver: records are not stored locally on web (plan U3).
 *
 * The native implementation lives in `sqlite-driver.native.ts`; Metro and jest-expo pick it
 * on iOS/Android. This file must not import expo-sqlite, so the web bundle never pulls in
 * its wasm. Both files export the same names with the same types.
 */
import type { SqlDriver } from '@/lib/records/sql-driver';

export const isRecordsSupported: boolean = false;

export async function openDriver(_name: string): Promise<SqlDriver> {
  throw new Error('Local records are not supported on this platform');
}

export async function deleteDatabase(_name: string): Promise<void> {}
