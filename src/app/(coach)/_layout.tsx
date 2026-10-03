import { Tabs } from 'expo-router';

import { Icon } from '@/components/ui-kit';
import { useTheme } from '@/hooks/use-theme';

export default function CoachTabs() {
  const theme = useTheme();
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: theme.tabActive,
        tabBarInactiveTintColor: theme.textSecondary,
        tabBarStyle: { backgroundColor: theme.backgroundElement, borderTopColor: theme.border },
      }}>
      <Tabs.Screen
        name="athletes"
        options={{
          title: 'Team',
          tabBarIcon: ({ color }) => <Icon name="team" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="comments"
        options={{
          title: 'Feedback',
          tabBarIcon: ({ color }) => <Icon name="feedback" size={24} color={color} />,
        }}
      />
    </Tabs>
  );
}
