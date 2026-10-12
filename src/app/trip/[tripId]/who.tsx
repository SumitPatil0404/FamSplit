import { useLocalSearchParams, useRouter } from 'expo-router';
import { Pressable, ScrollView, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Avatar, Card, Checkbox, EmptyState, Tag } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { setMe, useTrip } from '@/store/trips';

export default function WhoScreen() {
  const { tripId } = useLocalSearchParams<{ tripId: string }>();
  const router = useRouter();
  const trip = useTrip(tripId);

  if (!trip) {
    return <EmptyState emoji="🤔" title="Trip not found" body="It may have been deleted from this phone." />;
  }

  const choose = (memberId: string) => {
    setMe(trip.id, memberId);
    router.back();
  };

  return (
    <ScrollView contentContainerStyle={styles.content}>
      <ThemedText type="small" themeColor="textSecondary">
        Pick yourself so the app can show what your family owes or gets back. If you are not listed, add yourself to
        your family under Families first.
      </ThemedText>
      {trip.families.map((family) => (
        <Card key={family.id}>
          <View style={styles.row}>
            <Avatar name={family.name} color={family.color} size={32} />
            <ThemedText type="bold">{family.name} family</ThemedText>
          </View>
          {trip.members
            .filter((member) => member.familyId === family.id)
            .map((member) => (
              <Pressable
                key={member.id}
                accessibilityRole="radio"
                accessibilityState={{ selected: member.id === trip.meId }}
                onPress={() => choose(member.id)}
                style={[styles.row, styles.member]}>
                <Checkbox checked={member.id === trip.meId} />
                <ThemedText style={styles.grow}>{member.name}</ThemedText>
                {member.id === family.headId && <Tag label="Head" />}
              </Pressable>
            ))}
        </Card>
      ))}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  content: {
    padding: Spacing.three,
    gap: Spacing.three,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  member: {
    minHeight: 44,
  },
  grow: {
    flex: 1,
  },
});
