import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Button, EmptyState, Field } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useT } from '@/i18n';
import { joinTrip, useSync } from '@/sync/sync';

export default function JoinScreen() {
  const t = useT();
  const router = useRouter();
  const sync = useSync();
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  if (!sync.session) {
    return (
      <EmptyState
        emoji="🔑"
        title={t('Sign in to join a trip')}
        body={
          sync.configured
            ? t('Joining someone else’s trip needs an account, so everyone sees the same expenses.')
            : 'Sharing between phones is not set up in this build yet.'
        }>
        {sync.configured && <Button label={t('Sign in')} onPress={() => router.replace('/account')} style={styles.button} />}
      </EmptyState>
    );
  }

  const join = async () => {
    setBusy(true);
    setMessage(null);
    try {
      const tripId = await joinTrip(code);
      router.replace(`/trip/${tripId}`);
    } catch (error) {
      setMessage(error instanceof Error ? error.message : t('Could not join that trip.'));
      setBusy(false);
    }
  };

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.grow}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ThemedText type="small" themeColor="textSecondary">
          {t('Ask whoever created the trip for its invite code. They can find it under Families or People in the trip.')}
        </ThemedText>
        <Field
          label={t('Invite code')}
          placeholder="ABCD-EFGH"
          value={code}
          onChangeText={setCode}
          autoCapitalize="characters"
          autoCorrect={false}
          autoFocus
        />
        {message && (
          <ThemedText type="small" themeColor="negative">
            {t(message)}
          </ThemedText>
        )}
        <Button
          label={busy ? t('Joining…') : t('Join trip')}
          onPress={join}
          disabled={busy || code.replace(/[^A-Za-z0-9]/g, '').length < 8}
          style={styles.button}
        />
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
