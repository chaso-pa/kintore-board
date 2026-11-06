import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import { onlineManager } from '@tanstack/react-query';
import { create } from 'zustand';

/**
 * Offline means the OS says there is no connection at all (`isConnected === false`).
 * null / undefined (not yet known) count as online, and `isInternetReachable` is not used —
 * it flaps on captive portals and slow probes. The banner, the write gates and TanStack's
 * onlineManager all share this one definition.
 */
export function isOfflineState(state: Pick<NetInfoState, 'isConnected'>): boolean {
  return state.isConnected === false;
}

interface ConnectivityState {
  isOnline: boolean;
}

export const useConnectivityStore = create<ConnectivityState>(() => ({ isOnline: true }));

export function useIsOnline(): boolean {
  return useConnectivityStore((s) => s.isOnline);
}

let unsubscribeNetInfo: (() => void) | null = null;

/** Subscribes once; later calls return the same teardown. */
export function initConnectivity(): () => void {
  if (unsubscribeNetInfo) return unsubscribeNetInfo;

  onlineManager.setEventListener((setOnline) =>
    NetInfo.addEventListener((state) => setOnline(!isOfflineState(state))),
  );

  const unsubscribe = NetInfo.addEventListener((state) => {
    useConnectivityStore.setState({ isOnline: !isOfflineState(state) });
  });
  const teardown = () => {
    unsubscribe();
    if (unsubscribeNetInfo === teardown) unsubscribeNetInfo = null;
  };
  unsubscribeNetInfo = teardown;
  return teardown;
}
