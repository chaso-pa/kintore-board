import { useEffect, useState, type ReactNode } from 'react';
import {
  Keyboard,
  KeyboardAvoidingView,
  Platform,
  View,
  type StyleProp,
  type ViewStyle,
} from 'react-native';
import Reanimated, { useAnimatedKeyboard, useAnimatedStyle } from 'react-native-reanimated';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

/**
 * Keeps a form above the software keyboard on both platforms.
 *
 * Android needs this because the app draws edge-to-edge (`edgeToEdgeEnabled=true`): an
 * edge-to-edge window is not resized for the keyboard, so `adjustResize` does nothing and every
 * field in the lower half of a screen ended up behind the keyboard. The Android branch shrinks
 * the view by the keyboard's height, which is what `adjustResize` used to do — a ScrollView
 * inside then scrolls the focused field into view on its own.
 *
 * iOS keeps whatever each screen already relied on, chosen with `ios`:
 *   - 'padding': KeyboardAvoidingView, for screens that used one
 *   - 'none': a plain View, for screens whose ScrollView already sets
 *     `automaticallyAdjustKeyboardInsets` (iOS-only, which is why Android needed this at all)
 *
 * `insetBelow` says whether the content under this view already pads itself off the bottom
 * safe area (a SafeAreaView with the bottom edge, typically). An open keyboard covers that strip,
 * so lifting by the full keyboard height on top of it would leave a gap the size of the inset.
 *
 * `inModal` is for content inside an RN `<Modal>`. On Android a Modal is its own window, and
 * Reanimated's keyboard tracking only follows the activity's window, so it never sees a
 * keyboard opened from a Modal. RN's keyboard events are used there instead; they do not
 * animate with the keyboard, but they do arrive.
 */
export function KeyboardLift({
  children,
  style,
  ios = 'padding',
  insetBelow = true,
  inModal = false,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  ios?: 'padding' | 'none';
  insetBelow?: boolean;
  inModal?: boolean;
}) {
  if (Platform.OS === 'android' && inModal) {
    return (
      <AndroidModalKeyboardLift style={style} insetBelow={insetBelow}>
        {children}
      </AndroidModalKeyboardLift>
    );
  }
  if (Platform.OS === 'android') {
    return (
      <AndroidKeyboardLift style={style} insetBelow={insetBelow}>
        {children}
      </AndroidKeyboardLift>
    );
  }
  if (ios === 'padding') {
    return (
      <KeyboardAvoidingView behavior="padding" style={style}>
        {children}
      </KeyboardAvoidingView>
    );
  }
  return <View style={style}>{children}</View>;
}

// A separate component so the hooks are not called conditionally on the platform.
function AndroidKeyboardLift({
  children,
  style,
  insetBelow,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  insetBelow: boolean;
}) {
  const keyboard = useAnimatedKeyboard();
  const insets = useSafeAreaInsets();
  const covered = insetBelow ? insets.bottom : 0;

  const lift = useAnimatedStyle(() => ({
    paddingBottom: Math.max(keyboard.height.value - covered, 0),
  }));

  return <Reanimated.View style={[style, lift]}>{children}</Reanimated.View>;
}

function AndroidModalKeyboardLift({
  children,
  style,
  insetBelow,
}: {
  children: ReactNode;
  style?: StyleProp<ViewStyle>;
  insetBelow: boolean;
}) {
  const [height, setHeight] = useState(0);
  const insets = useSafeAreaInsets();
  const covered = insetBelow ? insets.bottom : 0;

  useEffect(() => {
    const show = Keyboard.addListener('keyboardDidShow', (e) => setHeight(e.endCoordinates.height));
    const hide = Keyboard.addListener('keyboardDidHide', () => setHeight(0));
    return () => {
      show.remove();
      hide.remove();
    };
  }, []);

  return (
    <View style={[style, { paddingBottom: Math.max(height - covered, 0) }]}>{children}</View>
  );
}
