import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { confirmDialog } from '@/components/dialog';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { CategoryTile } from '@/components/trip/expense-parts';
import { Avatar, Card, Emphasis, EmptyState, IconButton } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { expenseShares, formatPaise, type Split } from '@/domain';
import { useTheme } from '@/hooks/use-theme';
import { useT, type T } from '@/i18n';
import { describeActivity } from '@/store/activity';
import { categoryOf } from '@/store/categories';
import { formatDay } from '@/store/summary';
import { deleteExpense, isFriendsTrip, useTrip, type StoredExpense, type StoredTrip } from '@/store/trips';

function splitTitle(type: Split['type'], t: T): string {
  switch (type) {
    case 'equal':
      return t('Split equally per person');
    case 'perFamily':
      return t('Split equally per family');
    case 'shares':
      return t('Split by shares');
    case 'exact':
      return t('Split by exact amounts');
  }
}

/** Empty when the expense refers to people who have not been downloaded yet. */
function sharesOf(expense: StoredExpense, trip: StoredTrip): Map<string, number> {
  try {
    return expenseShares(expense, trip);
  } catch {
    return new Map();
  }
}

function SectionTitle({ children }: { children: string }) {
  return (
    <ThemedText type="caption" themeColor="textSecondary" style={styles.sectionTitle}>
      {children.toUpperCase()}
    </ThemedText>
  );
}

