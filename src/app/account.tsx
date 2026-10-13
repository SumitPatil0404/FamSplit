import { useState } from 'react';
import { ScrollView, StyleSheet, View } from 'react-native';

import { confirmDialog } from '@/components/dialog';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, EmptyState } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { showToast } from '@/components/toast';
import { deleteAccount, hasUnsentChanges, signInWithGoogle, signOut, syncNow, useSync } from '@/sync/sync';

function SignInPrompt() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const start = async () => {
    setBusy(true);
    setMessage(null);
    setMessage(await signInWithGoogle());
    setBusy(false);
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <ThemedText type="heading">Share trips with the other families</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        With an account, other families can join your trips with a code, everyone sees expenses as they are added, and
        your trips are backed up.
      </ThemedText>
      {message && (
        <ThemedText type="small" themeColor="negative">
          {message}
        </ThemedText>
      )}
      <Button label={busy ? 'Waiting for Google…' : 'Continue with Google'} icon="person" onPress={start} disabled={busy} />
      <ThemedText type="caption" themeColor="textSecondary" style={styles.centered}>
        Your Google account is only used to sign you in. FamSplit sees your name and email address, nothing else.
      </ThemedText>
    </ScrollView>
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
    return <SignInPrompt />;
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
  content: {
    padding: Spacing.three,
    gap: Spacing.three,
  },
  spacer: {
    height: Spacing.one,
  },
  centered: {
    textAlign: 'center',
  },
  dangerZone: {
    gap: Spacing.two,
    marginTop: Spacing.four,
  },
});
