import type { StoredTrip } from '@/store/trips';

// Shapes of the database tables in supabase/schema.sql.
export type TripRow = { id: string; name: string; invite_code: string; created_at: string };
export type FamilyRow = { trip_id: string; id: string; name: string; head_id: string; color: string; position: number };
export type MemberRow = { trip_id: string; id: string; family_id: string; name: string; position: number };
export type ExpenseRow = {
  trip_id: string;
  id: string;
  description: string;
  amount: number;
  paid_by: StoredTrip['expenses'][number]['paidBy'];
  split: StoredTrip['expenses'][number]['split'];
  date: string;
};
export type PaymentRow = {
  trip_id: string;
  id: string;
  from_member_id: string;
  to_member_id: string;
  amount: number;
  date: string;
};

export type TripRows = {
  trip: TripRow;
  /** Which member the signed-in user is, kept per user in trip_users. */
  meId: string | null;
  families: FamilyRow[];
  members: MemberRow[];
  expenses: ExpenseRow[];
  payments: PaymentRow[];
};

/** The database returns timestamps in its own format; keep one format so rows compare equal. */
const iso = (value: string) => new Date(value).toISOString();

export function tripToRows(trip: StoredTrip): TripRows {
  return {
    trip: { id: trip.id, name: trip.name, invite_code: trip.inviteCode, created_at: iso(trip.createdAt) },
    meId: trip.meId || null,
    families: trip.families.map((family, position) => ({
      trip_id: trip.id,
      id: family.id,
      name: family.name,
      head_id: family.headId,
      color: family.color,
      position,
    })),
    members: trip.members.map((member, position) => ({
      trip_id: trip.id,
      id: member.id,
      family_id: member.familyId,
      name: member.name,
      position,
    })),
    expenses: trip.expenses.map((expense) => ({
      trip_id: trip.id,
      id: expense.id,
      description: expense.description,
      amount: expense.amount,
      paid_by: expense.paidBy,
      split: expense.split,
      date: iso(expense.date),
    })),
    payments: trip.payments.map((payment) => ({
      trip_id: trip.id,
      id: payment.id,
      from_member_id: payment.fromMemberId,
      to_member_id: payment.toMemberId,
      amount: payment.amount,
      date: iso(payment.date),
    })),
  };
}

const byPosition = (a: { position: number }, b: { position: number }) => a.position - b.position;
const newestFirst = (a: { date: string; id: string }, b: { date: string; id: string }) =>
  b.date.localeCompare(a.date) || a.id.localeCompare(b.id);

export function rowsToTrip(rows: TripRows, createdBy: string | null): StoredTrip {
  return {
    id: rows.trip.id,
    name: rows.trip.name,
    inviteCode: rows.trip.invite_code,
    createdAt: iso(rows.trip.created_at),
    createdBy: createdBy ?? undefined,
    meId: rows.meId ?? '',
    families: [...rows.families].sort(byPosition).map((row) => ({
      id: row.id,
      name: row.name,
      headId: row.head_id,
      color: row.color,
    })),
    members: [...rows.members].sort(byPosition).map((row) => ({
      id: row.id,
      name: row.name,
      familyId: row.family_id,
    })),
    expenses: rows.expenses
      .map((row) => ({
        id: row.id,
        description: row.description,
        amount: Number(row.amount),
        paidBy: row.paid_by,
        split: row.split,
        date: iso(row.date),
      }))
      .sort(newestFirst),
    payments: rows.payments
      .map((row) => ({
        id: row.id,
        fromMemberId: row.from_member_id,
        toMemberId: row.to_member_id,
        amount: Number(row.amount),
        date: iso(row.date),
      }))
      .sort(newestFirst),
  };
}

export type TableChanges<Row> = { upserts: Row[]; deletes: string[] };

export type TripChanges = {
  /** The trip has never been sent to the server. */
  isNew: boolean;
  renamed: boolean;
  meChanged: boolean;
  families: TableChanges<FamilyRow>;
  members: TableChanges<MemberRow>;
  expenses: TableChanges<ExpenseRow>;
  payments: TableChanges<PaymentRow>;
};

/** Order-independent comparison, since the database does not keep JSON key order. */
function fingerprint(value: unknown): string {
  if (Array.isArray(value)) {
    return `[${value.map(fingerprint).join(',')}]`;
  }
  if (value !== null && typeof value === 'object') {
    const entries = Object.entries(value).sort(([a], [b]) => a.localeCompare(b));
    return `{${entries.map(([key, entry]) => `${key}:${fingerprint(entry)}`).join(',')}}`;
  }
  return JSON.stringify(value);
}

function diffTable<Row extends { id: string }>(base: Row[], next: Row[]): TableChanges<Row> {
  const before = new Map(base.map((row) => [row.id, fingerprint(row)]));
  const after = new Set(next.map((row) => row.id));
  return {
    upserts: next.filter((row) => before.get(row.id) !== fingerprint(row)),
    deletes: base.filter((row) => !after.has(row.id)).map((row) => row.id),
  };
}

/** What has to be sent to the server to turn `base` (what it last had) into `next` (what the phone has now). */
export function diffRows(base: TripRows | undefined, next: TripRows): TripChanges {
  return {
    isNew: base === undefined,
    renamed: base !== undefined && base.trip.name !== next.trip.name,
    meChanged: (base?.meId ?? null) !== next.meId,
    families: diffTable(base?.families ?? [], next.families),
    members: diffTable(base?.members ?? [], next.members),
    expenses: diffTable(base?.expenses ?? [], next.expenses),
    payments: diffTable(base?.payments ?? [], next.payments),
  };
}

export function hasChanges(changes: TripChanges): boolean {
  const tables = [changes.families, changes.members, changes.expenses, changes.payments];
  return (
    changes.isNew ||
    changes.renamed ||
    changes.meChanged ||
    tables.some((table) => table.upserts.length > 0 || table.deletes.length > 0)
  );
}
