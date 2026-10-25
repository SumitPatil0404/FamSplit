import * as Clipboard from 'expo-clipboard';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { DirectionTile, paymentName, signedAmount, sourceLabel, statusLabel } from '@/components/bank-payment-parts';
import { Icon } from '@/components/icon';
import { SettingsRow, SettingsSection } from '@/components/settings';
import { ThemedText } from '@/components/themed-text';
import { showToast } from '@/components/toast';
import { EmptyState, IconButton } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { plural, useT } from '@/i18n';
import { bankAlertsAvailable, openBankAlertSettings, useBankAlertsEnabled } from '@/notifications/bank-alerts';
import { addDetected, paidOn, useDetected, type DetectedPayment } from '@/store/detected';
import { relativeDay } from '@/store/summary';
import { useTrips } from '@/store/trips';

/** One payment at a glance: who, when, from where, and how much. Tapping it shows everything else. */
function PaymentRow({ payment }: { payment: DetectedPayment }) {
  const t = useT();
  const router = useRouter();
  const theme = useTheme();
  const trips = useTrips();
  const credit = payment.direction === 'credit';
  const status = statusLabel(payment, trips, t);
  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/bank-payment', params: { alertId: payment.id } })}
      style={({ pressed }) => [styles.row, { backgroundColor: pressed ? theme.backgroundSelected : 'transparent' }]}>
      <DirectionTile payment={payment} size={40} />
      <View style={styles.grow}>
        <ThemedText type="bold" numberOfLines={1}>
          {paymentName(payment, t)}
        </ThemedText>
        <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1}>
          {status ?? `${relativeDay(paidOn(payment), t)} · ${sourceLabel(payment, t)}`}
        </ThemedText>
      </View>
      <ThemedText type="bold" style={{ color: credit ? theme.positive : theme.text }}>
        {signedAmount(payment)}
      </ThemedText>
      <Icon name="chevronRight" size={18} color={theme.textSecondary} />
    </Pressable>
  );
}

function PaymentList({ payments }: { payments: DetectedPayment[] }) {
  const theme = useTheme();
  return (
    <View style={[styles.list, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      {payments.map((payment, index) => (
        <View key={payment.id}>
          {index > 0 && <View style={[styles.divider, { backgroundColor: theme.border }]} />}
          <PaymentRow payment={payment} />
        </View>
      ))}
    </View>
  );
}

/** Whether payments are picked up from notifications, as one row. */
function AutoReadRow() {
  const t = useT();
  const theme = useTheme();
  const router = useRouter();
  const enabled = useBankAlertsEnabled();
  return (
    <SettingsSection
      footer={enabled ? t('If payments stop showing up, allow FamSplit to run in the background in your phone’s battery settings.') : undefined}>
      {enabled ? (
        <SettingsRow
          icon="bell"
          label={t('Picking up payment alerts')}
          detail={t('Change in Android’s settings')}
          trailing={
            <ThemedText type="smallBold" style={{ color: theme.positive }}>
              {t('On')}
            </ThemedText>
          }
          onPress={openBankAlertSettings}
        />
      ) : (
        <SettingsRow
          icon="bell"
          label={t('Pick up bank payments automatically')}
          detail={t('Read bank SMS and UPI alerts as they arrive')}
          value={t('Off')}
          opens
          onPress={() => router.push('/bank-alerts-setup')}
        />
      )}
    </SettingsSection>
  );
}

export default function DetectedScreen() {
  const t = useT();
  const detected = useDetected();
  const [showSorted, setShowSorted] = useState(false);
  const waiting = detected.filter((payment) => payment.status === 'new');
  const sorted = detected.filter((payment) => payment.status !== 'new');

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
      <Stack.Screen
        options={{
          headerRight: () => <IconButton icon="copy" label={t('Paste a bank message')} onPress={() => void paste()} />,
        }}
      />
      {bankAlertsAvailable && <AutoReadRow />}

      {detected.length === 0 ? (
        <EmptyState
          emoji="🏦"
          title={t('No bank payments yet')}
          body={t('When a payment alert arrives it shows up here. You can also copy a bank SMS and paste it.')}
        />
      ) : (
        <>
          <View style={styles.section}>
            <ThemedText type="caption" themeColor="textSecondary" style={styles.heading}>
              {t('{count} TO SORT', { count: waiting.length })}
            </ThemedText>
            {waiting.length > 0 ? (
              <PaymentList payments={waiting} />
            ) : (
              <View style={styles.allSorted}>
                <ThemedText type="bold">✅ {t('All sorted')}</ThemedText>
                <ThemedText type="small" themeColor="textSecondary" style={styles.centered}>
                  {t('Every bank payment has been added to a trip, saved as personal or ignored.')}
                </ThemedText>
              </View>
            )}
            {waiting.length > 0 && (
              <ThemedText type="caption" themeColor="textSecondary" style={styles.heading}>
                {t('Tap a payment to see the full message and add it to a trip.')}
              </ThemedText>
            )}
          </View>

          {sorted.length > 0 && (
            <View style={styles.section}>
              <Pressable accessibilityRole="button" onPress={() => setShowSorted(!showSorted)} style={styles.toggle}>
                <ThemedText type="smallBold" themeColor="primary">
                  {showSorted
                    ? t('Hide sorted payments')
                    : plural(t, sorted.length, 'Show {count} sorted payment', 'Show {count} sorted payments')}
                </ThemedText>
              </Pressable>
              {showSorted && <PaymentList payments={sorted} />}
            </View>
          )}
        </>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  grow: {
    flex: 1,
  },
  content: {
    padding: Spacing.three,
    gap: Spacing.four,
    paddingBottom: Spacing.six,
  },
  section: {
    gap: Spacing.two,
  },
  heading: {
    paddingHorizontal: Spacing.two,
  },
  list: {
    borderRadius: Radius.medium,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: Spacing.three + 40 + Spacing.three,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: 64,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  allSorted: {
    alignItems: 'center',
    gap: Spacing.one,
    padding: Spacing.four,
  },
  centered: {
    textAlign: 'center',
  },
  toggle: {
    alignSelf: 'center',
    padding: Spacing.two,
  },
});
