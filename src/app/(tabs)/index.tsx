import { Stack, useRouter } from 'expo-router';
import { useEffect } from 'react';
import { Pressable, RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { confirmDialog } from '@/components/dialog';
import { Icon } from '@/components/icon';
import { SyncBanner } from '@/components/sync-banner';
import { ThemedText } from '@/components/themed-text';
import { BalancePill, Button, Card, EmptyState, Fab, IconButton, Tag } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { formatPaise } from '@/domain';
import { useTheme } from '@/hooks/use-theme';
import { plural, useT } from '@/i18n';
import { hasSeenWelcome } from '@/store/onboarding';
import { summarizeTrip } from '@/store/summary';
import { createSampleTrip, deleteTrip, isFriendsTrip, useTrips, type StoredTrip } from '@/store/trips';
import { isShared, usePullToSync, useSync } from '@/sync/sync';

function TripCard({ trip }: { trip: StoredTrip }) {
  const router = useRouter();
  const theme = useTheme();
  const sync = useSync();
  const t = useT();
  const { myFamilyNet, totalSpent, incomplete } = summarizeTrip(trip);
  const friends = isFriendsTrip(trip);

  // Someone else's trip can only be left; your own is deleted for everyone.
  const leaving = isShared(trip.id) && trip.createdBy !== undefined && trip.createdBy !== sync.session?.user.id;
  const confirmDelete = () =>
    confirmDialog({
      icon: leaving ? 'logout' : 'delete',
      tone: 'danger',
      title: leaving ? t('Leave "{name}"?', { name: trip.name }) : t('Delete "{name}"?', { name: trip.name }),
      message: leaving
        ? t('It is removed from this phone. Everyone else keeps it, and you can join again with the code.')
        : isShared(trip.id)
          ? t('All its people, expenses and payments are deleted for everyone on the trip.')
          : t('All its people, expenses and payments will be removed from this phone.'),
      confirmLabel: leaving ? t('Leave trip') : t('Delete trip'),
      onConfirm: () => deleteTrip(trip.id),
    });

  return (
    <Pressable
      accessibilityRole="button"
      onPress={() => router.push(`/trip/${trip.id}`)}
      onLongPress={confirmDelete}
      style={({ pressed }) => ({ opacity: pressed ? 0.7 : 1 })}>
      <Card>
        <View style={styles.row}>
          <View style={[styles.tile, { backgroundColor: friends ? theme.infoSoft : theme.primarySoft }]}>
            <Icon name={friends ? 'group' : 'family'} size={24} color={friends ? theme.info : theme.primary} />
          </View>
          <View style={styles.grow}>
            <ThemedText type="bold">{trip.name}</ThemedText>
            <View style={styles.meta}>
              <Tag label={friends ? t('Friends') : t('Families')} />
              <ThemedText type="small" themeColor="textSecondary">
                {friends
                  ? plural(t, trip.members.length, '{count} person', '{count} people')
                  : `${plural(t, trip.families.length, '{count} family', '{count} families')} · ${plural(t, trip.members.length, '{count} person', '{count} people')}`}
              </ThemedText>
            </View>
          </View>
          <Icon name="chevronRight" size={20} color={theme.textSecondary} />
        </View>
        <View style={[styles.row, styles.footer]}>
          <BalancePill
            amount={myFamilyNet}
            positive={friends ? t('You get back {amount}') : t('Your family gets back {amount}')}
            negative={friends ? t('You owe {amount}') : t('Your family owes {amount}')}
            settled={
              incomplete
                ? t('Still syncing…')
                : totalSpent === 0
                  ? t('No expenses yet')
                  : !trip.meId
                    ? t('Tell us who you are')
                    : friends
                      ? t('You are settled')
                      : t('Your family is settled')
            }
          />
          <ThemedText type="small" numberOfLines={1} themeColor="textSecondary">
            {t('{amount} spent', { amount: formatPaise(totalSpent) })}
          </ThemedText>
        </View>
      </Card>
    </Pressable>
  );
}

export default function TripsScreen() {
  const router = useRouter();
  const trips = useTrips();
  const sync = useSync();
  const t = useT();

  // The first time FamSplit opens on a phone, explain how it works before anything else.
  useEffect(() => {
    if (!hasSeenWelcome()) {
      router.push('/welcome');
    }
  }, [router]);

  const header = (
    <Stack.Screen
      options={{
        headerRight: () =>
          sync.session ? (
            <IconButton icon="person" label={t('Account')} onPress={() => router.push('/account')} />
          ) : sync.configured ? (
            <Button label={t('Sign in')} variant="soft" compact onPress={() => router.push('/account')} />
          ) : null,
      }}
    />
  );
  const pull = usePullToSync();
  const refresh = sync.session ? <RefreshControl {...pull} /> : undefined;

  if (trips.length === 0) {
    return (
      <ScrollView contentContainerStyle={styles.emptyContent} refreshControl={refresh}>
        {header}
        <EmptyState
          emoji="🧳"
          title={t('Plan your first trip')}
          body={t('Add your family or friends. Everyone logs what they spend, and FamSplit works out who pays whom at the end.')}>
          <Button label={t('Create a trip')} icon="add" onPress={() => router.push('/new-trip')} style={styles.emptyButton} />
          {sync.configured && (
            <Button
              label={t('Join with a code')}
              icon="link"
              variant="soft"
              onPress={() => router.push('/join')}
              style={styles.emptyButton}
            />
          )}
          <Button
            label={t('Try a sample trip')}
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
      <ScrollView contentContainerStyle={[styles.content, styles.roomForButton]} refreshControl={refresh}>
        <ThemedText type="title">{t('Your trips')}</ThemedText>
        <SyncBanner />
        {sync.configured && !sync.session && (
          <Card>
            <ThemedText type="bold">{t('Travelling with others?')}</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {t('Sign in so your family or friends can join your trips with a code and everyone sees the same expenses.')}
            </ThemedText>
            <Button label={t('Sign in')} variant="soft" compact onPress={() => router.push('/account')} style={styles.start} />
          </Card>
        )}
        {trips.map((trip) => (
          <TripCard key={trip.id} trip={trip} />
        ))}
        {sync.configured && (
          <Button label={t('Join with a code')} icon="link" variant="soft" onPress={() => router.push('/join')} />
        )}
        <ThemedText type="caption" themeColor="textSecondary" style={styles.hint}>
          {t('Press and hold a trip to delete or leave it')}
        </ThemedText>
      </ScrollView>
      <Fab label={t('New trip')} icon="add" bottom={0} onPress={() => router.push('/new-trip')} />
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
  // The tab bar keeps clear of the phone's edge, so only the New trip button needs room.
  roomForButton: {
    paddingBottom: 96,
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
  meta: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: Spacing.two,
    marginTop: Spacing.half,
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
