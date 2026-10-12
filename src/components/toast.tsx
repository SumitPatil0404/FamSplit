import { useEffect, useState, useSyncExternalStore } from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { Icon, type IconName } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';

export type Toast = {
  title: string;
  body: string;
  icon?: IconName;
  /** Runs when the banner is tapped, for example to open the trip it is about. */
  onPress?: () => void;
};

const VISIBLE_MS = 5000;

let current: (Toast & { id: number }) | null = null;
let nextId = 1;
const listeners = new Set<() => void>();

function set(next: typeof current) {
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

/** Shows a banner at the top of the app, in the app's own style. Can be called from anywhere. */
export function showToast(toast: Toast) {
  set({ ...toast, id: nextId++ });
}

/** Mounted once at the root; slides in whatever showToast() was last given, then hides it again. */
export function ToastHost() {
  const theme = useTheme();
  const insets = useSafeAreaInsets();
  const toast = useSyncExternalStore(subscribe, getCurrent, getCurrent);
  const [slide] = useState(() => new Animated.Value(0));
  const id = toast?.id;

  useEffect(() => {
    if (id === undefined) {
      return;
    }
    slide.setValue(0);
    Animated.spring(slide, { toValue: 1, useNativeDriver: true, bounciness: 6 }).start();
    const timer = setTimeout(() => {
      Animated.timing(slide, { toValue: 0, duration: 200, useNativeDriver: true }).start(({ finished }) => {
        if (finished && current?.id === id) {
          set(null);
        }
      });
    }, VISIBLE_MS);
    return () => clearTimeout(timer);
  }, [id, slide]);

  if (!toast) {
    return null;
  }

  const press = () => {
    set(null);
    toast.onPress?.();
  };

  return (
    <Animated.View
      pointerEvents="box-none"
      style={[
        styles.host,
        { top: insets.top + Spacing.two },
        { opacity: slide, transform: [{ translateY: slide.interpolate({ inputRange: [0, 1], outputRange: [-80, 0] }) }] },
      ]}>
      <Pressable
        accessibilityRole="alert"
        onPress={press}
        style={[styles.card, { backgroundColor: theme.backgroundElement, borderColor: theme.border }]}>
        <View style={[styles.badge, { backgroundColor: theme.primarySoft }]}>
          <Icon name={toast.icon ?? 'bell'} size={22} color={theme.primary} />
        </View>
        <View style={styles.text}>
          <ThemedText type="smallBold" numberOfLines={1}>
            {toast.title}
          </ThemedText>
          <ThemedText type="small" themeColor="textSecondary" numberOfLines={3}>
            {toast.body}
          </ThemedText>
        </View>
      </Pressable>
    </Animated.View>
  );
}

const styles = StyleSheet.create({
  host: {
    position: 'absolute',
    left: Spacing.three,
    right: Spacing.three,
    alignItems: 'center',
  },
  card: {
    alignSelf: 'stretch',
    maxWidth: 480,
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.medium,
    borderWidth: StyleSheet.hairlineWidth,
    elevation: 8,
    shadowColor: '#000',
    shadowOpacity: 0.18,
    shadowRadius: 12,
    shadowOffset: { width: 0, height: 6 },
  },
  badge: {
    width: 40,
    height: 40,
    borderRadius: 20,
    alignItems: 'center',
    justifyContent: 'center',
  },
  text: {
    flex: 1,
  },
});
