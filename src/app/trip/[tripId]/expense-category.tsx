import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { EmptyState } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/i18n';
import { CATEGORIES } from '@/store/categories';
import { readDraft, updateDraft, useDraft } from '@/store/expense-draft';
import { useTrip } from '@/store/trips';

export default function CategoryScreen() {
  const t = useT();
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const router = useRouter();
  const theme = useTheme();
  const trip = useTrip(tripId);
  const draft = useDraft();

  if (!trip || !draft) {
    return <EmptyState emoji="🤔" title={t('Nothing to choose for')} body={t('Go back and start the expense again.')} />;
  }
  const current = readDraft(draft, trip).category;

  const choose = (categoryId: string) => {
    updateDraft({ categoryId });
    router.back();
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <View style={styles.grid}>
        {CATEGORIES.map((category) => {
          const selected = category.id === current.id;
          return (
            <Pressable
              key={category.id}
              accessibilityRole="radio"
              accessibilityLabel={t(category.label)}
              accessibilityState={{ selected }}
              onPress={() => choose(category.id)}
              style={({ pressed }) => [
                styles.tile,
                {
                  backgroundColor: selected ? theme.primarySoft : theme.backgroundElement,
                  borderColor: selected ? theme.primary : theme.border,
                  opacity: pressed ? 0.7 : 1,
                },
              ]}>
              <ThemedText allowFontScaling={false} style={styles.emoji}>
                {category.emoji}
              </ThemedText>
              <ThemedText
                type="smallBold"
                numberOfLines={2}
                themeColor={selected ? 'primary' : 'text'}
                style={styles.label}>
                {t(category.label)}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: Spacing.three,
  },
  grid: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'space-between',
    rowGap: Spacing.three,
  },
  tile: {
    width: '31.5%',
    minHeight: 104,
    alignItems: 'center',
    justifyContent: 'center',
    gap: Spacing.two,
    padding: Spacing.two,
    borderRadius: Radius.medium,
    borderWidth: 1,
  },
  emoji: {
    fontSize: 32,
    lineHeight: 40,
  },
  label: {
    textAlign: 'center',
  },
});
