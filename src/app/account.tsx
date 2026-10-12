import { useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { confirmDialog } from '@/components/dialog';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, EmptyState, Field } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { showToast } from '@/components/toast';
import {
  confirmEmail,
  deleteAccount,
  hasUnsentChanges,
  requestPasswordReset,
  resendConfirmation,
  resetPassword,
  signIn,
  signOut,
  signUp,
  syncNow,
  useSync,
} from '@/sync/sync';

type Step = 'signIn' | 'confirm' | 'forgot' | 'reset';

const looksLikeEmail = (value: string) => /^\S+@\S+\.\S+$/.test(value.trim());
const looksLikeCode = (value: string) => /^\d{6,8}$/.test(value.trim());

function SignInForm() {
  const [step, setStep] = useState<Step>('signIn');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<{ text: string; good?: boolean } | null>(null);

  const address = email.trim();
  const go = (next: Step) => {
    setStep(next);
    setCode('');
    setMessage(null);
  };

  /** Runs one server request with the buttons disabled, and shows what went wrong if it fails. */
  const run = async (action: () => Promise<string | null | undefined>, onSuccess?: () => void) => {
    setBusy(true);
    setMessage(null);
    const problem = await action();
    setBusy(false);
    if (problem) {
      setMessage({ text: problem });
    } else {
      onSuccess?.();
    }
  };

  const submitSignIn = () =>
    run(async () => {
      const result = await signIn(address, password);
      if (result.confirmEmail) {
        go('confirm');
        return (await resendConfirmation(address)) ?? undefined;
      }
      return result.error;
    });

  const submitSignUp = () =>
    run(async () => {
      const result = await signUp(address, password);
      if (result.confirmEmail) {
        go('confirm');
      }
      return result.error;
    });

  const sent = () => setMessage({ text: `A new code is on its way to ${address}.`, good: true });

  const emailField = (
    <Field
      label="Email"
      placeholder="you@example.com"
      value={email}
      onChangeText={setEmail}
      autoCapitalize="none"
      autoCorrect={false}
      keyboardType="email-address"
    />
  );
  const codeField = (
    <Field
      label="Code from the email"
      placeholder="123456"
      value={code}
      onChangeText={(text) => setCode(text.replace(/\D/g, '').slice(0, 8))}
      keyboardType="number-pad"
      autoFocus
    />
  );
  const passwordField = (label: string) => (
    <Field
      label={label}
      placeholder="At least 6 characters"
      value={password}
      onChangeText={setPassword}
      autoCapitalize="none"
      secureTextEntry
    />
  );
  const link = (label: string, onPress: () => void) => (
    <Pressable accessibilityRole="button" hitSlop={8} disabled={busy} onPress={onPress} style={styles.link}>
      <ThemedText type="smallBold" themeColor="primary">
        {label}
      </ThemedText>
    </Pressable>
  );

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.grow}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        {step === 'signIn' && (
          <>
            <ThemedText type="heading">Share trips with the other families</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              With an account, other families can join your trips with a code, everyone sees expenses as they are
              added, and your trips are backed up.
            </ThemedText>
            {emailField}
            {passwordField('Password')}
          </>
        )}
        {step === 'confirm' && (
          <>
            <ThemedText type="heading">Check your email</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              We sent a code to {address}. Enter it here to finish creating your account.
            </ThemedText>
            {codeField}
          </>
        )}
        {step === 'forgot' && (
          <>
            <ThemedText type="heading">Forgot your password?</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Enter the email you signed up with and we will send you a code to choose a new password.
            </ThemedText>
            {emailField}
          </>
        )}
        {step === 'reset' && (
          <>
            <ThemedText type="heading">Choose a new password</ThemedText>
            <ThemedText type="small" themeColor="textSecondary">
              Enter the code we sent to {address}, then your new password.
            </ThemedText>
            {codeField}
            {passwordField('New password')}
          </>
        )}

        {message && (
          <ThemedText type="small" themeColor={message.good ? 'positive' : 'negative'}>
            {message.text}
          </ThemedText>
        )}

        {step === 'signIn' && (
          <>
            <Button
              label={busy ? 'Please wait…' : 'Sign in'}
              onPress={submitSignIn}
              disabled={busy || !looksLikeEmail(email) || password.length < 6}
            />
            <Button
              label="Create an account"
              variant="soft"
              onPress={submitSignUp}
              disabled={busy || !looksLikeEmail(email) || password.length < 6}
            />
            {link('Forgot password?', () => {
              setPassword('');
              go('forgot');
            })}
          </>
        )}
        {step === 'confirm' && (
          <>
            <Button
              label={busy ? 'Please wait…' : 'Confirm email'}
              onPress={() => run(() => confirmEmail(address, code.trim()))}
              disabled={busy || !looksLikeCode(code)}
            />
            {link('Send the code again', () => run(() => resendConfirmation(address), sent))}
            {link('Use a different email', () => go('signIn'))}
          </>
        )}
        {step === 'forgot' && (
          <>
            <Button
              label={busy ? 'Please wait…' : 'Email me a code'}
              onPress={() => run(() => requestPasswordReset(address), () => go('reset'))}
              disabled={busy || !looksLikeEmail(email)}
            />
            {link('Back to sign in', () => go('signIn'))}
          </>
        )}
        {step === 'reset' && (
          <>
            <Button
              label={busy ? 'Please wait…' : 'Save new password'}
              onPress={() => run(() => resetPassword(address, code.trim(), password))}
              disabled={busy || !looksLikeCode(code) || password.length < 6}
            />
            {link('Send the code again', () => run(() => requestPasswordReset(address), sent))}
            {link('Back to sign in', () => go('signIn'))}
          </>
        )}
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
  link: {
    alignSelf: 'center',
    paddingVertical: Spacing.one,
  },
  dangerZone: {
    gap: Spacing.two,
    marginTop: Spacing.four,
  },
});
