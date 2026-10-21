import * as Clipboard from 'expo-clipboard';
import { useState } from 'react';
import { Linking, Modal, Pressable, StyleSheet, View } from 'react-native';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { formatPaise, upiLink, type Paise } from '@/domain';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/i18n';

type Props = {
  payee: string;
  upiId: string;
  amount: Paise;
  note: string;
  onClose: () => void;
  onMarkPaid: () => void;
};

function CopyRow({ label, value, copyText }: { label: string; value: string; copyText: string }) {
  const theme = useTheme();
  const t = useT();
  const [copied, setCopied] = useState(false);

  const copy = async () => {
    await Clipboard.setStringAsync(copyText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <View style={styles.copyRow}>
      <View style={styles.grow}>
        <ThemedText type="caption" themeColor="textSecondary">
          {label}
        </ThemedText>
        <ThemedText type="bold" selectable numberOfLines={1}>
          {value}
        </ThemedText>
      </View>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={t('Copy {what}', { what: label })}
        hitSlop={8}
        onPress={() => void copy()}
        style={[styles.copyButton, { backgroundColor: copied ? theme.positiveSoft : theme.primarySoft }]}>
        <Icon name={copied ? 'check' : 'copy'} size={16} color={copied ? theme.positive : theme.primary} />
        <ThemedText type="smallBold" style={{ color: copied ? theme.positive : theme.primary }}>
          {copied ? t('Copied') : t('Copy')}
        </ThemedText>
      </Pressable>
    </View>
  );
}

/**
 * Paying with UPI. Opening a UPI app with everything filled in is quickest, but Google Pay and some
 * other apps refuse or cap payments to personal UPI IDs started from another app. Copying the UPI ID
 * into the app's own "Pay UPI ID" screen always works, so both ways are offered.
 */
export function UpiPaySheet({ payee, upiId, amount, note, onClose, onMarkPaid }: Props) {
  const theme = useTheme();
  const t = useT();
  const [noApp, setNoApp] = useState(false);

  const openApp = async () => {
    try {
      await Linking.openURL(upiLink(upiId, payee, amount, note));
    } catch {
      setNoApp(true);
    }
  };

  return (
    <Modal transparent visible animationType="fade" statusBarTranslucent navigationBarTranslucent onRequestClose={onClose}>
      <Pressable accessibilityLabel={t('Close')} onPress={onClose} style={styles.backdrop}>
        <Pressable onPress={() => {}} style={[styles.card, { backgroundColor: theme.backgroundElement }]}>
          <View style={[styles.badge, { backgroundColor: theme.primarySoft }]}>
            <Icon name="rupee" size={28} color={theme.primary} />
          </View>
          <ThemedText type="heading" style={styles.centered}>
            {t('Pay {name} {amount}', { name: payee, amount: formatPaise(amount) })}
          </ThemedText>

          <View style={[styles.details, { backgroundColor: theme.background, borderColor: theme.border }]}>
            <CopyRow label={t('UPI ID')} value={upiId} copyText={upiId} />
            <View style={[styles.divider, { backgroundColor: theme.border }]} />
            <CopyRow label={t('Amount')} value={formatPaise(amount)} copyText={(amount / 100).toFixed(2)} />
          </View>

          <ThemedText type="small" themeColor={noApp ? 'negative' : 'textSecondary'} style={styles.centered}>
            {noApp
              ? t('No UPI app opened. Copy the UPI ID and pay from any UPI app.')
              : t('If your UPI app will not complete the payment, copy the UPI ID, open the app, choose “Pay UPI ID” and paste it.')}
          </ThemedText>

          <View style={styles.actions}>
            <Button label={t('Open UPI app')} icon="openApp" onPress={() => void openApp()} />
            <Button
              label={t('I have paid')}
              icon="check"
              variant="soft"
              onPress={() => {
                onClose();
                onMarkPaid();
              }}
            />
            <Pressable accessibilityRole="button" hitSlop={8} onPress={onClose} style={styles.close}>
              <ThemedText type="smallBold" themeColor="textSecondary">
                {t('Close')}
              </ThemedText>
            </Pressable>
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
    gap: Spacing.three,
    padding: Spacing.four,
    borderRadius: Radius.large,
  },
  badge: {
    width: 56,
    height: 56,
    borderRadius: 28,
    alignItems: 'center',
    justifyContent: 'center',
  },
  centered: {
    textAlign: 'center',
  },
  details: {
    alignSelf: 'stretch',
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radius.medium,
    borderWidth: StyleSheet.hairlineWidth,
  },
  copyRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.two,
  },
  grow: {
    flex: 1,
  },
  copyButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    borderRadius: Radius.pill,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
  },
  actions: {
    alignSelf: 'stretch',
    gap: Spacing.two,
  },
  close: {
    alignSelf: 'center',
    paddingVertical: Spacing.two,
  },
});
