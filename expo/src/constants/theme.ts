import { Platform } from 'react-native';
import type { Edge } from 'react-native-safe-area-context';

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

/**
 * Border between a tab screen and the bottom tab bar, Android only.
 *
 * The Material tab bar has the same background as the screens and no divider of its own
 * (NativeTabs only exposes `shadowColor` for iOS), so scrolled content ran straight into it.
 * iOS draws its own separator, so nothing is added there.
 */
export const TabScreenBottomBorder =
  Platform.select({
    android: { borderBottomWidth: 1, borderBottomColor: Colors.lightCyan },
  }) ?? {};

/**
 * Safe-area edges for a tab screen's SafeAreaView, Android only.
 *
 * On Android the Material tab bar already sits above the gesture bar, so a SafeAreaView that
 * also pads its bottom inset left an empty strip between the scrolled content and the tab bar.
 * iOS keeps the default (all edges) and is unchanged.
 */
export const TabScreenEdges: readonly Edge[] | undefined =
  Platform.OS === 'android' ? ['top', 'left', 'right'] : undefined;
