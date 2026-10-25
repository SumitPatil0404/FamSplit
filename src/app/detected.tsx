import * as Clipboard from 'expo-clipboard';
import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { showToast } from '@/components/toast';
import { Button, Card, EmptyState, Tag } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { formatPaise } from '@/domain';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/i18n';
import { addDetected, markDetected, paidOn, useDetected, type DetectedPayment } from '@/store/detected';
import { relativeDay } from '@/store/summary';
import { useTrips } from '@/store/trips';

function PaymentCard({ payment }: { payment: DetectedPayment }) {
  const router = useRouter();
  const theme = useTheme();
  const t = useT();
  const trips = useTrips();
  const credit = payment.direction === 'credit';
  const name = payment.party ?? payment.upiId;
  const tripName = trips.find((trip) => trip.id === payment.tripId)?.name;
  const use = () => router.push({ pathname: '/detected-use', params: { alertId: payment.id } });

  return (
    <Card>
      <View style={styles.row}>
        <View style={[styles.tile, { backgroundColor: credit ? theme.positiveSoft : theme.negativeSoft }]}>
          <Icon name={credit ? 'moneyIn' : 'moneyOut'} size={22} color={credit ? theme.positive : theme.negative} />
        </View>
        <View style={styles.grow}>
          <ThemedText type="bold">{formatPaise(payment.amount)}</ThemedText>
          <ThemedText type="small" numberOfLines={1}>
            {credit
              ? name
                ? t('Received from {name}', { name })
                : t('Money received')
              : name
                ? t('Paid to {name}', { name })
                : t('Money paid')}
          </ThemedText>
        </View>
        <ThemedText type="caption" themeColor="textSecondary">
          {relativeDay(paidOn(payment), t)}
        </ThemedText>
      </View>
      <ThemedText type="caption" themeColor="textSecondary" numberOfLines={2}>
        {payment.text}
      </ThemedText>
      {payment.status === 'new' ? (
        <View style={styles.actions}>
          <Button
            label={credit ? t('Mark a settle-up paid') : t('Add to a trip')}
            icon={credit ? 'check' : 'add'}
            compact
            onPress={use}
            style={styles.grow}
          />
          <Button label={t('Ignore')} variant="soft" compact onPress={() => markDetected(payment.id, 'dismissed')} />
        </View>
      ) : (
        <View style={styles.actions}>
          <Tag
            label={
              payment.status === 'dismissed'
                ? t('Ignored')
                : tripName
                  ? t('Added to “{trip}”', { trip: tripName })
                  : t('Added')
            }
          />
          {payment.status === 'dismissed' && (
            <Button label={t('Put back')} variant="soft" compact onPress={() => markDetected(payment.id, 'new')} />
          )}
        </View>
      )}
    </Card>
  );
}

export default function DetectedScreen() {
  const t = useT();
  const detected = useDetected();
  const waiting = detected.filter((payment) => payment.status === 'new');
  const done = detected.filter((payment) => payment.status !== 'new');

  const paste = async () => {
    const text = await Clipboard.getStringAsync();
    const result = addDetected(text);
    if ('problem' in result) {
      showToast({
        title: result.problem === 'duplicate' ? t('Already in the list') : t('No payment found'),
        body:
          result.problem === 'duplicate'
            ? t('This payment was picked up before.')
            : t('Copy a bank SMS or UPI message that says money was paid or received, then try again.'),
        icon: 'rupee',
      });
    }
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <ThemedText type="small" themeColor="textSecondary">
        {t('Payments read from your bank and UPI alerts. They stay on this phone until you add one to a trip.')}
      </ThemedText>
      {waiting.length === 0 && done.length === 0 && (
        <EmptyState
          emoji="🏦"
          title={t('No bank payments yet')}
          body={t('When a payment alert arrives it shows up here. You can also copy a bank SMS and paste it.')}
        />
      )}
      {waiting.map((payment) => (
        <PaymentCard key={payment.id} payment={payment} />
      ))}
      <Button label={t('Paste a bank message')} icon="copy" variant="soft" onPress={paste} />
      {done.length > 0 && (
        <ThemedText type="smallBold" themeColor="textSecondary" style={styles.earlier}>
          {t('Earlier')}
        </ThemedText>
      )}
      {done.map((payment) => (
        <PaymentCard key={payment.id} payment={payment} />
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  grow: {
    flex: 1,
  },
  content: {
    padding: Spacing.three,
    gap: Spacing.three,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  tile: {
    width: 44,
    height: 44,
    borderRadius: Radius.medium,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginTop: Spacing.one,
  },
  earlier: {
    marginTop: Spacing.two,
  },
});
