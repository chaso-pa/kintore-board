import { Stack, useRouter } from 'expo-router';
import { Platform, StyleSheet, TouchableOpacity } from 'react-native';

import { SymbolIcon } from '@/components/SymbolIcon';
import { Colors } from '@/constants/theme';

function BackButton() {
  const router = useRouter();
  return (
    <TouchableOpacity onPress={() => router.back()} style={styles.backBtn}>
      <SymbolIcon name="chevron.left" ionicon="chevron-back-outline" size={22} tintColor={Colors.cyan} />
    </TouchableOpacity>
  );
}

const styles = StyleSheet.create({
  backBtn: { paddingLeft: Platform.OS === 'android' ? 4 : 0 },
});

export default function MachineLayout() {
  return (
    <Stack>
      <Stack.Screen
        name="[machineId]"
        options={{
          title: '',
          headerLeft: () => <BackButton />,
          headerStyle: { backgroundColor: Colors.background },
          headerShadowVisible: false,
        }}
      />
      <Stack.Screen name="new" options={{ presentation: 'modal', headerShown: false }} />
    </Stack>
  );
}
