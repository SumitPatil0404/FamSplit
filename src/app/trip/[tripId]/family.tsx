import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { confirmDialog } from '@/components/dialog';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Button, EmptyState, Field, IconButton } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import {
  deleteFamily,
  isFamilyUsed,
  isMemberUsed,
  saveFamily,
  useTrip,
  type StoredFamily,
  type StoredTrip,
} from '@/store/trips';

type Row = { key: string; id?: string; name: string; upiId: string; showUpi: boolean };

/** Loose check for name@bank; UPI apps do the real validation. */
const looksLikeUpiId = (value: string) => /^[\w.-]{2,}@[a-zA-Z][\w.-]+$/.test(value);

function FamilyForm({ trip, existing }: { trip: StoredTrip; existing?: StoredFamily }) {
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  // Once a trip is finalised, who is in it is fixed; UPI ids can still be filled in so people can pay.
  const finalised = Boolean(trip.finalizedAt);

  const [name, setName] = useState(existing?.name ?? '');
  const [rows, setRows] = useState<Row[]>(() =>
    existing
      ? trip.members
          .filter((member) => member.familyId === existing.id)
          .map((member) => ({
            key: member.id,
            id: member.id,
            name: member.name,
            upiId: member.upiId ?? '',
            showUpi: Boolean(member.upiId),
          }))
      : [{ key: 'new0', name: '', upiId: '', showUpi: false }],
  );
  const [headKey, setHeadKey] = useState(existing?.headId ?? 'new0');
  const [nextKey, setNextKey] = useState(1);
  const [focusKey, setFocusKey] = useState<string | null>(null);

  const kept = rows.filter((row) => row.name.trim() !== '');
  const problem =
    name.trim() === ''
      ? 'Give the family a name'
      : rows.some((row) => row.id && row.name.trim() === '')
        ? 'Every existing member needs a name'
        : kept.length === 0
          ? 'Add at least one person'
          : !kept.some((row) => row.key === headKey)
            ? 'Pick a head who has a name'
            : kept.some((row) => row.upiId.trim() !== '' && !looksLikeUpiId(row.upiId.trim()))
              ? 'A UPI ID looks like name@bank'
              : null;

  const canRemove = (row: Row) =>
    !finalised &&
    rows.length > 1 &&
    row.key !== headKey &&
    (!row.id || (row.id !== trip.meId && !isMemberUsed(trip, row.id)));
  const canDelete =
    existing && !finalised && !isFamilyUsed(trip, existing.id) && !rows.some((row) => row.id === trip.meId);

  const change = (key: string, patch: Partial<Row>) =>
    setRows(rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  const addRow = () => {
    const key = `new${nextKey}`;
    setNextKey(nextKey + 1);
    setRows([...rows, { key, name: '', upiId: '', showUpi: false }]);
    setFocusKey(key);
  };

  const save = () => {
    saveFamily(trip.id, {
      familyId: existing?.id,
      name: name.trim(),
      members: kept.map((row) => ({ id: row.id, name: row.name.trim(), upiId: row.upiId.trim() || undefined })),
      headIndex: kept.findIndex((row) => row.key === headKey),
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
      title: `Remove the ${existing.name} family?`,
      message: 'They are not part of any expense, so nothing else changes.',
      confirmLabel: 'Remove family',
      onConfirm: () => {
        deleteFamily(trip.id, existing.id);
        router.back();
      },
    });
  };

  const inputColors = { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: theme.border };

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.grow}>
      <Stack.Screen options={{ title: existing ? 'Edit family' : 'Add family' }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Field
          label="Family name"
          placeholder="Patel"
          value={name}
          onChangeText={setName}
          autoFocus={!existing}
          editable={!finalised}
        />

        <View style={styles.section}>
          <ThemedText type="smallBold" themeColor="textSecondary">
            People
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            {finalised
              ? 'The trip is finalised, so people cannot be changed. UPI IDs can still be added so others can pay.'
              : 'Tap the star to choose the head. The head is the one who settles with the other families. Children and grandparents can be added even if they never use the app.'}
          </ThemedText>
        </View>

        {rows.map((row) => {
          const isHead = row.key === headKey;
          return (
            <View key={row.key} style={styles.person}>
              <View style={styles.row}>
                <Pressable
                  accessibilityRole="radio"
                  accessibilityLabel={`Make ${row.name || 'this person'} the head`}
                  accessibilityState={{ selected: isHead }}
                  disabled={finalised}
                  hitSlop={8}
                  onPress={() => setHeadKey(row.key)}
                  style={[styles.star, { backgroundColor: isHead ? theme.primarySoft : theme.backgroundSelected }]}>
                  <Icon name="star" size={20} color={isHead ? theme.primary : theme.border} />
                </Pressable>
                <TextInput
                  value={row.name}
                  onChangeText={(text) => change(row.key, { name: text })}
                  placeholder={isHead ? 'Name of the head' : 'Name'}
                  placeholderTextColor={theme.textSecondary}
                  autoFocus={row.key === focusKey}
                  editable={!finalised}
                  style={[styles.input, inputColors]}
                />
                {canRemove(row) && (
                  <IconButton
                    icon="close"
                    label={`Remove ${row.name || 'this person'}`}
                    onPress={() => setRows(rows.filter((other) => other.key !== row.key))}
                  />
                )}
              </View>
              {row.showUpi ? (
                <TextInput
                  accessibilityLabel={`UPI ID for ${row.name || 'this person'}`}
                  value={row.upiId}
                  onChangeText={(text) => change(row.key, { upiId: text })}
                  placeholder="UPI ID, like name@bank"
                  placeholderTextColor={theme.textSecondary}
                  autoCapitalize="none"
                  autoCorrect={false}
                  keyboardType="email-address"
                  style={[styles.input, styles.upi, inputColors]}
                />
              ) : (
                <Pressable
                  accessibilityRole="button"
                  hitSlop={6}
                  onPress={() => change(row.key, { showUpi: true })}
                  style={styles.upiLink}>
                  <ThemedText type="smallBold" themeColor="primary">
                    Add UPI ID
                  </ThemedText>
                </Pressable>
              )}
            </View>
          );
        })}

        {!finalised && <Button label="Add a person" icon="personAdd" variant="soft" onPress={addRow} />}

        {existing && !finalised && (
          <ThemedText type="caption" themeColor="textSecondary">
            People who are part of an expense or payment cannot be removed.
          </ThemedText>
        )}
        {canDelete && <Button label="Remove this family" icon="delete" variant="danger" onPress={confirmDelete} />}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.two, backgroundColor: theme.background, borderColor: theme.border }]}>
        {problem && (
          <ThemedText type="small" themeColor="textSecondary" style={styles.centered}>
            {problem}
          </ThemedText>
        )}
        <Button label={existing ? 'Save changes' : 'Add family'} icon="check" onPress={save} disabled={problem !== null} />
      </View>
    </KeyboardAvoidingView>
  );
}

export default function FamilyScreen() {
  const { tripId, familyId } = useLocalSearchParams<{ tripId: string; familyId?: string }>();
  const trip = useTrip(tripId);

  if (!trip) {
    return <EmptyState emoji="🤔" title="Trip not found" body="It may have been deleted from this phone." />;
  }
  return <FamilyForm trip={trip} existing={trip.families.find((family) => family.id === familyId)} />;
}

const styles = StyleSheet.create({
  grow: {
    flex: 1,
  },
  content: {
    padding: Spacing.three,
    gap: Spacing.three,
  },
  section: {
    gap: Spacing.one,
  },
  person: {
    gap: Spacing.one,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  star: {
    width: 44,
    height: 44,
    borderRadius: 22,
    alignItems: 'center',
    justifyContent: 'center',
  },
  input: {
    flex: 1,
    minHeight: 52,
    borderRadius: Radius.medium,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
    fontWeight: 500,
  },
  upi: {
    flex: 0,
    minHeight: 44,
    marginLeft: 44 + Spacing.two,
    fontSize: 14,
  },
  upiLink: {
    alignSelf: 'flex-start',
    marginLeft: 44 + Spacing.two + Spacing.one,
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
