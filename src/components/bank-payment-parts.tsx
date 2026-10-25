import { StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { Radius } from '@/constants/theme';
import { formatPaise } from '@/domain';
import { useTheme } from '@/hooks/use-theme';
import type { T } from '@/i18n';
import { nameFromUpiId, PERSONAL, type DetectedPayment } from '@/store/detected-match';
import type { StoredTrip } from '@/store/trips';

/** Who the money went to or came from, as plainly as the alert allows. */
export function paymentName(payment: DetectedPayment, t: T): string {
  const fromUpi = payment.upiId ? nameFromUpiId(payment.upiId) || payment.upiId : undefined;
  return payment.party ?? fromUpi ?? (payment.direction === 'credit' ? t('Money received') : t('Money paid'));
}

/** "−₹169" or "+₹300". */
export function signedAmount(payment: DetectedPayment): string {
  return `${payment.direction === 'credit' ? '+' : '−'}${formatPaise(payment.amount)}`;
}

/** Where the alert came from: an SMS, a UPI app by name, or pasted in by hand. */
export function sourceLabel(payment: DetectedPayment, t: T): string {
  const apps: Record<string, string> = {
    'com.google.android.apps.messaging': t('SMS'),
    'com.samsung.android.messaging': t('SMS'),
    'com.android.mms': t('SMS'),
    'com.oneplus.mms': t('SMS'),
    'com.truecaller': t('SMS'),
    'com.google.android.apps.nbu.paisa.user': 'Google Pay',
    'com.phonepe.app': 'PhonePe',
    'net.one97.paytm': 'Paytm',
    'in.org.npci.upiapp': 'BHIM',
    'com.google.android.gm': 'Gmail',
  };
  if (!payment.source) {
    return t('Pasted');
  }
  return apps[payment.source] ?? t('App alert');
}

/** What happened to a payment already sorted. */
export function statusLabel(payment: DetectedPayment, trips: StoredTrip[], t: T): string | null {
  if (payment.status === 'new') {
    return null;
  }
  if (payment.status === 'dismissed') {
    return t('Ignored');
  }
  if (payment.tripId === PERSONAL) {
    return payment.direction === 'credit' ? t('Kept as personal') : t('Added as personal');
  }
  const trip = trips.find((candidate) => candidate.id === payment.tripId);
  return trip ? t('Added to “{trip}”', { trip: trip.name }) : t('Added');
}

/** A red arrow out for money paid, a green arrow in for money received. */
export function DirectionTile({ payment, size = 44 }: { payment: DetectedPayment; size?: number }) {
  const theme = useTheme();
  const credit = payment.direction === 'credit';
  return (
    <View
      style={[
        styles.tile,
        { width: size, height: size, backgroundColor: credit ? theme.positiveSoft : theme.negativeSoft },
      ]}>
      <Icon name={credit ? 'moneyIn' : 'moneyOut'} size={size / 2} color={credit ? theme.positive : theme.negative} />
    </View>
  );
}

const styles = StyleSheet.create({
  tile: {
    borderRadius: Radius.medium,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
