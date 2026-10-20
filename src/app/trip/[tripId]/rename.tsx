import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, EmptyState, Field } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { renameTrip, useTrip, type StoredTrip } from '@/store/trips';

function RenameForm({ trip }: { trip: StoredTrip }) {
  const router = useRouter();
  const [name, setName] = useState(trip.name);
  const trimmed = name.trim();

  const save = () => {
    renameTrip(trip.id, trimmed);
    router.back();
  };

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.grow}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Field
          label="Trip name"
          value={name}
          onChangeText={setName}
          autoFocus
          selectTextOnFocus
          returnKeyType="done"
          onSubmitEditing={() => trimmed && trimmed !== trip.name && save()}
        />
        <ThemedText type="small" themeColor="textSecondary">
          The new name shows for everyone on the trip.
        </ThemedText>
        <Button label="Save name" icon="check" onPress={save} disabled={trimmed === '' || trimmed === trip.name} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export default function RenameTripScreen() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const trip = useTrip(tripId);

  if (!trip) {
    return <EmptyState emoji="🤔" title="Trip not found" body="It may have been deleted from this phone." />;
  }
  return <RenameForm trip={trip} />;
}

const styles = StyleSheet.create({
  grow: {
    flex: 1,
  },
  content: {
    padding: Spacing.three,
    gap: Spacing.three,
  },
});
