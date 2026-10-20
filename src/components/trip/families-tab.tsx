import { useRouter } from 'expo-router';
import { Pressable, Share, StyleSheet, View } from 'react-native';

import { ThemedText } from '@/components/themed-text';
import { Avatar, BalancePill, Button, Card, IconButton, Tag } from '@/components/ui';
import { Spacing } from '@/constants/theme';
import { formatPaise } from '@/domain';
import { useTheme } from '@/hooks/use-theme';
import type { TripSummary } from '@/store/summary';
import { formatInviteCode, isFriendsTrip, type StoredTrip } from '@/store/trips';
import { isShared, useSync } from '@/sync/sync';

type Props = {
  trip: StoredTrip;
  summary: TripSummary;
  finalised: boolean;
  onAddFamily: () => void;
  onEditFamily: (familyId: string) => void;
  onChooseMe: () => void;
};

/** How the other families get onto this trip. Hidden when the app is not connected to a server. */
function InviteCard({ trip }: { trip: StoredTrip }) {
  const router = useRouter();
  const sync = useSync();
  const title = isFriendsTrip(trip) ? 'Invite your friends' : 'Invite the other families';

  if (!sync.configured) {
    return null;
  }
  if (!sync.session) {
    return (
      <Card>
        <ThemedText type="bold">{title}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          Sign in to get a code they can join this trip with.
        </ThemedText>
        <Button label="Sign in" variant="soft" compact onPress={() => router.push('/account')} style={styles.start} />
      </Card>
    );
  }
  if (!isShared(trip.id)) {
    return (
      <Card>
        <ThemedText type="bold">{title}</ThemedText>
        <ThemedText type="small" themeColor="textSecondary">
          {sync.error ?? 'Uploading this trip. The invite code appears in a moment.'}
        </ThemedText>
      </Card>
    );
  }

  const code = formatInviteCode(trip.inviteCode);
  const share = () =>
    Share.share({
      message: `Join "${trip.name}" on FamSplit. Open the app, tap "Join with a code" and enter ${code}`,
    });

  return (
    <Card>
      <ThemedText type="bold">{title}</ThemedText>
      <ThemedText type="small" themeColor="textSecondary">
        Anyone with this code can join the trip and add expenses.
      </ThemedText>
      <View style={[styles.row, styles.spread]}>
        <ThemedText type="heading" selectable style={styles.code}>
          {code}
        </ThemedText>
        <Button label="Share" icon="share" variant="soft" compact onPress={() => void share()} />
      </View>
    </Card>
  );
}

export function FamiliesTab({ trip, summary, finalised, onAddFamily, onEditFamily, onChooseMe }: Props) {
  const theme = useTheme();

  return (
    <View style={styles.list}>
      <InviteCard trip={trip} />
      <ThemedText type="caption" themeColor="textSecondary">
        Each amount is what that person paid minus their share
      </ThemedText>

      {trip.families.map((family) => {
        const members = trip.members.filter((member) => member.familyId === family.id);
        return (
          <Card key={family.id}>
            <View style={styles.row}>
              <Avatar name={family.name} color={family.color} size={44} />
              <View style={styles.grow}>
                <ThemedText type="bold">{family.name} family</ThemedText>
                <BalancePill
                  amount={summary.settlement.familyNets.get(family.id) ?? 0}
                  positive="Gets back"
                  negative="Owes"
                  settled="Settled"
                />
              </View>
              <IconButton icon="edit" label={`Edit ${family.name} family`} onPress={() => onEditFamily(family.id)} />
            </View>

            <View style={[styles.divider, { backgroundColor: theme.border }]} />

            {members.map((member) => {
              const net = summary.settlement.memberNets.get(member.id) ?? 0;
              return (
                <View key={member.id} style={styles.row}>
                  <Avatar name={member.name} color={family.color} size={30} />
                  <View style={[styles.grow, styles.nameRow]}>
                    <ThemedText>{member.name}</ThemedText>
                    {member.id === family.headId && <Tag label="Head" />}
                    {member.id === trip.meId && <Tag label="You" />}
                  </View>
                  <ThemedText
                    type="smallBold"
                    numberOfLines={1}
                    themeColor={net > 0 ? 'positive' : net < 0 ? 'negative' : 'textSecondary'}>
                    {net === 0 ? '—' : `${net > 0 ? '+' : '−'}${formatPaise(Math.abs(net))}`}
                  </ThemedText>
                </View>
              );
            })}
          </Card>
        );
      })}

      {!finalised && <Button label="Add a family" icon="groupAdd" variant="soft" onPress={onAddFamily} />}
      <Pressable accessibilityRole="button" hitSlop={8} onPress={onChooseMe} style={styles.link}>
        <ThemedText type="smallBold" themeColor="primary">
          {trip.meId ? 'Not you? Change who you are' : 'Tell us which one is you'}
        </ThemedText>
      </Pressable>
    </View>
  );
}

type PeopleProps = {
  trip: StoredTrip;
  summary: TripSummary;
  finalised: boolean;
  onAddPerson: () => void;
  onEditPerson: (memberId: string) => void;
  onChooseMe: () => void;
};

/** A friends trip's version of the Families tab: one list of people. */
export function PeopleTab({ trip, summary, finalised, onAddPerson, onEditPerson, onChooseMe }: PeopleProps) {
  const colorOf = (familyId: string) => trip.families.find((family) => family.id === familyId)?.color ?? '#8E8CA3';

  return (
    <View style={styles.list}>
      <InviteCard trip={trip} />
      <ThemedText type="caption" themeColor="textSecondary">
        Each amount is what that person paid minus their share
      </ThemedText>

      <Card style={styles.people}>
        {trip.members.map((member) => (
          <View key={member.id} style={styles.row}>
            <Avatar name={member.name} color={colorOf(member.familyId)} size={40} />
            <View style={styles.grow}>
              <View style={styles.nameRow}>
                <ThemedText type="bold">{member.name}</ThemedText>
                {member.id === trip.meId && <Tag label="You" />}
              </View>
              <BalancePill
                amount={summary.settlement.memberNets.get(member.id) ?? 0}
                positive="Gets back"
                negative="Owes"
                settled="Settled"
              />
            </View>
            <IconButton icon="edit" label={`Edit ${member.name}`} onPress={() => onEditPerson(member.id)} />
          </View>
        ))}
      </Card>

      {!finalised && <Button label="Add people" icon="personAdd" variant="soft" onPress={onAddPerson} />}
      <Pressable accessibilityRole="button" hitSlop={8} onPress={onChooseMe} style={styles.link}>
        <ThemedText type="smallBold" themeColor="primary">
          {trip.meId ? 'Not you? Change who you are' : 'Tell us which one is you'}
        </ThemedText>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  people: {
    gap: Spacing.three,
  },
  list: {
    gap: Spacing.three,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: Spacing.three,
  },
  grow: {
    flex: 1,
    gap: Spacing.one,
  },
  nameRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    alignItems: 'center',
    gap: Spacing.two,
  },
  divider: {
    height: StyleSheet.hairlineWidth,
    marginVertical: Spacing.one,
  },
  spread: {
    justifyContent: 'space-between',
    flexWrap: 'wrap',
  },
  code: {
    letterSpacing: 2,
  },
  start: {
    alignSelf: 'flex-start',
    marginTop: Spacing.one,
  },
  link: {
    alignSelf: 'center',
    paddingVertical: Spacing.one,
  },
});
