import '@/global.css';

import { Platform } from 'react-native';

export const Colors = {
  light: {
    text: '#15141F',
    textSecondary: '#6E6C80',
    background: '#F5F5FA',
    backgroundElement: '#FFFFFF',
    backgroundSelected: '#ECEBF5',
    border: '#E7E6F0',
    primary: '#6C4DF6',
    primarySoft: '#EEEAFE',
    onPrimary: '#FFFFFF',
    positive: '#0B8A5F',
    positiveSoft: '#DDF6EC',
    negative: '#E5484D',
    negativeSoft: '#FDECEC',
  },
  dark: {
    text: '#F4F3FA',
    textSecondary: '#A3A1B5',
    background: '#0F0E17',
    backgroundElement: '#1B1A27',
    backgroundSelected: '#2A2938',
    border: '#2A2938',
    primary: '#8E78FF',
    primarySoft: '#2A2450',
    onPrimary: '#FFFFFF',
    positive: '#34D399',
    positiveSoft: '#123A2E',
    negative: '#FF8580',
    negativeSoft: '#45201F',
  },
} as const;

export type ThemeColor = keyof typeof Colors.light & keyof typeof Colors.dark;

/** Each family gets one of these so its people are recognisable at a glance. */
export const FamilyColors = [
  '#6C4DF6',
  '#10B981',
  '#F59E0B',
  '#EF5DA8',
  '#0EA5E9',
  '#F4635E',
  '#84CC16',
  '#A855F7',
] as const;

export const Fonts = Platform.select({
  ios: {
    /** iOS `UIFontDescriptorSystemDesignDefault` */
    sans: 'system-ui',
    /** iOS `UIFontDescriptorSystemDesignSerif` */
    serif: 'ui-serif',
    /** iOS `UIFontDescriptorSystemDesignRounded` */
    rounded: 'ui-rounded',
    /** iOS `UIFontDescriptorSystemDesignMonospaced` */
    mono: 'ui-monospace',
  },
  default: {
    sans: 'normal',
    serif: 'serif',
    rounded: 'normal',
    mono: 'monospace',
  },
  web: {
    sans: 'var(--font-display)',
    serif: 'var(--font-serif)',
    rounded: 'var(--font-rounded)',
    mono: 'var(--font-mono)',
  },
});

export const Spacing = {
  half: 2,
  one: 4,
  two: 8,
  three: 16,
  four: 24,
  five: 32,
  six: 64,
} as const;

export const Radius = {
  small: 10,
  medium: 16,
  large: 24,
  pill: 999,
} as const;

export const MaxContentWidth = 800;
