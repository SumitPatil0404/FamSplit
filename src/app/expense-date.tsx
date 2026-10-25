import { useRouter } from 'expo-router';
import { useState } from 'react';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Card, EmptyState, IconButton } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { msg, useT } from '@/i18n';
import { updateDraft, useDraft } from '@/store/expense-draft';
import { MONTH_NAMES } from '@/store/summary';

const MONTHS = MONTH_NAMES;
const WEEKDAYS = [msg('Su'), msg('Mo'), msg('Tu'), msg('We'), msg('Th'), msg('Fr'), msg('Sa')];

const sameDay = (a: Date, b: Date) => a.toDateString() === b.toDateString();

/** When an expense was paid. Days after today cannot be picked: an expense is something already paid. */
export default function DateScreen() {
  const t = useT();
  const router = useRouter();
  const theme = useTheme();
  const draft = useDraft();
  const today = new Date();
  const picked = new Date(draft?.date ?? today.toISOString());
  const [month, setMonth] = useState({ year: picked.getFullYear(), month: picked.getMonth() });

  if (!draft) {
    return <EmptyState emoji="🤔" title={t('Nothing to choose for')} body={t('Go back and start the expense again.')} />;
  }

  // Keeps the time of day, so expenses on the same day stay in the order they were added.
  const choose = (day: Date) => {
    day.setHours(picked.getHours(), picked.getMinutes(), picked.getSeconds());
    updateDraft({ date: day.toISOString() });
    router.back();
  };
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1);
  const isCurrentMonth = month.year === today.getFullYear() && month.month === today.getMonth();
  const shift = (by: number) => {
    const next = new Date(month.year, month.month + by, 1);
    setMonth({ year: next.getFullYear(), month: next.getMonth() });
  };

  // Blank cells before the 1st, so each date sits under its weekday.
  const firstWeekday = new Date(month.year, month.month, 1).getDay();
  const daysInMonth = new Date(month.year, month.month + 1, 0).getDate();
  const cells: (Date | null)[] = [
    ...Array.from({ length: firstWeekday }, () => null),
    ...Array.from({ length: daysInMonth }, (_, index) => new Date(month.year, month.month, index + 1)),
  ];

  const quick = [
    { label: t('Today'), day: new Date(today.getFullYear(), today.getMonth(), today.getDate()) },
    { label: t('Yesterday'), day: yesterday },
  ];

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.quick}>
        {quick.map(({ label, day }) => {
          const selected = sameDay(day, picked);
          return (
            <Pressable
              key={label}
              accessibilityRole="button"
              accessibilityState={{ selected }}
              onPress={() => choose(new Date(day))}
              style={({ pressed }) => [
                styles.quickChip,
                {
                  backgroundColor: selected ? theme.primaryFill : theme.primarySoft,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}>
              <ThemedText type="bold" style={{ color: selected ? theme.onPrimary : theme.primary }}>
                {label}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>

      <Card style={styles.calendar}>
        <View style={styles.monthRow}>
          <IconButton icon="chevronLeft" label={t('Previous month')} onPress={() => shift(-1)} />
          <ThemedText type="bold" style={styles.monthName}>
            {t(MONTHS[month.month])} {month.year}
          </ThemedText>
          {isCurrentMonth ? (
            <View style={styles.placeholder} />
          ) : (
            <IconButton icon="chevronRight" label={t('Next month')} onPress={() => shift(1)} />
          )}
        </View>

        <View style={styles.grid}>
          {WEEKDAYS.map((weekday, index) => (
            <View key={`${weekday}${index}`} style={styles.cell}>
              <ThemedText type="caption" themeColor="textSecondary">
                {t(weekday)}
              </ThemedText>
            </View>
          ))}
          {cells.map((day, index) => {
            if (!day) {
              return <View key={`blank${index}`} style={styles.cell} />;
            }
            const selected = sameDay(day, picked);
            const isToday = sameDay(day, today);
            const future = day > today;
            return (
              <View key={day.getDate()} style={styles.cell}>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={`${day.getDate()} ${t(MONTHS[day.getMonth()])}`}
                  accessibilityState={{ selected, disabled: future }}
                  disabled={future}
                  onPress={() => choose(day)}
                  style={({ pressed }) => [
                    styles.day,
                    selected && { backgroundColor: theme.primaryFill },
                    !selected && isToday && { borderColor: theme.primary, borderWidth: 1.5 },
                    { opacity: future ? 0.3 : pressed ? 0.6 : 1 },
                  ]}>
                  <ThemedText
                    type={selected || isToday ? 'bold' : 'default'}
                    style={{ color: selected ? theme.onPrimary : isToday ? theme.primary : theme.text }}>
                    {day.getDate()}
                  </ThemedText>
                </Pressable>
              </View>
            );
          })}
        </View>
      </Card>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: Spacing.three,
    gap: Spacing.three,
  },
  quick: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  quickChip: {
    flex: 1,
    alignItems: 'center',
    paddingVertical: Spacing.three,
    borderRadius: Radius.medium,
  },
  calendar: {
    gap: Spacing.two,
  },
  monthRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
  },
  monthName: {
    flex: 1,
    textAlign: 'center',
  },
  placeholder: {
    width: 36,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
  },
  cell: {
    width: '14.28%',
    aspectRatio: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  day: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
