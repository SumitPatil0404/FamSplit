import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { DialogHost } from '@/components/dialog';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { startSync } from '@/sync/sync';

export default function RootLayout() {
  const colors = useTheme();
  const base = useColorScheme() === 'dark' ? DarkTheme : DefaultTheme;

  useEffect(startSync, []);

  return (
    <ThemeProvider
      value={{
        ...base,
        colors: {
          ...base.colors,
          primary: colors.primary,
          background: colors.background,
          card: colors.background,
          text: colors.text,
          border: colors.border,
        },
      }}>
      <StatusBar style="auto" />
      <Stack
        screenOptions={{
          headerShadowVisible: false,
          headerStyle: { backgroundColor: colors.background },
          headerTintColor: colors.text,
          headerTitleStyle: { fontWeight: '700' },
          contentStyle: { backgroundColor: colors.background },
        }}>
        <Stack.Screen name="index" options={{ title: 'FamSplit' }} />
        <Stack.Screen name="new-trip" options={{ title: 'New trip', presentation: 'modal' }} />
        <Stack.Screen name="account" options={{ title: 'Account', presentation: 'modal' }} />
        <Stack.Screen name="join" options={{ title: 'Join a trip', presentation: 'modal' }} />
        <Stack.Screen name="trip/[tripId]/index" options={{ title: '' }} />
        <Stack.Screen name="trip/[tripId]/expense" options={{ title: 'Add expense', presentation: 'modal' }} />
        <Stack.Screen name="trip/[tripId]/family" options={{ title: 'Add family', presentation: 'modal' }} />
        <Stack.Screen name="trip/[tripId]/who" options={{ title: 'Which one is you?', presentation: 'modal' }} />
        <Stack.Screen name="trip/[tripId]/activity" options={{ title: 'Activity', presentation: 'modal' }} />
      </Stack>
      <DialogHost />
    </ThemeProvider>
  );
}
