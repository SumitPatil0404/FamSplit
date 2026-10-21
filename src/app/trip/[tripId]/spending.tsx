import { useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { CategoryTile } from '@/components/trip/expense-parts';
import { Card, EmptyState } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { formatPaise } from '@/domain';
import { useTheme } from '@/hooks/use-theme';
import { plural, useT } from '@/i18n';
import { byCategory, spendingScopes } from '@/store/insights';
import { useTrip, type StoredTrip } from '@/store/trips';

function Spending({ trip }: { trip: StoredTrip }) {
  const t = useT();
  const theme = useTheme();
  const scopes = spendingScopes(trip, t);
  const [scopeId, setScopeId] = useState('all');
  const scope = scopes.find((candidate) => candidate.id === scopeId) ?? scopes[0];
  const rows = byCategory(trip, scope);
  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  const largest = rows[0]?.amount ?? 0;

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.chips}>
        {scopes.map((candidate) => {
          const selected = candidate.id === scope.id;
          return (
            <Pressable
              key={candidate.id}
              accessibilityRole="tab"
              accessibilityState={{ selected }}
              onPress={() => setScopeId(candidate.id)}
              style={[
                styles.chip,
                {
                  backgroundColor: selected ? theme.primaryFill : theme.backgroundElement,
                  borderColor: selected ? theme.primaryFill : theme.border,
                },
              ]}>
              <ThemedText type="smallBold" style={{ color: selected ? theme.onPrimary : theme.text }}>
                {candidate.label}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>

      <View style={styles.hero}>
        <ThemedText type="caption" themeColor="textSecondary">
          {scope.caption}
        </ThemedText>
        <ThemedText type="amount">{formatPaise(total)}</ThemedText>
      </View>

      {rows.length === 0 ? (
        <EmptyState emoji="📊" title={t('Nothing spent yet')} body={t('Once expenses are added, this shows where the money went.')} />
      ) : (
        <Card style={styles.list}>
          {rows.map(({ category, amount, count }) => {
            const percent = total > 0 ? Math.round((amount / total) * 100) : 0;
            return (
              <View
                key={category.id}
                accessible
                accessibilityLabel={`${t(category.label)}: ${formatPaise(amount)}, ${percent}%, ${plural(t, count, '{count} expense', '{count} expenses')}`}
                style={styles.row}>
                <CategoryTile emoji={category.emoji} size={40} />
                <View style={styles.grow}>
                  <View style={styles.labels}>
                    <ThemedText type="bold" style={styles.grow} numberOfLines={1}>
                      {t(category.label)}
                    </ThemedText>
                    <ThemedText type="bold">{formatPaise(amount)}</ThemedText>
                  </View>
                  <View style={[styles.track, { backgroundColor: theme.backgroundSelected }]}>
                    <View
                      style={[
                        styles.bar,
                        { width: `${largest > 0 ? (amount / largest) * 100 : 0}%`, backgroundColor: theme.primary },
                      ]}
                    />
                  </View>
                  <ThemedText type="caption" themeColor="textSecondary">
                    {percent}% · {plural(t, count, '{count} expense', '{count} expenses')}
                  </ThemedText>
                </View>
              </View>
            );
          })}
        </Card>
      )}
    </ScrollView>
  );
}

export default function SpendingScreen() {
  const t = useT();
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const trip = useTrip(tripId);

  if (!trip) {
    return <EmptyState emoji="🤔" title={t('Trip not found')} body={t('It may have been deleted from this phone.')} />;
  }
  return <Spending trip={trip} />;
}

const styles = StyleSheet.create({
  content: {
    padding: Spacing.three,
    gap: Spacing.three,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: Spacing.two,
  },
  chip: {
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radius.pill,
    borderWidth: 1,
  },
  hero: {
    alignItems: 'center',
    gap: Spacing.one,
    paddingVertical: Spacing.two,
  },
  list: {
    gap: Spacing.four,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  grow: {
    flex: 1,
  },
  labels: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  track: {
    height: 8,
    borderRadius: 4,
    marginVertical: Spacing.one,
    overflow: 'hidden',
  },
  bar: {
    height: 8,
    borderRadius: 4,
  },
});
