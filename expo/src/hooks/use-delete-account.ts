import { useMutation, useQueryClient } from '@tanstack/react-query';
import { reloadAppAsync } from 'expo';

import { api } from '@/lib/api';
import { clearDeviceUUID } from '@/lib/device-uuid';
import { useRecordsStore } from '@/lib/records/records-store';
import { clearAcceptedTerms } from '@/lib/terms-storage';
import { useAuthStore } from '@/store/auth';

/**
 * Deletes this account, then puts the app back to a first launch.
 *
 * Local state is cleared only after the server has said yes. Clearing first and failing the
 * request would leave someone believing they had deleted an account that still exists.
 *
 * The app is reloaded rather than navigated: the terms gate and anonymous sign-in live in the
 * root layout's start-up path, and running that path again is the one way to be sure nothing
 * from the old account — a cached query, the in-memory token, the role — survives into the
 * next one.
 *
 * Records sync is paused (waiting out a running cycle) before the request, so no upsert can
 * recreate a workout after the server has deleted the account. The local records DB goes
 * only on success; on failure sync resumes and nothing local is lost (plan §3.6).
 */
export function useDeleteAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      // Captured before the request: a 401 on it would clear the auth user id.
      const userId = useAuthStore.getState().userId ?? useRecordsStore.getState().ownerUserId;
      await useRecordsStore.getState().pauseSync();
      await api.delete('/api/v1/users/me');
      return userId;
    },
    onSuccess: async (userId) => {
      // The account is already gone on the server: a failure removing the local file must
      // not stop auth and the device UUID from being cleared below.
      if (userId) {
        await useRecordsStore
          .getState()
          .destroyForUser(userId)
          .catch((e) => console.warn('Records DB:', e));
      }
      await useAuthStore.getState().clearAuth();
      await clearDeviceUUID();
      await clearAcceptedTerms();
      qc.clear();
      await reloadAppAsync('account deleted');
    },
    onError: () => {
      useRecordsStore.getState().resumeSync();
    },
  });
}
