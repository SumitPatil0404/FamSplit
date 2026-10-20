import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Avatar, Card, Checkbox, EmptyState } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { formatPaise } from '@/domain';
import { useTheme } from '@/hooks/use-theme';
import { readDraft, sum, updateDraft, useDraft } from '@/store/expense-draft';
import { useTrip } from '@/store/trips';

export default function PayerScreen() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const router = useRouter();
  const theme = useTheme();
  const trip = useTrip(tripId);
  const draft = useDraft();

  if (!trip || !draft) {
    return <EmptyState emoji="🤔" title="Nothing to choose for" body="Go back and start the expense again." />;
  }
  const { amount, several, paidBy } = readDraft(draft, trip);
  const nameOf = (memberId: string, name: string) => (memberId === trip.meId ? `${name} (you)` : name);

  const choose = (payerId: string) => {
    updateDraft({ payerId });
    router.back();
  };
  // Replaces this page, so finishing there goes straight back to the expense.
  const openSeveral = () => router.replace({ pathname: '/trip/[tripId]/expense-payers', params: { tripId: trip.id } });

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.intro}>
        <ThemedText type="heading">Who paid {amount > 0 ? formatPaise(amount) : 'for this'}?</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Tap the one person who paid the whole bill.
        </ThemedText>
      </View>

      {trip.families.map((family) => (
        <View key={family.id} style={styles.group}>
          <View style={styles.familyHeading}>
            <View style={[styles.dot, { backgroundColor: family.color }]} />
            <ThemedText type="smallBold" themeColor="textSecondary">
              {family.name} family
            </ThemedText>
          </View>
          <Card style={styles.list}>
            {trip.members
              .filter((member) => member.familyId === family.id)
              .map((member) => {
                const selected = !several && member.id === draft.payerId;
                return (
                  <Pressable
                    key={member.id}
                    accessibilityRole="radio"
                    accessibilityState={{ selected }}
                    onPress={() => choose(member.id)}
                    style={({ pressed }) => [
                      styles.row,
                      { backgroundColor: selected ? theme.primarySoft : pressed ? theme.backgroundSelected : 'transparent' },
                    ]}>
                    <Avatar name={member.name} color={family.color} size={36} />
                    <ThemedText type={selected ? 'bold' : 'default'} style={styles.grow} numberOfLines={1}>
                      {nameOf(member.id, member.name)}
                    </ThemedText>
                    <Checkbox checked={selected} />
                  </Pressable>
                );
              })}
          </Card>
        </View>
      ))}

      <View style={styles.group}>
        <ThemedText type="smallBold" themeColor="textSecondary">
          Paid together?
        </ThemedText>
        <Pressable
          accessibilityRole="button"
          accessibilityState={{ selected: several }}
          onPress={openSeveral}
          style={({ pressed }) => [
            styles.several,
            {
              backgroundColor: theme.primarySoft,
              borderColor: several ? theme.primary : `${theme.primary}55`,
              borderStyle: several ? 'solid' : 'dashed',
              opacity: pressed ? 0.8 : 1,
            },
          ]}>
          <View style={[styles.severalIcon, { backgroundColor: theme.primary }]}>
            <Icon name="group" size={22} color={theme.onPrimary} />
          </View>
          <View style={styles.grow}>
            <ThemedText type="bold" themeColor="primary">
              Several people paid
            </ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              {several
                ? `${Object.keys(paidBy).length} people · ${formatPaise(sum(paidBy))}`
                : 'Split the bill between payers and enter what each one paid'}
            </ThemedText>
          </View>
          <Icon name="chevronRight" size={22} color={theme.primary} />
        </Pressable>
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  grow: {
    flex: 1,
  },
  content: {
    padding: Spacing.three,
    gap: Spacing.four,
  },
  intro: {
    gap: Spacing.one,
  },
  group: {
    gap: Spacing.two,
  },
  familyHeading: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  dot: {
    width: 10,
    height: 10,
    borderRadius: 5,
  },
  list: {
    padding: Spacing.two,
    gap: Spacing.half,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: 56,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.small,
  },
  several: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.medium,
    borderWidth: 1.5,
  },
  severalIcon: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
});
