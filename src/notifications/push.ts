import type { SupabaseClient } from '@supabase/supabase-js';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { router } from 'expo-router';
import Storage from 'expo-sqlite/kv-store';
import { Linking, Platform } from 'react-native';

import { showToast } from '@/components/toast';
import { Colors } from '@/constants/theme';
import { currentT } from '@/i18n';

type Notifications = typeof import('expo-notifications');

/** Expo Go cannot receive push notifications on Android, so all of this only runs in a real build. */
const supported = Platform.OS !== 'web' && Constants.executionEnvironment !== ExecutionEnvironment.StoreClient;

let loaded: Notifications | null = null;

/** Loaded on first use so that Expo Go never touches the native notification code. */
function notifications(): Notifications {
  if (!loaded) {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    loaded = require('expo-notifications') as Notifications;
  }
  return loaded;
}

let currentToken: string | null = null;

/** Set once this phone has shown the "Allow notifications?" prompt on its own. */
const ASKED_KEY = 'famsplit.notificationsAsked.v1';

/**
 * When to show Android's "Allow notifications?" prompt: `once` only the first time on this phone,
 * `now` because the person tapped Turn on, `never` only register if already allowed.
 */
export type AskForNotifications = 'once' | 'now' | 'never';

/**
 * Tells the server which phone to notify for the signed-in user, asking for permission when `ask`
 * says to. Fails quietly: no permission, no Play services or no connection just means no notifications for now.
 */
export async function registerForPush(client: SupabaseClient, ask: AskForNotifications = 'once'): Promise<void> {
  if (!supported) {
    return;
  }
  try {
    const push = notifications();
    if (Platform.OS === 'android') {
      const t = currentT();
      // Two channels, so reminders can be silenced in Android's settings without losing trip updates.
      await push.setNotificationChannelAsync('default', {
        name: t('Trip updates'),
        description: t('Expenses and payments added or changed by others on your trips'),
        importance: push.AndroidImportance.HIGH,
        lightColor: Colors.light.primary,
      });
      await push.setNotificationChannelAsync('reminders', {
        name: t('Payment reminders'),
        description: t('When someone reminds you that a payment is due'),
        importance: push.AndroidImportance.HIGH,
        lightColor: Colors.light.primary,
      });
    }
    const current = await push.getPermissionsAsync();
    let granted = current.granted;
    const firstTime = Storage.getItemSync(ASKED_KEY) !== 'yes';
    if (!granted && current.canAskAgain && (ask === 'now' || (ask === 'once' && firstTime))) {
      Storage.setItemSync(ASKED_KEY, 'yes');
      granted = (await push.requestPermissionsAsync()).granted;
    }
    if (!granted) {
      return;
    }
    currentToken = String((await push.getDevicePushTokenAsync()).data);
    await client.rpc('register_push_token', { device_token: currentToken, device_platform: Platform.OS });
  } catch (error) {
    console.warn('Push notifications are not available:', error);
  }
}

/** `blocked`: Android no longer shows the prompt, so only its settings can turn notifications on. */
export type NotificationStatus = 'on' | 'off' | 'blocked' | 'unsupported';

export async function notificationStatus(): Promise<NotificationStatus> {
  if (!supported) {
    return 'unsupported';
  }
  try {
    const { granted, canAskAgain } = await notifications().getPermissionsAsync();
    return granted ? 'on' : canAskAgain ? 'off' : 'blocked';
  } catch {
    return 'unsupported';
  }
}

/** For the Turn on button: Android's prompt if it can still be shown, otherwise FamSplit's page in Android's settings. */
export async function turnOnNotifications(client: SupabaseClient): Promise<void> {
  if ((await notificationStatus()) === 'blocked') {
    await Linking.openSettings();
    return;
  }
  await registerForPush(client, 'now');
}

/** Call before signing out, while the server still knows who is asking. */
export async function unregisterFromPush(client: SupabaseClient): Promise<void> {
  if (!currentToken) {
    return;
  }
  try {
    await client.rpc('unregister_push_token', { device_token: currentToken });
  } catch {
    // The token is replaced the next time anyone signs in on this phone.
  }
  currentToken = null;
}

let listening = false;

/** Call once at app start: shows notifications while the app is open, and opens the trip when one is tapped. */
export function startPushListeners(onNotification: () => void): void {
  if (!supported || listening) {
    return;
  }
  listening = true;
  try {
    const push = notifications();
    const openTrip = (tripId: unknown) => {
      if (typeof tripId === 'string' && tripId !== '') {
        // Wait a moment so navigation is ready when the tap is what launched the app.
        setTimeout(() => router.push(`/trip/${tripId}`), 300);
      }
    };

    // While the app is open, a notification appears as the app's own banner instead of Android's.
    push.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: false,
        shouldShowList: false,
        shouldPlaySound: false,
        shouldSetBadge: false,
      }),
    });
    push.addNotificationReceivedListener((notification) => {
      const { title, body, data } = notification.request.content;
      showToast({
        title: title ?? 'FamSplit',
        body: body ?? '',
        icon: data?.kind === 'reminder' ? 'bell' : 'trip',
        onPress: () => openTrip(data?.tripId),
      });
      onNotification();
    });

    push.addNotificationResponseReceivedListener((response) => openTrip(response.notification.request.content.data?.tripId));
    openTrip(push.getLastNotificationResponse()?.notification.request.content.data?.tripId);
  } catch (error) {
    console.warn('Push notifications are not available:', error);
  }
}
