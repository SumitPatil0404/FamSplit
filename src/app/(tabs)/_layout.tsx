import { Tabs } from 'expo-router';

import { Icon } from '@/components/icon';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/i18n';

/** Trips, and My spending: everything this person spent, on trips and on their own. */
export default function TabsLayout() {
  const theme = useTheme();
  const t = useT();
  return (
    <Tabs
      screenOptions={{
        headerShadowVisible: false,
        headerStyle: { backgroundColor: theme.background },
        headerTintColor: theme.text,
        headerTitleStyle: { fontWeight: '700' },
        headerRightContainerStyle: { paddingRight: Spacing.three },
        sceneStyle: { backgroundColor: theme.background },
        tabBarActiveTintColor: theme.primary,
        tabBarInactiveTintColor: theme.textSecondary,
        tabBarStyle: { backgroundColor: theme.background, borderTopColor: theme.border },
        tabBarLabelStyle: { fontWeight: '600' },
      }}>
      <Tabs.Screen
        name="index"
        options={{
          title: 'FamSplit',
          tabBarLabel: t('Trips'),
          tabBarIcon: ({ color }) => <Icon name="trip" size={24} color={color} />,
        }}
      />
      <Tabs.Screen
        name="my-spending"
        options={{
          title: t('My spending'),
          tabBarIcon: ({ color }) => <Icon name="wallet" size={24} color={color} />,
        }}
      />
    </Tabs>
  );
}
