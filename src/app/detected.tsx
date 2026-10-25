import * as Clipboard from 'expo-clipboard';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { DirectionTile, paymentName, signedAmount, sourceLabel, statusLabel } from '@/components/bank-payment-parts';
import { Icon } from '@/components/icon';
import { SettingsRow, SettingsSection } from '@/components/settings';
import { ThemedText } from '@/components/themed-text';
import { showToast } from '@/components/toast';
import { Button, EmptyState, IconButton } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { formatPaise } from '@/domain';
import { useTheme } from '@/hooks/use-theme';
import { plural, useT } from '@/i18n';
import { bankAlertsAvailable, openBankAlertSettings, useBankAlertsEnabled } from '@/notifications/bank-alerts';
import { addDetected, paidOn, settleUpMatches, useDetected, type DetectedPayment } from '@/store/detected';
import { tripsFor } from '@/store/detected-match';
import { addPaymentToTrip, ignorePayment, putBack, savePaymentAsPersonal, settleWithPayment, type Undo } from '@/store/payment-actions';
import { relativeDay } from '@/store/summary';
import { useTrips, type StoredTrip } from '@/store/trips';

/** Shows what just happened, with a tap taking it back. Stays a little longer than other banners. */
function done(title: string, undo: Undo, tapToUndo: string) {
  showToast({ title, body: tapToUndo, icon: 'undo', onPress: undo, visibleMs: 8000 });
}

/** A label and value inside an expanded payment. */
function Detail({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.detail}>
      <ThemedText type="caption" themeColor="textSecondary">
        {label}
      </ThemedText>
      <ThemedText type="small" numberOfLines={1} style={styles.detailValue}>
        {value}
      </ThemedText>
    </View>
  );
}

/**
 * One payment: who, when and how much, with one tap to add it to the likeliest trip, save it as
 * personal or ignore it. Tapping the row opens it in place for the full message and other trips.
 */
