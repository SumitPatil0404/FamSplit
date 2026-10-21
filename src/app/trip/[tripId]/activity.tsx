import { useLocalSearchParams, useRouter } from 'expo-router';
import { RefreshControl, ScrollView, StyleSheet, View } from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Emphasis, EmptyState } from '@/components/ui';
import { Radius, Spacing, type ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useT, type T } from '@/i18n';
import { describeActivity, type ActivityKind, type ActivityLine } from '@/store/activity';
import { relativeDay } from '@/store/summary';
import { useTrip, type ActivityEntry } from '@/store/trips';
import { isShared, usePullToSync, useSync } from '@/sync/sync';

function formatTime(iso: string): string {
  const date = new Date(iso);
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${date.getHours() % 12 || 12}:${minutes} ${date.getHours() < 12 ? 'am' : 'pm'}`;
}

/** Each kind of change gets its own colour and icon, so the log can be scanned at a glance. */
const LOOKS: Record<ActivityKind, { icon: IconName; color: ThemeColor; soft: ThemeColor }> = {
  added: { icon: 'add', color: 'positive', soft: 'positiveSoft' },
  changed: { icon: 'edit', color: 'warning', soft: 'warningSoft' },
  removed: { icon: 'delete', color: 'negative', soft: 'negativeSoft' },
  paid: { icon: 'handshake', color: 'info', soft: 'infoSoft' },
  finalised: { icon: 'lock', color: 'primary', soft: 'primarySoft' },
  reopened: { icon: 'lockOpen', color: 'primary', soft: 'primarySoft' },
};

const ICONS: Record<ActivityEntry['entity'], IconName> = {
  trip: 'trip',
  family: 'groupAdd',
  member: 'personAdd',
  expense: 'receipt',
  payment: 'handshake',
};

/** "EXPENSE ADDED", "TRIP FINALISED"… Whole phrases, since other languages order the words differently. */
function labelFor(entity: ActivityEntry['entity'], kind: ActivityKind, t: T): string {
  if (entity === 'payment') {
    return kind === 'removed' ? t('Payment undone') : t('Payment made');
  }
  if (entity === 'trip') {
    return kind === 'added'
      ? t('Trip created')
      : kind === 'finalised'
        ? t('Trip finalised')
        : kind === 'reopened'
          ? t('Trip reopened')
          : t('Trip edited');
  }
  const labels = {
    family: { added: t('Family added'), changed: t('Family edited'), removed: t('Family removed') },
    member: { added: t('Person added'), changed: t('Person edited'), removed: t('Person removed') },
    expense: { added: t('Expense added'), changed: t('Expense edited'), removed: t('Expense deleted') },
  }[entity];
  return kind === 'added' || kind === 'changed' || kind === 'removed' ? labels[kind] : labels.changed;
}

function ActivityRow({ entry, line }: { entry: ActivityEntry; line: ActivityLine }) {
  const theme = useTheme();
  const t = useT();
  const look = LOOKS[line.kind];
  const label = labelFor(entry.entity, line.kind, t);
  // Additions show what was added; everything else shows what happened to it.
  const icon = line.kind === 'added' ? ICONS[entry.entity] : look.icon;

  return (
    <View style={styles.row}>
      <View style={[styles.tile, { backgroundColor: theme[look.soft] }]}>
        <Icon name={icon} size={20} color={theme[look.color]} />
      </View>
      <View style={styles.grow}>
        <ThemedText type="caption" style={[styles.label, { color: theme[look.color] }]}>
          {label.toUpperCase()}
        </ThemedText>
        <Emphasis text={line.what} bold={line.who} />
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
  const t = useT();

  if (!trip) {
    return <EmptyState emoji="🤔" title={t('Trip not found')} body={t('It may have been deleted from this phone.')} />;
  }

  if (!sync.session || !isShared(trip.id)) {
    return (
      <EmptyState
        emoji="🕑"
        title={t('Activity starts once the trip is shared')}
        body={t('When a trip is on the server, it keeps a record of who added, changed or deleted what.')}>
        {sync.configured && !sync.session && (
          <Button label={t('Sign in')} onPress={() => router.replace('/account')} style={styles.button} />
        )}
      </EmptyState>
    );
  }

  const lines = (trip.activity ?? []).flatMap((entry) => {
    const line = describeActivity(entry, trip, t);
    return line ? [{ entry, line }] : [];
  });
  // Newest first, in one card per day.
  const days: { heading: string; lines: typeof lines }[] = [];
  for (const item of lines) {
    const heading = relativeDay(item.entry.at, t);
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
          title={t('Nothing recorded yet')}
          body={t('Changes show up here as they happen. If this stays empty, the database may still need its latest update.')}
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
