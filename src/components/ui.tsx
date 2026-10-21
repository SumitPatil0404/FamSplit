import type { ReactNode } from 'react';
import {
  Pressable,
  StyleSheet,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type ViewStyle,
} from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { formatPaise } from '@/domain';
import { useColorScheme } from '@/hooks/use-color-scheme';
import { useTheme } from '@/hooks/use-theme';

export function Card({ children, style }: { children: ReactNode; style?: StyleProp<ViewStyle> }) {
  const theme = useTheme();
  return (
    <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }, style]}>
      {children}
    </View>
  );
}

/** Mixes a #RRGGBB colour with white, so dark family colours stay readable on a dark background. */
function lighten(color: string, amount: number): string {
  const channel = (index: number) => {
    const value = parseInt(color.slice(index, index + 2), 16);
    return Math.round(value + (255 - value) * amount)
      .toString(16)
      .padStart(2, '0');
  };
  return /^#[0-9a-fA-F]{6}/.test(color) ? `#${channel(1)}${channel(3)}${channel(5)}` : color;
}

/** Round badge with a person's or family's initial, tinted with the family colour. */
export function Avatar({ name, color, size = 40 }: { name: string; color: string; size?: number }) {
  const dark = useColorScheme() === 'dark';
  const text = dark ? lighten(color, 0.35) : color;
  return (
    <View
      style={[
        styles.avatar,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: `${color}${dark ? '40' : '26'}` },
      ]}>
      <ThemedText
        allowFontScaling={false}
        style={{ color: text, fontSize: size * 0.42, lineHeight: size * 0.56, fontWeight: 800 }}>
        {name.trim().charAt(0).toUpperCase() || '?'}
      </ThemedText>
    </View>
  );
}

type ButtonProps = {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'soft' | 'danger' | 'destructive';
  icon?: IconName;
  disabled?: boolean;
  compact?: boolean;
  style?: StyleProp<ViewStyle>;
};

export function Button({ label, onPress, variant = 'primary', icon, disabled, compact, style }: ButtonProps) {
  const theme = useTheme();
  const palette = {
    primary: { background: theme.primaryFill, text: theme.onPrimary },
    soft: { background: theme.primarySoft, text: theme.primary },
    danger: { background: theme.negativeSoft, text: theme.negative },
    destructive: { background: theme.negativeFill, text: '#FFFFFF' },
  }[variant];

  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ disabled }}
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        styles.button,
        compact && styles.buttonCompact,
        { backgroundColor: palette.background, opacity: disabled ? 0.4 : pressed ? 0.8 : 1 },
        style,
      ]}>
      {icon && <Icon name={icon} size={compact ? 16 : 20} color={palette.text} />}
      <ThemedText type={compact ? 'smallBold' : 'bold'} numberOfLines={1} style={{ color: palette.text }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

export function IconButton({ icon, onPress, label, color }: { icon: IconName; onPress: () => void; label: string; color?: string }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={label}
      hitSlop={8}
      onPress={onPress}
      style={({ pressed }) => [styles.iconButton, { backgroundColor: theme.backgroundSelected, opacity: pressed ? 0.6 : 1 }]}>
      <Icon name={icon} size={18} color={color ?? theme.textSecondary} />
    </Pressable>
  );
}

