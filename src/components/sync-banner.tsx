import { StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { plural, useT } from '@/i18n';
import { usePersonalExpenses } from '@/store/personal';
import { useTrips } from '@/store/trips';
import { syncNow, unsentCount, useSync } from '@/sync/sync';

/**
 * Says when the server cannot be reached and how much is waiting to be sent, with a way to try again.
 * Other sync problems, such as a database missing an update, show as a plain message.
 */
export function SyncBanner() {
  const t = useT();
  const theme = useTheme();
  const sync = useSync();
  // Read so the count follows edits as they are made.
  useTrips();
  usePersonalExpenses();

  if (!sync.session) {
    return null;
  }
  if (!sync.offline) {
    return sync.error ? (
      <ThemedText type="small" themeColor="negative">
        {t(sync.error)}
      </ThemedText>
    ) : null;
  }
  const waiting = unsentCount();
  const trying = sync.status === 'syncing';
  return (
    <View style={[styles.banner, { backgroundColor: theme.warningSoft }]}>
      <Icon name="cloudOff" size={22} color={theme.warning} />
      <View style={styles.grow}>
        <ThemedText type="smallBold" style={{ color: theme.warning }}>
          {t('Offline')}
        </ThemedText>
        <ThemedText type="caption" style={{ color: theme.warning }}>
          {waiting > 0
            ? plural(t, waiting, '{count} change is saved on this phone and will sync when you are back online.', '{count} changes are saved on this phone and will sync when you are back online.')
            : t('Showing what is saved on this phone.')}
        </ThemedText>
      </View>
      <Button label={trying ? t('Trying…') : t('Retry')} variant="soft" compact disabled={trying} onPress={() => void syncNow()} />
    </View>
  );
}

const styles = StyleSheet.create({
  banner: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.medium,
  },
  grow: {
    flex: 1,
  },
});
