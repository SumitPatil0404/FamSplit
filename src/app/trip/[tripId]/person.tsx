import { Stack, useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { confirmDialog } from '@/components/dialog';
import { ThemedText } from '@/components/themed-text';
import { Button, EmptyState, Field } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { showToast } from '@/components/toast';
import { deleteFamily, getMyName, isMemberUsed, savePerson, setMe, useTrip, type StoredMember, type StoredTrip } from '@/store/trips';

/** Loose check for name@bank; UPI apps do the real validation. */
const looksLikeUpiId = (value: string) => /^[\w.-]{2,}@[a-zA-Z][\w.-]+$/.test(value);

/** Adding or editing someone on a friends trip. */
/** `asMe` is for someone who joined with a code and is not on the list yet. */
function PersonForm({ trip, existing, asMe }: { trip: StoredTrip; existing?: StoredMember; asMe: boolean }) {
  const router = useRouter();
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  // Once a trip is finalised, who is in it is fixed; UPI ids can still be filled in so people can pay.
  const finalised = Boolean(trip.finalizedAt);

  const [name, setName] = useState(existing?.name ?? (asMe ? getMyName() : ''));
  const [upiId, setUpiId] = useState(existing?.upiId ?? '');
  // Bumped after "Add another" so the name box empties and takes the focus again.
  const [round, setRound] = useState(0);

  const trimmed = name.trim();
  const taken = trip.members.some(
    (member) => member.id !== existing?.id && member.name.trim().toLowerCase() === trimmed.toLowerCase(),
  );
  const problem =
    trimmed === ''
      ? 'Enter a name'
      : taken
        ? `${trimmed} is already on this trip`
        : upiId.trim() !== '' && !looksLikeUpiId(upiId.trim())
          ? 'A UPI ID looks like name@bank'
          : null;
  const canRemove = existing && !finalised && existing.id !== trip.meId && !isMemberUsed(trip, existing.id);

  const store = () => savePerson(trip.id, { memberId: existing?.id, name: trimmed, upiId: upiId.trim() || undefined });
  const save = () => {
    const memberId = store();
    if (asMe) {
      setMe(trip.id, memberId);
    }
    router.back();
  };
  const saveAndAddAnother = () => {
    store();
    showToast({ icon: 'personAdd', title: `${trimmed} added`, body: 'Add the next person, or tap back when you are done.' });
    setName('');
    setUpiId('');
    setRound(round + 1);
  };

  const confirmRemove = () => {
    if (!existing) {
      return;
    }
    confirmDialog({
      icon: 'delete',
      tone: 'danger',
      title: `Remove ${existing.name}?`,
      message: 'They are not part of any expense, so nothing else changes.',
      confirmLabel: 'Remove',
      onConfirm: () => {
        deleteFamily(trip.id, existing.familyId);
        router.back();
      },
    });
  };

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.grow}>
      <Stack.Screen options={{ title: existing ? 'Edit person' : asMe ? 'Add yourself' : 'Add person' }} />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Field
          key={round}
          label={asMe ? 'Your name' : 'Name'}
          placeholder="Ravi"
          value={name}
          onChangeText={setName}
          autoFocus={!existing && !asMe}
          editable={!finalised}
        />
        <Field
          label="UPI ID (optional)"
          placeholder="name@bank"
          value={upiId}
          onChangeText={setUpiId}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
        />
        <ThemedText type="small" themeColor="textSecondary">
          {finalised
            ? 'The trip is finalised, so people cannot be changed. A UPI ID can still be added so others can pay.'
            : 'With a UPI ID, others can pay this person straight from Settle up. Anyone can be added, even if they never use the app.'}
        </ThemedText>
        {existing && !finalised && !canRemove && existing.id !== trip.meId && (
          <ThemedText type="caption" themeColor="textSecondary">
            People who are part of an expense or payment cannot be removed.
          </ThemedText>
        )}
        {canRemove && <Button label={`Remove ${existing.name}`} icon="delete" variant="danger" onPress={confirmRemove} />}
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.two, backgroundColor: theme.background, borderColor: theme.border }]}>
        {problem && trimmed !== '' && (
          <ThemedText type="small" themeColor="textSecondary" style={styles.centered}>
            {problem}
          </ThemedText>
        )}
        <Button
          label={existing ? 'Save changes' : asMe ? 'Add me' : 'Add person'}
          icon="check"
          onPress={save}
          disabled={problem !== null}
        />
        {!existing && !asMe && (
          <Button label="Add and add another" icon="personAdd" variant="soft" onPress={saveAndAddAnother} disabled={problem !== null} />
        )}
      </View>
    </KeyboardAvoidingView>
  );
}

export default function PersonScreen() {
  const { tripId, memberId, asMe } = useLocalSearchParams<{ tripId: string; memberId?: string; asMe?: string }>();
  const trip = useTrip(tripId);

  if (!trip) {
    return <EmptyState emoji="🤔" title="Trip not found" body="It may have been deleted from this phone." />;
  }
  return <PersonForm trip={trip} existing={trip.members.find((member) => member.id === memberId)} asMe={asMe === '1'} />;
}

const styles = StyleSheet.create({
  grow: {
    flex: 1,
  },
  content: {
    padding: Spacing.three,
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
