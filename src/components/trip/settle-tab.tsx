import { StyleSheet, View } from 'react-native';

import { confirmDialog } from '@/components/dialog';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Avatar, Button, Card, EmptyState } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { formatPaise, type Transfer } from '@/domain';
import { useTheme } from '@/hooks/use-theme';
import type { TripSummary } from '@/store/summary';
import { addPayment, type StoredTrip } from '@/store/trips';

function lookups(trip: StoredTrip) {
  const member = (memberId: string) => trip.members.find((candidate) => candidate.id === memberId);
  const familyOf = (memberId: string) => trip.families.find((family) => family.id === member(memberId)?.familyId);
  return {
    name: (memberId: string) => member(memberId)?.name ?? 'Someone',
    familyName: (memberId: string) => familyOf(memberId)?.name ?? '',
    color: (memberId: string) => familyOf(memberId)?.color ?? '#888888',
  };
}

type TransferRowProps = {
  trip: StoredTrip;
  transfer: Transfer;
  betweenFamilies?: boolean;
  /** Shown for information only; it cannot be marked as paid yet. */
  locked?: boolean;
};

function TransferRow({ trip, transfer, betweenFamilies, locked }: TransferRowProps) {
  const { name, familyName, color } = lookups(trip);
  const from = name(transfer.fromMemberId);
  const to = name(transfer.toMemberId);

  const markPaid = () =>
    confirmDialog({
      icon: 'check',
      title: 'Mark as paid?',
      message: `${from} paid ${to} ${formatPaise(transfer.amount)}.`,
      confirmLabel: 'Yes, paid',
      cancelLabel: 'Not yet',
      onConfirm: () =>
        addPayment(trip.id, {
          fromMemberId: transfer.fromMemberId,
          toMemberId: transfer.toMemberId,
          amount: transfer.amount,
        }),
    });

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
        {!locked && <Button label="Mark as paid" icon="check" variant="soft" compact onPress={markPaid} />}
      </View>
    </View>
  );
}

function Step({ number, title, subtitle, done }: { number: number; title: string; subtitle: string; done: boolean }) {
  const theme = useTheme();
  return (
    <View style={styles.row}>
      <View style={[styles.step, { backgroundColor: done ? theme.positiveSoft : theme.primarySoft }]}>
        {done ? (
          <Icon name="check" size={18} color={theme.positive} />
        ) : (
          <ThemedText type="smallBold" allowFontScaling={false} themeColor="primary">
            {number}
          </ThemedText>
        )}
      </View>
      <View style={styles.grow}>
        <ThemedText type="heading">{title}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {subtitle}
        </ThemedText>
      </View>
    </View>
  );
}

export function SettleTab({ trip, summary }: { trip: StoredTrip; summary: TripSummary }) {
  const theme = useTheme();
  const { name } = lookups(trip);
  const { betweenFamilies, withinFamily, familyNets } = summary.settlement;

  // A family settles internally only after its head has squared up with the other families.
  const internal = trip.families
    .map((family) => ({
      family,
      transfers: withinFamily.get(family.id) ?? [],
      locked: (familyNets.get(family.id) ?? 0) !== 0,
    }))
    .filter(({ transfers }) => transfers.length > 0);
  const headsDone = betweenFamilies.length === 0;

  if (trip.expenses.length === 0 && trip.payments.length === 0) {
    return <EmptyState emoji="🤝" title="Nothing to settle yet" body="Once expenses are added, the payments between family heads show up here." />;
  }

  return (
    <View style={styles.list}>
      <Step number={1} title="Between families" subtitle="Only the family heads pay each other" done={headsDone} />
      {headsDone ? (
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
        <Step
          number={2}
          title="Inside each family"
          subtitle="Can be paid once that family’s head has settled above"
          done={headsDone && internal.length === 0}
        />
      </View>
      {internal.length === 0 && (
        <Card>
          <ThemedText type="bold">Nothing to settle inside any family</ThemedText>
        </Card>
      )}
      {internal.map(({ family, transfers, locked }) => (
        <Card key={family.id} style={styles.familyCard}>
          <View style={styles.row}>
            <Avatar name={family.name} color={family.color} size={30} />
            <ThemedText type="smallBold" themeColor="textSecondary" style={styles.grow}>
              {family.name} family
            </ThemedText>
            {locked && <Icon name="lock" size={18} color={theme.textSecondary} />}
          </View>
          {locked && (
            <ThemedText type="small" themeColor="textSecondary">
              These can be paid once {name(family.headId)} has settled with the other families.
            </ThemedText>
          )}
          <View style={[styles.familyCard, locked && styles.locked]}>
            {transfers.map((transfer) => (
              <TransferRow
                key={`${transfer.fromMemberId}-${transfer.toMemberId}`}
                trip={trip}
                transfer={transfer}
                locked={locked}
              />
            ))}
          </View>
        </Card>
      ))}

      {trip.payments.length > 0 && (
        <ThemedText type="caption" themeColor="textSecondary" style={styles.note}>
          Payments marked as paid are listed under Expenses, where they can be undone.
        </ThemedText>
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
  locked: {
    opacity: 0.55,
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
  step: {
    width: 32,
    height: 32,
    borderRadius: 16,
    alignItems: 'center',
    justifyContent: 'center',
  },
  note: {
    textAlign: 'center',
  },
});
