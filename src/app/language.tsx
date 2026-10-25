import { useRouter } from 'expo-router';
import { ScrollView, StyleSheet } from 'react-native';

import { SettingsRow, SettingsSection } from '@/components/settings';
import { Checkbox } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { LANGUAGE_NAMES, setLanguage, useLanguage, type LanguageChoice } from '@/i18n';

const CHOICES: LanguageChoice[] = ['system', 'en', 'hi', 'mr'];

/** English, Hindi or Marathi, or whatever the phone is set to. */
export default function LanguageScreen() {
  const router = useRouter();
  const { choice, phone, t } = useLanguage();
  const choose = (option: LanguageChoice) => {
    setLanguage(option);
    router.back();
  };
  return (
    <ScrollView contentContainerStyle={styles.content}>
      <SettingsSection plain>
        {CHOICES.map((option) => (
          <SettingsRow
            key={option}
            label={option === 'system' ? t('Same as the phone') : LANGUAGE_NAMES[option]}
            detail={option === 'system' ? LANGUAGE_NAMES[phone] : undefined}
            trailing={<Checkbox checked={choice === option} />}
            onPress={() => choose(option)}
          />
        ))}
      </SettingsSection>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: Spacing.three,
  },
});
