import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useEffect, useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { confirmDialog } from '@/components/dialog';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { CategoryTile } from '@/components/trip/expense-parts';
import { Button } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/i18n';
import { cleanAmount, draftCategory, parseAmount, startPersonalDraft, updateDraft, useDraft, type ExpenseDraft } from '@/store/expense-draft';
import { deletePersonalExpense, savePersonalExpense, usePersonalExpenses, type PersonalExpense } from '@/store/personal';
import { relativeDay } from '@/store/summary';
import { newId } from '@/store/trips';

function PersonalForm({ existing, draft }: { existing?: PersonalExpense; draft: ExpenseDraft }) {
  const t = useT();
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const category = draftCategory(draft);
  const amount = parseAmount(draft.amountText);
  const underline = { borderBottomColor: theme.border, color: theme.text };

  const save = () => {
    savePersonalExpense({
      id: existing?.id ?? newId('pex'),
      description: draft.description.trim() || t(category.label),
      amount,
      category: category.id,
      date: draft.date,
    });
    router.back();
  };

  const remove = () =>
    confirmDialog({
      icon: 'delete',
      tone: 'danger',
      title: t('Delete this expense?'),
      confirmLabel: t('Delete'),
      onConfirm: () => {
        if (existing) {
          deletePersonalExpense(existing.id);
        }
        router.back();
      },
    });

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.grow}>
      <Stack.Screen options={{ title: existing ? t('Edit personal expense') : t('Personal expense') }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ThemedText type="small" themeColor="textSecondary">
          {t('Only you can see personal expenses. They count towards My spending but not towards any trip.')}
        </ThemedText>
        <View style={styles.inputRow}>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('Category: {name}. Change category', { name: t(category.label) })}
            onPress={() => router.push('/expense-category')}>
            <CategoryTile emoji={category.emoji} size={56} />
            <View style={[styles.editBadge, { backgroundColor: theme.primaryFill, borderColor: theme.background }]}>
              <Icon name="edit" size={12} color={theme.onPrimary} />
            </View>
          </Pressable>
          <TextInput
            accessibilityLabel={t('What was it for?')}
            value={draft.description}
            onChangeText={(description) => updateDraft({ description })}
            placeholder={t('What was it for?')}
            placeholderTextColor={theme.textSecondary}
            autoFocus={!existing}
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
            accessibilityLabel={t('Total amount')}
            value={draft.amountText}
            onChangeText={(text) => updateDraft({ amountText: cleanAmount(text) })}
            placeholder="0.00"
            placeholderTextColor={theme.textSecondary}
            keyboardType="decimal-pad"
            style={[styles.amount, underline]}
          />
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('Date: {date}. Change date', { date: relativeDay(draft.date, t) })}
          onPress={() => router.push('/expense-date')}
          style={({ pressed }) => [styles.choice, { backgroundColor: theme.primarySoft, opacity: pressed ? 0.7 : 1 }]}>
          <Icon name="calendar" size={16} color={theme.primary} />
          <ThemedText type="bold" themeColor="primary">
            {relativeDay(draft.date, t)}
          </ThemedText>
          <Icon name="expandMore" size={18} color={theme.primary} />
        </Pressable>
        {existing && <Button label={t('Delete expense')} icon="delete" variant="danger" onPress={remove} />}
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.two, borderColor: theme.border }]}>
        {amount <= 0 && (
          <ThemedText type="small" themeColor="textSecondary" style={styles.centered}>
            {t('Enter how much was paid')}
          </ThemedText>
        )}
        <Button label={existing ? t('Save changes') : t('Save expense')} icon="check" onPress={save} disabled={amount <= 0} />
      </View>
    </KeyboardAvoidingView>
  );
}

function PersonalEditor({ existing }: { existing?: PersonalExpense }) {
  // Started once when the page opens; the category and date pages share it.
  useState(() => startPersonalDraft(existing, false));
  const draft = useDraft();
  const current = draft !== null && draft.tripId === '' && draft.expenseId === existing?.id;
  // A reload during development clears the draft; start it again rather than show an empty page.
  useEffect(() => {
    if (!current) {
      startPersonalDraft(existing);
    }
  }, [current, existing]);
  if (!current || !draft) {
    return null;
  }
  return <PersonalForm existing={existing} draft={draft} />;
}

export default function PersonalExpenseScreen() {
  const { expenseId } = useLocalSearchParams<{ expenseId?: string }>();
  const existing = usePersonalExpenses().find((expense) => expense.id === expenseId);
  return <PersonalEditor existing={existing} />;
}

const styles = StyleSheet.create({
  grow: {
    flex: 1,
  },
  content: {
    padding: Spacing.four,
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
  choice: {
    flexDirection: 'row',
    alignItems: 'center',
    alignSelf: 'center',
    gap: Spacing.half,
    paddingLeft: Spacing.three,
    paddingRight: Spacing.two,
    paddingVertical: Spacing.two,
    borderRadius: Radius.pill,
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
