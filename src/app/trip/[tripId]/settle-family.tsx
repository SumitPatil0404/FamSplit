import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { HeadMoneyCard, lookups, TransferRow } from '@/components/trip/settle-parts';
import { Button, Card, EmptyState } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/i18n';
import { headFlows } from '@/store/insights';
import { familySteps } from '@/store/settle-plan';
import { summarizeTrip } from '@/store/summary';
import { useTrip } from '@/store/trips';
import { useSync } from '@/sync/sync';

/** One family's own settling up: its members square up with the head. */
export default function FamilySettleScreen() {
  const { tripId, familyId } = useLocalSearchParams<{ tripId: string; familyId: string }>();
  const router = useRouter();
  const theme = useTheme();
  const t = useT();
  const sync = useSync();
  const trip = useTrip(tripId);
  const family = trip?.families.find((candidate) => candidate.id === familyId);

  if (!trip || !family) {
    return <EmptyState emoji="🤔" title={t('Trip not found')} body={t('It may have been deleted from this phone.')} />;
  }
  const { settlement } = summarizeTrip(trip);
  const { name } = lookups(trip, t);
  const step = familySteps(trip, settlement).find((candidate) => candidate.family.id === family.id);
  const flow = headFlows(trip, settlement).find((candidate) => candidate.familyId === family.id);
  const transfers = step?.transfers ?? [];
  const locked = step?.locked ?? false;

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Stack.Screen options={{ title: t('{name} family', { name: family.name }) }} />

      {flow && <HeadMoneyCard trip={trip} flow={flow} />}

      {locked && transfers.length > 0 && (
        <Card style={[styles.banner, { backgroundColor: theme.backgroundSelected }]}>
          <View style={styles.row}>
            <Icon name="lock" size={20} color={theme.textSecondary} />
            <ThemedText type="small" style={styles.grow}>
              {t('These can be paid once {name} has settled with the other families.', { name: name(family.headId) })}
            </ThemedText>
          </View>
          <Button
            label={t('See payments between families')}
            icon="handshake"
            variant="soft"
            compact
            onPress={() => router.push({ pathname: '/trip/[tripId]/settle-between', params: { tripId: trip.id } })}
          />
        </Card>
      )}

      <ThemedText type="heading">{t('Inside the family')}</ThemedText>
      {transfers.length === 0 ? (
        <Card>
          <ThemedText type="bold">🎉 {t('Nothing to settle inside the {name} family', { name: family.name })}</ThemedText>
        </Card>
      ) : (
        <View style={[styles.list, locked && styles.locked]}>
          {transfers.map((transfer) => (
            <Card key={`${transfer.fromMemberId}-${transfer.toMemberId}`}>
              <TransferRow trip={trip} transfer={transfer} locked={locked} signedIn={sync.session !== null} />
            </Card>
          ))}
        </View>
      )}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: Spacing.three,
    gap: Spacing.three,
  },
  banner: {
    gap: Spacing.three,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  grow: {
    flex: 1,
  },
  list: {
    gap: Spacing.three,
  },
  locked: {
    opacity: 0.55,
  },
});
