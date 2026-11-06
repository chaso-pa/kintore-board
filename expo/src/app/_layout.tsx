import { QueryClientProvider } from '@tanstack/react-query';
import { SplashScreen, Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useCallback, useEffect, useState } from 'react';

import { HeaderCloseButton } from '@/components/HeaderCloseButton';
import { OfflineBanner } from '@/components/OfflineBanner';
import { TermsGate } from '@/components/TermsGate';
import { api } from '@/lib/api';
import { initConnectivity, useConnectivityStore } from '@/lib/connectivity';
import { getOrCreateDeviceUUID } from '@/lib/device-uuid';
import { queryClient } from '@/lib/query-client';
import { backoffDelay } from '@/lib/records/backoff';
import { useRecordsStore } from '@/lib/records/records-store';
import { startRecordsSync } from '@/lib/records/sync-triggers';
import { TERMS_VERSION } from '@/lib/terms';
import { loadAcceptedTermsVersion, saveAcceptedTermsVersion } from '@/lib/terms-storage';
import { useAuthStore } from '@/store/auth';
import { loadWeightUnit } from '@/store/weight-unit';

SplashScreen.preventAutoHideAsync();

export default function RootLayout() {
  const loadFromStorage = useAuthStore((s) => s.loadFromStorage);
  const setAuth = useAuthStore((s) => s.setAuth);
  const setRole = useAuthStore((s) => s.setRole);
  const [ready, setReady] = useState(false);
  const [needsTerms, setNeedsTerms] = useState(false);

  const refreshRole = useCallback(async () => {
    try {
      const res = await api.get('/api/v1/users/me');
      if (res.data?.role === 'admin') setRole('admin');
    } catch {
      // Left at 'user'. See the call site for why this is not surfaced.
    }
  }, [setRole]);

  /**
   * Creates the anonymous account.
   *
   * Split out of init so it can be called from two places: straight through for someone who
   * has already agreed, and from the gate's accept button for someone who has not. It is the
   * registration step, and nothing may call it before the terms have been accepted.
   */
  const register = useCallback(async () => {
    if (useAuthStore.getState().token) return;
    try {
      const deviceUUID = await getOrCreateDeviceUUID();
      const res = await api.post('/api/v1/auth/anonymous', { device_uuid: deviceUUID });
      await setAuth(res.data.token, res.data.user_id, res.data.role ?? 'user');
    } catch (e) {
      console.warn('Anonymous auth failed:', e);
    }
  }, [setAuth]);

  useEffect(() => initConnectivity(), []);

  // Records follow the auth user id (plan §3.6). The last owner's DB opens even with no token,
  // so records work on an offline launch or after a 401; the auth user id then switches it.
  useEffect(() => {
    const stopSync = startRecordsSync();
    const unsubscribe = useAuthStore.subscribe((s, prev) => {
      if (s.userId !== prev.userId) {
        useRecordsStore.getState().handleAuthUserId(s.userId).catch((e) => console.warn('Records DB:', e));
      }
    });
    return () => {
      unsubscribe();
      stopSync();
    };
  }, []);

  // After a 401 the interceptor clears auth. Re-register (same device UUID → same account)
  // with 2s → 5min backoff, trying only while online, and only for someone who has agreed
  // to the terms — re-checked at each attempt, since account deletion clears both (R6).
  useEffect(() => {
    let timer: ReturnType<typeof setTimeout> | null = null;
    let attempt = 0;
    let unsubOnline: (() => void) | null = null;
    const cancel = () => {
      if (timer) clearTimeout(timer);
      timer = null;
      unsubOnline?.();
      unsubOnline = null;
    };
    const tryRegister = async () => {
      timer = null;
      if (useAuthStore.getState().token) return;
      if (!useConnectivityStore.getState().isOnline) {
        unsubOnline = useConnectivityStore.subscribe((c) => {
          if (!c.isOnline) return;
          unsubOnline?.();
          unsubOnline = null;
          void tryRegister();
        });
        return;
      }
      if ((await loadAcceptedTermsVersion()) !== TERMS_VERSION) return;
      await register();
      if (useAuthStore.getState().token) return;
      timer = setTimeout(() => void tryRegister(), backoffDelay(attempt++));
    };
    const unsubscribe = useAuthStore.subscribe((s, prev) => {
      if (s.token) {
        attempt = 0;
        cancel();
      } else if (prev.token && !timer && !unsubOnline) {
        timer = setTimeout(() => void tryRegister(), backoffDelay(attempt++));
      }
    });
    return () => {
      unsubscribe();
      cancel();
    };
  }, [register]);

  useEffect(() => {
    async function init() {
      await Promise.all([loadFromStorage(), loadWeightUnit()]);
      const records = useRecordsStore.getState();
      records.restoreOwnerOnBoot().catch((e) => console.warn('Records DB:', e));
      records.handleAuthUserId(useAuthStore.getState().userId).catch((e) => console.warn('Records DB:', e));

      // Before registration, not after. App Store guideline 1.2 asks for the terms to be
      // presented "before registering or logging in", and this app registers on its own
      // during the first launch — so the check has to sit in front of that call rather
      // than in front of the first screen.
      //
      // Version-compared rather than merely present, so a material change to the terms can
      // be re-presented to people who already agreed to an older wording.
      const accepted = await loadAcceptedTermsVersion();
      if (accepted !== TERMS_VERSION) {
        setNeedsTerms(true);
        setReady(true);
        SplashScreen.hideAsync();
        return;
      }

      await register();
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
  }, [loadFromStorage, register, refreshRole]);

  /**
   * Agreement is written before the account is created, not after.
   *
   * If the order were reversed and the app were killed in between, the next launch would
   * find an account that exists and an agreement that does not, and would show the gate to
   * somebody already registered. This way the worst case is an agreement recorded for an
   * account that failed to be created — and `register` is retried on the next launch anyway.
   */
  const acceptTerms = useCallback(async () => {
    await saveAcceptedTermsVersion(TERMS_VERSION);
    await register();
    setNeedsTerms(false);
    refreshRole();
  }, [register, refreshRole]);

  if (!ready) return null;

  // The app is drawn light-only, but Android draws edge-to-edge with a transparent status
  // bar whose icons follow the system default — white, which vanishes against the light
  // background. Pinned dark rather than 'auto' for the same reason: 'auto' tracks the
  // system theme, and the screens do not.
  const statusBar = <StatusBar style="dark" />;

  if (needsTerms) {
    return (
      <>
        {statusBar}
        <TermsGate onAccept={acceptTerms} />
      </>
    );
  }

  return (
    <QueryClientProvider client={queryClient}>
      {statusBar}
      <OfflineBanner />
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
        {/* Both carry an explicit headerBackTitle for the reason given above. */}
        <Stack.Screen
          name="profile/blocks"
          options={{ headerShown: true, title: 'ブロックしたユーザー', headerBackTitle: 'マイページ' }}
        />
        <Stack.Screen
          name="profile/terms"
          options={{ headerShown: true, title: '利用規約', headerBackTitle: 'マイページ' }}
        />
        <Stack.Screen
          name="profile/contact"
          options={{ headerShown: true, title: 'お問い合わせ', headerBackTitle: 'マイページ' }}
        />
        <Stack.Screen
          name="profile/delete-account"
          options={{ headerShown: true, title: 'アカウントを削除', headerBackTitle: 'マイページ' }}
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
