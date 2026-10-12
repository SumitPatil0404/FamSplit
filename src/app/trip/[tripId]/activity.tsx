import { useLocalSearchParams, useRouter } from 'expo-router';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Avatar, Button, Card, EmptyState } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { describeActivity } from '@/store/activity';
import { formatDay } from '@/store/summary';
import { useTrip } from '@/store/trips';
import { isShared, usePullToSync, useSync } from '@/sync/sync';

function formatTime(iso: string): string {
  const date = new Date(iso);
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${formatDay(iso)}, ${date.getHours() % 12 || 12}:${minutes} ${date.getHours() < 12 ? 'am' : 'pm'}`;
}

export default function ActivityScreen() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const router = useRouter();
  const trip = useTrip(tripId);
  const sync = useSync();
  const pull = usePullToSync();

  if (!trip) {
    return <EmptyState emoji="🤔" title="Trip not found" body="It may have been deleted from this phone." />;
  }

  if (!sync.session || !isShared(trip.id)) {
    return (
      <EmptyState
        emoji="🕑"
        title="Activity starts once the trip is shared"
        body="When a trip is on the server, it keeps a record of who added, changed or deleted what.">
        {sync.configured && !sync.session && (
          <Button label="Sign in" onPress={() => router.replace('/account')} style={styles.button} />
        )}
      </EmptyState>
    );
  }

  const colorOf = (memberId: string | null) => {
    const familyId = trip.members.find((member) => member.id === memberId)?.familyId;
    return trip.families.find((family) => family.id === familyId)?.color ?? '#8E8CA3';
  };
  const lines = (trip.activity ?? []).flatMap((entry) => {
    const line = describeActivity(entry, trip);
    return line ? [{ entry, line }] : [];
  });

  return (
    <ScrollView
      contentContainerStyle={styles.content}
      refreshControl={<RefreshControl {...pull} />}>
      {lines.length === 0 ? (
        <EmptyState
          emoji="🕑"
          title="Nothing recorded yet"
          body="Changes show up here as they happen. If this stays empty, the database may still need its latest update."
        />
      ) : (
        <Card style={styles.card}>
          {lines.map(({ entry, line }) => (
            <View key={entry.id} style={styles.row}>
              <Avatar name={line.who} color={colorOf(entry.actorMemberId)} size={32} />
              <View style={styles.grow}>
                <ThemedText>
                  <ThemedText type="bold">{line.who}</ThemedText> {line.what}
                </ThemedText>
                {line.detail && (
                  <ThemedText type="small" themeColor="textSecondary">
                    {line.detail}
                  </ThemedText>
                )}
                <ThemedText type="caption" themeColor="textSecondary">
                  {formatTime(entry.at)}
                </ThemedText>
              </View>
            </View>
          ))}
        </Card>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: Spacing.three,
    gap: Spacing.three,
  },
  card: {
    gap: Spacing.three,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: Spacing.three,
  },
  grow: {
    flex: 1,
  },
  button: {
    marginTop: Spacing.two,
  },
});
