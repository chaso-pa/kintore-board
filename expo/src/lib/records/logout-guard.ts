/**
 * Asks before a logout that would strand unsynced records (plan §3.6, U4).
 *
 * No logout UI exists yet; whoever adds one awaits this first. "Unsynced" is R13's count:
 * dirty workouts (tombstones included) plus pending classifications.
 */
import { Alert } from 'react-native';

import { useRecordsStore } from '@/lib/records/records-store';
import type { RecordsRepository } from '@/lib/records/repository';

/** Resolves true when it is fine to log out: nothing unsynced, or the user confirmed. */
export async function confirmLogoutIfUnsynced(
  repo: Pick<RecordsRepository, 'unsyncedCount'> | null = useRecordsStore.getState().repo
): Promise<boolean> {
  if (!repo) return true;
  const n = await repo.unsyncedCount();
  if (n === 0) return true;
  return new Promise((resolve) => {
    Alert.alert(
      '未送信の記録があります',
      `${n} 件の変更がまだサーバーに送信されていません。ログアウトすると、再ログインするまで送信されません。`,
      [
        { text: 'キャンセル', style: 'cancel', onPress: () => resolve(false) },
        { text: 'ログアウト', style: 'destructive', onPress: () => resolve(true) },
      ],
      { cancelable: true, onDismiss: () => resolve(false) }
    );
  });
}
