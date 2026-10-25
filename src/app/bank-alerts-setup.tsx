import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Button } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/i18n';
import { turnOnBankAlerts } from '@/notifications/bank-alerts';

function Point({ icon, title, body }: { icon: IconName; title: string; body: string }) {
  const theme = useTheme();
  return (
    <View style={styles.point}>
      <View style={[styles.pointIcon, { backgroundColor: theme.primarySoft }]}>
        <Icon name={icon} size={20} color={theme.primary} />
      </View>
      <View style={styles.grow}>
        <ThemedText type="bold">{title}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {body}
        </ThemedText>
      </View>
    </View>
  );
}

/**
 * What FamSplit reads and what it does with it, shown before Android's Notification access page.
 * Google Play requires this to come first and the user to agree to it.
 */
export default function BankAlertsSetupScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const t = useT();

  const agree = async () => {
    await turnOnBankAlerts();
    router.back();
  };

  return (
    <View style={styles.grow}>
      <ScrollView contentContainerStyle={styles.content}>
        <ThemedText type="heading">{t('Pick up bank payments automatically')}</ThemedText>
        <Point
          icon="rupee"
          title={t('What FamSplit reads')}
          body={t('Notifications that look like a payment, such as a bank SMS or an alert from GPay or PhonePe: the amount, who it was paid to or from, and the date.')}
        />
        <Point
          icon="close"
          title={t('What it ignores')}
          body={t('Every other notification is skipped straight away and never saved. Chat apps like WhatsApp are never read.')}
        />
        <Point
          icon="lock"
          title={t('Where it stays')}
          body={t('Payments are kept on this phone only. Nothing leaves it unless you add a payment to a trip, and then only that expense or settle-up is shared with the people on the trip.')}
        />
        <Point
          icon="undo"
          title={t('Turning it off')}
          body={t('Turn off notification access for FamSplit in Android’s settings at any time.')}
        />
        <ThemedText type="small" themeColor="textSecondary">
          {t('Next, Android asks you to allow notification access for FamSplit.')}
        </ThemedText>
      </ScrollView>
      <View style={[styles.footer, { paddingBottom: insets.bottom + Spacing.two }]}>
        <Button label={t('Agree and turn on')} icon="check" onPress={agree} />
        <Button label={t('Not now')} variant="soft" onPress={() => router.back()} />
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  grow: {
    flex: 1,
  },
  content: {
    padding: Spacing.four,
    gap: Spacing.four,
  },
  point: {
    flexDirection: 'row',
    gap: Spacing.three,
  },
  pointIcon: {
    width: 40,
    height: 40,
    borderRadius: Radius.medium,
    alignItems: 'center',
    justifyContent: 'center',
  },
  footer: {
    paddingHorizontal: Spacing.three,
    paddingTop: Spacing.two,
    gap: Spacing.two,
  },
});
