import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { confirmDialog } from '@/components/dialog';
import { ThemedText } from '@/components/themed-text';
import { Avatar, Button, Card, Checkbox, EmptyState, Field, IconButton, Segmented } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { expenseShares, formatPaise, toPaise, type Paise, type Split } from '@/domain';
import { useTheme } from '@/hooks/use-theme';
import { deleteExpense, newId, saveExpense, useTrip, type StoredExpense, type StoredTrip } from '@/store/trips';

type Mode = 'equal' | 'perFamily' | 'shares' | 'exact';

const SEVERAL = 'several';

/** Keeps only digits and a single decimal point with up to two decimals. */
function cleanAmount(text: string): string {
  const [whole, ...rest] = text.replace(/[^0-9.]/g, '').split('.');
  return rest.length > 0 ? `${whole}.${rest.join('').slice(0, 2)}` : whole;
}

function parseAmount(text: string | undefined): Paise {
  const trimmed = (text ?? '').replace(/\.$/, '');
  if (trimmed === '') {
    return 0;
  }
  try {
    return toPaise(trimmed.startsWith('.') ? `0${trimmed}` : trimmed);
  } catch {
    return 0;
  }
}

/** Turns typed amounts into paise, leaving out anyone with nothing entered. */
function parseAmounts(texts: Record<string, string>): Record<string, Paise> {
  return Object.fromEntries(
    Object.entries(texts)
      .map(([memberId, text]) => [memberId, parseAmount(text)] as const)
      .filter(([, value]) => value > 0),
  );
}

function toTexts(amounts: Record<string, Paise>): Record<string, string> {
  return Object.fromEntries(Object.entries(amounts).map(([memberId, value]) => [memberId, String(value / 100)]));
}

function sum(amounts: Record<string, Paise>): Paise {
  return Object.values(amounts).reduce((total, value) => total + value, 0);
}

function previewShares(amount: Paise, split: Split, trip: StoredTrip): Map<string, Paise> | null {
  try {
    return expenseShares({ id: 'draft', description: 'draft', amount, paidBy: {}, split }, trip);
  } catch {
    return null;
  }
}

function MoneyInput({ value, onChange, label }: { value: string; onChange: (text: string) => void; label: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.money, { backgroundColor: theme.background, borderColor: theme.border }]}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        ₹
      </ThemedText>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={(text) => onChange(cleanAmount(text))}
        placeholder="0"
        placeholderTextColor={theme.textSecondary}
        keyboardType="decimal-pad"
        style={[styles.moneyInput, { color: theme.text }]}
      />
    </View>
  );
}

/** "₹1,750 of ₹2,750 · ₹1,000 left", the running total Splitwise shows while amounts are typed in. */
function Tally({ entered, total }: { entered: Paise; total: Paise }) {
  const left = total - entered;
  return (
    <ThemedText type="smallBold" themeColor={left === 0 && total > 0 ? 'positive' : left < 0 ? 'negative' : 'textSecondary'}>
      {formatPaise(entered)} of {formatPaise(total)} ·{' '}
      {left === 0 ? 'all accounted for' : left > 0 ? `${formatPaise(left)} left` : `${formatPaise(-left)} too much`}
    </ThemedText>
  );
}

