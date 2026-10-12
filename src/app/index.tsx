import { ScrollView, StyleSheet } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { ThemedText } from '@/components/themed-text';
import { ThemedView } from '@/components/themed-view';
import { BottomTabInset, MaxContentWidth, Spacing } from '@/constants/theme';
import { sampleTrip } from '@/data/sample-trip';
import { formatPaise, settleTrip, type Transfer } from '@/domain';

const settlement = settleTrip(sampleTrip);
const memberName = new Map(sampleTrip.members.map((member) => [member.id, member.name]));
const familyName = new Map(sampleTrip.families.map((family) => [family.id, family.name]));
const totalSpent = sampleTrip.expenses.reduce((sum, expense) => sum + expense.amount, 0);

function TransferRow({ transfer, note }: { transfer: Transfer; note?: string }) {
  return (
    <ThemedView type="backgroundElement" style={styles.row}>
      <ThemedView type="backgroundElement" style={styles.rowText}>
        <ThemedText>
          {memberName.get(transfer.fromMemberId)} pays {memberName.get(transfer.toMemberId)}
        </ThemedText>
        {note && (
          <ThemedText type="small" themeColor="textSecondary">
            {note}
          </ThemedText>
        )}
      </ThemedView>
      <ThemedText type="smallBold">{formatPaise(transfer.amount)}</ThemedText>
    </ThemedView>
  );
}

export default function HomeScreen() {
  return (
    <ThemedView style={styles.container}>
      <SafeAreaView style={styles.safeArea}>
        <ScrollView contentContainerStyle={styles.content}>
          <ThemedText type="subtitle">Goa trip</ThemedText>
          <ThemedText type="small" themeColor="textSecondary">
            Sample data · {sampleTrip.families.length} families · {sampleTrip.members.length} people ·{' '}
            {formatPaise(totalSpent)} spent
          </ThemedText>

          <ThemedText type="smallBold" style={styles.heading}>
            Final settlement between family heads
          </ThemedText>
          {settlement.betweenFamilies.map((transfer) => (
            <TransferRow
              key={`${transfer.fromFamilyId}-${transfer.toFamilyId}`}
              transfer={transfer}
              note={`${familyName.get(transfer.fromFamilyId)} family to ${familyName.get(transfer.toFamilyId)} family`}
            />
          ))}

          {sampleTrip.families.map((family) => {
            const transfers = settlement.withinFamily.get(family.id) ?? [];
            return (
              <ThemedView key={family.id} style={styles.section}>
                <ThemedText type="smallBold" style={styles.heading}>
                  Inside the {family.name} family
                </ThemedText>
                {transfers.length === 0 && (
                  <ThemedText type="small" themeColor="textSecondary">
                    Nothing to settle
                  </ThemedText>
                )}
                {transfers.map((transfer) => (
                  <TransferRow key={`${transfer.fromMemberId}-${transfer.toMemberId}`} transfer={transfer} />
                ))}
              </ThemedView>
            );
          })}
        </ScrollView>
      </SafeAreaView>
    </ThemedView>
  );
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    flexDirection: 'row',
  },
  safeArea: {
    flex: 1,
    maxWidth: MaxContentWidth,
  },
  content: {
    paddingHorizontal: Spacing.four,
    paddingTop: Spacing.four,
    paddingBottom: BottomTabInset + Spacing.three,
    gap: Spacing.two,
  },
  section: {
    gap: Spacing.two,
  },
  heading: {
    marginTop: Spacing.four,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: Spacing.three,
    paddingHorizontal: Spacing.three,
    paddingVertical: Spacing.three,
    borderRadius: Spacing.three,
  },
  rowText: {
    flex: 1,
  },
});
