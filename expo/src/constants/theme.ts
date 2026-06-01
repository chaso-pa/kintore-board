import { Platform } from 'react-native';

export const Colors = {
  background: '#FFF8FC',
  surface: '#FFFFFF',
  surfaceBlue: '#EAF8FF',
  surfacePink: '#FFEAF5',

  textPrimary: '#243044',
  textSecondary: '#5E6A7D',
  textMuted: '#8A94A6',

  pink: '#FF69B4',
  hotPink: '#FF2F9A',
  cyan: '#49CFFF',
  lightCyan: '#AEEBFF',
  yellowPOP: '#FFE66D',

  success: '#39C980',
  warning: '#FFB84D',
  danger: '#FF5A7A',
} as const;

export type ThemeColor = keyof typeof Colors;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const BottomTabInset = Platform.select({ ios: 50, android: 80 }) ?? 0;
export const MaxContentWidth = 800;
