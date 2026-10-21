import { useRouter } from 'expo-router';
import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Pressable, ScrollView, StyleSheet, useWindowDimensions, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Avatar, Button } from '@/components/ui';
import { FamilyColors, Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useT, type T } from '@/i18n';
import { markWelcomeSeen } from '@/store/onboarding';

const [VIOLET, GREEN, AMBER] = FamilyColors;

/** One "who pays whom" line, the same shape the Settle up tab uses. */
function PaymentLine({ from, to, fromColor, toColor, amount }: { from: string; to: string; fromColor: string; toColor: string; amount: string }) {
  const theme = useTheme();
  const t = useT();
  return (
    <View style={styles.line}>
      <Avatar name={from} color={fromColor} size={32} />
      <Icon name="arrowForward" size={18} color={theme.textSecondary} />
      <Avatar name={to} color={toColor} size={32} />
      <ThemedText type="smallBold" style={styles.grow} numberOfLines={1}>
        {t('{from} pays {to}', { from, to })}
      </ThemedText>
      <ThemedText type="smallBold" numberOfLines={1}>
        {amount}
      </ThemedText>
    </View>
  );
}

function FamilyLine({ name, people, color }: { name: string; people: number; color: string }) {
  const t = useT();
  return (
    <View style={styles.line}>
      <Avatar name={name} color={color} size={36} />
      <ThemedText type="bold" style={styles.grow}>
        {t('{name} family', { name })}
      </ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        {t('{count} people', { count: people })}
      </ThemedText>
    </View>
  );
}

// Pictures are functions so they are built after the styles at the bottom of this file exist.
const slides = (t: T): { title: string; body: string; picture: () => ReactNode }[] => [
  {
    title: t('One trip, several families'),
    body: t('Add every family on the trip and everyone in them, even children and grandparents who never use the app. Travelling with friends instead? Pick a Friends trip and everyone settles with everyone.'),
    picture: () => (
      <>
        <FamilyLine name="Sharma" people={4} color={VIOLET} />
        <FamilyLine name="Patel" people={3} color={GREEN} />
        <FamilyLine name="Iyer" people={5} color={AMBER} />
      </>
    ),
  },
  {
    title: t('Family heads settle first'),
    body: t('FamSplit works out a few simple payments between the family heads, so the families square up with each other in one go.'),
    picture: () => (
      <>
        <PaymentLine from="Venkat" to="Rajesh" fromColor={AMBER} toColor={VIOLET} amount="₹12,520" />
        <PaymentLine from="Mahesh" to="Rajesh" fromColor={GREEN} toColor={VIOLET} amount="₹7,112" />
      </>
    ),
  },
  {
    title: t('Then each family settles inside'),
    body: t('Once a head has settled, the family can see what each person owes the head or is owed, without anyone doing the maths.'),
    picture: () => (
      <>
        <PaymentLine from="Sunita" to="Rajesh" fromColor={VIOLET} toColor={VIOLET} amount="₹2,554" />
        <PaymentLine from="Aarav" to="Rajesh" fromColor={VIOLET} toColor={VIOLET} amount="₹4,904" />
        <PaymentLine from="Diya" to="Rajesh" fromColor={VIOLET} toColor={VIOLET} amount="₹4,604" />
      </>
    ),
  },
  {
    title: t('Share it with a code'),
    body: t('Sign in with Google and send the trip’s invite code. Everyone sees expenses as they are added, on their own phone.'),
    picture: () => (
      <View style={styles.codeBox}>
        <ThemedText type="caption" themeColor="textSecondary">
          {t('INVITE CODE')}
        </ThemedText>
        <ThemedText type="title" style={styles.code}>
          GADE-MXY2
        </ThemedText>
      </View>
    ),
  },
];

/** Shown once on a phone's first launch, and again from Account → How FamSplit works. */
export default function WelcomeScreen() {
  const t = useT();
  const router = useRouter();
  const theme = useTheme();
  const { width } = useWindowDimensions();
  const pager = useRef<ScrollView>(null);
  const [page, setPage] = useState(0);
  const SLIDES = slides(t);
  const last = page === SLIDES.length - 1;

  // Counts as seen as soon as it opens, so leaving with the back button doesn't bring it back.
  useEffect(markWelcomeSeen, []);

  const close = () => (router.canGoBack() ? router.back() : router.replace('/'));
  const next = () => {
    if (last) {
      close();
    } else {
      pager.current?.scrollTo({ x: width * (page + 1), animated: true });
      setPage(page + 1);
    }
  };

  return (
    <View style={[styles.screen, { backgroundColor: theme.primaryFill }]}>
      <SafeAreaView style={styles.grow}>
        <View style={styles.top}>
          <Pressable accessibilityRole="button" hitSlop={12} onPress={close}>
            <ThemedText type="smallBold" style={styles.skip}>
              {last ? '' : t('Skip')}
            </ThemedText>
          </Pressable>
        </View>

        <ScrollView
          ref={pager}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onMomentumScrollEnd={(event) => setPage(Math.round(event.nativeEvent.contentOffset.x / width))}>
          {SLIDES.map((slide) => (
            <View key={slide.title} style={[styles.slide, { width }]}>
              <View style={[styles.picture, { backgroundColor: theme.backgroundElement }]}>{slide.picture()}</View>
              <ThemedText type="title" style={styles.title}>
                {slide.title}
              </ThemedText>
              <ThemedText style={styles.body}>{slide.body}</ThemedText>
            </View>
          ))}
        </ScrollView>

        <View style={styles.bottom}>
          <View style={styles.dots}>
            {SLIDES.map((slide, index) => (
              <View key={slide.title} style={[styles.dot, index === page && styles.dotActive]} />
            ))}
          </View>
          <Button
            label={last ? t('Get started') : t('Next')}
            icon={last ? 'check' : 'arrowForward'}
            variant="soft"
            onPress={next}
          />
        </View>
      </SafeAreaView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  grow: {
    flex: 1,
  },
  top: {
    alignItems: 'flex-end',
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.two,
    minHeight: 40,
  },
  skip: {
    color: '#FFFFFFCC',
  },
  slide: {
    paddingHorizontal: Spacing.four,
    justifyContent: 'center',
    gap: Spacing.three,
  },
  picture: {
    borderRadius: Radius.large,
    padding: Spacing.four,
    gap: Spacing.three,
    marginBottom: Spacing.three,
  },
  line: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.two,
  },
  codeBox: {
    alignItems: 'center',
    gap: Spacing.one,
    paddingVertical: Spacing.three,
  },
  code: {
    letterSpacing: 3,
  },
  title: {
    color: '#FFFFFF',
  },
  body: {
    color: '#FFFFFFDD',
    fontSize: 17,
    lineHeight: 26,
  },
  bottom: {
    paddingHorizontal: Spacing.four,
    paddingBottom: Spacing.four,
    gap: Spacing.four,
  },
  dots: {
    flexDirection: 'row',
    justifyContent: 'center',
    gap: Spacing.two,
  },
  dot: {
    width: 8,
    height: 8,
    borderRadius: 4,
    backgroundColor: '#FFFFFF55',
  },
  dotActive: {
    width: 24,
    backgroundColor: '#FFFFFF',
  },
});
