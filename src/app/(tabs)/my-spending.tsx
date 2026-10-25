import { useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { AppState, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { CategoryBars } from '@/components/category-bars';
import { Icon } from '@/components/icon';
import { SyncBanner } from '@/components/sync-banner';
import { ThemedText } from '@/components/themed-text';
import { CategoryTile } from '@/components/trip/expense-parts';
import { Card, EmptyState, Fab, IconButton, Segmented } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { formatPaise } from '@/domain';
import { useTheme } from '@/hooks/use-theme';
import { plural, useT, type T } from '@/i18n';
import { useDetected } from '@/store/detected';
import { monthKey, monthSummary, shiftMonth, spendingEntries, type SpendingEntry, type SpendingView } from '@/store/my-spending';
import { usePersonalExpenses } from '@/store/personal';
import { MONTH_NAMES, relativeDay } from '@/store/summary';
import { useTrips } from '@/store/trips';

/** Coming back to the app after this long starts again at the current month. */
const FORGET_MONTH_MS = 30 * 60 * 1000;

/**
 * The month being looked at. Android can keep the app in memory for hours, so after a while away
 * it goes back to the current month instead of whichever month was open last.
 */
function useMonth(): [string, (month: string) => void] {
  const current = () => monthKey(new Date().toISOString());
  const [month, setMonth] = useState(current);
  useEffect(() => {
    let leftAt = 0;
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'background') {
        leftAt = Date.now();
      } else if (state === 'active' && leftAt > 0 && Date.now() - leftAt > FORGET_MONTH_MS) {
        setMonth(current());
      }
    });
    return () => subscription.remove();
  }, []);
  return [month, setMonth];
}

function monthLabel(key: string, t: T): string {
  const [year, month] = key.split('-').map(Number);
  return `${t(MONTH_NAMES[month - 1])} ${year}`;
}

/** "‹ October 2026 ›". There is nothing to see after this month. */
function MonthSwitcher({ month, onChange }: { month: string; onChange: (month: string) => void }) {
  const t = useT();
  const theme = useTheme();
  const latest = month >= monthKey(new Date().toISOString());
  return (
    <View style={styles.monthRow}>
      <IconButton icon="chevronLeft" label={t('Previous month')} onPress={() => onChange(shiftMonth(month, -1))} />
      <ThemedText type="bold" style={styles.monthLabel}>
        {monthLabel(month, t)}
      </ThemedText>
      {latest ? (
        <View style={styles.monthSpacer} />
      ) : (
        <IconButton icon="chevronRight" label={t('Next month')} onPress={() => onChange(shiftMonth(month, 1))} color={theme.textSecondary} />
      )}
    </View>
  );
}

function EntryRow({ entry }: { entry: SpendingEntry }) {
  const t = useT();
  const router = useRouter();
  const theme = useTheme();
  const { source } = entry;
  const open = () =>
    source.kind === 'personal'
      ? router.push({ pathname: '/personal-expense', params: { expenseId: source.expenseId } })
      : router.push({ pathname: '/trip/[tripId]/expense-details', params: { tripId: source.tripId, expenseId: source.expenseId } });
  return (
    <Pressable
      accessibilityRole="button"
      onPress={open}
      style={({ pressed }) => [styles.entry, { backgroundColor: pressed ? theme.backgroundSelected : 'transparent' }]}>
      <CategoryTile emoji={entry.category.emoji} size={40} />
      <View style={styles.grow}>
        <ThemedText type="bold" numberOfLines={1}>
          {entry.description}
        </ThemedText>
        <View style={styles.sourceRow}>
          <Icon name={source.kind === 'personal' ? 'person' : 'trip'} size={14} color={theme.textSecondary} />
          <ThemedText type="caption" themeColor="textSecondary" numberOfLines={1} style={styles.grow}>
            {source.kind === 'personal'
              ? t('Personal')
              : `${source.tripName} · ${source.friends ? t('your share') : t('your family’s share')}`}
          </ThemedText>
        </View>
      </View>
      <ThemedText type="bold">{formatPaise(entry.amount)}</ThemedText>
    </Pressable>
  );
}

/** Entries grouped under "Today", "Yesterday" or "18 Oct". */
function EntryList({ entries }: { entries: SpendingEntry[] }) {
  const t = useT();
  const days: { label: string; entries: SpendingEntry[] }[] = [];
  for (const entry of entries) {
    const label = relativeDay(entry.date, t);
    if (days[days.length - 1]?.label === label) {
      days[days.length - 1].entries.push(entry);
    } else {
      days.push({ label, entries: [entry] });
    }
  }
  return (
    <View style={styles.days}>
      {days.map((day) => (
        <View key={day.label} style={styles.day}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            {day.label}
          </ThemedText>
          <Card style={styles.entries}>
            {day.entries.map((entry) => (
              <EntryRow key={entry.key} entry={entry} />
            ))}
          </Card>
        </View>
      ))}
    </View>
  );
}

