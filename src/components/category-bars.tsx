import { StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { CategoryTile } from '@/components/trip/expense-parts';
import { Card } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { formatPaise } from '@/domain';
import { useTheme } from '@/hooks/use-theme';
import { plural, useT } from '@/i18n';
import type { CategoryRow } from '@/store/insights';

/** Where the money went: one bar per category, the biggest full width. */
export function CategoryBars({ rows }: { rows: CategoryRow[] }) {
  const t = useT();
  const theme = useTheme();
  const total = rows.reduce((sum, row) => sum + row.amount, 0);
  const largest = rows[0]?.amount ?? 0;

  return (
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
                  style={[styles.bar, { width: `${largest > 0 ? (amount / largest) * 100 : 0}%`, backgroundColor: theme.primary }]}
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
  );
}

const styles = StyleSheet.create({
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
