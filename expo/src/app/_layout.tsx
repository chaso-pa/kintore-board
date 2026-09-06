import { QueryClientProvider } from '@tanstack/react-query';
import { SplashScreen, Stack } from 'expo-router';
import { useCallback, useEffect, useState } from 'react';

import { HeaderCloseButton } from '@/components/HeaderCloseButton';
import { api } from '@/lib/api';
import { getOrCreateDeviceUUID } from '@/lib/device-uuid';
import { queryClient } from '@/lib/query-client';
import { useAuthStore } from '@/store/auth';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const loadFromStorage = useAuthStore((s) => s.loadFromStorage);
  const setAuth = useAuthStore((s) => s.setAuth);
  const setRole = useAuthStore((s) => s.setRole);
  const [ready, setReady] = useState(false);

  const refreshRole = useCallback(async () => {
    try {
      const res = await api.get('/api/v1/users/me');
      if (res.data?.role === 'admin') setRole('admin');
    } catch {
      // Left at 'user'. See the call site for why this is not surfaced.
    }
  }, [setRole]);

  useEffect(() => {
    async function init() {
      await loadFromStorage();
      if (!useAuthStore.getState().token) {
        try {
          const deviceUUID = await getOrCreateDeviceUUID();
          const res = await api.post('/api/v1/auth/anonymous', { device_uuid: deviceUUID });
          await setAuth(res.data.token, res.data.user_id, res.data.role ?? 'user');
        } catch (e) {
          console.warn('Anonymous auth failed:', e);
        }
      }
      setReady(true);
      SplashScreen.hideAsync();

      // Deliberately after setReady and deliberately not awaited.
      //
      // A returning user is rendered from the stored token without touching the network.
      // Awaiting this would put the api client's 15s timeout in front of the first frame,
      // so an offline launch would stare at a blank screen — for a role that only matters
      // to the handful of accounts that can moderate.
      //
      // Failure is silent and leaves the role at 'user'. That also covers a client running
      // against a server old enough not to have the endpoint, which is what makes it safe
      // to ship the two sides in either order.
      refreshRole();
    }
    init();
  }, [loadFromStorage, setAuth, refreshRole]);

  if (!ready) return null;

  return (
    <QueryClientProvider client={queryClient}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        {/* headerBackTitle is spelled out because iOS falls back to the previous screen's
            title, and the tab navigator's is the route name — the button read "(tabs)". */}
        <Stack.Screen
          name="board/[threadId]"
          options={{ headerShown: true, title: '', headerBackTitle: '一覧' }}
        />
        <Stack.Screen
          name="board/new"
          options={{
            presentation: 'modal',
            headerShown: true,
            title: 'スレ作成',
            headerRight: () => <HeaderCloseButton />,
          }}
        />
        <Stack.Screen name="gym/[gymId]" options={{ headerShown: true, title: '', headerBackTitle: '戻る' }} />
        <Stack.Screen
          name="gym/new"
          options={{
            presentation: 'modal',
            headerShown: true,
            title: 'ジム登録',
            headerRight: () => <HeaderCloseButton />,
          }}
        />
        <Stack.Screen name="gym/[gymId]/threads" options={{ headerShown: true, title: '', headerBackTitle: '戻る' }} />
        <Stack.Screen name="gym/[gymId]/machines" options={{ headerShown: true, title: '', headerBackTitle: '戻る' }} />
        <Stack.Screen name="gym/[gymId]/machines/link" options={{ headerShown: true, title: '', headerBackTitle: '戻る' }} />
      </Stack>
    </QueryClientProvider>
  );
}
