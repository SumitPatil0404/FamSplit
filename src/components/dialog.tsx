import { useSyncExternalStore } from 'react';
import { Modal, Pressable, StyleSheet, View } from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type DialogOptions = {
  title: string;
  message?: string;
  icon?: IconName;
  /** "danger" is for actions that remove something. */
  tone?: 'primary' | 'danger';
  confirmLabel: string;
  cancelLabel?: string;
  /** For messages that only need acknowledging. */
  hideCancel?: boolean;
  onConfirm?: () => void;
};

let current: DialogOptions | null = null;
const listeners = new Set<() => void>();

function set(next: DialogOptions | null) {
  current = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getCurrent = () => current;

/** Asks the user to confirm something, in the app's own style. Can be called from anywhere. */
export function confirmDialog(options: DialogOptions) {
  set(options);
}

/** Mounted once at the root; shows whatever confirmDialog() was last asked for. */
export function DialogHost() {
  const theme = useTheme();
  const dialog = useSyncExternalStore(subscribe, getCurrent, getCurrent);
  const close = () => set(null);

  if (!dialog) {
    return null;
  }

  const danger = dialog.tone === 'danger';
  const confirm = () => {
    close();
    dialog.onConfirm?.();
  };

  return (
    <Modal transparent visible animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={close}>
      <Pressable accessibilityLabel="Close" onPress={close} style={styles.backdrop}>
        {/* Swallows taps so pressing the card itself does not close it. */}
        <Pressable accessibilityRole="alert" onPress={() => {}} style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
          {dialog.icon && (
            <View style={[styles.badge, { backgroundColor: danger ? theme.negativeSoft : theme.primarySoft }]}>
              <Icon name={dialog.icon} size={28} color={danger ? theme.negative : theme.primary} />
            </View>
          )}
          <ThemedText type="heading" style={styles.centered}>
            {dialog.title}
          </ThemedText>
          {dialog.message && (
            <ThemedText type="small" themeColor="textSecondary" style={styles.centered}>
              {dialog.message}
            </ThemedText>
          )}
          <View style={styles.actions}>
            <Button label={dialog.confirmLabel} variant={danger ? 'destructive' : 'primary'} onPress={confirm} />
            {!dialog.hideCancel && <Button label={dialog.cancelLabel ?? 'Cancel'} variant="soft" onPress={close} />}
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: Spacing.four,
    backgroundColor: '#0F0E1799',
  },
  card: {
    alignSelf: 'stretch',
    maxWidth: 420,
    alignItems: 'center',
    gap: Spacing.two,
    padding: Spacing.four,
    borderRadius: Radius.large,
  },
  badge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
    marginBottom: Spacing.one,
  },
  centered: {
    textAlign: 'center',
  },
  actions: {
    alignSelf: 'stretch',
    gap: Spacing.two,
    marginTop: Spacing.three,
  },
});
