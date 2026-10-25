import * as Clipboard from 'expo-clipboard';
import { Stack, useRouter } from 'expo-router';
import { useState } from 'react';
import { Modal, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { DirectionTile, paymentName, signedAmount, sourceLabel, statusLabel } from '@/components/bank-payment-parts';
import { Icon, type IconName } from '@/components/icon';
import { SettingsRow, SettingsSection } from '@/components/settings';
import { ThemedText } from '@/components/themed-text';
import { showToast } from '@/components/toast';
import { EmptyState, IconButton } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { formatPaise } from '@/domain';
import { useTheme } from '@/hooks/use-theme';
import { plural, useT } from '@/i18n';
import { bankAlertsAvailable, openBankAlertSettings, useBankAlertsEnabled } from '@/notifications/bank-alerts';
import { addDetected, paidOn, settleUpMatches, useDetected, type DetectedPayment } from '@/store/detected';
import { tripsFor } from '@/store/detected-match';
import { addPaymentToTrip, ignorePayment, putBack, savePaymentAsPersonal, settleWithPayment, type Undo } from '@/store/payment-actions';
import { relativeDay } from '@/store/summary';
import { isFriendsTrip, useTrips, type StoredTrip } from '@/store/trips';

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

/** A short button for sorting a payment: small text, sized to its label. `filled` is for the likeliest choice. */
function Pill({ label, icon, onPress, filled, style }: { label: string; icon?: IconName; onPress: () => void; filled?: boolean; style?: object }) {
  const theme = useTheme();
  const color = filled ? theme.onPrimary : theme.primary;
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={4}
      onPress={onPress}
      style={({ pressed }) => [
        styles.pill,
        { backgroundColor: filled ? theme.primaryFill : theme.primarySoft, opacity: pressed ? 0.75 : 1 },
        style,
      ]}>
      {icon && <Icon name={icon} size={14} color={color} />}
      <ThemedText type="caption" numberOfLines={1} style={[styles.pillText, { color }]}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

/**
 * Every open trip a payment could go to, best fit first, in a dialog over the list. Picking one adds
 * the payment there straight away.
 */
function TripPicker({
  payment,
  trips,
  onPick,
  onClose,
}: {
  payment: DetectedPayment;
  trips: StoredTrip[];
  onPick: (trip: StoredTrip) => void;
  onClose: () => void;
}) {
  const t = useT();
  const theme = useTheme();
  return (
    <Modal transparent visible animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <Pressable accessibilityLabel={t('Close')} onPress={onClose} style={styles.backdrop}>
        {/* Swallows taps so pressing the card itself does not close it. */}
        <Pressable onPress={() => {}} style={[styles.dialog, { backgroundColor: theme.backgroundElement }]}>
          <ThemedText type="heading" style={styles.centered}>
            {t('Which trip was {amount} for?', { amount: formatPaise(payment.amount) })}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" style={styles.centered}>
            {paymentName(payment, t)}
          </ThemedText>
          <ScrollView style={styles.dialogList} contentContainerStyle={styles.dialogListContent}>
            {trips.map((trip, index) => (
              <Pressable
                key={trip.id}
                accessibilityRole="button"
                onPress={() => onPick(trip)}
                style={({ pressed }) => [styles.dialogRow, { backgroundColor: pressed ? theme.backgroundSelected : theme.background }]}>
                <Icon name={isFriendsTrip(trip) ? 'group' : 'family'} size={20} color={theme.primary} />
                <ThemedText type="bold" numberOfLines={1} style={styles.grow}>
                  {trip.name}
                </ThemedText>
                {index === 0 && (
                  <ThemedText type="caption" themeColor="primary">
                    {t('Suggested')}
                  </ThemedText>
                )}
              </Pressable>
            ))}
          </ScrollView>
          <Pill label={t('Cancel')} onPress={onClose} style={styles.dialogCancel} />
        </Pressable>
      </Pressable>
    </Modal>
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
  const [picking, setPicking] = useState(false);
  const credit = payment.direction === 'credit';
  const name = paymentName(payment, t);
  const status = statusLabel(payment, allTrips, t);
  const waiting = payment.status === 'new';
  const trips = credit ? [] : tripsFor(payment, allTrips);
  const matches = credit ? settleUpMatches(allTrips, payment) : [];
  const undoText = t('Tap to undo.');

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
        {/* ✕ at the top corner, the amount right under it. */}
        <View style={styles.corner}>
          {waiting ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('Ignore')}
              hitSlop={10}
              onPress={ignore}
              style={({ pressed }) => [styles.ignore, { backgroundColor: theme.backgroundSelected, opacity: pressed ? 0.6 : 1 }]}>
              <Icon name="close" size={12} color={theme.textSecondary} />
            </Pressable>
          ) : (
            <Icon name={expanded ? 'expandLess' : 'expandMore'} size={18} color={theme.textSecondary} />
          )}
          <ThemedText type="bold" style={{ color: credit ? theme.positive : theme.text }}>
            {signedAmount(payment)}
          </ThemedText>
        </View>
      </Pressable>

      {waiting && (credit ? matches.length > 0 : true) && (
        <View style={[styles.actions, styles.actionsRight]}>
          {credit ? (
            <Pill label={t('{name} paid', { name: ower(0) })} icon="check" filled onPress={() => settle(0)} />
          ) : (
            <>
              {trips.length > 0 && (
                <View style={styles.tripButton}>
                  <Pill
                    label={trips[0].name}
                    icon="trip"
                    filled
                    onPress={() => toTrip(trips[0])}
                    style={trips.length > 1 ? styles.tripMain : undefined}
                  />
                  {trips.length > 1 && (
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t('Choose another trip')}
                      hitSlop={4}
                      onPress={() => setPicking(true)}
                      style={({ pressed }) => [styles.tripMore, { backgroundColor: theme.primaryFill, opacity: pressed ? 0.75 : 1 }]}>
                      <Icon name="expandMore" size={14} color={theme.onPrimary} />
                    </Pressable>
                  )}
                </View>
              )}
              <Pill label={t('Personal')} icon="person" onPress={personal} />
            </>
          )}
        </View>
      )}

      {picking && (
        <TripPicker
          payment={payment}
          trips={trips}
          onPick={(trip) => {
            setPicking(false);
            toTrip(trip);
          }}
          onClose={() => setPicking(false)}
        />
      )}

      {waiting && expanded && matches.length > 1 && (
        <View style={styles.choices}>
          <ThemedText type="caption" themeColor="textSecondary" style={styles.choicesTitle}>
            {t('Or someone else who owes you')}
          </ThemedText>
          <View style={styles.actions}>
            {matches.slice(1).map((match, index) => (
              <Pill
                key={`${match.trip.id}-${match.transfer.fromMemberId}`}
                label={`${ower(index + 1)} · ${match.trip.name}`}
                onPress={() => settle(index + 1)}
              />
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
          {!waiting && <Pill label={t('Put back')} icon="undo" onPress={() => putBack(payment)} style={styles.putBack} />}
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
    paddingLeft: Spacing.three,
    paddingRight: Spacing.two,
    paddingTop: Spacing.two,
    paddingBottom: Spacing.two,
  },
  corner: {
    alignItems: 'flex-end',
    gap: Spacing.one,
  },
  actionsRight: {
    justifyContent: 'flex-end',
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
    paddingHorizontal: Spacing.three,
    paddingBottom: Spacing.three,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.three,
    paddingVertical: 6,
    borderRadius: Radius.pill,
    maxWidth: 170,
  },
  pillText: {
    fontWeight: 700,
  },
  ignore: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: 'center',
    justifyContent: 'center',
  },
  tripButton: {
    flexDirection: 'row',
  },
  tripMain: {
    borderTopRightRadius: 0,
    borderBottomRightRadius: 0,
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
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
    backgroundColor: '#0F0E1799',
  },
  dialog: {
    alignSelf: 'stretch',
    maxWidth: 420,
    maxHeight: '80%',
    gap: Spacing.two,
    padding: Spacing.four,
    borderRadius: Radius.large,
  },
  dialogList: {
    marginTop: Spacing.two,
  },
  dialogListContent: {
    gap: Spacing.two,
  },
  dialogRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: 52,
    paddingHorizontal: Spacing.three,
    borderRadius: Radius.medium,
  },
  dialogCancel: {
    alignSelf: 'center',
    marginTop: Spacing.two,
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
