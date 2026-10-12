import { StyleSheet, Text, type TextProps } from 'react-native';

import { ThemeColor } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type ThemedTextProps = TextProps & {
  type?: 'default' | 'bold' | 'title' | 'heading' | 'small' | 'smallBold' | 'caption' | 'amount';
  themeColor?: ThemeColor;
};

export function ThemedText({ style, type = 'default', themeColor, ...rest }: ThemedTextProps) {
  const theme = useTheme();

  return <Text style={[{ color: theme[themeColor ?? 'text'] }, styles[type], style]} {...rest} />;
}

const styles = StyleSheet.create({
  default: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: 500,
  },
  bold: {
    fontSize: 16,
    lineHeight: 24,
    fontWeight: 700,
  },
  title: {
    fontSize: 28,
    lineHeight: 36,
    fontWeight: 800,
  },
  heading: {
    fontSize: 20,
    lineHeight: 28,
    fontWeight: 700,
  },
  small: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: 500,
  },
  smallBold: {
    fontSize: 14,
    lineHeight: 20,
    fontWeight: 700,
  },
  caption: {
    fontSize: 12,
    lineHeight: 16,
    fontWeight: 600,
  },
  amount: {
    fontSize: 36,
    lineHeight: 44,
    fontWeight: 800,
  },
});
