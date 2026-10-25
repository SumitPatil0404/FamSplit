import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { confirmDialog } from '@/components/dialog';
import { ThemedText } from '@/components/themed-text';
import { CategoryTile } from '@/components/trip/expense-parts';
import { Button, Card, EmptyState } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { expenseShares, formatPaise } from '@/domain';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/i18n';
import { categoryOf } from '@/store/categories';
import { formatDay } from '@/store/summary';
import { deletePayment, isFriendsTrip, type StoredExpense, type StoredPayment, type StoredTrip } from '@/store/trips';

/** Empty when the expense refers to people who have not been downloaded yet. */
function sharesOf(expense: StoredExpense, trip: StoredTrip): Map<string, number> {
  try {
    return expenseShares(expense, trip);
  } catch {
    return new Map();
  }
}

function ExpenseRow({ trip, expense }: { trip: StoredTrip; expense: StoredExpense }) {
  const t = useT();
  const router = useRouter();

  const nameOf = (memberId: string) => trip.members.find((member) => member.id === memberId)?.name ?? t('Someone');
  const payers = Object.keys(expense.paidBy).filter((memberId) => expense.paidBy[memberId] > 0);
  const paidBy = payers.length > 1 ? `${nameOf(payers[0])} +${payers.length - 1}` : nameOf(payers[0]);

  // What this expense did to my family's position: paid by us minus our share.
  const myFamilyId = trip.members.find((member) => member.id === trip.meId)?.familyId;
  const mine = new Set(trip.members.filter((member) => member.familyId === myFamilyId).map((member) => member.id));
  let effect = 0;
  let involved = false;
  for (const memberId of payers) {
    if (mine.has(memberId)) {
      effect += expense.paidBy[memberId];
      involved = true;
    }
  }
  sharesOf(expense, trip).forEach((share, memberId) => {
    if (mine.has(memberId) && share > 0) {
      effect -= share;
      involved = true;
    }
  });

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/trip/[tripId]/expense-details', params: { tripId: trip.id, expenseId: expense.id } })}
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
      <Card style={styles.row}>
        <CategoryTile emoji={categoryOf(expense).emoji} />
        <View style={styles.grow}>
          <ThemedText type="bold">{expense.description}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {formatDay(expense.date, t)} · {t('{name} paid {amount}', { name: paidBy, amount: formatPaise(expense.amount) })}
          </ThemedText>
        </View>
        <View style={styles.effect}>
          {!involved || effect === 0 ? (
            <ThemedText type="caption" numberOfLines={1} themeColor="textSecondary">
              {involved ? t('even') : t('not involved')}
            </ThemedText>
          ) : (
            <>
              <ThemedText type="caption" numberOfLines={1} themeColor={effect > 0 ? 'positive' : 'negative'}>
                {effect > 0 ? t('you lent') : t('you borrowed')}
              </ThemedText>
              <ThemedText type="smallBold" numberOfLines={1} themeColor={effect > 0 ? 'positive' : 'negative'}>
                {formatPaise(Math.abs(effect))}
              </ThemedText>
            </>
          )}
        </View>
      </Card>
    </Pressable>
  );
}

/** A settlement payment, shown in the same list so the trip reads as one timeline. */
function PaymentRow({ trip, payment }: { trip: StoredTrip; payment: StoredPayment }) {
  const t = useT();
  const theme = useTheme();
  const from = trip.members.find((member) => member.id === payment.fromMemberId);
  const to = trip.members.find((member) => member.id === payment.toMemberId);
  const fromName = from?.name ?? t('Someone');
  const toName = to?.name ?? t('someone');
  const family = trip.families.find((candidate) => candidate.id === from?.familyId);
  const where = isFriendsTrip(trip)
    ? t('Settled up')
    : from && to && from.familyId === to.familyId
      ? t('Inside the {name} family', { name: family?.name ?? '' })
      : t('Between families');

  const confirmUndo = () =>
    confirmDialog({
      icon: 'undo',
      tone: 'danger',
      title: t('Undo this payment?'),
      message: t('{from} will owe {to} {amount} again.', { from: fromName, to: toName, amount: formatPaise(payment.amount) }),
      confirmLabel: t('Undo payment'),
      cancelLabel: t('Keep it'),
      onConfirm: () => deletePayment(trip.id, payment.id),
    });

  return (
    <Pressable accessibilityRole="button" onPress={confirmUndo} style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
      <Card style={styles.row}>
        <View style={[styles.tile, { backgroundColor: theme.positiveSoft }]}>
          <ThemedText allowFontScaling={false} style={styles.emoji}>
            🤝
          </ThemedText>
        </View>
        <View style={styles.grow}>
          <ThemedText type="bold">
            {t('{from} paid {to}', { from: fromName, to: toName })}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {formatDay(payment.date, t)} · {where}
          </ThemedText>
        </View>
        <View style={styles.effect}>
          <ThemedText type="caption" numberOfLines={1} themeColor="positive">
            {t('settled')}
          </ThemedText>
          <ThemedText type="smallBold" numberOfLines={1} themeColor="positive">
            {formatPaise(payment.amount)}
          </ThemedText>
        </View>
      </Card>
    </Pressable>
  );
}

