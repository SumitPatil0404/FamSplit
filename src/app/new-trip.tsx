import { useRouter } from 'expo-router';
import { useState } from 'react';
import { KeyboardAvoidingView, Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { Icon, type IconName } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { Button, Checkbox, Field } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { useTheme } from '@/hooks/use-theme';
import { useT } from '@/i18n';
import { createTrip, getMyName, type TripKind } from '@/store/trips';

const KINDS: { kind: TripKind; icon: IconName }[] = [
  { kind: 'families', icon: 'family' },
  { kind: 'friends', icon: 'group' },
];

function KindCard({ option, selected, onPress }: { option: (typeof KINDS)[number]; selected: boolean; onPress: () => void }) {
  const theme = useTheme();
  const t = useT();
  const families = option.kind === 'families';
  return (
    <Pressable
      accessibilityRole="radio"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.kind,
        {
          backgroundColor: selected ? theme.primarySoft : theme.backgroundElement,
          borderColor: selected ? theme.primary : theme.border,
          opacity: pressed ? 0.8 : 1,
        },
      ]}>
      <View style={[styles.kindIcon, { backgroundColor: selected ? theme.primaryFill : theme.primarySoft }]}>
        <Icon name={option.icon} size={26} color={selected ? theme.onPrimary : theme.primary} />
      </View>
      <View style={styles.grow}>
        <ThemedText type="bold" themeColor={selected ? 'primary' : 'text'}>
          {families ? t('Families') : t('Friends')}
        </ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {families
            ? t('Several families travel together. Family heads settle up first, then each family inside.')
            : t('Friends, colleagues or roommates. Everyone settles up with everyone.')}
        </ThemedText>
      </View>
      <Checkbox checked={selected} />
    </Pressable>
  );
}

export default function NewTripScreen() {
  const t = useT();
  const router = useRouter();
  const [kind, setKind] = useState<TripKind | null>(null);
  const [name, setName] = useState('');
  const [myName, setMyName] = useState(getMyName);
  const [familyName, setFamilyName] = useState('');

  const families = kind === 'families';
  const ready = kind !== null && name.trim() !== '' && myName.trim() !== '' && (!families || familyName.trim() !== '');

  const create = () => {
    if (!kind) {
      return;
    }
    const tripId = createTrip({
      kind,
      name: name.trim(),
      myName: myName.trim(),
      ...(families ? { familyName: familyName.trim() } : {}),
    });
    router.replace(`/trip/${tripId}`);
  };

  return (
    <KeyboardAvoidingView behavior="padding" style={styles.grow}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <ThemedText type="heading">Who is travelling?</ThemedText>
        {KINDS.map((option) => (
          <KindCard key={option.kind} option={option} selected={kind === option.kind} onPress={() => setKind(option.kind)} />
        ))}

        {kind && (
          <View style={styles.fields}>
            <Field
              label={t('Trip name')}
              placeholder={families ? t('Goa with the cousins') : t('Manali with college friends')}
              value={name}
              onChangeText={setName}
              autoFocus
            />
            <Field label={t('Your name')} placeholder="Rajesh" value={myName} onChangeText={setMyName} />
            {families && <Field label={t('Your family')} placeholder="Sharma" value={familyName} onChangeText={setFamilyName} />}
            <ThemedText type="small" themeColor="textSecondary">
              {families
                ? t('You start as the head of your family. You can add the rest of your family and the other families next.')
                : t('You can add the others next, or share the invite code so they join themselves. The type of trip cannot be changed later.')}
            </ThemedText>
            <Button label={t('Create trip')} onPress={create} disabled={!ready} style={styles.button} />
          </View>
        )}
      </ScrollView>
    </KeyboardAvoidingView>
  );
}

const styles = StyleSheet.create({
  grow: {
    flex: 1,
  },
  content: {
    padding: Spacing.three,
    gap: Spacing.three,
  },
  kind: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
    padding: Spacing.three,
    borderRadius: Radius.medium,
    borderWidth: 1.5,
  },
  kindIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    alignItems: 'center',
    justifyContent: 'center',
  },
  fields: {
    gap: Spacing.three,
    marginTop: Spacing.two,
  },
  button: {
    marginTop: Spacing.two,
  },
});
