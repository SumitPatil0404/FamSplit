import { Stack, useRouter } from 'expo-router';
import { Alert, Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { BalancePill, Button, Card, EmptyState, Fab, IconButton } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { formatPaise } from '@/domain';
import { useTheme } from '@/hooks/use-theme';
import { plural, summarizeTrip } from '@/store/summary';
import { createSampleTrip, deleteTrip, useTrips, type StoredTrip } from '@/store/trips';
import { isShared, syncNow, useSync } from '@/sync/sync';

function TripCard({ trip }: { trip: StoredTrip }) {
  const router = useRouter();
  const theme = useTheme();
  const sync = useSync();
  const { myFamilyNet, totalSpent } = summarizeTrip(trip);

  // Someone else's trip can only be left; your own is deleted for everyone.
  const leaving = isShared(trip.id) && trip.createdBy !== sync.session?.user.id;
  const confirmDelete = () =>
    Alert.alert(
      leaving ? `Leave "${trip.name}"?` : `Delete "${trip.name}"?`,
      leaving
        ? 'It is removed from this phone. The other families keep it, and you can join again with the code.'
        : isShared(trip.id)
          ? 'All its families, expenses and payments are deleted for everyone on the trip.'
          : 'All its families, expenses and payments will be removed from this phone.',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: leaving ? 'Leave' : 'Delete', style: 'destructive', onPress: () => deleteTrip(trip.id) },
      ],
    );

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(`/trip/${trip.id}`)}
      onLongPress={confirmDelete}
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
      <Card>
        <View style={styles.row}>
          <View style={[styles.tile, { backgroundColor: theme.primarySoft }]}>
            <Icon name="trip" size={24} color={theme.primary} />
          </View>
          <View style={styles.grow}>
            <ThemedText type="bold">{trip.name}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {plural(trip.families.length, 'family', 'families')} · {plural(trip.members.length, 'person', 'people')}
            </ThemedText>
          </View>
          <Icon name="chevronRight" size={20} color={theme.textSecondary} />
        </View>
        <View style={[styles.row, styles.footer]}>
          <BalancePill
            amount={myFamilyNet}
            positive="Your family gets back"
            negative="Your family owes"
            settled={totalSpent === 0 ? 'No expenses yet' : trip.meId ? 'Your family is settled' : 'Tell us who you are'}
          />
          <ThemedText type="small" numberOfLines={1} themeColor="textSecondary">
            {formatPaise(totalSpent)} spent
          </ThemedText>
        </View>
      </Card>
    </Pressable>
  );
}

export default function TripsScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const trips = useTrips();
  const sync = useSync();

  const header = (
    <Stack.Screen
      options={{
        headerRight: () =>
          sync.session ? (
            <IconButton icon="person" label="Account" onPress={() => router.push('/account')} />
          ) : sync.configured ? (
            <Button label="Sign in" variant="soft" compact onPress={() => router.push('/account')} />
          ) : null,
      }}
    />
  );
  const refresh = sync.session ? (
    <RefreshControl refreshing={sync.status === 'syncing'} onRefresh={() => void syncNow()} />
  ) : undefined;

  if (trips.length === 0) {
    return (
      <ScrollView contentContainerStyle={styles.emptyContent} refreshControl={refresh}>
        {header}
        <EmptyState
          emoji="🧳"
          title="Plan your first trip"
          body="Add the families travelling together. Everyone logs what they spend, and only the family heads settle up at the end.">
          <Button label="Create a trip" icon="add" onPress={() => router.push('/new-trip')} style={styles.emptyButton} />
          {sync.configured && (
            <Button
              label="Join with a code"
              icon="link"
              variant="soft"
              onPress={() => router.push('/join')}
              style={styles.emptyButton}
            />
          )}
          <Button
            label="Try a sample trip"
            variant="soft"
            onPress={() => router.push(`/trip/${createSampleTrip()}`)}
            style={styles.emptyButton}
          />
        </EmptyState>
      </ScrollView>
    );
  }

  return (
    <View style={styles.grow}>
      {header}
      <ScrollView contentContainerStyle={[styles.content, { paddingBottom: insets.bottom + 96 }]} refreshControl={refresh}>
        <ThemedText type="title">Your trips</ThemedText>
        {sync.error && (
          <ThemedText type="small" themeColor="negative">
            {sync.error}
          </ThemedText>
        )}
        {sync.configured && !sync.session && (
          <Card>
            <ThemedText type="bold">Travelling with other families?</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Sign in so they can join your trips with a code and everyone sees the same expenses.
            </ThemedText>
            <Button label="Sign in" variant="soft" compact onPress={() => router.push('/account')} style={styles.start} />
          </Card>
        )}
        {trips.map((trip) => (
          <TripCard key={trip.id} trip={trip} />
        ))}
        {sync.configured && (
          <Button label="Join with a code" icon="link" variant="soft" onPress={() => router.push('/join')} />
        )}
        <ThemedText type="caption" themeColor="textSecondary" style={styles.hint}>
          Press and hold a trip to delete or leave it
        </ThemedText>
      </ScrollView>
      <Fab label="New trip" icon="add" bottom={insets.bottom} onPress={() => router.push('/new-trip')} />
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
  emptyContent: {
    flexGrow: 1,
    justifyContent: 'center',
    padding: Spacing.three,
  },
  emptyButton: {
    alignSelf: 'stretch',
    marginTop: Spacing.two,
  },
  start: {
    alignSelf: 'flex-start',
    marginTop: Spacing.one,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  footer: {
    justifyContent: 'space-between',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  tile: {
    width: 48,
    height: 48,
    borderRadius: Radius.medium,
    alignItems: 'center',
    justifyContent: 'center',
  },
  hint: {
    textAlign: 'center',
  },
});
