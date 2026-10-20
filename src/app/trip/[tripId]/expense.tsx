import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { CategoryTile } from '@/components/trip/expense-parts';
import { Avatar, Button, Card, EmptyState } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { formatPaise } from '@/domain';
import { useTheme } from '@/hooks/use-theme';
import {
  cleanAmount,
  payerLabel,
  readDraft,
  splitLabel,
  startDraft,
  updateDraft,
  useDraft,
  type ExpenseDraft,
} from '@/store/expense-draft';
import { isFriendsTrip, newId, saveExpense, useTrip, type StoredExpense, type StoredTrip } from '@/store/trips';

/** A tappable word in the "Paid by … and split …" sentence. */
function Choice({ label, onPress, accessibilityLabel }: { label: string; onPress: () => void; accessibilityLabel: string }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={accessibilityLabel}
      onPress={onPress}
      style={({ pressed }) => [styles.choice, { backgroundColor: theme.primarySoft, opacity: pressed ? 0.7 : 1 }]}>
      <ThemedText type="bold" numberOfLines={1} themeColor="primary">
        {label}
      </ThemedText>
      <Icon name="expandMore" size={18} color={theme.primary} />
    </Pressable>
  );
}

function ExpenseForm({ trip, existing, draft }: { trip: StoredTrip; existing?: StoredExpense; draft: ExpenseDraft }) {
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const { amount, category, paidBy, split, preview, problem } = readDraft(draft, trip);

  const open = (pathname: '/trip/[tripId]/expense-category' | '/trip/[tripId]/expense-payer' | '/trip/[tripId]/expense-split') =>
    router.push({ pathname, params: { tripId: trip.id } });

  const save = () => {
    saveExpense(trip.id, {
      id: existing?.id ?? newId('exp'),
      date: existing?.date ?? new Date().toISOString(),
      description: draft.description.trim() || category.label,
      category: category.id,
      amount,
      paidBy,
      split,
    });
    router.back();
  };

  // What each family (on a friends trip, each person) ends up paying, so the choices can be checked at a glance.
  const friends = isFriendsTrip(trip);
  const familyShares = trip.families
    .map((family) => ({
      family,
      share: trip.members
        .filter((member) => member.familyId === family.id)
        .reduce((total, member) => total + (preview?.get(member.id) ?? 0), 0),
    }))
    .filter(({ share }) => share > 0);
  const underline = { borderBottomColor: theme.border, color: theme.text };

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.grow}>
      <Stack.Screen options={{ title: existing ? 'Edit expense' : 'Add expense' }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.inputs}>
          <View style={styles.inputRow}>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Category: ${category.label}. Change category`}
              onPress={() => open('/trip/[tripId]/expense-category')}>
              <CategoryTile emoji={category.emoji} size={56} />
              <View style={[styles.editBadge, { backgroundColor: theme.primary, borderColor: theme.background }]}>
                <Icon name="edit" size={12} color={theme.onPrimary} />
              </View>
            </Pressable>
            <TextInput
              accessibilityLabel="What was it for?"
              value={draft.description}
              onChangeText={(description) => updateDraft({ description })}
              placeholder="What was it for?"
              placeholderTextColor={theme.textSecondary}
              autoFocus={!existing}
              returnKeyType="next"
              style={[styles.description, underline]}
            />
          </View>

          <View style={styles.inputRow}>
            <View style={[styles.rupee, { backgroundColor: theme.primarySoft }]}>
              <ThemedText allowFontScaling={false} style={[styles.rupeeText, { color: theme.primary }]}>
                ₹
              </ThemedText>
            </View>
            <TextInput
              accessibilityLabel="Total amount"
              value={draft.amountText}
              onChangeText={(text) => updateDraft({ amountText: cleanAmount(text) })}
              placeholder="0.00"
              placeholderTextColor={theme.textSecondary}
              keyboardType="decimal-pad"
              style={[styles.amount, underline]}
            />
          </View>
        </View>

        <View style={styles.sentence}>
          <ThemedText type="bold">Paid by</ThemedText>
          <Choice
            label={payerLabel(draft, trip, paidBy)}
            accessibilityLabel="Change who paid"
            onPress={() => open('/trip/[tripId]/expense-payer')}
          />
          <ThemedText type="bold">and split</ThemedText>
          <Choice
            label={splitLabel(draft, trip)}
            accessibilityLabel="Change how it is split"
            onPress={() => open('/trip/[tripId]/expense-split')}
          />
        </View>

        {preview && familyShares.length > 0 && (
          <Card style={styles.shares}>
            <ThemedText type="caption" themeColor="textSecondary">
              {friends ? 'EACH PERSON’S SHARE' : 'EACH FAMILY’S SHARE'}
            </ThemedText>
            {familyShares.map(({ family, share }) => (
              <View key={family.id} style={styles.shareRow}>
                <Avatar name={family.name} color={family.color} size={28} />
                <ThemedText style={styles.grow} numberOfLines={1}>
                  {friends ? family.name : `${family.name} family`}
                </ThemedText>
                <ThemedText type="smallBold">{formatPaise(share)}</ThemedText>
              </View>
            ))}
          </Card>
        )}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.two, backgroundColor: theme.background, borderColor: theme.border }]}>
        {problem && (
          <ThemedText type="small" themeColor="textSecondary" style={styles.centered}>
            {problem}
          </ThemedText>
        )}
        <Button label={existing ? 'Save changes' : 'Save expense'} icon="check" onPress={save} disabled={problem !== null} />
      </View>
    </KeyboardAvoidingView>
  );
}

function ExpenseEditor({ trip, existing }: { trip: StoredTrip; existing?: StoredExpense }) {
  // The draft is started once when this page opens; the category, payer and split pages share it.
  useState(() => startDraft(trip, existing));
  const draft = useDraft();
  if (!draft || draft.tripId !== trip.id || draft.expenseId !== existing?.id) {
    return null;
  }
  return <ExpenseForm trip={trip} existing={existing} draft={draft} />;
}

export default function ExpenseScreen() {
  const { tripId, expenseId } = useLocalSearchParams<{ tripId: string; expenseId?: string }>();
  const trip = useTrip(tripId);

  if (!trip) {
    return <EmptyState emoji="🤔" title="Trip not found" body="It may have been deleted from this phone." />;
  }
  return <ExpenseEditor trip={trip} existing={trip.expenses.find((expense) => expense.id === expenseId)} />;
}

const styles = StyleSheet.create({
  grow: {
    flex: 1,
  },
  content: {
    padding: Spacing.four,
    gap: Spacing.five,
  },
  inputs: {
    gap: Spacing.four,
  },
  inputRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  editBadge: {
    position: 'absolute',
    right: -4,
    bottom: -4,
    width: 22,
    height: 22,
    borderRadius: 11,
    borderWidth: 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  description: {
    flex: 1,
    fontSize: 20,
    fontWeight: 600,
    paddingVertical: Spacing.two,
    borderBottomWidth: 2,
  },
  rupee: {
    width: 56,
    height: 56,
    borderRadius: Radius.medium,
    alignItems: 'center',
    justifyContent: 'center',
  },
  rupeeText: {
    fontSize: 28,
    lineHeight: 36,
    fontWeight: 800,
  },
  amount: {
    flex: 1,
    fontSize: 36,
    fontWeight: 800,
    paddingVertical: Spacing.one,
    borderBottomWidth: 2,
  },
  sentence: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.half,
    maxWidth: '100%',
    paddingLeft: Spacing.three,
    paddingRight: Spacing.two,
    paddingVertical: Spacing.two,
    borderRadius: Radius.pill,
  },
  shares: {
    gap: Spacing.two,
  },
  shareRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  footer: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    gap: Spacing.two,
    borderTopWidth: StyleSheet.hairlineWidth,
  },
  centered: {
    textAlign: 'center',
  },
});
