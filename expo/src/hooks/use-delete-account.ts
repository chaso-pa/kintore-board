import { useMutation, useQueryClient } from '@tanstack/react-query';
import { reloadAppAsync } from 'expo';

import { api } from '@/lib/api';
import { clearDeviceUUID } from '@/lib/device-uuid';
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
 */
export function useDeleteAccount() {
  const qc = useQueryClient();
  return useMutation({
    mutationFn: async () => {
      await api.delete('/api/v1/users/me');
    },
    onSuccess: async () => {
      await useAuthStore.getState().clearAuth();
      await clearDeviceUUID();
      await clearAcceptedTerms();
      qc.clear();
      await reloadAppAsync('account deleted');
    },
  });
}
