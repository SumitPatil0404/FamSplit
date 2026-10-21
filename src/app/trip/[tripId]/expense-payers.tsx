import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { MoneyInput, Tally } from '@/components/trip/expense-parts';
import { Avatar, Button, Card, EmptyState } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { formatPaise } from '@/domain';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/i18n';
import { parseAmount, parseAmounts, SEVERAL, sum, updateDraft, useDraft } from '@/store/expense-draft';
import { personGroups, useTrip } from '@/store/trips';

/** When more than one person paid: what each one put in. Nothing changes until Done is tapped. */
export default function SeveralPayersScreen() {
  const t = useT();
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const trip = useTrip(tripId);
  const draft = useDraft();
  const [texts, setTexts] = useState(() => draft?.paidTexts ?? {});

  if (!trip || !draft) {
    return <EmptyState emoji="🤔" title={t('Nothing to choose for')} body={t('Go back and start the expense again.')} />;
  }
  const total = parseAmount(draft.amountText);
  const entered = sum(parseAmounts(texts));
  const payers = Object.keys(parseAmounts(texts)).length;

  // With no total typed in yet, what the payers put in becomes the total.
  const problem =
    payers === 0
      ? t('Enter what each person paid')
      : total > 0 && entered !== total
        ? t('What each person paid must add up to the total')
        : null;

  const done = () => {
    updateDraft({
      payerId: SEVERAL,
      paidTexts: texts,
      ...(total === 0 ? { amountText: String(entered / 100) } : {}),
    });
    router.back();
  };

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.grow}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.intro}>
          <ThemedText type="heading">
            {total > 0 ? t('Who put in the {amount}?', { amount: formatPaise(total) }) : t('Who put in how much?')}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {t('Leave anyone who paid nothing empty.')}
          </ThemedText>
        </View>

        {personGroups(trip, t).map((group) => (
          <Card key={group.id} style={styles.card}>
            {group.title && (
              <View style={styles.familyHeading}>
                <View style={[styles.dot, { backgroundColor: group.color }]} />
                <ThemedText type="smallBold" themeColor="textSecondary">
                  {group.title}
                </ThemedText>
              </View>
            )}
            {group.members.map((member) => (
              <View key={member.id} style={styles.row}>
                <Avatar name={member.name} color={member.color} size={32} />
                <ThemedText style={styles.grow} numberOfLines={1}>
                  {member.id === trip.meId ? t('{name} (you)', { name: member.name }) : member.name}
                </ThemedText>
                <MoneyInput
                  label={t('Paid by {name}', { name: member.name })}
                  value={texts[member.id] ?? ''}
                  onChange={(text) => setTexts({ ...texts, [member.id]: text })}
                />
              </View>
            ))}
          </Card>
        ))}
      </ScrollView>

      <View
        style={[
          styles.footer,
          { paddingBottom: insets.bottom + Spacing.two, backgroundColor: theme.background, borderColor: theme.border },
        ]}>
        <View style={styles.status}>
          {total > 0 ? (
            <Tally entered={entered} total={total} />
          ) : (
            <ThemedText type="smallBold" themeColor="textSecondary">
              {t('Total {amount}', { amount: formatPaise(entered) })}
            </ThemedText>
          )}
          {problem && payers > 0 && (
            <ThemedText type="small" themeColor="textSecondary">
              {problem}
            </ThemedText>
          )}
        </View>
        <Button label={t('Done')} icon="check" onPress={done} disabled={problem !== null} />
      </View>
    </KeyboardAvoidingView>
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
  intro: {
    gap: Spacing.one,
    marginBottom: Spacing.one,
  },
  card: {
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: 48,
  },
  status: {
    alignItems: 'center',
    gap: Spacing.half,
  },
  footer: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    gap: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
});
