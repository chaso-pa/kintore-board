import { useState } from 'react';
import { TextInput, type TextInputProps } from 'react-native';

import { Colors } from '@/constants/theme';

/**
 * The weight / reps field of a set row.
 *
 * The placeholder is dropped while the field is focused. The field is centred, and on Android
 * an empty centred field draws its caret in the middle of the placeholder, so the "0" read as
 * if the caret had landed inside a value that was already there.
 */
export function SetNumberInput({ onFocus, onBlur, ...props }: TextInputProps) {
  const [focused, setFocused] = useState(false);
  return (
    <TextInput
      {...props}
      placeholder={focused ? '' : '0'}
      placeholderTextColor={Colors.textMuted}
      onFocus={e => {
        setFocused(true);
        onFocus?.(e);
      }}
      onBlur={e => {
        setFocused(false);
        onBlur?.(e);
      }}
    />
  );
}