function ExpenseForm({ trip, existing }: { trip: StoredTrip; existing?: StoredExpense }) {
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();

  const existingPayers = existing ? Object.keys(existing.paidBy).filter((id) => existing.paidBy[id] > 0) : [];
  const oldSplit = existing?.split;

  const [amountText, setAmountText] = useState(existing ? String(existing.amount / 100) : '');
  const [description, setDescription] = useState(existing?.description ?? '');
  const [payerId, setPayerId] = useState(
    existing ? (existingPayers.length > 1 ? SEVERAL : existingPayers[0]) : trip.meId || trip.members[0]?.id,
  );
  const [paidTexts, setPaidTexts] = useState<Record<string, string>>(() =>
    existing && existingPayers.length > 1 ? toTexts(existing.paidBy) : {},
  );
  const [mode, setMode] = useState<Mode>(oldSplit?.type ?? 'equal');
  const [memberOn, setMemberOn] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      trip.members.map((member) => [member.id, oldSplit?.type === 'equal' ? oldSplit.memberIds.includes(member.id) : true]),
    ),
  );
  const [familyOn, setFamilyOn] = useState<Record<string, boolean>>(() =>
    Object.fromEntries(
      trip.families.map((family) => [
        family.id,
        oldSplit?.type === 'perFamily' ? oldSplit.familyIds.includes(family.id) : true,
      ]),
    ),
  );
  const [shares, setShares] = useState<Record<string, number>>(() =>
    Object.fromEntries(
      trip.members.map((member) => [member.id, oldSplit?.type === 'shares' ? (oldSplit.shares[member.id] ?? 0) : 1]),
    ),
  );
  const [exactTexts, setExactTexts] = useState<Record<string, string>>(() =>
    oldSplit?.type === 'exact' ? toTexts(oldSplit.amounts) : {},
  );

  const amount = parseAmount(amountText);
  const several = payerId === SEVERAL;
  const paidBy = several ? parseAmounts(paidTexts) : { [payerId]: amount };
  const exactAmounts = parseAmounts(exactTexts);

  const split: Split =
    mode === 'equal'
      ? { type: 'equal', memberIds: trip.members.filter((member) => memberOn[member.id]).map((member) => member.id) }
      : mode === 'perFamily'
        ? { type: 'perFamily', familyIds: trip.families.filter((family) => familyOn[family.id]).map((family) => family.id) }
        : mode === 'shares'
          ? {
              type: 'shares',
              shares: Object.fromEntries(
                trip.members.filter((member) => shares[member.id] > 0).map((member) => [member.id, shares[member.id]]),
              ),
            }
          : { type: 'exact', amounts: exactAmounts };
  const preview = amount > 0 ? previewShares(amount, split, trip) : null;

  const problem = trip.finalizedAt
    ? 'This trip is finalised. Reopen it to change expenses.'
    : amount <= 0
      ? 'Enter how much was paid'
      : several && sum(paidBy) !== amount
        ? 'What each person paid must add up to the total'
        : mode === 'exact' && sum(exactAmounts) !== amount
          ? 'What each person owes must add up to the total'
          : preview === null
            ? 'Choose who to split it between'
            : null;

  const shareOf = (memberId: string) => {
    const share = preview?.get(memberId);
    return share ? formatPaise(share) : '—';
  };
  const membersOf = (familyId: string) => trip.members.filter((member) => member.familyId === familyId);

  const save = () => {
    saveExpense(trip.id, {
      id: existing?.id ?? newId('exp'),
      date: existing?.date ?? new Date().toISOString(),
      description: description.trim() || 'Expense',
      amount,
      paidBy,
      split,
    });
    router.back();
  };

  const confirmDelete = () => {
    if (!existing) {
      return;
    }
    confirmDialog({
      icon: 'delete',
      tone: 'danger',
      title: 'Delete this expense?',
      message: 'Everyone’s balances will be recalculated.',
      confirmLabel: 'Delete expense',
      onConfirm: () => {
        deleteExpense(trip.id, existing.id);
        router.back();
      },
    });
  };

  const chipColors = (selected: boolean) => ({
    backgroundColor: selected ? theme.primary : theme.backgroundElement,
    borderColor: theme.border,
  });

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.grow}>
      <Stack.Screen options={{ title: existing ? 'Edit expense' : 'Add expense' }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.amountRow}>
          <ThemedText type="amount" themeColor="textSecondary">
            ₹
          </ThemedText>
          <TextInput
            accessibilityLabel="Total amount"
            value={amountText}
            onChangeText={(text) => setAmountText(cleanAmount(text))}
            placeholder="0"
            placeholderTextColor={theme.textSecondary}
            keyboardType="decimal-pad"
            autoFocus={!existing}
            style={[styles.amountInput, { color: theme.text }]}
          />
        </View>

        <Field label="What was it for?" placeholder="Dinner, cab, hotel…" value={description} onChangeText={setDescription} />

        <View style={styles.section}>
          <View style={[styles.row, styles.spread]}>
            <ThemedText type="smallBold" themeColor="textSecondary">
              Paid by
            </ThemedText>
            <Pressable
              accessibilityRole="switch"
              accessibilityState={{ checked: several }}
              hitSlop={8}
              onPress={() => setPayerId(several ? trip.meId || trip.members[0]?.id : SEVERAL)}>
              <ThemedText type="smallBold" numberOfLines={1} themeColor="primary">
                {several ? 'One person paid' : 'Several people paid'}
              </ThemedText>
            </Pressable>
          </View>

          {!several && (
            <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips} keyboardShouldPersistTaps="handled">
              {trip.families.flatMap((family) =>
                membersOf(family.id).map((member) => {
                  const selected = member.id === payerId;
                  return (
                    <Pressable
                      key={member.id}
                      accessibilityRole="radio"
                      accessibilityState={{ selected }}
                      onPress={() => setPayerId(member.id)}
                      style={[styles.chip, chipColors(selected)]}>
                      <Avatar name={member.name} color={selected ? '#FFFFFF' : family.color} size={24} />
                      <ThemedText type="smallBold" numberOfLines={1} style={{ color: selected ? theme.onPrimary : theme.text }}>
                        {member.id === trip.meId ? 'You' : member.name}
                      </ThemedText>
                    </Pressable>
                  );
                }),
              )}
            </ScrollView>
          )}

          {several && (
            <Card>
              <ThemedText type="small" themeColor="textSecondary">
                Enter what each person paid.
              </ThemedText>
              {trip.families.flatMap((family) =>
                membersOf(family.id).map((member) => (
                  <View key={member.id} style={[styles.row, styles.memberRow]}>
                    <Avatar name={member.name} color={family.color} size={28} />
                    <ThemedText style={styles.grow}>{member.id === trip.meId ? 'You' : member.name}</ThemedText>
                    <MoneyInput
                      label={`Paid by ${member.name}`}
                      value={paidTexts[member.id] ?? ''}
                      onChange={(text) => setPaidTexts({ ...paidTexts, [member.id]: text })}
                    />
                  </View>
                )),
              )}
              <Tally entered={sum(paidBy)} total={amount} />
            </Card>
          )}
        </View>

        <View style={styles.section}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            Split
          </ThemedText>
          <Segmented
            value={mode}
            onChange={setMode}
            options={[
              { value: 'equal', label: 'Per person' },
              { value: 'perFamily', label: 'Per family' },
              { value: 'shares', label: 'Shares' },
              { value: 'exact', label: 'Exact' },
            ]}
          />
          <ThemedText type="small" themeColor="textSecondary">
            {mode === 'equal'
              ? 'Everyone ticked pays the same amount.'
              : mode === 'perFamily'
                ? 'Each family pays the same, whatever its size.'
                : mode === 'shares'
                  ? 'Give children or light eaters a smaller share, like 0.5.'
                  : 'Enter exactly what each person owes.'}
          </ThemedText>
          {mode === 'exact' && <Tally entered={sum(exactAmounts)} total={amount} />}
        </View>

        {trip.families.map((family) => {
          const members = membersOf(family.id);
          const allOn = members.every((member) => memberOn[member.id]);
          const familyShare = members.reduce((total, member) => total + (preview?.get(member.id) ?? 0), 0);

          if (mode === 'perFamily') {
            return (
              <Pressable key={family.id} onPress={() => setFamilyOn({ ...familyOn, [family.id]: !familyOn[family.id] })}>
                <Card style={styles.row}>
                  <Checkbox checked={familyOn[family.id]} />
                  <Avatar name={family.name} color={family.color} size={32} />
                  <View style={styles.grow}>
                    <ThemedText type="bold">{family.name} family</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {members.length === 1 ? '1 person' : `${members.length} people`}
                    </ThemedText>
                  </View>
                  <ThemedText type="smallBold" numberOfLines={1}>
                    {familyShare > 0 ? formatPaise(familyShare) : '—'}
                  </ThemedText>
                </Card>
              </Pressable>
            );
          }

          return (
            <Card key={family.id}>
              <Pressable
                disabled={mode !== 'equal'}
                onPress={() =>
                  setMemberOn({ ...memberOn, ...Object.fromEntries(members.map((member) => [member.id, !allOn])) })
                }
                style={styles.row}>
                <Avatar name={family.name} color={family.color} size={32} />
                <ThemedText type="bold" style={styles.grow}>
                  {family.name} family
                </ThemedText>
                {mode === 'equal' && (
                  <ThemedText type="smallBold" numberOfLines={1} themeColor="primary">
                    {allOn ? 'Clear' : 'Select all'}
                  </ThemedText>
                )}
              </Pressable>

              {members.map((member) =>
                mode === 'equal' ? (
                  <Pressable
                    key={member.id}
                    accessibilityRole="checkbox"
                    accessibilityState={{ checked: memberOn[member.id] }}
                    onPress={() => setMemberOn({ ...memberOn, [member.id]: !memberOn[member.id] })}
                    style={[styles.row, styles.memberRow]}>
                    <Checkbox checked={memberOn[member.id]} />
                    <ThemedText style={styles.grow}>{member.name}</ThemedText>
                    <ThemedText type="smallBold" numberOfLines={1} themeColor="textSecondary">
                      {shareOf(member.id)}
                    </ThemedText>
                  </Pressable>
                ) : mode === 'shares' ? (
                  <View key={member.id} style={[styles.row, styles.memberRow]}>
                    <View style={styles.grow}>
                      <ThemedText>{member.name}</ThemedText>
                      <ThemedText type="small" themeColor="textSecondary">
                        {shareOf(member.id)}
                      </ThemedText>
                    </View>
                    <IconButton
                      icon="remove"
                      label={`Smaller share for ${member.name}`}
                      onPress={() => setShares({ ...shares, [member.id]: Math.max(0, shares[member.id] - 0.5) })}
                    />
                    <ThemedText type="bold" style={styles.shareValue}>
                      {shares[member.id]}
                    </ThemedText>
                    <IconButton
                      icon="add"
                      label={`Bigger share for ${member.name}`}
                      onPress={() => setShares({ ...shares, [member.id]: Math.min(5, shares[member.id] + 0.5) })}
                    />
                  </View>
                ) : (
                  <View key={member.id} style={[styles.row, styles.memberRow]}>
                    <ThemedText style={styles.grow}>{member.name}</ThemedText>
                    <MoneyInput
                      label={`Owed by ${member.name}`}
                      value={exactTexts[member.id] ?? ''}
                      onChange={(text) => setExactTexts({ ...exactTexts, [member.id]: text })}
                    />
                  </View>
                ),
              )}
            </Card>
          );
        })}

        {existing && !trip.finalizedAt && (
          <Button label="Delete expense" icon="delete" variant="danger" onPress={confirmDelete} />
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

export default function ExpenseScreen() {
  const { tripId, expenseId } = useLocalSearchParams<{ tripId: string; expenseId?: string }>();
  const trip = useTrip(tripId);

  if (!trip) {
    return <EmptyState emoji="🤔" title="Trip not found" body="It may have been deleted from this phone." />;
  }
  return <ExpenseForm trip={trip} existing={trip.expenses.find((expense) => expense.id === expenseId)} />;
}

const styles = StyleSheet.create({
  grow: {
    flex: 1,
  },
  content: {
    padding: Spacing.three,
    gap: Spacing.three,
  },
  amountRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  amountInput: {
    minWidth: 96,
    fontSize: 44,
    fontWeight: 800,
    paddingVertical: Spacing.one,
  },
  section: {
    gap: Spacing.two,
  },
  chips: {
    gap: Spacing.two,
    paddingRight: Spacing.three,
  },
  chip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 40,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
    borderRadius: Radius.pill,
    borderWidth: StyleSheet.hairlineWidth,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  spread: {
    justifyContent: 'space-between',
  },
  memberRow: {
    minHeight: 44,
  },
  shareValue: {
    minWidth: 32,
    textAlign: 'center',
  },
  money: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    width: 124,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.small,
    borderWidth: StyleSheet.hairlineWidth,
  },
  moneyInput: {
    flex: 1,
    minHeight: 40,
    paddingVertical: Spacing.one,
    fontSize: 16,
    fontWeight: 600,
    textAlign: 'right',
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
