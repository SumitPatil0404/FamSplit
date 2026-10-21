import { useLocalSearchParams } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { TransferRow } from '@/components/trip/settle-parts';
import { Card, EmptyState } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useT } from '@/i18n';
import { summarizeTrip } from '@/store/summary';
import { useTrip } from '@/store/trips';
import { useSync } from '@/sync/sync';

/** The first step on a family trip: the heads square up with each other. */
export default function BetweenFamiliesScreen() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const t = useT();
  const sync = useSync();
  const trip = useTrip(tripId);

  if (!trip) {
    return <EmptyState emoji="🤔" title={t('Trip not found')} body={t('It may have been deleted from this phone.')} />;
  }
  const transfers = summarizeTrip(trip).settlement.betweenFamilies;

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.intro}>
        <ThemedText type="small" themeColor="textSecondary">
          {t('Only the family heads pay each other. Each head then settles with their own family.')}
        </ThemedText>
      </View>
      {transfers.length === 0 ? (
        <Card>
          <ThemedText type="bold">🎉 {t('All families are settled')}</ThemedText>
        </Card>
      ) : (
        transfers.map((transfer) => (
          <Card key={`${transfer.fromFamilyId}-${transfer.toFamilyId}`}>
            <TransferRow trip={trip} transfer={transfer} betweenFamilies signedIn={sync.session !== null} />
          </Card>
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
  intro: {
    gap: Spacing.one,
  },
});