function PaymentItem({ payment, expanded, onToggle }: { payment: DetectedPayment; expanded: boolean; onToggle: () => void }) {
  const t = useT();
  const theme = useTheme();
  const allTrips = useTrips();
  const [choosing, setChoosing] = useState(false);
  const credit = payment.direction === 'credit';
  const name = paymentName(payment, t);
  const status = statusLabel(payment, allTrips, t);
  const waiting = payment.status === 'new';
  const trips = credit ? [] : tripsFor(payment, allTrips);
  const matches = credit ? settleUpMatches(allTrips, payment) : [];
  const undoText = t('Tap to undo.');
  const showChoices = expanded || choosing;

  const toTrip = (trip: StoredTrip) => done(t('Added to “{trip}”', { trip: trip.name }), addPaymentToTrip(payment, trip, name), undoText);
  const personal = () => done(t('Added as personal'), savePaymentAsPersonal(payment, name), undoText);
  const ignore = () => done(t('Ignored'), ignorePayment(payment), undoText);
  const settle = (index: number) => {
    const match = matches[index];
    const from = match.trip.members.find((member) => member.id === match.transfer.fromMemberId)?.name ?? t('Someone');
    done(t('{name} paid you {amount}', { name: from, amount: formatPaise(payment.amount) }), settleWithPayment(payment, match), undoText);
  };
  const ower = (index: number) =>
    matches[index].trip.members.find((member) => member.id === matches[index].transfer.fromMemberId)?.name ?? t('Someone');

  return (
    <View>
      <Pressable
        accessibilityRole="button"
        accessibilityState={{ expanded }}
        onPress={onToggle}
        style={({ pressed }) => [styles.row, { backgroundColor: pressed ? theme.backgroundSelected : 'transparent' }]}>
        <DirectionTile payment={payment} size={40} />
        <View style={styles.grow}>
          <ThemedText type="bold" numberOfLines={1}>
            {name}
          </ThemedText>
          <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1}>
            {status ?? `${relativeDay(paidOn(payment), t)} · ${sourceLabel(payment, t)}`}
          </ThemedText>
        </View>
        <ThemedText type="bold" style={{ color: credit ? theme.positive : theme.text }}>
          {signedAmount(payment)}
        </ThemedText>
        <Icon name={expanded ? 'expandLess' : 'expandMore'} size={20} color={theme.textSecondary} />
      </Pressable>

      {waiting && (
        <View style={styles.actions}>
          {credit ? (
            matches.length > 0 && (
              <Button label={t('{name} paid', { name: ower(0) })} icon="check" compact onPress={() => settle(0)} />
            )
          ) : (
            trips.length > 0 && (
              <View style={styles.tripButton}>
                <Button label={trips[0].name} icon="trip" compact onPress={() => toTrip(trips[0])} style={styles.tripMain} />
                {trips.length > 1 && (
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={t('Choose another trip')}
                    onPress={() => setChoosing(!choosing)}
                    style={({ pressed }) => [styles.tripMore, { backgroundColor: theme.primaryFill, opacity: pressed ? 0.8 : 1 }]}>
                    <Icon name={showChoices ? 'expandLess' : 'expandMore'} size={18} color={theme.onPrimary} />
                  </Pressable>
                )}
              </View>
            )
          )}
          {!credit && <Button label={t('Personal')} icon="person" variant="soft" compact onPress={personal} />}
          <Button label={t('Ignore')} icon="close" variant="soft" compact onPress={ignore} />
        </View>
      )}

      {waiting && showChoices && (trips.length > 1 || matches.length > 1) && (
        <View style={styles.choices}>
          <ThemedText type="caption" themeColor="textSecondary" style={styles.choicesTitle}>
            {credit ? t('Or someone else who owes you') : t('Or another trip')}
          </ThemedText>
          <View style={styles.actions}>
            {credit
              ? matches.slice(1).map((match, index) => (
                  <Button
                    key={`${match.trip.id}-${match.transfer.fromMemberId}`}
                    label={`${ower(index + 1)} · ${match.trip.name}`}
                    variant="soft"
                    compact
                    onPress={() => settle(index + 1)}
                  />
                ))
              : trips.slice(1).map((trip) => (
                  <Button key={trip.id} label={trip.name} icon="trip" variant="soft" compact onPress={() => toTrip(trip)} />
                ))}
          </View>
        </View>
      )}

      {expanded && (
        <View style={[styles.expanded, { backgroundColor: theme.background }]}>
          {payment.upiId && <Detail label={t('UPI ID')} value={payment.upiId} />}
          {payment.account && <Detail label={t('Account or card')} value={`••${payment.account}`} />}
          {payment.reference && <Detail label={t('Reference')} value={payment.reference} />}
          <ThemedText type="caption" themeColor="textSecondary" selectable style={styles.message}>
            {payment.text}
          </ThemedText>
          {!waiting && (
            <Button label={t('Put back')} icon="undo" variant="soft" compact onPress={() => putBack(payment)} style={styles.putBack} />
          )}
        </View>
      )}
    </View>
  );
}

function PaymentList({ payments }: { payments: DetectedPayment[] }) {
  const theme = useTheme();
  const [open, setOpen] = useState<string | null>(null);
  return (
    <View style={[styles.list, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
      {payments.map((payment, index) => (
        <View key={payment.id}>
          {index > 0 && <View style={[styles.divider, { backgroundColor: theme.border }]} />}
          <PaymentItem payment={payment} expanded={open === payment.id} onToggle={() => setOpen(open === payment.id ? null : payment.id)} />
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
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.three,
    paddingBottom: Spacing.two,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.three,
  },
  tripButton: {
    flexDirection: 'row',
  },
  tripMain: {
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
    maxWidth: 180,
  },
  tripMore: {
    justifyContent: 'center',
    paddingHorizontal: Spacing.two,
    marginLeft: 1,
    borderTopRightRadius: Radius.pill,
    borderBottomRightRadius: Radius.pill,
  },
  choices: {
    gap: Spacing.two,
  },
  choicesTitle: {
    paddingHorizontal: Spacing.three,
  },
  expanded: {
    gap: Spacing.two,
    marginHorizontal: Spacing.three,
    marginBottom: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.small,
  },
  detail: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    gap: Spacing.three,
  },
  detailValue: {
    flexShrink: 1,
    textAlign: 'right',
  },
  message: {
    marginTop: Spacing.one,
  },
  putBack: {
    alignSelf: 'flex-start',
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