type Props = {
  trip: StoredTrip;
  /** A finalised trip is read-only, so nothing here invites adding. */
  finalised: boolean;
  onAddFamily: () => void;
  onAddExpense: () => void;
};

export function ExpensesTab({ trip, finalised, onAddFamily, onAddExpense }: Props) {
  const t = useT();
  if (finalised && trip.expenses.length === 0 && trip.payments.length === 0) {
    return <EmptyState emoji="🔒" title={t('No expenses')} body={t('This trip was finalised without any expenses. Reopen it to add some.')} />;
  }

  const friends = isFriendsTrip(trip);
  const nothingYet = trip.expenses.length === 0 && trip.payments.length === 0;
  const aloneSoFar = trip.families.length < 2;
  if (aloneSoFar && nothingYet) {
    return (
      <EmptyState
        emoji="🙌"
        title={t('Who is coming along?')}
        body={
          friends
            ? t('Add the people on this trip, or share the invite code under People. Then start adding expenses.')
            : 'Add the other families on this trip, then start adding expenses.'
        }>
        <Button
          label={friends ? t('Add people') : t('Add a family')}
          icon={friends ? 'personAdd' : 'groupAdd'}
          onPress={onAddFamily}
          style={styles.cta}
        />
      </EmptyState>
    );
  }

  if (nothingYet) {
    return (
      <EmptyState
        emoji="🧾"
        title={t('No expenses yet')}
        body={friends ? t('Add the first thing someone paid for.') : t('Add the first thing someone paid for. Anyone in any family can be the payer.')}>
        <Button label={t('Add an expense')} icon="add" onPress={onAddExpense} style={styles.cta} />
      </EmptyState>
    );
  }

  const timeline = [
    ...trip.expenses.map((item) => ({ kind: 'expense' as const, item })),
    ...trip.payments.map((item) => ({ kind: 'payment' as const, item })),
  ].sort((a, b) => b.item.date.localeCompare(a.item.date));

  return (
    <View style={styles.list}>
      {/* Expenses can arrive before anyone else is added, for example from bank payments; show them and nudge. */}
      {aloneSoFar && !finalised && (
        <Card style={styles.row}>
          <View style={styles.grow}>
            <ThemedText type="bold">{friends ? t('Only you so far') : t('Only your family so far')}</ThemedText>
            <ThemedText type="caption" themeColor="textSecondary">
              {friends ? t('Add the others to split these expenses with them.') : t('Add the other families to split these expenses with them.')}
            </ThemedText>
          </View>
          <Button
            label={friends ? t('Add people') : t('Add a family')}
            icon={friends ? 'personAdd' : 'groupAdd'}
            variant="soft"
            compact
            onPress={onAddFamily}
          />
        </Card>
      )}
      {!friends && (
        <ThemedText type="caption" themeColor="textSecondary">
          {t('“You” means your whole family on this trip')}
        </ThemedText>
      )}
      {timeline.map((entry) =>
        entry.kind === 'expense' ? (
          <ExpenseRow key={entry.item.id} trip={trip} expense={entry.item} />
        ) : (
          <PaymentRow key={entry.item.id} trip={trip} payment={entry.item} />
        ),
      )}
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: Spacing.two,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  grow: {
    flex: 1,
  },
  tile: {
    width: 44,
    height: 44,
    borderRadius: Radius.small,
    alignItems: 'center',
    justifyContent: 'center',
  },
  emoji: {
    fontSize: 22,
    lineHeight: 28,
  },
  effect: {
    alignItems: 'flex-end',
  },
  cta: {
    marginTop: Spacing.two,
  },
});
