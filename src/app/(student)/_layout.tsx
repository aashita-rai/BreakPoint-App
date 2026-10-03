import { Tabs } from 'expo-router';

import { Icon } from '@/components/ui-kit';
import { useTheme } from '@/hooks/use-theme';

// README §9 tabs: Capture, Results, Check-In, Report (+ the athlete's coach feedback).
export default function StudentTabs() {
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
        name="workouts"
        options={{ title: 'Results', tabBarIcon: ({ color }) => <Icon name="workouts" size={24} color={color} /> }}
      />
      <Tabs.Screen
        name="capture"
        options={{ title: 'Capture', tabBarIcon: ({ color }) => <Icon name="camera" size={24} color={color} /> }}
      />
      <Tabs.Screen
        name="check-in"
        options={{ title: 'Check-In', tabBarIcon: ({ color }) => <Icon name="checkin" size={24} color={color} /> }}
      />
      <Tabs.Screen
        name="report"
        options={{ title: 'Report', tabBarIcon: ({ color }) => <Icon name="report" size={24} color={color} /> }}
      />
      <Tabs.Screen
        name="feedback"
        options={{ title: 'Feedback', tabBarIcon: ({ color }) => <Icon name="feedback" size={24} color={color} /> }}
      />
    </Tabs>
  );
}
