import * as SecureStore from 'expo-secure-store';

const DEVICE_UUID_KEY = 'device_uuid';

function generateUUID(): string {
  return 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
    const r = (Math.random() * 16) | 0;
    return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
  });
}

export async function getOrCreateDeviceUUID(): Promise<string> {
  const existing = await SecureStore.getItemAsync(DEVICE_UUID_KEY);
  if (existing) return existing;
  const uuid = generateUUID();
  await SecureStore.setItemAsync(DEVICE_UUID_KEY, uuid);
  return uuid;
}

/**
 * Forgets this device's identifier, so the next sign-in starts a brand-new account.
 *
 * Only used after account deletion. The server already frees the old identifier, so this is
 * not needed for correctness — it is so nothing left on the phone links the old account to
 * the new one.
 */
export async function clearDeviceUUID(): Promise<void> {
  await SecureStore.deleteItemAsync(DEVICE_UUID_KEY);
}
