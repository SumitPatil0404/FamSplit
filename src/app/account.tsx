import { useState } from 'react';
import { KeyboardAvoidingView, ScrollView, StyleSheet, View } from 'react-native';

import { confirmDialog } from '@/components/dialog';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, EmptyState, Field } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { showToast } from '@/components/toast';
import { deleteAccount, hasUnsentChanges, signIn, signOut, signUp, syncNow, useSync } from '@/sync/sync';

function SignInForm() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const ready = email.includes('@') && password.length >= 6 && !busy;

  const submit = async (mode: 'signIn' | 'signUp') => {
    setBusy(true);
    setMessage(null);
    if (mode === 'signIn') {
      setMessage(await signIn(email.trim(), password));
    } else {
      const result = await signUp(email.trim(), password);
      setMessage(result.error ?? (result.confirmEmail ? 'Check your email to confirm your account, then sign in.' : null));
    }
    setBusy(false);
  };

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.grow}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ThemedText type="heading">Share trips with the other families</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          With an account, other families can join your trips with a code, everyone sees expenses as they are added,
          and your trips are backed up.
        </ThemedText>
        <Field
          label="Email"
          placeholder="you@example.com"
          value={email}
          onChangeText={setEmail}
          autoCapitalize="none"
          autoCorrect={false}
          keyboardType="email-address"
        />
        <Field
          label="Password"
          placeholder="At least 6 characters"
          value={password}
          onChangeText={setPassword}
          autoCapitalize="none"
          secureTextEntry
        />
        {message && (
          <ThemedText type="small" themeColor="negative">
            {message}
          </ThemedText>
        )}
        <Button label={busy ? 'Please wait…' : 'Sign in'} onPress={() => submit('signIn')} disabled={!ready} />
        <Button label="Create an account" variant="soft" onPress={() => submit('signUp')} disabled={!ready} />
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

export default function AccountScreen() {
  const sync = useSync();

  if (!sync.configured) {
    return (
      <EmptyState
        emoji="📱"
        title="Trips stay on this phone for now"
        body="Sharing between phones switches on once the Supabase project keys are added to .env.local and the app is restarted."
      />
    );
  }

  if (!sync.session) {
    return <SignInForm />;
  }

  const confirmSignOut = () =>
    confirmDialog({
      icon: 'logout',
      tone: 'danger',
      title: 'Sign out?',
      message: hasUnsentChanges()
        ? 'Some changes have not reached the server yet and will be lost. Shared trips come back when you sign in again.'
        : 'Shared trips are removed from this phone and come back when you sign in again.',
      confirmLabel: 'Sign out',
      onConfirm: () => void signOut(),
    });

  const confirmDelete = () =>
    confirmDialog({
      icon: 'delete',
      tone: 'danger',
      title: 'Delete your account?',
      message:
        'Your sign-in is removed for good. Trips only you are on are deleted. Trips you share with other families stay for them, with your name still on those trips. This cannot be undone.',
      confirmLabel: 'Delete my account',
      cancelLabel: 'Keep my account',
      onConfirm: async () => {
        const problem = await deleteAccount();
        if (problem) {
          confirmDialog({ icon: 'delete', title: 'Account not deleted', message: problem, confirmLabel: 'OK', hideCancel: true });
        } else {
          showToast({ icon: 'check', title: 'Account deleted', body: 'Your sign-in and your trips have been removed.' });
        }
      },
    });

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Card>
        <ThemedText type="caption" themeColor="textSecondary">
          SIGNED IN AS
        </ThemedText>
        <ThemedText type="bold">{sync.session.user.email}</ThemedText>
      </Card>
      <Card>
        <ThemedText type="bold">
          {sync.status === 'syncing' ? 'Syncing…' : sync.status === 'error' ? 'Not fully synced' : 'Everything is synced'}
        </ThemedText>
        {sync.error && (
          <ThemedText type="small" themeColor="negative">
            {sync.error}
          </ThemedText>
        )}
        <View style={styles.spacer} />
        <Button label="Sync now" variant="soft" onPress={() => void syncNow()} disabled={sync.status === 'syncing'} />
      </Card>
      <Button label="Sign out" variant="soft" onPress={confirmSignOut} />

      <View style={styles.dangerZone}>
        <ThemedText type="small" themeColor="textSecondary">
          Deleting your account removes your sign-in and the trips only you are on. It cannot be undone.
        </ThemedText>
        <Button label="Delete account" icon="delete" variant="danger" onPress={confirmDelete} />
      </View>
    </ScrollView>
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
  spacer: {
    height: Spacing.one,
  },
  dangerZone: {
    gap: Spacing.two,
    marginTop: Spacing.four,
  },
});
