import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { confirmDialog } from '@/components/dialog';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { ExpensesTab } from '@/components/trip/expenses-tab';
import { FamiliesTab } from '@/components/trip/families-tab';
import { SettleTab } from '@/components/trip/settle-tab';
import { Button, Card, EmptyState, Fab, IconButton, Segmented } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { formatPaise } from '@/domain';
import { useTheme } from '@/hooks/use-theme';
import { formatDay, plural, summarizeTrip, type TripSummary } from '@/store/summary';
import { canFinalize, reopenTrip, useTrip, type StoredTrip } from '@/store/trips';
import { usePullToSync, useSync } from '@/sync/sync';

type Tab = 'expenses' | 'families' | 'settle';

function Hero({ trip, summary }: { trip: StoredTrip; summary: TripSummary }) {
  const theme = useTheme();
  const { myFamily, myFamilyNet, totalSpent } = summary;
  const who = myFamily ? `${myFamily.name} family` : 'Your family';
  const status = summary.incomplete
    ? 'Still syncing this trip…'
    : totalSpent === 0
      ? 'Add an expense to get started'
      : myFamilyNet > 0
        ? `${who} gets back ${formatPaise(myFamilyNet)}`
        : myFamilyNet < 0
          ? `${who} owes ${formatPaise(-myFamilyNet)}`
          : `${who} is all settled`;

  return (
    <View style={[styles.hero, { backgroundColor: theme.primary }]}>
      <ThemedText type="caption" style={styles.heroMuted}>
        TOTAL SPENT
      </ThemedText>
      <ThemedText type="amount" style={{ color: theme.onPrimary }}>
        {formatPaise(totalSpent)}
      </ThemedText>
      <View style={styles.heroPill}>
        <ThemedText type="smallBold" style={{ color: theme.onPrimary }}>
          {status}
        </ThemedText>
      </View>
      <ThemedText type="caption" style={styles.heroMuted}>
        {plural(trip.families.length, 'family', 'families')} · {plural(trip.members.length, 'person', 'people')} ·{' '}
        {plural(trip.expenses.length, 'expense', 'expenses')}
      </ThemedText>
    </View>
  );
}

export default function TripScreen() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const trip = useTrip(tripId);
  const sync = useSync();
  const pull = usePullToSync();
  const [tab, setTab] = useState<Tab>('expenses');

  if (!trip) {
    return <EmptyState emoji="🤔" title="Trip not found" body="It may have been deleted from this phone." />;
  }

  const summary = summarizeTrip(trip);
  const addExpense = () => router.push({ pathname: '/trip/[tripId]/expense', params: { tripId } });
  const addFamily = () => router.push({ pathname: '/trip/[tripId]/family', params: { tripId } });
  const editFamily = (familyId: string) =>
    router.push({ pathname: '/trip/[tripId]/family', params: { tripId, familyId } });
  const chooseMe = () => router.push({ pathname: '/trip/[tripId]/who', params: { tripId } });
  const openActivity = () => router.push({ pathname: '/trip/[tripId]/activity', params: { tripId } });
  const openRename = () => router.push({ pathname: '/trip/[tripId]/rename', params: { tripId } });
  const finalised = Boolean(trip.finalizedAt);
  const confirmReopen = () =>
    confirmDialog({
      icon: 'lockOpen',
      title: 'Reopen this trip?',
      message: 'Expenses can be added and changed again, which may change what everyone owes.',
      confirmLabel: 'Reopen trip',
      onConfirm: () => reopenTrip(trip.id),
    });

  return (
    <View style={styles.grow}>
      <Stack.Screen
        options={{
          title: trip.name,
          headerRight: () => (
            <View style={styles.headerButtons}>
              <IconButton icon="edit" label="Rename trip" onPress={openRename} />
              <IconButton icon="history" label="Activity" onPress={openActivity} />
            </View>
          ),
        }}
      />
      <ScrollView
        contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 104 }]}
        refreshControl={sync.session ? <RefreshControl {...pull} /> : undefined}>
        <Hero trip={trip} summary={summary} />
        {trip.finalizedAt && (
          <Card>
            <View style={styles.row}>
              <Icon name="lock" size={20} />
              <ThemedText type="bold" style={styles.grow}>
                Finalised on {formatDay(trip.finalizedAt)}
              </ThemedText>
            </View>
            <ThemedText type="small" themeColor="textSecondary">
              Expenses are locked. Payments can still be marked as paid under Settle up.
            </ThemedText>
            {canFinalize(trip, sync.session?.user.id) && (
              <Button label="Reopen trip" icon="lockOpen" variant="soft" compact onPress={confirmReopen} style={styles.start} />
            )}
          </Card>
        )}
        {!trip.meId && (
          <Card>
            <ThemedText type="bold">Which one is you?</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Pick yourself to see what your family owes or gets back.
            </ThemedText>
            <Button label="Choose" variant="soft" compact onPress={chooseMe} style={styles.start} />
          </Card>
        )}
        <Segmented
          value={tab}
          onChange={setTab}
          options={[
            { value: 'expenses', label: 'Expenses' },
            { value: 'families', label: 'Families' },
            { value: 'settle', label: 'Settle up' },
          ]}
        />
        {tab === 'expenses' && (
          <ExpensesTab trip={trip} finalised={finalised} onAddFamily={addFamily} onAddExpense={addExpense} />
        )}
        {tab === 'families' && (
          <FamiliesTab
            trip={trip}
            summary={summary}
            finalised={finalised}
            onAddFamily={addFamily}
            onEditFamily={editFamily}
            onChooseMe={chooseMe}
          />
        )}
        {tab === 'settle' && <SettleTab trip={trip} summary={summary} />}
      </ScrollView>
      {tab !== 'settle' && !finalised && (
        <Fab label="Add expense" icon="add" bottom={insets.bottom} onPress={addExpense} />
      )}
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
  },
  start: {
    alignSelf: 'flex-start',
    marginTop: Spacing.one,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  headerButtons: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  hero: {
    borderRadius: Radius.large,
    padding: Spacing.four,
    gap: Spacing.two,
  },
  heroMuted: {
    color: '#FFFFFFCC',
    letterSpacing: 0.5,
  },
  heroPill: {
    alignSelf: 'flex-start',
    backgroundColor: '#FFFFFF2E',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radius.pill,
  },
});
