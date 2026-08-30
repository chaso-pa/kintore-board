import { useRef } from 'react';
import { StyleSheet, Text, TouchableOpacity, View } from 'react-native';
import ReanimatedSwipeable, {
  type SwipeableMethods,
} from 'react-native-gesture-handler/ReanimatedSwipeable';

import { Colors, Spacing } from '@/constants/theme';

interface Props {
  onDelete: () => void;
  children: React.ReactNode;
}

const ACTION_WIDTH = 84;

/**
 * A row that reveals a red 削除 when dragged sideways.
 *
 * Both directions are wired to the same action. iOS convention puts delete on the trailing
 * edge, reached by dragging left, but "右スワイプ" describes dragging the other way — rather
 * than guess which one someone will reach for, either drag reveals the same button.
 *
 * Revealing is not deleting: the button still has to be tapped, and the caller may confirm
 * on top of that. A horizontal drag is easy to make by accident while scrolling a list, and
 * a full-swipe-deletes gesture would turn that into data loss.
 */
export function SwipeToDeleteRow({ onDelete, children }: Props) {
  const ref = useRef<SwipeableMethods>(null);

  const action = () => (
    <TouchableOpacity
      style={styles.action}
      onPress={() => {
        // Closed first so the row is not left hanging open behind a confirmation dialog,
        // or after the delete is declined.
        ref.current?.close();
        onDelete();
      }}>
      <Text style={styles.actionText}>削除</Text>
    </TouchableOpacity>
  );

  return (
    <ReanimatedSwipeable
      ref={ref}
      friction={2}
      overshootLeft={false}
      overshootRight={false}
      leftThreshold={ACTION_WIDTH / 2}
      rightThreshold={ACTION_WIDTH / 2}
      renderLeftActions={action}
      renderRightActions={action}
      containerStyle={styles.container}>
      <View style={styles.child}>{children}</View>
    </ReanimatedSwipeable>
  );
}

const styles = StyleSheet.create({
  container: { borderRadius: 10, overflow: 'hidden' },
  child: { flex: 1 },
  action: {
    width: ACTION_WIDTH,
    backgroundColor: Colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: Spacing.two,
  },
  actionText: { color: '#fff', fontWeight: 'bold', fontSize: 14 },
});