export function Field({ label, style, ...input }: TextInputProps & { label: string }) {
  const theme = useTheme();
  return (
    <View style={styles.field}>
      <ThemedText type="smallBold" themeColor="textSecondary">
        {label}
      </ThemedText>
      <TextInput
        placeholderTextColor={theme.textSecondary}
        style={[
          styles.input,
          { color: theme.text, backgroundColor: theme.backgroundElement, borderColor: theme.border },
          style,
        ]}
        {...input}
      />
    </View>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
}) {
  const theme = useTheme();
  return (
    <View style={[styles.segmented, { backgroundColor: theme.backgroundSelected }]}>
      {options.map((option) => {
        const selected = option.value === value;
        return (
          <Pressable
            key={option.value}
            accessibilityRole="tab"
            accessibilityState={{ selected }}
            onPress={() => onChange(option.value)}
            style={[styles.segment, selected && { backgroundColor: theme.backgroundElement }]}>
            <ThemedText
              type="smallBold"
              numberOfLines={1}
              adjustsFontSizeToFit
              themeColor={selected ? 'primary' : 'textSecondary'}>
              {option.label}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

/** A sentence with one part, such as a name, in bold, wherever that part falls in the sentence. */
export function Emphasis({ text, bold, small }: { text: string; bold: string; small?: boolean }) {
  const at = bold ? text.indexOf(bold) : -1;
  if (at < 0) {
    return <ThemedText type={small ? 'small' : 'default'}>{text}</ThemedText>;
  }
  return (
    <ThemedText type={small ? 'small' : 'default'}>
      {text.slice(0, at)}
      <ThemedText type={small ? 'smallBold' : 'bold'}>{bold}</ThemedText>
      {text.slice(at + bold.length)}
    </ThemedText>
  );
}

export function Checkbox({ checked }: { checked: boolean }) {
  const theme = useTheme();
  return <Icon name={checked ? 'checkCircle' : 'circle'} size={24} color={checked ? theme.primary : theme.border} />;
}

/** Small coloured label saying whether an amount is owed, owed back, or settled. `{amount}` marks where the amount goes. */
export function BalancePill({ amount, positive, negative, settled }: { amount: number; positive: string; negative: string; settled: string }) {
  const theme = useTheme();
  const tone =
    amount > 0
      ? { background: theme.positiveSoft, text: theme.positive, label: positive.replace('{amount}', formatPaise(amount)) }
      : amount < 0
        ? { background: theme.negativeSoft, text: theme.negative, label: negative.replace('{amount}', formatPaise(-amount)) }
        : { background: theme.backgroundSelected, text: theme.textSecondary, label: settled };

  return (
    <View style={[styles.pill, { backgroundColor: tone.background }]}>
      <ThemedText type="caption" numberOfLines={1} style={{ color: tone.text }}>
        {tone.label}
      </ThemedText>
    </View>
  );
}

export function Tag({ label }: { label: string }) {
  const theme = useTheme();
  return (
    <View style={[styles.tag, { backgroundColor: theme.primarySoft }]}>
      <ThemedText type="caption" numberOfLines={1} themeColor="primary">
        {label}
      </ThemedText>
    </View>
  );
}

export function EmptyState({ emoji, title, body, children }: { emoji: string; title: string; body: string; children?: ReactNode }) {
  return (
    <View style={styles.empty}>
      <ThemedText style={styles.emptyEmoji}>{emoji}</ThemedText>
      <ThemedText type="heading" style={styles.centered}>
        {title}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary" style={styles.centered}>
        {body}
      </ThemedText>
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  card: {
    borderRadius: Radius.medium,
    borderWidth: StyleSheet.hairlineWidth,
    padding: Spacing.three,
    gap: Spacing.two,
  },
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
  },
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    minHeight: 52,
    paddingHorizontal: Spacing.four,
    paddingVertical: Spacing.two,
    borderRadius: Radius.pill,
  },
  buttonCompact: {
    minHeight: 36,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.one,
  },
  iconButton: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  field: {
    gap: Spacing.one,
  },
  input: {
    minHeight: 52,
    borderRadius: Radius.medium,
    borderWidth: StyleSheet.hairlineWidth,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
    fontSize: 16,
    fontWeight: 500,
  },
  segmented: {
    flexDirection: 'row',
    borderRadius: Radius.pill,
    padding: Spacing.one,
  },
  segment: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 40,
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.two,
    borderRadius: Radius.pill,
  },
  pill: {
    alignSelf: 'flex-start',
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.one,
    borderRadius: Radius.pill,
  },
  tag: {
    paddingHorizontal: Spacing.two,
    paddingVertical: Spacing.half,
    borderRadius: Radius.pill,
  },
  empty: {
    alignItems: 'center',
    gap: Spacing.two,
    paddingVertical: Spacing.five,
    paddingHorizontal: Spacing.three,
  },
  emptyEmoji: {
    fontSize: 48,
    lineHeight: 60,
  },
  centered: {
    textAlign: 'center',
  },
});

/** Floating action button pinned to the bottom of a screen. */
export function Fab({ label, icon, onPress, bottom }: { label: string; icon: IconName; onPress: () => void; bottom: number }) {
  const theme = useTheme();
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      style={({ pressed }) => [
        fabStyles.fab,
        { backgroundColor: theme.primaryFill, bottom: bottom + Spacing.three, opacity: pressed ? 0.85 : 1 },
      ]}>
      <Icon name={icon} size={22} color={theme.onPrimary} />
      <ThemedText type="bold" numberOfLines={1} style={{ color: theme.onPrimary }}>
        {label}
      </ThemedText>
    </Pressable>
  );
}

const fabStyles = StyleSheet.create({
  fab: {
    position: 'absolute',
    right: Spacing.three,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
    minHeight: 56,
    paddingHorizontal: Spacing.four,
    borderRadius: Radius.pill,
    elevation: 6,
    shadowColor: '#000',
    shadowOpacity: 0.2,
    shadowRadius: 8,
    shadowOffset: { width: 0, height: 4 },
  },
});
