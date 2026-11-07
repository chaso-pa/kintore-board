jest.mock('expo-sqlite', () => ({
  openDatabaseAsync: jest.fn(),
  deleteDatabaseAsync: jest.fn(),
}));

describe('sqlite-driver resolution', () => {
  it('resolves to the native implementation under jest-expo', () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const driver = require('@/lib/records/sqlite-driver') as typeof import('@/lib/records/sqlite-driver');
    expect(driver.isRecordsSupported).toBe(true);
  });

  it('keeps the default file as the web stub', async () => {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const web = require('./sqlite-driver.ts') as typeof import('@/lib/records/sqlite-driver');
    expect(web.isRecordsSupported).toBe(false);
    await expect(web.openDriver('x.db')).rejects.toThrow();
    await expect(web.deleteDatabase('x.db')).resolves.toBeUndefined();
  });
});
