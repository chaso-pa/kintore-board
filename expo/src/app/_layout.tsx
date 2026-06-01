import { QueryClientProvider } from '@tanstack/react-query';
import { SplashScreen, Stack } from 'expo-router';
import { useEffect } from 'react';

import { api } from '@/lib/api';
import { getOrCreateDeviceUUID } from '@/lib/device-uuid';
import { queryClient } from '@/lib/query-client';
import { useAuthStore } from '@/store/auth';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const loadFromStorage = useAuthStore((s) => s.loadFromStorage);
  const setAuth = useAuthStore((s) => s.setAuth);

  useEffect(() => {
    async function init() {
      await loadFromStorage();
      if (!useAuthStore.getState().token) {
        try {
          const deviceUUID = await getOrCreateDeviceUUID();
          const res = await api.post('/api/v1/auth/anonymous', { device_uuid: deviceUUID });
          await setAuth(res.data.token, res.data.user_id);
        } catch (e) {
          console.warn('Anonymous auth failed:', e);
        }
      }
      SplashScreen.hideAsync();
    }
    init();
  }, [loadFromStorage, setAuth]);

  return (
    <QueryClientProvider client={queryClient}>
      <Stack screenOptions={{ headerShown: false }}>
        <Stack.Screen name="(tabs)" />
        <Stack.Screen name="board/[threadId]" options={{ headerShown: true, title: '' }} />
        <Stack.Screen name="board/new" options={{ presentation: 'modal', headerShown: true, title: 'スレ作成' }} />
        <Stack.Screen name="gym/[gymId]" options={{ headerShown: true, title: '' }} />
        <Stack.Screen name="gym/new" options={{ presentation: 'modal', headerShown: true, title: 'ジム登録' }} />
        <Stack.Screen name="gym/[gymId]/machine/[machineId]" options={{ headerShown: true, title: '' }} />
      </Stack>
    </QueryClientProvider>
  );
}
