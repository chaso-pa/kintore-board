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
