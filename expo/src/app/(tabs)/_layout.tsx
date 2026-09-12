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


      <NativeTabs.Trigger name="record">
        <NativeTabs.Trigger.Label>記録</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'chart.bar', selected: 'chart.bar.fill' }}
          md={{ default: 'bar_chart', selected: 'bar_chart' }}
        />
      </NativeTabs.Trigger>


      <NativeTabs.Trigger name="gym">
        <NativeTabs.Trigger.Label>ジム</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'figure.strengthtraining.traditional', selected: 'figure.strengthtraining.traditional' }}
          md={{ default: 'fitness_center', selected: 'fitness_center' }}
        />
      </NativeTabs.Trigger>

      <NativeTabs.Trigger name="machine">
        <NativeTabs.Trigger.Label>マシン</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'dumbbell', selected: 'dumbbell.fill' }}
          md={{ default: 'fitness_center', selected: 'fitness_center' }}
        />
      </NativeTabs.Trigger>

      {/* The profile screen existed for a while with no trigger and no link to it from
          anywhere, which made it unreachable — and with it the moderation queue, the only
          route an admin has into the report backlog.

          It is now also where blocking, the terms and the contact address live, all three of
          which App Store guideline 1.2 requires a reviewer to be able to find. Five is the
          most iOS shows before it folds the rest into a "More" tab, so this is the last one
          that can be added without the bar changing shape. */}
      <NativeTabs.Trigger name="profile">
        <NativeTabs.Trigger.Label>マイページ</NativeTabs.Trigger.Label>
        <NativeTabs.Trigger.Icon
          sf={{ default: 'person.crop.circle', selected: 'person.crop.circle.fill' }}
          md={{ default: 'person', selected: 'person' }}
        />
      </NativeTabs.Trigger>
    </NativeTabs>
  );
}
