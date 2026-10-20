import { StyleSheet, TextInput, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { formatPaise, type Paise } from '@/domain';
import { useTheme } from '@/hooks/use-theme';
import { cleanAmount } from '@/store/expense-draft';

/** The rounded square with a category's emoji, used wherever an expense is shown. */
export function CategoryTile({ emoji, size = 44 }: { emoji: string; size?: number }) {
  const theme = useTheme();
  return (
    <View
      style={[
        styles.tile,
        { width: size, height: size, borderRadius: size > 50 ? Radius.medium : Radius.small, backgroundColor: theme.backgroundSelected },
      ]}>
      <ThemedText allowFontScaling={false} style={{ fontSize: size * 0.5, lineHeight: size * 0.64 }}>
        {emoji}
      </ThemedText>
    </View>
  );
}

export function MoneyInput({ value, onChange, label }: { value: string; onChange: (text: string) => void; label: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.money, { backgroundColor: theme.background, borderColor: theme.border }]}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        ₹
      </ThemedText>
      <TextInput
        accessibilityLabel={label}
        value={value}
        onChangeText={(text) => onChange(cleanAmount(text))}
        placeholder="0"
        placeholderTextColor={theme.textSecondary}
        keyboardType="decimal-pad"
        style={[styles.moneyInput, { color: theme.text }]}
      />
    </View>
  );
}

/** "₹1,750 of ₹2,750 · ₹1,000 left", the running total Splitwise shows while amounts are typed in. */
export function Tally({ entered, total }: { entered: Paise; total: Paise }) {
  const left = total - entered;
  return (
    <ThemedText type="smallBold" themeColor={left === 0 && total > 0 ? 'positive' : left < 0 ? 'negative' : 'textSecondary'}>
      {formatPaise(entered)} of {formatPaise(total)} ·{' '}
      {left === 0 ? 'all accounted for' : left > 0 ? `${formatPaise(left)} left` : `${formatPaise(-left)} too much`}
    </ThemedText>
  );
}

const styles = StyleSheet.create({
  tile: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  money: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.one,
    width: 124,
    paddingHorizontal: Spacing.two,
    borderRadius: Radius.small,
    borderWidth: StyleSheet.hairlineWidth,
  },
  moneyInput: {
    flex: 1,
    minHeight: 40,
    paddingVertical: Spacing.one,
    fontSize: 16,
    fontWeight: 600,
    textAlign: 'right',
  },
});
