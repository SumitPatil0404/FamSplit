import { useState, type ReactNode } from 'react';
import { Pressable, Share, StyleSheet, View } from 'react-native';

import { confirmDialog } from '@/components/dialog';
import { Icon, type IconName } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { UpiPaySheet } from '@/components/trip/upi-pay';
import { Avatar, Button, Card } from '@/components/ui';
import { Radius, Spacing, type ThemeColor } from '@/constants/theme';
import { formatPaise, type Transfer } from '@/domain';
import { useTheme } from '@/hooks/use-theme';
import { useT, type T } from '@/i18n';
import type { HeadFlow } from '@/store/insights';
import { addPayment, type StoredTrip } from '@/store/trips';
import { isShared, sendReminder } from '@/sync/sync';

export function lookups(trip: StoredTrip, t: T) {
  const member = (memberId: string) => trip.members.find((candidate) => candidate.id === memberId);
  const familyOf = (memberId: string) => trip.families.find((family) => family.id === member(memberId)?.familyId);
  return {
    member,
    name: (memberId: string) => member(memberId)?.name ?? t('Someone'),
    familyName: (memberId: string) => familyOf(memberId)?.name ?? '',
    color: (memberId: string) => familyOf(memberId)?.color ?? '#888888',
  };
}

export type TransferRowProps = {
  trip: StoredTrip;
  transfer: Transfer;
  betweenFamilies?: boolean;
  /** Shown for information only; it cannot be paid or marked as paid yet. */
  locked?: boolean;
  signedIn: boolean;
};

