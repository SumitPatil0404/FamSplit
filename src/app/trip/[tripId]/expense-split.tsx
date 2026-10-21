import { useLocalSearchParams, useRouter } from 'expo-router';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { MoneyInput, Tally } from '@/components/trip/expense-parts';
import { Avatar, Button, Card, Checkbox, EmptyState, IconButton, Segmented } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { formatPaise } from '@/domain';
import { useTheme } from '@/hooks/use-theme';
import { plural, useT, type T } from '@/i18n';
import { readDraft, sum, updateDraft, useDraft, type SplitMode } from '@/store/expense-draft';
import { isFriendsTrip, personGroups, useTrip } from '@/store/trips';

const hints = (t: T): Record<SplitMode, string> => ({
  equal: t('Everyone ticked pays the same amount.'),
  perFamily: t('Each family ticked pays the same, whatever its size.'),
  shares: t('Give children or light eaters a smaller share, like 0.5.'),
  exact: t('Enter exactly what each person owes.'),
});

export default function SplitScreen() {
  const t = useT();
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const trip = useTrip(tripId);
  const draft = useDraft();

  if (!trip || !draft) {
    return <EmptyState emoji="🤔" title={t('Nothing to split')} body={t('Go back and start the expense again.')} />;
  }
  const { amount, exactAmounts, preview, splitProblem } = readDraft(draft, trip, t);
  const { memberOn, familyOn, shares, exactTexts } = draft;
  const membersOf = (familyId: string) => trip.members.filter((member) => member.familyId === familyId);
  const shareOf = (memberId: string) => {
    const share = preview?.get(memberId);
    return share ? formatPaise(share) : '—';
  };

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.grow}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ThemedText type="heading" style={styles.centered}>
          {amount > 0 ? formatPaise(amount) : t('No amount yet')}
        </ThemedText>
        <Segmented
          value={draft.mode}
          onChange={(mode) => updateDraft({ mode })}
          options={[
            { value: 'equal', label: t('Per person') },
            ...(isFriendsTrip(trip) ? [] : [{ value: 'perFamily' as const, label: t('Per family') }]),
            { value: 'shares', label: t('Shares') },
            { value: 'exact', label: t('Exact') },
          ]}
        />
        <ThemedText type="small" themeColor="textSecondary">
          {hints(t)[draft.mode]}
        </ThemedText>
        {draft.mode === 'exact' && <Tally entered={sum(exactAmounts)} total={amount} />}

        {draft.mode === 'perFamily' &&
          trip.families.map((family) => {
            const members = membersOf(family.id);
            const familyShare = members.reduce((total, member) => total + (preview?.get(member.id) ?? 0), 0);
            return (
              <Pressable
                key={family.id}
                accessibilityRole="checkbox"
                accessibilityState={{ checked: familyOn[family.id] }}
                onPress={() => updateDraft({ familyOn: { ...familyOn, [family.id]: !familyOn[family.id] } })}>
                <Card style={styles.row}>
                  <Checkbox checked={familyOn[family.id]} />
                  <Avatar name={family.name} color={family.color} size={32} />
                  <View style={styles.grow}>
                    <ThemedText type="bold">{t('{name} family', { name: family.name })}</ThemedText>
                    <ThemedText type="small" themeColor="textSecondary">
                      {plural(t, members.length, '{count} person', '{count} people')}
                    </ThemedText>
                  </View>
                  <ThemedText type="smallBold" numberOfLines={1}>
                    {familyShare > 0 ? formatPaise(familyShare) : '—'}
                  </ThemedText>
                </Card>
              </Pressable>
            );
          })}

        {draft.mode !== 'perFamily' &&
          personGroups(trip, t).map((group) => {
            const members = group.members;
            const allOn = members.every((member) => memberOn[member.id]);
            return (
              <Card key={group.id}>
                <Pressable
                  disabled={draft.mode !== 'equal'}
                  onPress={() =>
                    updateDraft({
                      memberOn: { ...memberOn, ...Object.fromEntries(members.map((member) => [member.id, !allOn])) },
                    })
                  }
                  style={styles.row}>
                  {group.title && <Avatar name={group.title} color={group.color} size={32} />}
                  <ThemedText type="bold" style={styles.grow}>
                    {group.title ?? t('Everyone')}
                  </ThemedText>
                  {draft.mode === 'equal' && (
                    <ThemedText type="smallBold" numberOfLines={1} themeColor="primary">
                      {allOn ? t('Clear') : t('Select all')}
                    </ThemedText>
                  )}
                </Pressable>

                {members.map((member) =>
                  draft.mode === 'equal' ? (
                    <Pressable
                      key={member.id}
                      accessibilityRole="checkbox"
                      accessibilityState={{ checked: memberOn[member.id] }}
                      onPress={() => updateDraft({ memberOn: { ...memberOn, [member.id]: !memberOn[member.id] } })}
                      style={[styles.row, styles.memberRow]}>
                      <Checkbox checked={memberOn[member.id]} />
                      <ThemedText style={styles.grow}>{member.name}</ThemedText>
                      <ThemedText type="smallBold" numberOfLines={1} themeColor="textSecondary">
                        {shareOf(member.id)}
                      </ThemedText>
                    </Pressable>
                  ) : draft.mode === 'shares' ? (
                    <View key={member.id} style={[styles.row, styles.memberRow]}>
                      <View style={styles.grow}>
                        <ThemedText>{member.name}</ThemedText>
                        <ThemedText type="small" themeColor="textSecondary">
                          {shareOf(member.id)}
                        </ThemedText>
                      </View>
                      <IconButton
                        icon="remove"
                        label={t('Smaller share for {name}', { name: member.name })}
                        onPress={() =>
                          updateDraft({ shares: { ...shares, [member.id]: Math.max(0, shares[member.id] - 0.5) } })
                        }
                      />
                      <ThemedText type="bold" style={styles.shareValue}>
                        {shares[member.id]}
                      </ThemedText>
                      <IconButton
                        icon="add"
                        label={t('Bigger share for {name}', { name: member.name })}
                        onPress={() =>
                          updateDraft({ shares: { ...shares, [member.id]: Math.min(5, shares[member.id] + 0.5) } })
                        }
                      />
                    </View>
                  ) : (
                    <View key={member.id} style={[styles.row, styles.memberRow]}>
                      <ThemedText style={styles.grow}>{member.name}</ThemedText>
                      <MoneyInput
                        label={t('Owed by {name}', { name: member.name })}
                        value={exactTexts[member.id] ?? ''}
                        onChange={(text) => updateDraft({ exactTexts: { ...exactTexts, [member.id]: text } })}
                      />
                    </View>
                  ),
                )}
              </Card>
            );
          })}
      </ScrollView>

      <View
        style={[
          styles.footer,
          { paddingBottom: insets.bottom + Spacing.two, backgroundColor: theme.background, borderColor: theme.border },
        ]}>
        {splitProblem && (
          <ThemedText type="small" themeColor="textSecondary" style={styles.centered}>
            {splitProblem}
          </ThemedText>
        )}
        <Button label={t('Done')} icon="check" onPress={() => router.back()} />
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
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  memberRow: {
    minHeight: 44,
  },
  shareValue: {
    minWidth: 32,
    textAlign: 'center',
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
