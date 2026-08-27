import * as SecureStore from 'expo-secure-store';
import { create } from 'zustand';

const TOKEN_KEY = 'auth_token';
const USER_ID_KEY = 'auth_user_id';

export type Role = 'user' | 'admin';

interface AuthState {
  token: string | null;
  userId: string | null;
  /**
   * Whether this account may moderate.
   *
   * Held in memory only, unlike the token. Persisting it would let a demoted account keep
   * showing moderation controls until it next reached the network, and the controls would
   * then fail server-side with no explanation. Starting from 'user' every launch means the
   * UI is briefly less capable than it could be, which is the harmless direction.
   *
   * This is a rendering hint, not a permission: every moderation endpoint checks the role
   * itself, so a client that lies about it gains nothing.
   */
  role: Role;
  setAuth: (token: string, userId: string, role?: Role) => Promise<void>;
  setRole: (role: Role) => void;
  clearAuth: () => Promise<void>;
  loadFromStorage: () => Promise<void>;
}

export const useAuthStore = create<AuthState>((set) => ({
  token: null,
  userId: null,
  role: 'user',

  setAuth: async (token, userId, role = 'user') => {
    await SecureStore.setItemAsync(TOKEN_KEY, token);
    await SecureStore.setItemAsync(USER_ID_KEY, userId);
    set({ token, userId, role });
  },

  setRole: (role) => set({ role }),

  clearAuth: async () => {
    await SecureStore.deleteItemAsync(TOKEN_KEY);
    await SecureStore.deleteItemAsync(USER_ID_KEY);
    set({ token: null, userId: null, role: 'user' });
  },

  loadFromStorage: async () => {
    const token = await SecureStore.getItemAsync(TOKEN_KEY);
    const userId = await SecureStore.getItemAsync(USER_ID_KEY);
    // No role here by design: it is fetched fresh in the root layout.
    set({ token, userId });
  },
}));
