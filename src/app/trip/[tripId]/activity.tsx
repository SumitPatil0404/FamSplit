import { useLocalSearchParams, useRouter } from 'expo-router';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, EmptyState } from '@/components/ui';
import { Radius, Spacing, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { describeActivity, type ActivityKind, type ActivityLine } from '@/store/activity';
import { formatDay } from '@/store/summary';
import { useTrip, type ActivityEntry } from '@/store/trips';
import { isShared, usePullToSync, useSync } from '@/sync/sync';

function formatTime(iso: string): string {
  const date = new Date(iso);
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${date.getHours() % 12 || 12}:${minutes} ${date.getHours() < 12 ? 'am' : 'pm'}`;
}

function dayHeading(iso: string): string {
  const day = new Date(iso).toDateString();
  const today = new Date();
  if (day === today.toDateString()) {
    return 'Today';
  }
  today.setDate(today.getDate() - 1);
  return day === today.toDateString() ? 'Yesterday' : formatDay(iso);
}

/** Each kind of change gets its own colour and icon, so the log can be scanned at a glance. */
const LOOKS: Record<ActivityKind, { icon: IconName; color: ThemeColor; soft: ThemeColor; label: string }> = {
  added: { icon: 'add', color: 'positive', soft: 'positiveSoft', label: 'added' },
  changed: { icon: 'edit', color: 'warning', soft: 'warningSoft', label: 'edited' },
  removed: { icon: 'delete', color: 'negative', soft: 'negativeSoft', label: 'deleted' },
  paid: { icon: 'handshake', color: 'info', soft: 'infoSoft', label: 'paid' },
  finalised: { icon: 'lock', color: 'primary', soft: 'primarySoft', label: 'finalised' },
  reopened: { icon: 'lockOpen', color: 'primary', soft: 'primarySoft', label: 'reopened' },
};

const SUBJECTS: Record<ActivityEntry['entity'], { label: string; icon: IconName }> = {
  trip: { label: 'Trip', icon: 'trip' },
  family: { label: 'Family', icon: 'groupAdd' },
  member: { label: 'Person', icon: 'personAdd' },
  expense: { label: 'Expense', icon: 'receipt' },
  payment: { label: 'Payment', icon: 'handshake' },
};

function ActivityRow({ entry, line }: { entry: ActivityEntry; line: ActivityLine }) {
  const theme = useTheme();
  const look = LOOKS[line.kind];
  const subject = SUBJECTS[entry.entity];
  const label =
    entry.entity === 'payment' && line.kind === 'removed'
      ? 'Payment undone'
      : entry.entity === 'trip' && line.kind === 'added'
        ? 'Trip created'
        : `${subject.label} ${look.label}`;
  // Additions show what was added; everything else shows what happened to it.
  const icon = line.kind === 'added' ? subject.icon : look.icon;

  return (
    <View style={styles.row}>
      <View style={[styles.tile, { backgroundColor: theme[look.soft] }]}>
        <Icon name={icon} size={20} color={theme[look.color]} />
      </View>
      <View style={styles.grow}>
        <ThemedText type="caption" style={[styles.label, { color: theme[look.color] }]}>
          {label.toUpperCase()}
        </ThemedText>
        <ThemedText>
          <ThemedText type="bold">{line.who}</ThemedText> {line.what}
        </ThemedText>
        {line.detail && (
          <ThemedText type="small" themeColor="textSecondary">
            {line.detail}
          </ThemedText>
        )}
      </View>
      <ThemedText type="caption" themeColor="textSecondary">
        {formatTime(entry.at)}
      </ThemedText>
    </View>
  );
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

  const lines = (trip.activity ?? []).flatMap((entry) => {
    const line = describeActivity(entry, trip);
    return line ? [{ entry, line }] : [];
  });
  // Newest first, in one card per day.
  const days: { heading: string; lines: typeof lines }[] = [];
  for (const item of lines) {
    const heading = dayHeading(item.entry.at);
    if (days.at(-1)?.heading === heading) {
      days.at(-1)?.lines.push(item);
    } else {
      days.push({ heading, lines: [item] });
    }
  }

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
        days.map((day) => (
          <View key={day.heading} style={styles.day}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              {day.heading}
            </ThemedText>
            <Card style={styles.card}>
              {day.lines.map(({ entry, line }) => (
                <ActivityRow key={entry.id} entry={entry} line={line} />
              ))}
            </Card>
          </View>
        ))
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: Spacing.three,
    gap: Spacing.three,
  },
  day: {
    gap: Spacing.two,
  },
  card: {
    gap: Spacing.three,
  },
  tile: {
    width: 40,
    height: 40,
    borderRadius: Radius.small,
    alignItems: 'center',
    justifyContent: 'center',
  },
  label: {
    fontWeight: 700,
    letterSpacing: 0.5,
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
