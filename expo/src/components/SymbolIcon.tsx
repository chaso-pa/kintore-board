import { SymbolView, SymbolViewProps } from 'expo-symbols';
import Ionicons from '@expo/vector-icons/Ionicons';
import { Platform } from 'react-native';

interface Props {
  name: SymbolViewProps['name'];
  ionicon: React.ComponentProps<typeof Ionicons>['name'];
  size?: number;
  tintColor?: string;
}

export function SymbolIcon({ name, ionicon, size = 14, tintColor }: Props) {
  if (Platform.OS !== 'ios') {
    return <Ionicons name={ionicon} size={size} color={tintColor} />;
  }
  return <SymbolView name={name} size={size} tintColor={tintColor} />;
}