export function TransferRow({ trip, transfer, betweenFamilies, locked, signedIn }: TransferRowProps) {
  const t = useT();
  const { member, name, familyName, color } = lookups(trip, t);
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
      title: t('Mark as paid?'),
      message: t('{from} paid {to} {amount}.', { from, to, amount }),
      confirmLabel: t('Yes, paid'),
      cancelLabel: t('Not yet'),
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
        (betweenFamilies
          ? t('Hi {from}, a reminder from our “{trip}” trip on FamSplit: the {fromFamily} family owes the {toFamily} family {amount}. Please pay {to}.', {
              from,
              trip: trip.name,
              fromFamily: familyName(transfer.fromMemberId),
              toFamily: familyName(transfer.toMemberId),
              amount,
              to,
            })
          : t('Hi {from}, a reminder from our “{trip}” trip on FamSplit: you owe {to} {amount}.', { from, trip: trip.name, to, amount })) +
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
          title: t('Reminder sent'),
          message: t('{from} gets a notification that {amount} is due.', { from, amount }),
          confirmLabel: t('OK'),
          hideCancel: true,
        });
      } else {
        confirmDialog({
          icon: 'bell',
          title: t('{name} is not on FamSplit yet', { name: from }),
          message: t('There is no phone to notify. You can send them a message instead.'),
          confirmLabel: t('Send a message'),
          onConfirm: () => void sendMessage(),
        });
      }
    } catch (error) {
      confirmDialog({
        icon: 'bell',
        title: t('Reminder not sent'),
        message: error instanceof Error ? t(error.message) : t('Something went wrong.'),
        confirmLabel: t('OK'),
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
            {t('{from} pays {to}', { from, to })}
          </ThemedText>
          {betweenFamilies && (
            <ThemedText type="small" themeColor="textSecondary">
              {t('{name} family', { name: familyName(transfer.fromMemberId) })} → {t('{name} family', { name: familyName(transfer.toMemberId) })}
            </ThemedText>
          )}
        </View>
        <ThemedText type="heading" numberOfLines={1}>
          {amount}
        </ThemedText>
      </View>
      {!locked && (
        <View style={styles.actions}>
          {iPay && payeeUpi && <Button label={t('Pay with UPI')} icon="rupee" compact onPress={() => setPaying(true)} />}
          {!iPay && <Button label={t('Remind')} icon="bell" variant="soft" compact onPress={() => void remind()} />}
          <Button label={t('Mark as paid')} icon="check" variant="soft" compact onPress={markPaid} />
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

export function FlowLine({ label, amount, incoming }: { label: string; amount: number; incoming: boolean }) {
  const theme = useTheme();
  if (amount === 0) {
    return null;
  }
  return (
    <View style={styles.row}>
      <View style={[styles.flowIcon, { backgroundColor: incoming ? theme.positiveSoft : theme.negativeSoft }]}>
        <Icon name={incoming ? 'moneyIn' : 'moneyOut'} size={16} color={incoming ? theme.positive : theme.negative} />
      </View>
      <ThemedText type="small" style={styles.grow}>
        {label}
      </ThemedText>
      <ThemedText type="smallBold" themeColor={incoming ? 'positive' : 'negative'}>
        {incoming ? '+' : '−'}
        {formatPaise(amount)}
      </ThemedText>
    </View>
  );
}

/** A family head's money, still to come in and go out. */
export function HeadMoneyCard({ trip, flow }: { trip: StoredTrip; flow: HeadFlow }) {
  const t = useT();
  const { name } = lookups(trip, t);
  const family = trip.families.find((candidate) => candidate.id === flow.familyId);
  return (
    <Card style={styles.card}>
      <View style={styles.row}>
        <Avatar name={name(flow.headId)} color={family?.color ?? '#888888'} size={36} />
        <View style={styles.grow}>
          <ThemedText type="bold">{t('{name} has the family’s money', { name: name(flow.headId) })}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {t('What the head still collects and hands out')}
          </ThemedText>
        </View>
      </View>
      <View style={styles.flows}>
        <FlowLine label={t('Collects from the family')} amount={flow.collectsFromFamily} incoming />
        <FlowLine label={t('Gets from other families')} amount={flow.receivesFromFamilies} incoming />
        <FlowLine label={t('Pays other families')} amount={flow.paysToFamilies} incoming={false} />
        <FlowLine label={t('Hands out to the family')} amount={flow.handsOutToFamily} incoming={false} />
      </View>
    </Card>
  );
}

export type Status = { label: string; tone: 'done' | 'todo' | 'waiting' };

/** "Done", "2 left" or "Waiting for the head", as a small coloured label. */
export function StatusPill({ status }: { status: Status }) {
  const theme = useTheme();
  const look: Record<Status['tone'], { icon: IconName; color: ThemeColor; soft: ThemeColor }> = {
    done: { icon: 'checkCircle', color: 'positive', soft: 'positiveSoft' },
    todo: { icon: 'rupee', color: 'warning', soft: 'warningSoft' },
    waiting: { icon: 'lock', color: 'textSecondary', soft: 'backgroundSelected' },
  };
  const { icon, color, soft } = look[status.tone];
  return (
    <View style={[styles.pill, { backgroundColor: theme[soft] }]}>
      <Icon name={icon} size={14} color={theme[color]} />
      <ThemedText type="caption" numberOfLines={1} style={{ color: theme[color], fontWeight: 700 }}>
        {status.label}
      </ThemedText>
    </View>
  );
}

/** A tappable row that opens a page of its own. */
export function NavRow({
  leading,
  title,
  subtitle,
  status,
  onPress,
}: {
  leading: ReactNode;
  title: string;
  subtitle: string;
  status: Status;
  onPress: () => void;
}) {
  const theme = useTheme();
  return (
    <Pressable accessibilityRole="button" onPress={onPress} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
      <Card style={styles.navRow}>
        {leading}
        <View style={styles.grow}>
          <ThemedText type="bold" numberOfLines={1}>
            {title}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={2}>
            {subtitle}
          </ThemedText>
          <View style={styles.pillRow}>
            <StatusPill status={status} />
          </View>
        </View>
        <Icon name="chevronRight" size={22} color={theme.textSecondary} />
      </Card>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  card: {
    gap: Spacing.three,
  },
  flows: {
    gap: Spacing.two,
  },
  flowIcon: {
    width: 28,
    height: 28,
    borderRadius: 14,
    alignItems: 'center',
    justifyContent: 'center',
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
  grow: {
    flex: 1,
  },
  pill: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    borderRadius: Radius.pill,
  },
  pillRow: {
    flexDirection: 'row',
    marginTop: Spacing.one,
  },
  navRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
});
