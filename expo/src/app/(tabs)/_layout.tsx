import { NativeTabs } from 'expo-router/unstable-native-tabs';

import { Colors } from '@/constants/theme';

export default function TabsLayout() {
  return (
    <NativeTabs
      backgroundColor={Colors.background}
      indicatorColor={Colors.pink}
      labelStyle={{ selected: { color: Colors.hotPink } }}>
      <NativeTabs.Trigger name="board">
        <NativeTabs.Trigger.Label>スレッド</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'bubble.left.and.bubble.right', selected: 'bubble.left.and.bubble.right.fill' }}
          md={{ default: 'forum', selected: 'forum' }}
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="gym">
        <NativeTabs.Trigger.Label>ジム</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'dumbbell', selected: 'dumbbell.fill' }}
          md={{ default: 'fitness_center', selected: 'fitness_center' }}
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="record">
        <NativeTabs.Trigger.Label>記録</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'chart.bar', selected: 'chart.bar.fill' }}
          md={{ default: 'bar_chart', selected: 'bar_chart' }}
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="profile">
        <NativeTabs.Trigger.Label>マイ</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'person', selected: 'person.fill' }}
          md={{ default: 'person', selected: 'person' }}
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
