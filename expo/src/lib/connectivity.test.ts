import { onlineManager } from '@tanstack/react-query';

import { initConnectivity, isOfflineState, useConnectivityStore } from './connectivity';

type Listener = (state: { isConnected: boolean | null | undefined; isInternetReachable?: boolean | null }) => void;

const listeners: Listener[] = [];
const mockAddEventListener = jest.fn((l: Listener) => {
  listeners.push(l);
  return () => {
    listeners.splice(listeners.indexOf(l), 1);
  };
});

jest.mock('@react-native-community/netinfo', () => ({
  __esModule: true,
  default: { addEventListener: (l: Listener) => mockAddEventListener(l) },
}));

function emit(state: Parameters<Listener>[0]) {
  [...listeners].forEach((l) => l(state));
}

describe('isOfflineState', () => {
  it('is offline only when isConnected is false', () => {
    expect(isOfflineState({ isConnected: false })).toBe(true);
    expect(isOfflineState({ isConnected: null })).toBe(false);
    expect(isOfflineState({ isConnected: undefined as unknown as null })).toBe(false);
    expect(isOfflineState({ isConnected: true })).toBe(false);
  });
});

describe('initConnectivity', () => {
  afterEach(() => {
    // Tear down so each test starts unsubscribed.
    initConnectivity()();
  });

  it('is idempotent', () => {
    mockAddEventListener.mockClear();
    const a = initConnectivity();
    const callsAfterFirst = mockAddEventListener.mock.calls.length;
    const b = initConnectivity();
    expect(a).toBe(b);
    expect(mockAddEventListener).toHaveBeenCalledTimes(callsAfterFirst);
  });

  it('updates the store and onlineManager with the same definition', () => {
    initConnectivity();
    onlineManager.setOnline(true); // subscribes the listener via setEventListener
    const cases: [Parameters<Listener>[0], boolean][] = [
      [{ isConnected: false }, false],
      [{ isConnected: null }, true],
      [{ isConnected: undefined }, true],
      [{ isConnected: true, isInternetReachable: false }, true],
    ];
    for (const [state, online] of cases) {
      emit(state);
      expect(useConnectivityStore.getState().isOnline).toBe(online);
      expect(onlineManager.isOnline()).toBe(online);
    }
  });
});
