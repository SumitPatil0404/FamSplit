import { Alert, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Avatar, Button, Card, EmptyState, IconButton } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { formatPaise, type Transfer } from '@/domain';
import { formatDay, type TripSummary } from '@/store/summary';
import { addPayment, deletePayment, type StoredTrip } from '@/store/trips';

function lookups(trip: StoredTrip) {
  const member = (memberId: string) => trip.members.find((candidate) => candidate.id === memberId);
  const familyOf = (memberId: string) => trip.families.find((family) => family.id === member(memberId)?.familyId);
  return {
    name: (memberId: string) => member(memberId)?.name ?? 'Someone',
    familyName: (memberId: string) => familyOf(memberId)?.name ?? '',
    color: (memberId: string) => familyOf(memberId)?.color ?? '#888888',
  };
}

function TransferRow({ trip, transfer, betweenFamilies }: { trip: StoredTrip; transfer: Transfer; betweenFamilies?: boolean }) {
  const { name, familyName, color } = lookups(trip);
  const from = name(transfer.fromMemberId);
  const to = name(transfer.toMemberId);

  const markPaid = () =>
    Alert.alert('Mark as paid?', `${from} paid ${to} ${formatPaise(transfer.amount)}.`, [
      { text: 'Not yet', style: 'cancel' },
      {
        text: 'Yes, paid',
        onPress: () =>
          addPayment(trip.id, {
            fromMemberId: transfer.fromMemberId,
            toMemberId: transfer.toMemberId,
            amount: transfer.amount,
          }),
      },
    ]);

  return (
    <View style={styles.transfer}>
      <View style={styles.row}>
        <Avatar name={betweenFamilies ? familyName(transfer.fromMemberId) : from} color={color(transfer.fromMemberId)} size={36} />
        <View style={styles.grow}>
          <ThemedText type="bold">
            {from} pays {to}
          </ThemedText>
          {betweenFamilies && (
            <ThemedText type="small" themeColor="textSecondary">
              {familyName(transfer.fromMemberId)} family → {familyName(transfer.toMemberId)} family
            </ThemedText>
          )}
        </View>
      </View>
      <View style={[styles.row, styles.spread]}>
        <ThemedText type="heading" numberOfLines={1}>
          {formatPaise(transfer.amount)}
        </ThemedText>
        <Button label="Mark as paid" icon="check" variant="soft" compact onPress={markPaid} />
      </View>
    </View>
  );
}

export function SettleTab({ trip, summary }: { trip: StoredTrip; summary: TripSummary }) {
  const { name } = lookups(trip);
  const { betweenFamilies, withinFamily } = summary.settlement;
  const internal = trip.families
    .map((family) => ({ family, transfers: withinFamily.get(family.id) ?? [] }))
    .filter(({ transfers }) => transfers.length > 0);

  if (trip.expenses.length === 0) {
    return <EmptyState emoji="🤝" title="Nothing to settle yet" body="Once expenses are added, the payments between family heads show up here." />;
  }

  return (
    <View style={styles.list}>
      <View>
        <ThemedText type="heading">Between families</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Only the family heads pay each other
        </ThemedText>
      </View>
      {betweenFamilies.length === 0 ? (
        <Card>
          <ThemedText type="bold">🎉 All families are settled</ThemedText>
        </Card>
      ) : (
        betweenFamilies.map((transfer) => (
          <Card key={`${transfer.fromFamilyId}-${transfer.toFamilyId}`}>
            <TransferRow trip={trip} transfer={transfer} betweenFamilies />
          </Card>
        ))
      )}

      <View style={styles.section}>
        <ThemedText type="heading">Inside each family</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Each family squares up through its own head
        </ThemedText>
      </View>
      {internal.length === 0 && (
        <Card>
          <ThemedText type="bold">Nothing to settle inside any family</ThemedText>
        </Card>
      )}
      {internal.map(({ family, transfers }) => (
        <Card key={family.id} style={styles.familyCard}>
          <View style={styles.row}>
            <Avatar name={family.name} color={family.color} size={30} />
            <ThemedText type="smallBold" themeColor="textSecondary">
              {family.name} family
            </ThemedText>
          </View>
          {transfers.map((transfer) => (
            <TransferRow key={`${transfer.fromMemberId}-${transfer.toMemberId}`} trip={trip} transfer={transfer} />
          ))}
        </Card>
      ))}

      {trip.payments.length > 0 && (
        <>
          <View style={styles.section}>
            <ThemedText type="heading">Payments made</ThemedText>
          </View>
          <Card>
            {trip.payments.map((payment) => (
              <View key={payment.id} style={styles.row}>
                <View style={styles.grow}>
                  <ThemedText>
                    {name(payment.fromMemberId)} paid {name(payment.toMemberId)}
                  </ThemedText>
                  <ThemedText type="small" themeColor="textSecondary">
                    {formatDay(payment.date)} · {formatPaise(payment.amount)}
                  </ThemedText>
                </View>
                <IconButton icon="undo" label="Undo this payment" onPress={() => deletePayment(trip.id, payment.id)} />
              </View>
            ))}
          </Card>
        </>
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: Spacing.three,
  },
  section: {
    marginTop: Spacing.three,
  },
  familyCard: {
    gap: Spacing.three,
  },
  transfer: {
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  spread: {
    justifyContent: 'space-between',
    flexWrap: 'wrap',
  },
  grow: {
    flex: 1,
  },
});
