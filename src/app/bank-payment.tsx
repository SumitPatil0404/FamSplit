import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { DirectionTile, paymentName, signedAmount, sourceLabel, statusLabel } from '@/components/bank-payment-parts';
import { SettingsRow, SettingsSection } from '@/components/settings';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, EmptyState, Tag } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/i18n';
import { markDetected, paidOn, useDetected } from '@/store/detected';
import { formatDay } from '@/store/summary';
import { useTrips } from '@/store/trips';

/** Everything known about one bank payment, and what to do with it. */
export default function BankPaymentScreen() {
  const t = useT();
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const trips = useTrips();
  const { alertId } = useLocalSearchParams<{ alertId: string }>();
  const payment = useDetected().find((candidate) => candidate.id === alertId);

  if (!payment) {
    return <EmptyState emoji="🤔" title={t('Payment not found')} body={t('It may have been removed after 60 days.')} />;
  }
  const credit = payment.direction === 'credit';
  const name = paymentName(payment, t);
  const status = statusLabel(payment, trips, t);
  const params = { alertId: payment.id };

  return (
    <View style={styles.grow}>
      <Stack.Screen options={{ title: credit ? t('Money received') : t('Money paid') }} />
      <ScrollView contentContainerStyle={styles.content}>
        <View style={styles.hero}>
          <DirectionTile payment={payment} size={56} />
          <ThemedText type="amount" style={{ color: credit ? theme.positive : theme.text }}>
            {signedAmount(payment)}
          </ThemedText>
          <ThemedText type="bold" style={styles.centered}>
            {credit ? t('Received from {name}', { name }) : t('Paid to {name}', { name })}
          </ThemedText>
          {status && <Tag label={status} />}
        </View>

        <SettingsSection title={t('DETAILS')} plain>
          <SettingsRow label={t('Date')} value={formatDay(paidOn(payment), t)} />
          {payment.upiId && <SettingsRow label={t('UPI ID')} value={payment.upiId} />}
          {payment.account && <SettingsRow label={t('Account or card')} value={`••${payment.account}`} />}
          {payment.reference && <SettingsRow label={t('Reference')} value={payment.reference} />}
          <SettingsRow label={t('From')} value={sourceLabel(payment, t)} />
        </SettingsSection>

        <View style={styles.section}>
          <ThemedText type="caption" themeColor="textSecondary" style={styles.heading}>
            {t('MESSAGE')}
          </ThemedText>
          <Card>
            <ThemedText type="small" selectable>
              {payment.text}
            </ThemedText>
          </Card>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.two, borderColor: theme.border }]}>
        {payment.status === 'new' ? (
          <>
            {credit ? (
              <Button
                label={t('Mark a settle-up paid')}
                icon="check"
                onPress={() => router.replace({ pathname: '/detected-use', params })}
              />
            ) : (
              <View style={styles.actions}>
                <Button
                  label={t('Add to a trip')}
                  icon="add"
                  onPress={() => router.replace({ pathname: '/detected-use', params })}
                  style={styles.grow}
                />
                <Button
                  label={t('Personal')}
                  icon="person"
                  variant="soft"
                  onPress={() => router.replace({ pathname: '/personal-expense', params })}
                  style={styles.grow}
                />
              </View>
            )}
            <Button
              label={t('Ignore')}
              variant="soft"
              onPress={() => {
                markDetected(payment.id, 'dismissed');
                router.back();
              }}
            />
          </>
        ) : payment.status === 'dismissed' ? (
          <Button label={t('Put back')} icon="undo" variant="soft" onPress={() => markDetected(payment.id, 'new')} />
        ) : null}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  grow: {
    flex: 1,
  },
  content: {
    padding: Spacing.three,
    gap: Spacing.four,
  },
  hero: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
  },
  centered: {
    textAlign: 'center',
  },
  section: {
    gap: Spacing.two,
  },
  heading: {
    paddingHorizontal: Spacing.two,
  },
  footer: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    gap: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  actions: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
});
