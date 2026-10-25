import { Children, Fragment, type ReactNode } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

/**
 * A titled group of rows in one card, like a phone's own settings. `plain` is for rows without
 * icons, so the lines between them run the full width.
 */
export function SettingsSection({
  title,
  footer,
  plain,
  children,
}: {
  title?: string;
  footer?: string;
  plain?: boolean;
  children: ReactNode;
}) {
  const theme = useTheme();
  const rows = Children.toArray(children).filter(Boolean);
  return (
    <View style={styles.section}>
      {title && (
        <ThemedText type="caption" themeColor="textSecondary" style={styles.sectionTitle}>
          {title}
        </ThemedText>
      )}
      <View style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
        {rows.map((row, index) => (
          <Fragment key={index}>
            {index > 0 && <View style={[styles.divider, plain && styles.dividerPlain, { backgroundColor: theme.border }]} />}
            {row}
          </Fragment>
        ))}
      </View>
      {footer && (
        <ThemedText type="caption" themeColor="textSecondary" style={styles.sectionTitle}>
          {footer}
        </ThemedText>
      )}
    </View>
  );
}

type RowProps = {
  icon?: IconName;
  label: string;
  /** A short line under the label. */
  detail?: string;
  /** Shown on the right, such as "On" or "English". */
  value?: string;
  /** Replaces the value, for something like a coloured status. */
  trailing?: ReactNode;
  onPress?: () => void;
  /** For rows that remove something. */
  danger?: boolean;
  /** Shows an arrow, for rows that open another page. */
  opens?: boolean;
  accent?: string;
};

export function SettingsRow({ icon, label, detail, value, trailing, onPress, danger, opens, accent }: RowProps) {
  const theme = useTheme();
  const color = danger ? theme.negative : (accent ?? theme.primary);
  const tint = danger ? theme.negativeSoft : theme.primarySoft;
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityLabel={[label, detail, value].filter(Boolean).join(', ')}
      disabled={!onPress}
      onPress={onPress}
      style={({ pressed }) => [styles.row, { backgroundColor: pressed ? theme.backgroundSelected : 'transparent' }]}>
      {icon && (
        <View style={[styles.iconTile, { backgroundColor: tint }]}>
          <Icon name={icon} size={18} color={color} />
        </View>
      )}
      <View style={styles.grow}>
        <ThemedText type="bold" style={danger ? { color: theme.negative } : undefined} numberOfLines={1}>
          {label}
        </ThemedText>
        {detail && (
          <ThemedText type="caption" themeColor="textSecondary" numberOfLines={2}>
            {detail}
          </ThemedText>
        )}
      </View>
      {trailing ??
        (value && (
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={1} style={styles.value}>
            {value}
          </ThemedText>
        ))}
      {opens && <Icon name="chevronRight" size={18} color={theme.textSecondary} />}
    </Pressable>
  );
}

const styles = StyleSheet.create({
  section: {
    gap: Spacing.two,
  },
  sectionTitle: {
    paddingHorizontal: Spacing.two,
  },
  card: {
    borderRadius: Radius.medium,
    borderWidth: StyleSheet.hairlineWidth,
    overflow: 'hidden',
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginLeft: Spacing.three + 36 + Spacing.three,
  },
  dividerPlain: {
    marginLeft: Spacing.three,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    minHeight: 60,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.two,
  },
  iconTile: {
    width: 36,
    height: 36,
    borderRadius: Radius.small,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grow: {
    flex: 1,
  },
  value: {
    maxWidth: '40%',
  },
});