function ExpenseDetails({ trip, expense }: { trip: StoredTrip; expense: StoredExpense }) {
  const t = useT();
  const router = useRouter();
  const theme = useTheme();
  const category = categoryOf(expense);
  const shares = sharesOf(expense, trip);
  const finalised = Boolean(trip.finalizedAt);

  const member = (memberId: string) => trip.members.find((candidate) => candidate.id === memberId);
  const familyColor = (memberId: string) =>
    trip.families.find((family) => family.id === member(memberId)?.familyId)?.color ?? theme.textSecondary;
  const nameOf = (memberId: string) => {
    const name = member(memberId)?.name ?? t('Someone who has left');
    return memberId === trip.meId ? t('{name} (you)', { name }) : name;
  };
  const payers = Object.keys(expense.paidBy).filter((memberId) => expense.paidBy[memberId] > 0);

  const history = (trip.activity ?? []).flatMap((entry) => {
    const row = entry.after ?? entry.before;
    if (entry.entity !== 'expense' || row?.id !== expense.id) {
      return [];
    }
    const line = describeActivity(entry, trip, t);
    return line ? [{ entry, line }] : [];
  });

  const edit = () =>
    router.push({ pathname: '/trip/[tripId]/expense', params: { tripId: trip.id, expenseId: expense.id } });
  const confirmDelete = () =>
    confirmDialog({
      icon: 'delete',
      tone: 'danger',
      title: t('Delete this expense?'),
      message: t('Everyone’s balances will be recalculated.'),
      confirmLabel: t('Delete expense'),
      onConfirm: () => {
        router.back();
        deleteExpense(trip.id, expense.id);
      },
    });

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Stack.Screen
        options={{
          title: '',
          headerRight: finalised
            ? undefined
            : () => (
                <View style={styles.headerButtons}>
                  <IconButton icon="edit" label={t('Edit expense')} onPress={edit} />
                  <IconButton icon="delete" label={t('Delete expense')} color={theme.negative} onPress={confirmDelete} />
                </View>
              ),
        }}
      />

      <View style={styles.hero}>
        <CategoryTile emoji={category.emoji} size={72} />
        <ThemedText type="heading" style={styles.centered}>
          {expense.description}
        </ThemedText>
        <ThemedText type="amount">{formatPaise(expense.amount)}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {t(category.label)} · {formatDay(expense.date, t)}
        </ThemedText>
      </View>

      {finalised && (
        <Card style={styles.row}>
          <Icon name="lock" size={18} color={theme.textSecondary} />
          <ThemedText type="small" themeColor="textSecondary" style={styles.grow}>
            {t('The trip is finalised. Reopen it to change or delete this expense.')}
          </ThemedText>
        </Card>
      )}

      <View>
        <SectionTitle>{t('Paid by')}</SectionTitle>
        <Card style={styles.list}>
          {payers.map((memberId) => (
            <View key={memberId} style={styles.row}>
              <Avatar name={member(memberId)?.name ?? '?'} color={familyColor(memberId)} size={32} />
              <ThemedText style={styles.grow} numberOfLines={1}>
                {nameOf(memberId)}
              </ThemedText>
              <ThemedText type="bold">{formatPaise(expense.paidBy[memberId])}</ThemedText>
            </View>
          ))}
        </Card>
      </View>

      <View>
        <SectionTitle>{splitTitle(expense.split.type, t)}</SectionTitle>
        <Card style={styles.list}>
          {trip.families.map((family) => {
            const people = trip.members.filter((candidate) => candidate.familyId === family.id && (shares.get(candidate.id) ?? 0) > 0);
            if (people.length === 0) {
              return null;
            }
            const total = people.reduce((sum, person) => sum + (shares.get(person.id) ?? 0), 0);
            // On a friends trip each "family" is one person, so a single line says it all.
            if (isFriendsTrip(trip)) {
              return (
                <View key={family.id} style={styles.row}>
                  <Avatar name={people[0].name} color={family.color} size={32} />
                  <ThemedText style={styles.grow} numberOfLines={1}>
                    {nameOf(people[0].id)}
                  </ThemedText>
                  <ThemedText type="bold">{formatPaise(total)}</ThemedText>
                </View>
              );
            }
            return (
              <View key={family.id} style={styles.family}>
                <View style={styles.row}>
                  <Avatar name={family.name} color={family.color} size={32} />
                  <ThemedText type="bold" style={styles.grow} numberOfLines={1}>
                    {t('{name} family', { name: family.name })}
                  </ThemedText>
                  <ThemedText type="bold">{formatPaise(total)}</ThemedText>
                </View>
                {people.map((person) => (
                  <View key={person.id} style={[styles.row, styles.person]}>
                    <ThemedText type="small" themeColor="textSecondary" style={styles.grow} numberOfLines={1}>
                      {nameOf(person.id)}
                    </ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {formatPaise(shares.get(person.id) ?? 0)}
                    </ThemedText>
                  </View>
                ))}
              </View>
            );
          })}
        </Card>
      </View>

      {history.length > 0 && (
        <View>
          <SectionTitle>{t('History')}</SectionTitle>
          <Card style={styles.list}>
            {history.map(({ entry, line }) => (
              <View key={entry.id}>
                <Emphasis text={line.what} bold={line.who} small />
                <ThemedText type="caption" themeColor="textSecondary">
                  {formatDay(entry.at, t)}
                  {line.detail ? ` · ${line.detail}` : ''}
                </ThemedText>
              </View>
            ))}
          </Card>
        </View>
      )}
    </ScrollView>
  );
}

export default function ExpenseDetailsScreen() {
  const t = useT();
  const { tripId, expenseId } = useLocalSearchParams<{ tripId: string; expenseId: string }>();
  const trip = useTrip(tripId);
  const expense = trip?.expenses.find((candidate) => candidate.id === expenseId);

  if (!trip || !expense) {
    return <EmptyState emoji="🧾" title={t('Expense not found')} body={t('It may have been deleted.')} />;
  }
  return <ExpenseDetails trip={trip} expense={expense} />;
}

const styles = StyleSheet.create({
  content: {
    padding: Spacing.three,
    gap: Spacing.four,
  },
  headerButtons: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  hero: {
    alignItems: 'center',
    gap: Spacing.one,
    paddingTop: Spacing.two,
  },
  centered: {
    textAlign: 'center',
  },
  sectionTitle: {
    marginBottom: Spacing.two,
    marginLeft: Spacing.one,
  },
  list: {
    gap: Spacing.three,
  },
  family: {
    gap: Spacing.two,
  },
  person: {
    paddingLeft: 32 + Spacing.three,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  grow: {
    flex: 1,
  },
});
