import { useRouter } from 'expo-router';
import { useState } from 'react';
import * as WebBrowser from 'expo-web-browser';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { confirmDialog } from '@/components/dialog';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Button, Card, Checkbox, EmptyState } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { showToast } from '@/components/toast';
import { useTheme } from '@/hooks/use-theme';
import { LANGUAGE_NAMES, setLanguage, useLanguage, useT, type LanguageChoice } from '@/i18n';
import { deleteAccount, hasUnsentChanges, signInWithGoogle, signOut, syncNow, useSync } from '@/sync/sync';

const PRIVACY_POLICY_URL = 'https://famsplit-75fca.web.app/privacy';

const CHOICES: LanguageChoice[] = ['system', 'en', 'hi', 'mr'];

/** English, Hindi or Marathi, or whatever the phone is set to. */
function LanguagePicker() {
  const theme = useTheme();
  const { choice, phone, t } = useLanguage();
  return (
    <Card style={styles.languages}>
      <View style={styles.languageTitle}>
        <Icon name="language" size={20} color={theme.textSecondary} />
        <ThemedText type="bold">{t('Language')}</ThemedText>
      </View>
      {CHOICES.map((option) => (
        <Pressable
          key={option}
          accessibilityRole="radio"
          accessibilityState={{ selected: choice === option }}
          onPress={() => setLanguage(option)}
          style={styles.languageRow}>
          <Checkbox checked={choice === option} />
          <ThemedText style={styles.grow}>
            {option === 'system' ? t('Same as the phone ({language})', { language: LANGUAGE_NAMES[phone] }) : LANGUAGE_NAMES[option]}
          </ThemedText>
        </Pressable>
      ))}
    </Card>
  );
}

function HelpLinks() {
  const router = useRouter();
  const t = useT();
  return (
    <View style={styles.links}>
      <Pressable accessibilityRole="link" hitSlop={8} onPress={() => router.push('/welcome')} style={styles.link}>
        <ThemedText type="smallBold" themeColor="primary">
          {t('How FamSplit works')}
        </ThemedText>
      </Pressable>
      <Pressable
        accessibilityRole="link"
        hitSlop={8}
        onPress={() => void WebBrowser.openBrowserAsync(PRIVACY_POLICY_URL)}
        style={styles.link}>
        <ThemedText type="smallBold" themeColor="primary">
          {t('Privacy policy')}
        </ThemedText>
      </Pressable>
    </View>
  );
}

function SignInPrompt() {
  const [busy, setBusy] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const t = useT();

  const start = async () => {
    setBusy(true);
    setMessage(null);
    setMessage(await signInWithGoogle());
    setBusy(false);
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <ThemedText type="heading">{t('Share trips with your family and friends')}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {t('With an account, others can join your trips with a code, everyone sees expenses as they are added, and your trips are backed up.')}
      </ThemedText>
      {message && (
        <ThemedText type="small" themeColor="negative">
          {t(message)}
        </ThemedText>
      )}
      <Button label={busy ? t('Waiting for Google…') : t('Continue with Google')} icon="person" onPress={start} disabled={busy} />
      <ThemedText type="caption" themeColor="textSecondary" style={styles.centered}>
        {t('Your Google account is only used to sign you in. FamSplit sees your name, email address and profile picture, nothing else.')}
      </ThemedText>
      <LanguagePicker />
      <HelpLinks />
    </ScrollView>
  );
}

export default function AccountScreen() {
  const sync = useSync();
  const t = useT();

  if (!sync.configured) {
    return (
      <EmptyState
        emoji="📱"
        title={t('Trips stay on this phone for now')}
        body={t('Sharing between phones is not set up in this build yet.')}
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
      title: t('Sign out?'),
      message: hasUnsentChanges()
        ? t('Some changes have not reached the server yet and will be lost. Shared trips come back when you sign in again.')
        : t('Shared trips are removed from this phone and come back when you sign in again.'),
      confirmLabel: t('Sign out'),
      onConfirm: () => void signOut(),
    });

  const confirmDelete = () =>
    confirmDialog({
      icon: 'delete',
      tone: 'danger',
      title: t('Delete your account?'),
      message: t(
        'Your sign-in is removed for good. Trips only you are on are deleted. Trips you share with others stay for them, with your name still on those trips. This cannot be undone.',
      ),
      confirmLabel: t('Delete my account'),
      cancelLabel: t('Keep my account'),
      onConfirm: async () => {
        const problem = await deleteAccount();
        if (problem) {
          confirmDialog({ icon: 'delete', title: t('Account not deleted'), message: t(problem), confirmLabel: t('OK'), hideCancel: true });
        } else {
          showToast({ icon: 'check', title: t('Account deleted'), body: t('Your sign-in and your trips have been removed.') });
        }
      },
    });

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <Card>
        <ThemedText type="caption" themeColor="textSecondary">
          {t('SIGNED IN AS')}
        </ThemedText>
        <ThemedText type="bold">{sync.session.user.email}</ThemedText>
      </Card>
      <Card>
        <ThemedText type="bold">
          {sync.status === 'syncing' ? t('Syncing…') : sync.status === 'error' ? t('Not fully synced') : t('Everything is synced')}
        </ThemedText>
        {sync.error && (
          <ThemedText type="small" themeColor="negative">
            {t(sync.error)}
          </ThemedText>
        )}
        <View style={styles.spacer} />
        <Button label={t('Sync now')} variant="soft" onPress={() => void syncNow()} disabled={sync.status === 'syncing'} />
      </Card>
      <Button label={t('Sign out')} variant="soft" onPress={confirmSignOut} />

      <View style={styles.dangerZone}>
        <ThemedText type="small" themeColor="textSecondary">
          {t('Deleting your account removes your sign-in and the trips only you are on. It cannot be undone.')}
        </ThemedText>
        <Button label={t('Delete account')} icon="delete" variant="danger" onPress={confirmDelete} />
      </View>
      <LanguagePicker />
      <HelpLinks />
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
  links: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: Spacing.four,
  },
  link: {
    paddingVertical: Spacing.one,
  },
  grow: {
    flex: 1,
  },
  languages: {
    gap: Spacing.one,
  },
  languageTitle: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    marginBottom: Spacing.one,
  },
  languageRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: 44,
  },
  dangerZone: {
    gap: Spacing.two,
    marginTop: Spacing.four,
  },
});
