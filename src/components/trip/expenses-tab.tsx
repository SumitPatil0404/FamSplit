import { useRouter } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Card, EmptyState } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { expenseShares, formatPaise } from '@/domain';
import { useTheme } from '@/hooks/use-theme';
import { formatDay } from '@/store/summary';
import type { StoredExpense, StoredTrip } from '@/store/trips';

const EMOJI: [RegExp, string][] = [
  [/cab|taxi|auto|uber|ola|fuel|petrol|diesel|toll|bus|train|parking/i, '🚕'],
  [/flight|plane|airfare|airline/i, '✈️'],
  [/hotel|villa|stay|room|resort|rent|airbnb|homestay/i, '🏠'],
  [/grocer|vegetable|milk|supermarket|kirana/i, '🛒'],
  [/dinner|lunch|breakfast|food|restaurant|meal|snack|pizza|biryani/i, '🍽️'],
  [/tea|chai|coffee|drink|juice|bar|beer/i, '☕'],
  [/ticket|boat|ride|entry|park|movie|show|tour|safari/i, '🎟️'],
  [/shop|gift|souvenir|cloth/i, '🛍️'],
  [/medic|doctor|pharma/i, '💊'],
];

function emojiFor(description: string): string {
  return EMOJI.find(([pattern]) => pattern.test(description))?.[1] ?? '🧾';
}

function ExpenseRow({ trip, expense }: { trip: StoredTrip; expense: StoredExpense }) {
  const router = useRouter();
  const theme = useTheme();

  const nameOf = (memberId: string) => trip.members.find((member) => member.id === memberId)?.name ?? 'Someone';
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
  expenseShares(expense, trip).forEach((share, memberId) => {
    if (mine.has(memberId) && share > 0) {
      effect -= share;
      involved = true;
    }
  });

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push({ pathname: '/trip/[tripId]/expense', params: { tripId: trip.id, expenseId: expense.id } })}
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
      <Card style={styles.row}>
        <View style={[styles.tile, { backgroundColor: theme.backgroundSelected }]}>
          <ThemedText allowFontScaling={false} style={styles.emoji}>
            {emojiFor(expense.description)}
          </ThemedText>
        </View>
        <View style={styles.grow}>
          <ThemedText type="bold">{expense.description}</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {formatDay(expense.date)} · {paidBy} paid {formatPaise(expense.amount)}
          </ThemedText>
        </View>
        <View style={styles.effect}>
          {!involved || effect === 0 ? (
            <ThemedText type="caption" numberOfLines={1} themeColor="textSecondary">
              {involved ? 'even' : 'not involved'}
            </ThemedText>
          ) : (
            <>
              <ThemedText type="caption" numberOfLines={1} themeColor={effect > 0 ? 'positive' : 'negative'}>
                {effect > 0 ? 'you lent' : 'you borrowed'}
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

export function ExpensesTab({ trip, onAddFamily, onAddExpense }: { trip: StoredTrip; onAddFamily: () => void; onAddExpense: () => void }) {
  if (trip.families.length < 2) {
    return (
      <EmptyState
        emoji="🙌"
        title="Who is coming along?"
        body="Add the other families on this trip, then start adding expenses.">
        <Button label="Add a family" icon="groupAdd" onPress={onAddFamily} style={styles.cta} />
      </EmptyState>
    );
  }

  if (trip.expenses.length === 0) {
    return (
      <EmptyState emoji="🧾" title="No expenses yet" body="Add the first thing someone paid for. Anyone in any family can be the payer.">
        <Button label="Add an expense" icon="add" onPress={onAddExpense} style={styles.cta} />
      </EmptyState>
    );
  }

  return (
    <View style={styles.list}>
      <ThemedText type="caption" themeColor="textSecondary">
        “You” means your whole family on this trip
      </ThemedText>
      {trip.expenses.map((expense) => (
        <ExpenseRow key={expense.id} trip={trip} expense={expense} />
      ))}
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
