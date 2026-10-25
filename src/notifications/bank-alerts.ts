import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { AppState } from 'react-native';

import { showToast } from '@/components/toast';
import { formatPaise } from '@/domain';
import { currentT, onLanguageChange } from '@/i18n';
import { addDetected, type DetectedPayment } from '@/store/detected';

import { BankAlerts, type BankAlert } from '../../modules/bank-alerts';

/** Reading payment alerts needs the Android module, which iPhone, the web and Expo Go do not have. */
export const bankAlertsAvailable = BankAlerts !== null;

function keep(alert: BankAlert) {
  return addDetected(alert.text, { source: alert.source, seenAt: alert.seenAt });
}

/** Keeps FamSplit's own notification in the app's language. */
function sendTexts() {
  const t = currentT();
  BankAlerts?.setTexts(t('Add this payment to FamSplit?'), t('{count} payments to add to FamSplit'), t('Bank payments'));
}

/** Takes the alerts waiting on the phone, and returns the ones that were new payments. */
function collect(): DetectedPayment[] {
  if (!BankAlerts) {
    return [];
  }
  return BankAlerts.takePending().flatMap((alert) => {
    const result = keep(alert);
    return 'payment' in result ? [result.payment] : [];
  });
}

let started = false;

/** Call once at app start. */
export function startBankAlerts(): void {
  if (!BankAlerts || started) {
    return;
  }
  started = true;
  sendTexts();
  onLanguageChange(sendTexts);
  collect();
  AppState.addEventListener('change', (state) => {
    if (state === 'active') {
      collect();
    }
  });
  // With the app on screen, a new alert shows as a banner here instead of as a notification.
  BankAlerts.addListener('onAlert', () => {
    const t = currentT();
    for (const payment of collect()) {
      const amount = formatPaise(payment.amount);
      showToast({
        title: payment.direction === 'credit' ? t('{amount} received', { amount }) : t('{amount} paid', { amount }),
        body: t('Tap to add it to FamSplit.'),
        icon: 'rupee',
        onPress: () => router.push('/detected'),
      });
    }
  });
}

/** Whether Notification access is on, checked again each time the user comes back to the app. */
export function useBankAlertsEnabled(): boolean {
  const [enabled, setEnabled] = useState(() => BankAlerts?.isEnabled() ?? false);
  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        setEnabled(BankAlerts?.isEnabled() ?? false);
      }
    });
    return () => subscription.remove();
  }, []);
  return enabled;
}

/** Called only after the user has agreed on the explanation screen. */
export async function turnOnBankAlerts(): Promise<void> {
  if (!BankAlerts) {
    return;
  }
  // FamSplit's "Add this payment?" notification needs permission to show, so ask for that first.
  try {
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    const notifications = require('expo-notifications') as typeof import('expo-notifications');
    if (!(await notifications.getPermissionsAsync()).granted) {
      await notifications.requestPermissionsAsync();
    }
  } catch {
    // Without it, payments still show up in the list; only the notification is missing.
  }
  BankAlerts.openSettings();
}

export function openBankAlertSettings(): void {
  BankAlerts?.openSettings();
}
