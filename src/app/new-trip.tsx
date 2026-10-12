import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, Field } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { createTrip, getMyName } from '@/store/trips';

export default function NewTripScreen() {
  const router = useRouter();
  const [name, setName] = useState('');
  const [myName, setMyName] = useState(getMyName);
  const [familyName, setFamilyName] = useState('');

  const ready = name.trim() !== '' && myName.trim() !== '' && familyName.trim() !== '';

  const create = () => {
    const tripId = createTrip({ name: name.trim(), myName: myName.trim(), familyName: familyName.trim() });
    router.replace(`/trip/${tripId}`);
  };

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.grow}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Field label="Trip name" placeholder="Goa with the cousins" value={name} onChangeText={setName} autoFocus />
        <Field label="Your name" placeholder="Rajesh" value={myName} onChangeText={setMyName} />
        <Field label="Your family" placeholder="Sharma" value={familyName} onChangeText={setFamilyName} />
        <ThemedText type="small" themeColor="textSecondary">
          You start as the head of your family. You can add the rest of your family and the other families next.
        </ThemedText>
        <Button label="Create trip" onPress={create} disabled={!ready} style={styles.button} />
      </ScrollView>
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
  button: {
    marginTop: Spacing.two,
  },
});
