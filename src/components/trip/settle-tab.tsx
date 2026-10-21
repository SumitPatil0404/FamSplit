import { useRouter } from 'expo-router';
import { useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { confirmDialog } from '@/components/dialog';
import { Icon } from '@/components/icon';
import { ThemedText } from '@/components/themed-text';
import { lookups, NavRow, TransferRow } from '@/components/trip/settle-parts';
import { Avatar, Button, Card, EmptyState } from '@/components/ui';
import { Radius, Spacing } from '@/constants/theme';
import { shareTripSummary } from '@/export/share';
import { useTheme } from '@/hooks/use-theme';
import { plural, useT } from '@/i18n';
import { familySteps, myTransfers } from '@/store/settle-plan';
import type { TripSummary } from '@/store/summary';
import { canFinalize, finalizeTrip, isFriendsTrip, type StoredTrip } from '@/store/trips';
import { useSync } from '@/sync/sync';

function SectionTitle({ title, subtitle }: { title: string; subtitle?: string }) {
  return (
    <View style={styles.sectionTitle}>
      <ThemedText type="heading">{title}</ThemedText>
      {subtitle && (
        <ThemedText type="small" themeColor="textSecondary">
          {subtitle}
        </ThemedText>
      )}
    </View>
  );
}

/** The payments between families this phone's owner makes or receives, before anything else. */
function YourPart({ trip, summary }: { trip: StoredTrip; summary: TripSummary }) {
  const t = useT();
  const sync = useSync();
  const mine = myTransfers(trip, summary.settlement);
  const myFamily = trip.families.find((family) =>
    trip.members.some((member) => member.id === trip.meId && member.familyId === family.id),
  );
  const isHead = myFamily?.headId === trip.meId;

  return (
    <>
      <SectionTitle title={t('Your part')} />
      {!trip.meId ? (
        <Card>
          <ThemedText type="small" themeColor="textSecondary">
            {t('Tell us which one is you under Families to see what you pay or collect.')}
          </ThemedText>
        </Card>
      ) : mine.length === 0 ? (
        <Card style={styles.card}>
          <ThemedText type="bold">
            {isHead ? `🎉 ${t('Nothing for you to pay or collect')}` : t('Your family head settles with the other families')}
          </ThemedText>
          {myFamily && (
            <ThemedText type="small" themeColor="textSecondary">
              {t('What you pay or get inside your family is under {name} family below.', { name: myFamily.name })}
            </ThemedText>
          )}
        </Card>
      ) : (
        mine.map((transfer) => (
          <Card key={`${transfer.fromMemberId}-${transfer.toMemberId}`}>
            <TransferRow trip={trip} transfer={transfer} betweenFamilies signedIn={sync.session !== null} />
          </Card>
        ))
      )}
    </>
  );
}

/** Families: what is left between the heads, and inside each family, each opening a page of its own. */
function FamilyOverview({ trip, summary }: { trip: StoredTrip; summary: TripSummary }) {
  const router = useRouter();
  const theme = useTheme();
  const t = useT();
  const { name } = lookups(trip, t);
  const between = summary.settlement.betweenFamilies;
  const steps = familySteps(trip, summary.settlement);

  return (
    <>
      <YourPart trip={trip} summary={summary} />

      <SectionTitle title={t('Everyone')} subtitle={t('Heads settle between families first, then each family inside.')} />
      <NavRow
        leading={
          <View style={[styles.tile, { backgroundColor: theme.primarySoft }]}>
            <Icon name="handshake" size={22} color={theme.primary} />
          </View>
        }
        title={t('Between families')}
        subtitle={
          between.length === 0
            ? t('All family heads are square')
            : plural(t, between.length, '{count} payment between the heads', '{count} payments between the heads')
        }
        status={
          between.length === 0
            ? { tone: 'done', label: t('Done') }
            : { tone: 'todo', label: t('{count} left', { count: between.length }) }
        }
        onPress={() => router.push({ pathname: '/trip/[tripId]/settle-between', params: { tripId: trip.id } })}
      />
      {steps.map(({ family, transfers, locked }) => (
        <NavRow
          key={family.id}
          leading={<Avatar name={family.name} color={family.color} size={44} />}
          title={t('{name} family', { name: family.name })}
          subtitle={
            transfers.length === 0
              ? t('Head: {name} · nothing to settle inside', { name: name(family.headId) })
              : t('Head: {name} · {payments} inside', {
                  name: name(family.headId),
                  payments: plural(t, transfers.length, '{count} payment', '{count} payments'),
                })
          }
          status={
            transfers.length === 0
              ? { tone: 'done', label: t('Done') }
              : locked
                ? { tone: 'waiting', label: t('Waiting for {name}', { name: name(family.headId) }) }
                : { tone: 'todo', label: t('{count} left', { count: transfers.length }) }
          }
          onPress={() =>
            router.push({ pathname: '/trip/[tripId]/settle-family', params: { tripId: trip.id, familyId: family.id } })
          }
        />
      ))}
    </>
  );
}

/** Friends: one list of who pays whom. */
function FriendsList({ trip, summary }: { trip: StoredTrip; summary: TripSummary }) {
  const t = useT();
  const sync = useSync();
  const transfers = summary.settlement.betweenFamilies;
  return (
    <>
      <SectionTitle title={t('Who pays whom')} subtitle={t('The fewest payments that square everyone up')} />
      {transfers.length === 0 ? (
        <Card>
          <ThemedText type="bold">🎉 {t('Everyone is settled')}</ThemedText>
        </Card>
      ) : (
        transfers.map((transfer) => (
          <Card key={`${transfer.fromMemberId}-${transfer.toMemberId}`}>
            <TransferRow trip={trip} transfer={transfer} signedIn={sync.session !== null} />
          </Card>
        ))
      )}
    </>
  );
}

export function SettleTab({ trip, summary }: { trip: StoredTrip; summary: TripSummary }) {
  const sync = useSync();
  const t = useT();
  const [exporting, setExporting] = useState(false);
  const friends = isFriendsTrip(trip);
  const mayFinalize = canFinalize(trip, sync.session?.user.id);

  if (trip.expenses.length === 0 && trip.payments.length === 0) {
    return (
      <EmptyState
        emoji="🤝"
        title={t('Nothing to settle yet')}
        body={
          friends
            ? t('Once expenses are added, who pays whom shows up here.')
            : t('Once expenses are added, the payments between family heads show up here.')
        }
      />
    );
  }

  const confirmFinalize = () =>
    confirmDialog({
      icon: 'lock',
      title: t('Finalise this trip?'),
      message: t(
        'Expenses can no longer be added or changed, so the amounts below stay put. Payments can still be marked as paid, and the trip can be reopened later.',
      ),
      confirmLabel: t('Finalise trip'),
      onConfirm: () => finalizeTrip(trip.id),
    });

  const exportPdf = async () => {
    setExporting(true);
    try {
      await shareTripSummary(trip);
    } catch (error) {
      confirmDialog({
        icon: 'pdf',
        title: t('Could not make the PDF'),
        message: error instanceof Error ? t(error.message) : t('Something went wrong.'),
        confirmLabel: t('OK'),
        hideCancel: true,
      });
    }
    setExporting(false);
  };

  return (
    <View style={styles.list}>
      {friends ? <FriendsList trip={trip} summary={summary} /> : <FamilyOverview trip={trip} summary={summary} />}

      <View style={styles.footer}>
        <View style={styles.footerButtons}>
          {!trip.finalizedAt && mayFinalize && (
            <Button label={t('Finalise trip')} icon="lock" variant="soft" onPress={confirmFinalize} style={styles.grow} />
          )}
          <Button
            label={exporting ? t('Making the PDF…') : t('Share PDF')}
            icon="pdf"
            variant="soft"
            disabled={exporting}
            onPress={() => void exportPdf()}
            style={styles.grow}
          />
        </View>
        {!trip.finalizedAt && (
          <ThemedText type="caption" themeColor="textSecondary" style={styles.centered}>
            {mayFinalize
              ? t('Finalise when the trip is over, so the amounts stay put while everyone pays.')
              : friends
                ? t('The trip’s creator can finalise it, which locks the expenses while everyone pays.')
                : t('The trip’s creator or a family head can finalise it, which locks the expenses while everyone pays.')}
          </ThemedText>
        )}
        {trip.payments.length > 0 && (
          <ThemedText type="caption" themeColor="textSecondary" style={styles.centered}>
            {t('Payments marked as paid are listed under Expenses, where they can be undone.')}
          </ThemedText>
        )}
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  list: {
    gap: Spacing.three,
  },
  sectionTitle: {
    marginTop: Spacing.two,
  },
  card: {
    gap: Spacing.two,
  },
  tile: {
    width: 44,
    height: 44,
    borderRadius: Radius.small,
    alignItems: 'center',
    justifyContent: 'center',
  },
  grow: {
    flex: 1,
  },
  footer: {
    gap: Spacing.two,
    marginTop: Spacing.three,
  },
  footerButtons: {
    flexDirection: 'row',
    gap: Spacing.two,
  },
  centered: {
    textAlign: 'center',
  },
});
