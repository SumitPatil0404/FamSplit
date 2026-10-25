import Constants from 'expo-constants';
import { useRouter } from 'expo-router';
import * as WebBrowser from 'expo-web-browser';
import { useEffect, useRef, useState } from 'react';
import { AppState, Linking, ScrollView, StyleSheet, View } from 'react-native';

import { confirmDialog } from '@/components/dialog';
import { SettingsRow, SettingsSection } from '@/components/settings';
import { ThemedText } from '@/components/themed-text';
import { showToast } from '@/components/toast';
import { Avatar, Button, EmptyState } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { LANGUAGE_NAMES, useLanguage, useT } from '@/i18n';
import { bankAlertsAvailable, useBankAlertsEnabled } from '@/notifications/bank-alerts';
import { notificationStatus, registerForPush, turnOnNotifications, type NotificationStatus } from '@/notifications/push';
import { supabase } from '@/sync/supabase';
import { deleteAccount, hasUnsentChanges, signInWithGoogle, signOut, syncNow, unsentCount, useSync } from '@/sync/sync';

const PRIVACY_POLICY_URL = 'https://famsplit-75fca.web.app/privacy';

/** "English", or the phone's own language when FamSplit follows the phone. */
function LanguageRow() {
  const router = useRouter();
  const { choice, phone, t } = useLanguage();
  return (
    <SettingsRow
      icon="language"
      label={t('Language')}
      value={choice === 'system' ? LANGUAGE_NAMES[phone] : LANGUAGE_NAMES[choice]}
      opens
      onPress={() => router.push('/language')}
    />
  );
}

/**
 * Whether this phone gets notifications. FamSplit only asks on its own once, so this is where
 * someone who said no can turn them on, and where someone who said yes can manage them.
 */
function NotificationsRow() {
  const t = useT();
  const theme = useTheme();
  const [status, setStatus] = useState<NotificationStatus | null>(null);
  const shown = useRef<NotificationStatus | null>(null);

  useEffect(() => {
    const check = async () => {
      const next = await notificationStatus();
      // Turned on in Android's settings while away: tell the server about this phone straight away.
      if (next === 'on' && shown.current !== null && shown.current !== 'on' && supabase) {
        void registerForPush(supabase, 'never');
      }
      shown.current = next;
      setStatus(next);
    };
    void check();
    const subscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') {
        void check();
      }
    });
    return () => subscription.remove();
  }, []);

  if (status === null || status === 'unsupported' || !supabase) {
    return null;
  }
  const client = supabase;
  const on = status === 'on';
  const press = async () => {
    if (on) {
      // Turning them off, or choosing which kinds, happens in Android's settings.
      await Linking.openSettings();
      return;
    }
    await turnOnNotifications(client);
    const next = await notificationStatus();
    shown.current = next;
    setStatus(next);
  };

  return (
    <SettingsRow
      icon="bell"
      label={t('Notifications')}
      detail={
        on
          ? t('Trip changes, payment reminders and bank payments to sort')
          : status === 'blocked'
            ? t('Off. Tap to turn them on in Android’s settings.')
            : t('Off. Tap to turn them on.')
      }
      trailing={
        <ThemedText type="smallBold" style={{ color: on ? theme.positive : theme.negative }}>
          {on ? t('On') : t('Off')}
        </ThemedText>
      }
      onPress={() => void press()}
    />
  );
}

function BankAlertsRow() {
  const t = useT();
  const router = useRouter();
  const enabled = useBankAlertsEnabled();
  return (
    <SettingsRow
      icon="rupee"
      label={t('Bank payments')}
      detail={enabled ? t('Picking up payment alerts') : t('Pick up bank payments automatically')}
      value={enabled ? t('On') : t('Off')}
      opens
      onPress={() => router.push('/detected')}
    />
  );
}

function HelpSection() {
  const t = useT();
  const router = useRouter();
  const version = Constants.expoConfig?.version;
  return (
    <>
      <SettingsSection title={t('HELP')}>
        <SettingsRow icon="help" label={t('How FamSplit works')} opens onPress={() => router.push('/welcome')} />
        <SettingsRow icon="lock" label={t('Privacy policy')} opens onPress={() => void WebBrowser.openBrowserAsync(PRIVACY_POLICY_URL)} />
      </SettingsSection>
      {version && (
        <ThemedText type="caption" themeColor="textSecondary" style={styles.centered}>
          FamSplit {version}
        </ThemedText>
      )}
    </>
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
      <View style={styles.signIn}>
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
      </View>
      <SettingsSection title={t('SETTINGS')}>
        <LanguageRow />
        {bankAlertsAvailable && <BankAlertsRow />}
      </SettingsSection>
      <HelpSection />
    </ScrollView>
  );
}

export default function AccountScreen() {
  const sync = useSync();
  const t = useT();
  const theme = useTheme();

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

  const { user } = sync.session;
  const name = String(user.user_metadata?.full_name ?? user.user_metadata?.name ?? '').trim();
  const waiting = unsentCount();

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

  const syncDetail =
    sync.status === 'syncing'
      ? t('Syncing…')
      : sync.offline
        ? waiting > 0
          ? t('Offline · {count} waiting', { count: waiting })
          : t('Offline')
        : sync.error
          ? t(sync.error)
          : t('Everything is synced');

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.profile}>
        <Avatar name={name || user.email || '?'} color={theme.primary} size={72} />
        {name !== '' && <ThemedText type="heading">{name}</ThemedText>}
        <ThemedText type="small" themeColor="textSecondary">
          {user.email}
        </ThemedText>
      </View>

      <SettingsSection title={t('SYNC')}>
        <SettingsRow
          icon="sync"
          label={sync.status === 'syncing' ? t('Syncing…') : t('Sync now')}
          detail={syncDetail}
          accent={sync.error ? theme.negative : undefined}
          onPress={sync.status === 'syncing' ? undefined : () => void syncNow()}
        />
      </SettingsSection>

      <SettingsSection title={t('SETTINGS')}>
        <NotificationsRow />
        <LanguageRow />
        {bankAlertsAvailable && <BankAlertsRow />}
      </SettingsSection>

      <HelpSection />

      <SettingsSection
        title={t('ACCOUNT')}
        footer={t('Deleting your account removes your sign-in and the trips only you are on. It cannot be undone.')}>
        <SettingsRow icon="logout" label={t('Sign out')} onPress={confirmSignOut} />
        <SettingsRow icon="delete" label={t('Delete account')} danger onPress={confirmDelete} />
      </SettingsSection>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: Spacing.three,
    gap: Spacing.four,
    paddingBottom: Spacing.six,
  },
  profile: {
    alignItems: 'center',
    gap: Spacing.one,
    paddingVertical: Spacing.two,
  },
  signIn: {
    gap: Spacing.three,
  },
  centered: {
    textAlign: 'center',
  },
});
