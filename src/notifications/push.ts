import type { SupabaseClient } from '@supabase/supabase-js';
import Constants, { ExecutionEnvironment } from 'expo-constants';
import { router } from 'expo-router';
import { Platform } from 'react-native';

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

/**
 * Asks for permission if needed and tells the server which phone to notify for the signed-in user.
 * Fails quietly: no permission, no Play services or no connection just means no notifications for now.
 */
export async function registerForPush(client: SupabaseClient): Promise<void> {
  if (!supported) {
    return;
  }
  try {
    const push = notifications();
    if (Platform.OS === 'android') {
      await push.setNotificationChannelAsync('default', {
        name: 'Trip updates',
        importance: push.AndroidImportance.HIGH,
      });
    }
    let { granted } = await push.getPermissionsAsync();
    if (!granted) {
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
    push.setNotificationHandler({
      handleNotification: async () => ({
        shouldShowBanner: true,
        shouldShowList: true,
        shouldPlaySound: true,
        shouldSetBadge: false,
      }),
    });
    push.addNotificationReceivedListener(onNotification);

    const openTrip = (tripId: unknown) => {
      if (typeof tripId === 'string' && tripId !== '') {
        // Wait a moment so navigation is ready when the tap is what launched the app.
        setTimeout(() => router.push(`/trip/${tripId}`), 300);
      }
    };
    push.addNotificationResponseReceivedListener((response) => openTrip(response.notification.request.content.data?.tripId));
    openTrip(push.getLastNotificationResponse()?.notification.request.content.data?.tripId);
  } catch (error) {
    console.warn('Push notifications are not available:', error);
  }
}
