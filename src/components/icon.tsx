import { SymbolView, type AndroidSymbol, type SFSymbol } from 'expo-symbols';
import { Platform, useWindowDimensions, View, type ColorValue } from 'react-native';

import { useTheme } from '@/hooks/use-theme';

const icons = {
  add: { ios: 'plus', android: 'add' },
  remove: { ios: 'minus', android: 'remove' },
  check: { ios: 'checkmark', android: 'check' },
  checkCircle: { ios: 'checkmark.circle.fill', android: 'check_circle' },
  circle: { ios: 'circle', android: 'radio_button_unchecked' },
  close: { ios: 'xmark', android: 'close' },
  chevronRight: { ios: 'chevron.right', android: 'chevron_right' },
  delete: { ios: 'trash', android: 'delete' },
  edit: { ios: 'pencil', android: 'edit' },
  star: { ios: 'star.fill', android: 'star' },
  trip: { ios: 'suitcase.fill', android: 'luggage' },
  groupAdd: { ios: 'person.2.badge.plus', android: 'group_add' },
  personAdd: { ios: 'person.badge.plus', android: 'person_add' },
  undo: { ios: 'arrow.uturn.backward', android: 'undo' },
  person: { ios: 'person.crop.circle', android: 'account_circle' },
  share: { ios: 'square.and.arrow.up', android: 'share' },
  link: { ios: 'link', android: 'link' },
  lock: { ios: 'lock.fill', android: 'lock' },
  logout: { ios: 'rectangle.portrait.and.arrow.right', android: 'logout' },
} satisfies Record<string, { ios: SFSymbol; android: AndroidSymbol }>;

export type IconName = keyof typeof icons;

export function Icon({ name, size = 24, color }: { name: IconName; size?: number; color?: ColorValue }) {
  const theme = useTheme();
  const { fontScale } = useWindowDimensions();
  const symbol = icons[name];
  // Android draws symbols as font glyphs, which would otherwise grow with the system font size.
  const symbolSize = Platform.OS === 'ios' ? size : size / fontScale;

  return (
    <View style={{ width: size, height: size }}>
      <SymbolView
        name={{ ...symbol, web: symbol.android }}
        size={symbolSize}
        tintColor={color ?? theme.text}
        style={{ overflow: 'visible' }}
      />
    </View>
  );
}
