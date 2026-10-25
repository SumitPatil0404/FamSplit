import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { confirmDialog } from '@/components/dialog';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Avatar, Card, EmptyState, Tag } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { formatPaise } from '@/domain';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/i18n';
import { markDetected, settleUpMatches, useDetected, type DetectedPayment } from '@/store/detected';
import { addPayment, isFriendsTrip, useTrips } from '@/store/trips';

/** A debit becomes an expense: pick the trip, then the expense page opens filled in. */
function ChooseTrip({ payment }: { payment: DetectedPayment }) {
  const router = useRouter();
  const theme = useTheme();
  const t = useT();
  const trips = useTrips().filter((trip) => !trip.finalizedAt);

  if (trips.length === 0) {
    return <EmptyState emoji="🧳" title={t('No open trips')} body={t('Create a trip first, then add this payment to it.')} />;
  }
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: t('Add to a trip') }} />
      <ThemedText type="heading">{t('Which trip was {amount} for?', { amount: formatPaise(payment.amount) })}</ThemedText>
      <Card style={styles.list}>
        {trips.map((trip) => (
          <Pressable
            key={trip.id}
            accessibilityRole="button"
            onPress={() => router.replace({ pathname: '/trip/[tripId]/expense', params: { tripId: trip.id, alertId: payment.id } })}
            style={({ pressed }) => [styles.row, { backgroundColor: pressed ? theme.backgroundSelected : 'transparent' }]}>
            <Icon name={isFriendsTrip(trip) ? 'group' : 'family'} size={22} color={theme.primary} />
            <ThemedText style={styles.grow} numberOfLines={1}>
              {trip.name}
            </ThemedText>
            <Icon name="chevronRight" size={20} color={theme.textSecondary} />
          </Pressable>
        ))}
      </Card>
    </ScrollView>
  );
}

/** A credit is someone settling up: pick which payment it was, and it is marked as paid. */
function ChooseSettleUp({ payment }: { payment: DetectedPayment }) {
  const router = useRouter();
  const theme = useTheme();
  const t = useT();
  const matches = settleUpMatches(useTrips(), payment);
  const amount = formatPaise(payment.amount);

  if (matches.length === 0) {
    return (
      <EmptyState
        emoji="🔍"
        title={t('No settle-up matches this')}
        body={t('Nobody on your trips owes you {amount}. If it was for a trip, record it from the trip’s Settle up tab.', { amount })}
      />
    );
  }
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: t('Mark as paid') }} />
      <View style={styles.intro}>
        <ThemedText type="heading">{t('Who paid you {amount}?', { amount })}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {t('Choose the settle-up this money was for.')}
        </ThemedText>
      </View>
      <Card style={styles.list}>
        {matches.map(({ trip, transfer, byName, byAmount }, index) => {
          const from = trip.members.find((member) => member.id === transfer.fromMemberId);
          const color = trip.families.find((family) => family.id === from?.familyId)?.color ?? theme.primary;
          const name = from?.name ?? t('Someone');
          const choose = () =>
            confirmDialog({
              icon: 'check',
              title: t('Mark as paid?'),
              message: t('{from} paid you {amount} on “{trip}”.', { from: name, amount, trip: trip.name }),
              confirmLabel: t('Yes, paid'),
              cancelLabel: t('Not yet'),
              onConfirm: () => {
                addPayment(trip.id, { fromMemberId: transfer.fromMemberId, toMemberId: transfer.toMemberId, amount: payment.amount });
                markDetected(payment.id, 'added', trip.id);
                router.back();
              },
            });
          return (
            <Pressable
              key={`${trip.id}-${transfer.fromMemberId}`}
              accessibilityRole="button"
              onPress={choose}
              style={({ pressed }) => [styles.row, { backgroundColor: pressed ? theme.backgroundSelected : 'transparent' }]}>
              <Avatar name={name} color={color} size={36} />
              <View style={styles.grow}>
                <ThemedText numberOfLines={2}>
                  {t('{name} owes you {amount}', { name, amount: formatPaise(transfer.amount) })}
                </ThemedText>
                <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1}>
                  {trip.name}
                </ThemedText>
              </View>
              {index === 0 && byName && byAmount && <Tag label={t('Best match')} />}
            </Pressable>
          );
        })}
      </Card>
    </ScrollView>
  );
}

export default function DetectedUseScreen() {
  const t = useT();
  const { alertId } = useLocalSearchParams<{ alertId: string }>();
  const payment = useDetected().find((candidate) => candidate.id === alertId);

  if (!payment || payment.status !== 'new') {
    return <EmptyState emoji="✅" title={t('Already sorted')} body={t('This payment has been added or ignored.')} />;
  }
  return payment.direction === 'credit' ? <ChooseSettleUp payment={payment} /> : <ChooseTrip payment={payment} />;
}

const styles = StyleSheet.create({
  grow: {
    flex: 1,
  },
  content: {
    padding: Spacing.three,
    gap: Spacing.four,
  },
  intro: {
    gap: Spacing.one,
  },
  list: {
    padding: Spacing.two,
    gap: Spacing.half,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: 56,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.small,
  },
});
