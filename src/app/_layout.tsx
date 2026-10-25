import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';

import { DialogHost } from '@/components/dialog';
import { ToastHost } from '@/components/toast';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/i18n';
import { startSync } from '@/sync/sync';

// A link straight to a screen, such as a tapped bank payment notification, still has the trips list to go back to.
export const unstable_settings = {
  anchor: 'index',
};

export default function RootLayout() {
  const colors = useTheme();
  const t = useT();
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
        <Stack.Screen name="new-trip" options={{ title: t('New trip'), presentation: 'modal' }} />
        <Stack.Screen name="account" options={{ title: t('Account'), presentation: 'modal' }} />
        <Stack.Screen name="join" options={{ title: t('Join a trip'), presentation: 'modal' }} />
        <Stack.Screen name="auth-callback" options={{ headerShown: false, animation: 'none' }} />
        <Stack.Screen name="welcome" options={{ headerShown: false, presentation: 'fullScreenModal' }} />
        <Stack.Screen name="detected" options={{ title: t('Bank payments') }} />
        <Stack.Screen name="detected-use" options={{ title: '', presentation: 'modal' }} />
        <Stack.Screen name="trip/[tripId]/index" options={{ title: '' }} />
        <Stack.Screen name="trip/[tripId]/expense" options={{ title: t('Add expense'), presentation: 'modal' }} />
        <Stack.Screen name="trip/[tripId]/expense-details" options={{ title: '' }} />
        <Stack.Screen name="trip/[tripId]/expense-category" options={{ title: t('Category'), presentation: 'modal' }} />
        <Stack.Screen name="trip/[tripId]/expense-payer" options={{ title: t('Paid by'), presentation: 'modal' }} />
        <Stack.Screen name="trip/[tripId]/expense-payers" options={{ title: t('Several people paid'), presentation: 'modal' }} />
        <Stack.Screen name="trip/[tripId]/expense-split" options={{ title: t('How is it split?'), presentation: 'modal' }} />
        <Stack.Screen name="trip/[tripId]/expense-date" options={{ title: t('When was it paid?'), presentation: 'modal' }} />
        <Stack.Screen name="trip/[tripId]/family" options={{ title: t('Add family'), presentation: 'modal' }} />
        <Stack.Screen name="trip/[tripId]/person" options={{ title: t('Add person'), presentation: 'modal' }} />
        <Stack.Screen name="trip/[tripId]/who" options={{ title: t('Which one is you?'), presentation: 'modal' }} />
        <Stack.Screen name="trip/[tripId]/activity" options={{ title: t('Activity'), presentation: 'modal' }} />
        <Stack.Screen name="trip/[tripId]/spending" options={{ title: t('Spending'), presentation: 'modal' }} />
        <Stack.Screen name="trip/[tripId]/settle-between" options={{ title: t('Between families') }} />
        <Stack.Screen name="trip/[tripId]/settle-family" options={{ title: '' }} />
        <Stack.Screen name="trip/[tripId]/rename" options={{ title: t('Rename trip'), presentation: 'modal' }} />
      </Stack>
      <ToastHost />
      <DialogHost />
    </ThemeProvider>
  );
}
