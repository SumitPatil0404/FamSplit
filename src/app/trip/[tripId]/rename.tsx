import { useLocalSearchParams, useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, EmptyState, Field } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useT } from '@/i18n';
import { renameTrip, useTrip, type StoredTrip } from '@/store/trips';

function RenameForm({ trip }: { trip: StoredTrip }) {
  const t = useT();
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
          label={t('Trip name')}
          value={name}
          onChangeText={setName}
          autoFocus
          selectTextOnFocus
          returnKeyType="done"
          onSubmitEditing={() => trimmed && trimmed !== trip.name && save()}
        />
        <ThemedText type="small" themeColor="textSecondary">
          {t('The new name shows for everyone on the trip.')}
        </ThemedText>
        <Button label={t('Save name')} icon="check" onPress={save} disabled={trimmed === '' || trimmed === trip.name} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export default function RenameTripScreen() {
  const t = useT();
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const trip = useTrip(tripId);

  if (!trip) {
    return <EmptyState emoji="🤔" title={t('Trip not found')} body={t('It may have been deleted from this phone.')} />;
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
