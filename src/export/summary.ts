import { formatPaise, settleTrip, type Split } from '@/domain';
import { formatDay } from '@/store/summary';
import type { StoredTrip } from '@/store/trips';

const escapeHtml = (text: string) =>
  text.replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[char]!);

const SPLIT_LABELS: Record<Split['type'], string> = {
  equal: 'Per person',
  perFamily: 'Per family',
  shares: 'By shares',
  exact: 'Exact amounts',
};

function table(headers: string[], rows: string[][], empty: string): string {
  if (rows.length === 0) {
    return `<p class="muted">${escapeHtml(empty)}</p>`;
  }
  const cells = (row: string[], tag: string) =>
    row.map((cell, index) => `<${tag}${index === row.length - 1 ? ' class="amount"' : ''}>${escapeHtml(cell)}</${tag}>`).join('');
  return `<table><thead><tr>${cells(headers, 'th')}</tr></thead><tbody>${rows
    .map((row) => `<tr>${cells(row, 'td')}</tr>`)
    .join('')}</tbody></table>`;
}

/** A printable page with everything about a trip: spending, what is still owed, and what has been paid. */
export function buildSummaryHtml(trip: StoredTrip, generatedAt = new Date().toISOString()): string {
  const name = (memberId: string) => trip.members.find((member) => member.id === memberId)?.name ?? 'Someone';
  const familyName = (familyId: string) => trip.families.find((family) => family.id === familyId)?.name ?? '';

  const now = settleTrip(trip);
  // Without payments, a family's net is simply what it paid minus what it spent.
  const spending = settleTrip({ ...trip, payments: [] });
  const total = trip.expenses.reduce((sum, expense) => sum + expense.amount, 0);

  const families = trip.families.map((family) => {
    const ids = new Set(trip.members.filter((member) => member.familyId === family.id).map((member) => member.id));
    const paid = trip.expenses.reduce(
      (sum, expense) => sum + Object.entries(expense.paidBy).reduce((part, [id, value]) => part + (ids.has(id) ? value : 0), 0),
      0,
    );
    const share = paid - (spending.familyNets.get(family.id) ?? 0);
    const net = now.familyNets.get(family.id) ?? 0;
    return [
      `${family.name} (head: ${name(family.headId)})`,
      String(ids.size),
      formatPaise(paid),
      formatPaise(share),
      net === 0 ? 'Settled' : net > 0 ? `Gets back ${formatPaise(net)}` : `Owes ${formatPaise(-net)}`,
    ];
  });

  const expenses = [...trip.expenses]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((expense) => [
      formatDay(expense.date),
      expense.description,
      Object.keys(expense.paidBy)
        .filter((id) => expense.paidBy[id] > 0)
        .map(name)
        .join(', '),
      SPLIT_LABELS[expense.split.type],
      formatPaise(expense.amount),
    ]);

  const betweenFamilies = now.betweenFamilies.map((transfer) => [
    `${name(transfer.fromMemberId)} (${familyName(transfer.fromFamilyId)})`,
    `${name(transfer.toMemberId)} (${familyName(transfer.toFamilyId)})`,
    formatPaise(transfer.amount),
  ]);

  const withinFamilies = trip.families.flatMap((family) =>
    (now.withinFamily.get(family.id) ?? []).map((transfer) => [
      family.name,
      name(transfer.fromMemberId),
      name(transfer.toMemberId),
      formatPaise(transfer.amount),
    ]),
  );

  const payments = [...trip.payments]
    .sort((a, b) => a.date.localeCompare(b.date))
    .map((payment) => [formatDay(payment.date), name(payment.fromMemberId), name(payment.toMemberId), formatPaise(payment.amount)]);

  return `<!doctype html>
<html>
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<style>
  body { font-family: -apple-system, Roboto, Helvetica, Arial, sans-serif; color: #15141f; margin: 32px; font-size: 12px; }
  h1 { font-size: 24px; margin: 0 0 4px; }
  h2 { font-size: 15px; margin: 28px 0 8px; color: #6c4df6; }
  .muted { color: #6e6c80; }
  .total { font-size: 18px; font-weight: 700; margin-top: 12px; }
  table { width: 100%; border-collapse: collapse; }
  th { text-align: left; font-size: 10px; text-transform: uppercase; letter-spacing: 0.5px; color: #6e6c80; }
  th, td { padding: 6px 8px 6px 0; border-bottom: 1px solid #e7e6f0; vertical-align: top; }
  .amount { text-align: right; padding-right: 0; white-space: nowrap; }
  footer { margin-top: 32px; color: #6e6c80; font-size: 10px; }
</style>
</head>
<body>
  <h1>${escapeHtml(trip.name)}</h1>
  <div class="muted">${trip.families.length} families · ${trip.members.length} people · ${trip.expenses.length} expenses${
    trip.finalizedAt ? ` · finalised on ${formatDay(trip.finalizedAt)}` : ''
  }</div>
  <div class="total">Total spent: ${formatPaise(total)}</div>

  <h2>Families</h2>
  ${table(['Family', 'People', 'Paid', 'Share of spending', 'Now'], families, 'No families yet.')}

  <h2>Still to pay between families</h2>
  ${table(['From', 'To', 'Amount'], betweenFamilies, 'All families are settled.')}

  <h2>Still to pay inside each family</h2>
  ${table(['Family', 'From', 'To', 'Amount'], withinFamilies, 'Nothing left to settle inside any family.')}

  <h2>Payments made</h2>
  ${table(['Date', 'From', 'To', 'Amount'], payments, 'No payments recorded yet.')}

  <h2>Expenses</h2>
  ${table(['Date', 'What', 'Paid by', 'Split', 'Amount'], expenses, 'No expenses yet.')}

  <footer>Made with FamSplit on ${formatDay(generatedAt)}</footer>
</body>
</html>`;
}
