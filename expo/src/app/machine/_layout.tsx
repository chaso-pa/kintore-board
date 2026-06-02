import { Stack } from 'expo-router';

export default function MachineLayout() {
  return (
    <Stack>
      <Stack.Screen name="[machineId]" options={{ title: 'マシン詳細' }} />
    </Stack>
  );
}
