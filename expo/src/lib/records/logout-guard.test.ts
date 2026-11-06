import { Alert } from 'react-native';

import { confirmLogoutIfUnsynced } from '@/lib/records/logout-guard';

jest.mock('@/lib/records/records-store', () => ({ useRecordsStore: { getState: () => ({ repo: null }) } }));

type Buttons = { text: string; onPress?: () => void }[];

describe('confirmLogoutIfUnsynced', () => {
  let alert: jest.SpyInstance;
  beforeEach(() => {
    alert = jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });
  afterEach(() => alert.mockRestore());

  it('allows logout without asking when nothing is unsynced or no DB is open', async () => {
    expect(await confirmLogoutIfUnsynced({ unsyncedCount: async () => 0 })).toBe(true);
    expect(await confirmLogoutIfUnsynced()).toBe(true);
    expect(alert).not.toHaveBeenCalled();
  });

  it('asks when something is unsynced and follows the answer', async () => {
    const repo = { unsyncedCount: async () => 3 };
    const cancelled = confirmLogoutIfUnsynced(repo);
    await new Promise((r) => setTimeout(r, 0));
    expect(alert.mock.calls[0][1]).toContain('3 件');
    (alert.mock.calls[0][2] as Buttons).find((b) => b.text === 'キャンセル')?.onPress?.();
    expect(await cancelled).toBe(false);

    const confirmed = confirmLogoutIfUnsynced(repo);
    await new Promise((r) => setTimeout(r, 0));
    (alert.mock.calls[1][2] as Buttons).find((b) => b.text === 'ログアウト')?.onPress?.();
    expect(await confirmed).toBe(true);
  });
});
