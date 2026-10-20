import { useState } from 'react';
import { Share, StyleSheet, View } from 'react-native';

import { confirmDialog } from '@/components/dialog';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { UpiPaySheet } from '@/components/trip/upi-pay';
import { Avatar, Button, Card, EmptyState } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { formatPaise, type Transfer } from '@/domain';
import { shareTripSummary } from '@/export/share';
import { useTheme } from '@/hooks/use-theme';
import type { TripSummary } from '@/store/summary';
import { addPayment, canFinalize, finalizeTrip, type StoredTrip } from '@/store/trips';
import { isShared, sendReminder, useSync } from '@/sync/sync';

function lookups(trip: StoredTrip) {
  const member = (memberId: string) => trip.members.find((candidate) => candidate.id === memberId);
  const familyOf = (memberId: string) => trip.families.find((family) => family.id === member(memberId)?.familyId);
  return {
    member,
    name: (memberId: string) => member(memberId)?.name ?? 'Someone',
    familyName: (memberId: string) => familyOf(memberId)?.name ?? '',
    color: (memberId: string) => familyOf(memberId)?.color ?? '#888888',
  };
}

type TransferRowProps = {
  trip: StoredTrip;
  transfer: Transfer;
  betweenFamilies?: boolean;
  /** Shown for information only; it cannot be paid or marked as paid yet. */
  locked?: boolean;
  signedIn: boolean;
};

function TransferRow({ trip, transfer, betweenFamilies, locked, signedIn }: TransferRowProps) {
  const { member, name, familyName, color } = lookups(trip);
  const from = name(transfer.fromMemberId);
  const to = name(transfer.toMemberId);
  const amount = formatPaise(transfer.amount);
  const payeeUpi = member(transfer.toMemberId)?.upiId;
  const [paying, setPaying] = useState(false);

  // "Mine" means anyone in the family of whoever is using this phone.
  const myFamilyId = member(trip.meId)?.familyId;
  const iPay = myFamilyId !== undefined && member(transfer.fromMemberId)?.familyId === myFamilyId;

  const markPaid = () =>
    confirmDialog({
      icon: 'check',
      title: 'Mark as paid?',
      message: `${from} paid ${to} ${amount}.`,
      confirmLabel: 'Yes, paid',
      cancelLabel: 'Not yet',
      onConfirm: () =>
        addPayment(trip.id, {
          fromMemberId: transfer.fromMemberId,
          toMemberId: transfer.toMemberId,
          amount: transfer.amount,
        }),
    });

  const sendMessage = () =>
    Share.share({
      message:
        `Hi ${from}, a reminder from our “${trip.name}” trip on FamSplit: ` +
        (betweenFamilies
          ? `the ${familyName(transfer.fromMemberId)} family owes the ${familyName(transfer.toMemberId)} family ${amount}. Please pay ${to}.`
          : `you owe ${to} ${amount}.`) +
        (payeeUpi ? ` UPI: ${payeeUpi}` : ''),
    });

  // A reminder is a push notification to their phone. Only someone who does not use the app, or
  // a trip that is not shared, falls back to a message through another app.
  const remind = async () => {
    if (!signedIn || !isShared(trip.id)) {
      void sendMessage();
      return;
    }
    try {
      const phones = await sendReminder(trip.id, transfer);
      if (phones > 0) {
        confirmDialog({
          icon: 'bell',
          title: 'Reminder sent',
          message: `${from} gets a notification that ${amount} is due.`,
          confirmLabel: 'OK',
          hideCancel: true,
        });
      } else {
        confirmDialog({
          icon: 'bell',
          title: `${from} is not on FamSplit yet`,
          message: 'There is no phone to notify. You can send them a message instead.',
          confirmLabel: 'Send a message',
          onConfirm: () => void sendMessage(),
        });
      }
    } catch (error) {
      confirmDialog({
        icon: 'bell',
        title: 'Reminder not sent',
        message: error instanceof Error ? error.message : 'Something went wrong.',
        confirmLabel: 'OK',
        hideCancel: true,
      });
    }
  };

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
        <ThemedText type="heading" numberOfLines={1}>
          {amount}
        </ThemedText>
      </View>
      {!locked && (
        <View style={styles.actions}>
          {iPay && payeeUpi && <Button label="Pay with UPI" icon="rupee" compact onPress={() => setPaying(true)} />}
          {!iPay && <Button label="Remind" icon="bell" variant="soft" compact onPress={() => void remind()} />}
          <Button label="Mark as paid" icon="check" variant="soft" compact onPress={markPaid} />
        </View>
      )}
      {paying && payeeUpi && (
        <UpiPaySheet
          payee={to}
          upiId={payeeUpi}
          amount={transfer.amount}
          note={`FamSplit: ${trip.name}`}
          onClose={() => setPaying(false)}
          onMarkPaid={markPaid}
        />
      )}
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
  const sync = useSync();
  const [exporting, setExporting] = useState(false);
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

  const confirmFinalize = () =>
    confirmDialog({
      icon: 'lock',
      title: 'Finalise this trip?',
      message: 'Expenses can no longer be added or changed, so the amounts below stay put. Payments can still be marked as paid, and the trip can be reopened later.',
      confirmLabel: 'Finalise trip',
      onConfirm: () => finalizeTrip(trip.id),
    });

  const exportPdf = async () => {
    setExporting(true);
    try {
      await shareTripSummary(trip);
    } catch (error) {
      confirmDialog({
        icon: 'pdf',
        title: 'Could not make the PDF',
        message: error instanceof Error ? error.message : 'Something went wrong.',
        confirmLabel: 'OK',
        hideCancel: true,
      });
    }
    setExporting(false);
  };

  return (
    <View style={styles.list}>
      {!trip.finalizedAt && (
        <Card>
          <ThemedText type="bold">Is the trip over?</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {canFinalize(trip, sync.session?.user.id)
              ? 'Finalise it to lock the expenses, so these amounts stay put while everyone pays.'
              : 'The trip’s creator or a family head can finalise it, which locks the expenses while everyone pays.'}
          </ThemedText>
          {canFinalize(trip, sync.session?.user.id) && (
            <Button label="Finalise trip" icon="lock" variant="soft" compact onPress={confirmFinalize} style={styles.start} />
          )}
        </Card>
      )}

      <Step number={1} title="Between families" subtitle="Only the family heads pay each other" done={headsDone} />
      {headsDone ? (
        <Card>
          <ThemedText type="bold">🎉 All families are settled</ThemedText>
        </Card>
      ) : (
        betweenFamilies.map((transfer) => (
          <Card key={`${transfer.fromFamilyId}-${transfer.toFamilyId}`}>
            <TransferRow trip={trip} transfer={transfer} betweenFamilies signedIn={sync.session !== null} />
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
                signedIn={sync.session !== null}
              />
            ))}
          </View>
        </Card>
      ))}

      <Button
        label={exporting ? 'Making the PDF…' : 'Share summary as PDF'}
        icon="pdf"
        variant="soft"
        disabled={exporting}
        onPress={() => void exportPdf()}
        style={styles.section}
      />
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
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'flex-end',
    gap: Spacing.two,
  },
  start: {
    alignSelf: 'flex-start',
    marginTop: Spacing.one,
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