export default function MySpendingScreen() {
  const t = useT();
  const router = useRouter();
  const theme = useTheme();
  const trips = useTrips();
  const personal = usePersonalExpenses();
  const waiting = useDetected().filter((payment) => payment.status === 'new').length;
  const [view, setView] = useState<SpendingView>('everything');
  const [month, setMonth] = useMonth();

  const summary = monthSummary(spendingEntries(view, trips, personal), month);
  const previous = t(MONTH_NAMES[Number(shiftMonth(month, -1).split('-')[1]) - 1]);
  const difference = summary.total - summary.previousTotal;

  return (
    <View style={styles.grow}>
      <ScrollView contentContainerStyle={styles.content}>
        <SyncBanner />
        <Segmented
          options={[
            { value: 'everything', label: t('Everything') },
            { value: 'personal', label: t('Personal') },
          ]}
          value={view}
          onChange={setView}
        />

        {waiting > 0 && (
          <Pressable accessibilityRole="button" onPress={() => router.push('/detected')}>
            <Card style={styles.bankCard}>
              <ThemedText style={styles.bankEmoji}>🏦</ThemedText>
              <ThemedText type="bold" style={styles.grow}>
                {plural(t, waiting, '{count} bank payment to sort', '{count} bank payments to sort')}
              </ThemedText>
              <Icon name="chevronRight" size={20} color={theme.textSecondary} />
            </Card>
          </Pressable>
        )}

        <MonthSwitcher month={month} onChange={setMonth} />

        <View style={styles.hero}>
          <ThemedText type="caption" themeColor="textSecondary">
            {view === 'personal' ? t('SPENT ON YOUR OWN') : t('TOTAL SPENT')}
          </ThemedText>
          <ThemedText type="amount">{formatPaise(summary.total)}</ThemedText>
          {summary.previousTotal > 0 && (
            <ThemedText type="small" themeColor="textSecondary">
              {difference > 0
                ? t('{amount} more than {month}', { amount: formatPaise(difference), month: previous })
                : difference < 0
                  ? t('{amount} less than {month}', { amount: formatPaise(-difference), month: previous })
                  : t('The same as {month}', { month: previous })}
            </ThemedText>
          )}
        </View>

        {view === 'everything' && summary.total > 0 && (
          <View style={styles.split}>
            <Card style={styles.splitCard}>
              <ThemedText type="caption" themeColor="textSecondary">
                {t('Personal')}
              </ThemedText>
              <ThemedText type="bold">{formatPaise(summary.personal)}</ThemedText>
            </Card>
            <Card style={styles.splitCard}>
              <ThemedText type="caption" themeColor="textSecondary">
                {plural(t, summary.tripCount, 'On {count} trip', 'On {count} trips')}
              </ThemedText>
              <ThemedText type="bold">{formatPaise(summary.trips)}</ThemedText>
            </Card>
          </View>
        )}

        {summary.entries.length === 0 ? (
          <EmptyState
            emoji="🪙"
            title={t('Nothing spent this month')}
            body={
              view === 'personal'
                ? t('Add what you spend on your own, such as groceries or bills, or add a bank payment as personal.')
                : t('Your share of trip expenses and your personal expenses show up here.')
            }
          />
        ) : (
          <>
            <CategoryBars rows={summary.byCategory} />
            <EntryList entries={summary.entries} />
          </>
        )}
      </ScrollView>
      <Fab label={t('Personal expense')} icon="add" bottom={0} onPress={() => router.push('/personal-expense')} />
    </View>
  );
}

const styles = StyleSheet.create({
  grow: {
    flex: 1,
  },
  content: {
    padding: Spacing.three,
    gap: Spacing.three,
    paddingBottom: 96,
  },
  bankCard: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  bankEmoji: {
    fontSize: 24,
    lineHeight: 32,
  },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  monthLabel: {
    flex: 1,
    textAlign: 'center',
  },
  monthSpacer: {
    width: 36,
  },
  hero: {
    alignItems: 'center',
    gap: Spacing.one,
  },
  split: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  splitCard: {
    flex: 1,
    gap: Spacing.half,
  },
  days: {
    gap: Spacing.three,
  },
  day: {
    gap: Spacing.two,
  },
  entries: {
    padding: Spacing.one,
    gap: Spacing.half,
  },
  entry: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.two,
    borderRadius: Radius.small,
  },
  sourceRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
  },
});
