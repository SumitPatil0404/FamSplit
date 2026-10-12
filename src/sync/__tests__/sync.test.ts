/**
 * Runs the real store and sync engine for two "phones" against an in-memory stand-in for the
 * server. The stand-in mimics the access rules in supabase/schema.sql: a user only sees and
 * edits trips they are linked to through trip_users.
 */

type Row = Record<string, any>;
type Result = { data: any; error: { message: string } | null };

class FakeServer {
  tables: Record<string, Row[]> = {
    trips: [],
    trip_users: [],
    families: [],
    members: [],
    expenses: [],
    payments: [],
    activity: [],
  };
  /** Mimics a database that has not been given update-2.sql yet. */
  missingColumns = false;
  offline = false;
  /** Runs once, in the middle of the next download, to simulate someone typing during a sync. */
  duringNextSelect: (() => void) | null = null;

  isTripUser(tripId: string, userId: string) {
    return this.tables.trip_users.some((link) => link.trip_id === tripId && link.user_id === userId);
  }

  private visible(table: string, userId: string): Row[] {
    const rows = this.tables[table];
    if (table === 'trip_users') {
      return rows.filter((row) => row.user_id === userId);
    }
    return rows.filter((row) => this.isTripUser(table === 'trips' ? row.id : row.trip_id, userId));
  }

  run(userId: string, query: Query): Result {
    if (this.offline) {
      return { data: null, error: { message: 'Network request failed' } };
    }
    const { table, action, filters } = query;
    const matches = (row: Row) =>
      filters.every((filter) => (filter.values ? filter.values.includes(row[filter.column]) : row[filter.column] === filter.value));
    const key = (row: Row) => (table === 'trips' ? row.id : `${row.trip_id}/${table === 'trip_users' ? row.user_id : row.id}`);

    switch (action.type) {
      case 'select': {
        if (this.duringNextSelect) {
          const hook = this.duringNextSelect;
          this.duringNextSelect = null;
          hook();
        }
        const rows = this.visible(table, userId).filter(matches);
        return { data: rows.slice(query.from, query.to + 1).map((row) => ({ ...row })), error: null };
      }
      case 'upsert': {
        if (this.missingColumns && action.rows.some((row) => 'upi_id' in row || 'finalized_at' in row)) {
          return { data: null, error: { message: "Could not find the 'upi_id' column of 'members' in the schema cache" } };
        }
        for (const row of action.rows) {
          const tripId = table === 'trips' ? row.id : row.trip_id;
          const existing = this.tables[table].find((other) => key(other) === key(row));
          if (table === 'trips' && !existing) {
            this.tables.trips.push({ ...row, created_by: userId });
            this.tables.trip_users.push({ trip_id: row.id, user_id: userId, member_id: null });
          } else if (!this.isTripUser(tripId, userId)) {
            return { data: null, error: { message: 'new row violates row-level security policy' } };
          } else if (existing && !action.ignoreDuplicates) {
            Object.assign(existing, row);
          } else if (!existing) {
            this.tables[table].push({ ...row });
          }
        }
        return { data: null, error: null };
      }
      case 'update':
        if (this.missingColumns && 'finalized_at' in action.patch) {
          return { data: null, error: { message: "Could not find the 'finalized_at' column of 'trips' in the schema cache" } };
        }
        this.visible(table, userId)
          .filter(matches)
          .forEach((row) => Object.assign(row, action.patch));
        return { data: null, error: null };
      case 'delete': {
        const doomed = new Set(
          this.visible(table, userId)
            .filter(matches)
            .filter((row) => table !== 'trips' || row.created_by === userId),
        );
        this.tables[table] = this.tables[table].filter((row) => !doomed.has(row));
        if (table === 'trips') {
          const gone = new Set([...doomed].map((row) => row.id));
          for (const child of ['trip_users', 'families', 'members', 'expenses', 'payments']) {
            this.tables[child] = this.tables[child].filter((row) => !gone.has(row.trip_id));
          }
        }
        return { data: null, error: null };
      }
    }
  }

  /** Mimics the delete-account function: the sign-in goes, and with it the user's trip links. */
  deleteUser(functionName: string, userId: string): { message: string } | null {
    if (this.offline || functionName !== 'delete-account') {
      return { message: 'Failed to send a request to the Edge Function' };
    }
    const soleTrips = this.tables.trips.filter(
      (trip) => trip.created_by === userId && !this.tables.trip_users.some((link) => link.trip_id === trip.id && link.user_id !== userId),
    );
    for (const trip of soleTrips) {
      for (const table of Object.keys(this.tables)) {
        this.tables[table] = this.tables[table].filter((row) => (table === 'trips' ? row.id : row.trip_id) !== trip.id);
      }
    }
    this.tables.trip_users = this.tables.trip_users.filter((link) => link.user_id !== userId);
    return null;
  }

  joinTrip(userId: string, code: string): Result {
    const trip = this.tables.trips.find((row) => row.invite_code === code.replace(/[^A-Za-z0-9]/g, '').toUpperCase());
    if (!trip) {
      return { data: null, error: { message: 'No trip found for that code' } };
    }
    if (!this.isTripUser(trip.id, userId)) {
      this.tables.trip_users.push({ trip_id: trip.id, user_id: userId, member_id: null });
    }
    return { data: trip.id, error: null };
  }
}

type Action =
  | { type: 'select' }
  | { type: 'upsert'; rows: Row[]; ignoreDuplicates: boolean }
  | { type: 'update'; patch: Row }
  | { type: 'delete' };

/** The slice of the Supabase query builder that the sync engine uses. */
class Query implements PromiseLike<Result> {
  action: Action = { type: 'select' };
  filters: { column: string; value?: unknown; values?: unknown[] }[] = [];
  from = 0;
  to = Infinity;

  constructor(
    private server: FakeServer,
    private userId: string,
    public table: string,
  ) {}

  select() {
    return this;
  }
  order() {
    return this;
  }
  upsert(rows: Row | Row[], options: { ignoreDuplicates?: boolean } = {}) {
    this.action = { type: 'upsert', rows: Array.isArray(rows) ? rows : [rows], ignoreDuplicates: options.ignoreDuplicates ?? false };
    return this;
  }
  update(patch: Row) {
    this.action = { type: 'update', patch };
    return this;
  }
  delete() {
    this.action = { type: 'delete' };
    return this;
  }
  eq(column: string, value: unknown) {
    this.filters.push({ column, value });
    return this;
  }
  in(column: string, values: unknown[]) {
    this.filters.push({ column, values });
    return this;
  }
  limit(count: number) {
    this.to = count - 1;
    return this;
  }
  range(from: number, to: number) {
    this.from = from;
    this.to = to;
    return this;
  }
  then<A, B>(resolve?: (value: Result) => A | PromiseLike<A>, reject?: (reason: unknown) => B | PromiseLike<B>) {
    return Promise.resolve(this.server.run(this.userId, this)).then(resolve, reject);
  }
}

function fakeClient(server: FakeServer, userId: string) {
  const channel = { on: () => channel, subscribe: () => channel };
  return {
    from: (table: string) => new Query(server, userId, table),
    rpc: async (_name: string, args: { code: string }) => server.joinTrip(userId, args.code),
    channel: () => channel,
    getChannels: () => [],
    removeChannel: async () => {},
    auth: {
      getSession: async () => ({ data: { session: { user: { id: userId, email: `${userId}@example.com` } } } }),
      onAuthStateChange: () => ({ data: { subscription: { unsubscribe() {} } } }),
      startAutoRefresh: async () => {},
      stopAutoRefresh: async () => {},
      signOut: async () => ({ error: null }),
    },
    functions: {
      invoke: async (name: string) => ({ data: null, error: server.deleteUser(name, userId) }),
    },
  };
}

type Phone = { store: typeof import('@/store/trips'); sync: typeof import('../sync') };

/** A phone has its own storage and its own copy of the store and sync modules. */
async function makePhone(server: FakeServer, userId: string): Promise<Phone> {
  const disk = new Map<string, string>();
  let phone!: Phone;
  jest.isolateModules(() => {
    jest.doMock('expo-sqlite/kv-store', () => ({
      __esModule: true,
      default: {
        getItemSync: (key: string) => disk.get(key) ?? null,
        setItemSync: (key: string, value: string) => void disk.set(key, value),
      },
    }));
    jest.doMock('expo-crypto', () => ({
      getRandomBytes: (count: number) => Uint8Array.from({ length: count }, () => Math.floor(Math.random() * 256)),
    }));
    jest.doMock('@/constants/theme', () => ({ FamilyColors: ['#111111', '#222222', '#333333'] }));
    jest.doMock('../supabase', () => ({ supabase: fakeClient(server, userId) }));
    jest.doMock('@/notifications/push', () => ({
      registerForPush: async () => {},
      unregisterFromPush: async () => {},
      startPushListeners: () => {},
    }));
    // require() is the only way to load a fresh copy inside isolateModules.
    // eslint-disable-next-line @typescript-eslint/no-require-imports
    phone = { store: require('@/store/trips'), sync: require('../sync') };
  });
  phone.sync.startSync();
  await new Promise<void>((resolve) => setImmediate(() => resolve()));
  return phone;
}

const dinner = (id: string, payer: string) => ({
  id,
  description: `Dinner ${id}`,
  amount: 90000,
  paidBy: { [payer]: 90000 },
  split: { type: 'equal' as const, memberIds: [payer] },
  date: new Date().toISOString(),
});

describe('sync between two phones', () => {
  let server: FakeServer;
  let alice: Phone;
  let bob: Phone;
  let tripId: string;

  beforeEach(async () => {
    jest.useFakeTimers({ doNotFake: ['setImmediate'] });
    server = new FakeServer();
    alice = await makePhone(server, 'alice');
    bob = await makePhone(server, 'bob');

    tripId = alice.store.createTrip({ name: 'Goa', myName: 'Alice', familyName: 'Sharma' });
    await alice.sync.syncNow();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  const trip = (phone: Phone) => phone.store.getTrips().find((candidate) => candidate.id === tripId);

  it('uploads a trip created on one phone', () => {
    expect(server.tables.trips).toHaveLength(1);
    expect(server.tables.families).toHaveLength(1);
    expect(server.tables.members).toHaveLength(1);
    expect(server.tables.trip_users).toEqual([{ trip_id: tripId, user_id: 'alice', member_id: trip(alice)!.meId }]);
    expect(alice.sync.isShared(tripId)).toBe(true);
    expect(trip(alice)!.createdBy).toBe('alice');
  });

  it('keeps a stranger out until they join with the invite code', async () => {
    await bob.sync.syncNow();
    expect(bob.store.getTrips()).toEqual([]);
    await expect(bob.sync.joinTrip('WRONG123')).rejects.toThrow('No trip found');

    const code = trip(alice)!.inviteCode;
    await expect(bob.sync.joinTrip(`${code.slice(0, 4)}-${code.slice(4).toLowerCase()}`)).resolves.toBe(tripId);
    expect(trip(bob)!.name).toBe('Goa');
    expect(trip(bob)!.meId).toBe('');
  });

  it('remembers who each user is without changing it for the other', async () => {
    await bob.sync.joinTrip(trip(alice)!.inviteCode);
    alice.store.saveFamily(tripId, { name: 'Patel', members: [{ name: 'Bob' }], headIndex: 0 });
    await alice.sync.syncNow();
    await bob.sync.syncNow();

    const bobMember = trip(bob)!.members.find((member) => member.name === 'Bob')!;
    bob.store.setMe(tripId, bobMember.id);
    await bob.sync.syncNow();
    await alice.sync.syncNow();

    expect(trip(bob)!.meId).toBe(bobMember.id);
    expect(trip(alice)!.meId).not.toBe(bobMember.id);
    expect(trip(alice)!.meId).not.toBe('');
  });

  it('merges expenses added on both phones at the same time', async () => {
    await bob.sync.joinTrip(trip(alice)!.inviteCode);
    const payer = trip(alice)!.meId;

    alice.store.saveExpense(tripId, dinner('from-alice', payer));
    bob.store.saveExpense(tripId, dinner('from-bob', payer));
    await alice.sync.syncNow();
    await bob.sync.syncNow();
    await alice.sync.syncNow();

    const ids = (phone: Phone) => trip(phone)!.expenses.map((expense) => expense.id).sort();
    expect(ids(alice)).toEqual(['from-alice', 'from-bob']);
    expect(ids(bob)).toEqual(['from-alice', 'from-bob']);
  });

  it('carries edits and deletions across', async () => {
    await bob.sync.joinTrip(trip(alice)!.inviteCode);
    const payer = trip(alice)!.meId;
    alice.store.saveExpense(tripId, dinner('e1', payer));
    alice.store.saveExpense(tripId, dinner('e2', payer));
    await alice.sync.syncNow();
    await bob.sync.syncNow();

    bob.store.saveExpense(tripId, { ...dinner('e1', payer), description: 'Lunch', amount: 50000, paidBy: { [payer]: 50000 } });
    bob.store.deleteExpense(tripId, 'e2');
    await bob.sync.syncNow();
    await alice.sync.syncNow();

    expect(trip(alice)!.expenses.map((expense) => [expense.id, expense.description, expense.amount])).toEqual([
      ['e1', 'Lunch', 50000],
    ]);
  });

  it('does not lose an expense typed in while a sync is downloading', async () => {
    const payer = trip(alice)!.meId;
    server.duringNextSelect = () => alice.store.saveExpense(tripId, dinner('typed-mid-sync', payer));
    await alice.sync.syncNow();

    expect(trip(alice)!.expenses.map((expense) => expense.id)).toEqual(['typed-mid-sync']);
    expect(server.tables.expenses.map((expense) => expense.id)).toEqual(['typed-mid-sync']);
  });

  it('keeps changes made offline and sends them once back online', async () => {
    const payer = trip(alice)!.meId;
    server.offline = true;
    alice.store.saveExpense(tripId, dinner('offline', payer));
    await alice.sync.syncNow();
    expect(trip(alice)!.expenses).toHaveLength(1);
    expect(server.tables.expenses).toHaveLength(0);
    expect(alice.sync.hasUnsentChanges()).toBe(true);

    server.offline = false;
    await alice.sync.syncNow();
    expect(server.tables.expenses.map((expense) => expense.id)).toEqual(['offline']);
    expect(alice.sync.hasUnsentChanges()).toBe(false);
  });

  it('lets a joiner leave without deleting the trip for the creator', async () => {
    await bob.sync.joinTrip(trip(alice)!.inviteCode);
    bob.store.deleteTrip(tripId);
    await bob.sync.syncNow();
    await alice.sync.syncNow();

    expect(bob.store.getTrips()).toEqual([]);
    expect(trip(alice)).toBeDefined();
    expect(server.tables.trip_users.map((link) => link.user_id)).toEqual(['alice']);
  });

  it('removes a trip from every phone when its creator deletes it', async () => {
    await bob.sync.joinTrip(trip(alice)!.inviteCode);
    alice.store.deleteTrip(tripId);
    await alice.sync.syncNow();

    // Bob edits the trip before finding out it is gone; his edit has nowhere to go.
    bob.store.saveExpense(tripId, dinner('too-late', trip(bob)!.members[0].id));
    await bob.sync.syncNow();

    expect(server.tables.trips).toEqual([]);
    expect(server.tables.expenses).toEqual([]);
    expect(bob.store.getTrips()).toEqual([]);
  });

  it('carries a finalised trip and a UPI id to the other phone, and reopening too', async () => {
    await bob.sync.joinTrip(trip(alice)!.inviteCode);
    const me = trip(alice)!.members[0];
    const family = trip(alice)!.families[0];
    alice.store.saveFamily(tripId, {
      familyId: family.id,
      name: family.name,
      members: [{ id: me.id, name: me.name, upiId: 'alice@upi' }],
      headIndex: 0,
    });
    alice.store.finalizeTrip(tripId);
    await alice.sync.syncNow();
    await bob.sync.syncNow();

    expect(trip(bob)!.finalizedAt).toBe(trip(alice)!.finalizedAt);
    expect(trip(bob)!.finalizedAt).toBeDefined();
    expect(trip(bob)!.members[0].upiId).toBe('alice@upi');

    bob.store.reopenTrip(tripId);
    await bob.sync.syncNow();
    await alice.sync.syncNow();
    expect(trip(alice)!.finalizedAt).toBeUndefined();
  });

  it('keeps syncing everything else against a database without the latest update', async () => {
    server.missingColumns = true;
    const payer = trip(alice)!.meId;
    alice.store.saveExpense(tripId, dinner('still-syncs', payer));
    alice.store.saveFamily(tripId, { name: 'Patel', members: [{ name: 'Bob' }], headIndex: 0 });
    await alice.sync.syncNow();
    expect(server.tables.expenses.map((expense) => expense.id)).toEqual(['still-syncs']);
    expect(server.tables.members).toHaveLength(2);
    expect(alice.sync.hasUnsentChanges()).toBe(false);

    // Finalising needs the new column: it stays on the phone and is reported, but nothing is lost.
    alice.store.finalizeTrip(tripId);
    await alice.sync.syncNow();
    expect(trip(alice)!.finalizedAt).toBeDefined();
    expect(alice.sync.hasUnsentChanges()).toBe(true);

    server.missingColumns = false;
    await alice.sync.syncNow();
    expect(server.tables.trips[0].finalized_at).toBe(trip(alice)!.finalizedAt);
    expect(alice.sync.hasUnsentChanges()).toBe(false);
  });

  it('cleans up on the server when a half-uploaded trip is deleted', async () => {
    server.missingColumns = true;
    const half = alice.store.createTrip({ name: 'Half', myName: 'Alice', familyName: 'Sharma' });
    const [family] = alice.store.getTrips().find((candidate) => candidate.id === half)!.families;
    alice.store.saveFamily(half, { familyId: family.id, name: 'Sharma', members: [{ name: 'Alice', upiId: 'alice@upi' }], headIndex: 0 });
    await alice.sync.syncNow();
    // The trip row went up, but its members could not.
    expect(server.tables.trips.map((row) => row.id)).toContain(half);
    expect(server.tables.members.filter((row) => row.trip_id === half)).toEqual([]);
    expect(alice.store.getTrips().find((candidate) => candidate.id === half)!.members).toHaveLength(1);

    alice.store.deleteTrip(half);
    await alice.sync.syncNow();
    expect(server.tables.trips.map((row) => row.id)).toEqual([tripId]);
    expect(alice.store.getTrips().map((candidate) => candidate.id)).toEqual([tripId]);
  });

  it('deleting an account clears this phone but leaves shared trips for the others', async () => {
    await bob.sync.joinTrip(trip(alice)!.inviteCode);
    const solo = alice.store.createTrip({ name: 'Solo', myName: 'Alice', familyName: 'Sharma' });
    await alice.sync.syncNow();

    server.offline = true;
    expect(await alice.sync.deleteAccount()).toMatch(/reach the server/);
    expect(alice.store.getTrips()).toHaveLength(2);

    server.offline = false;
    expect(await alice.sync.deleteAccount()).toBeNull();
    expect(alice.store.getTrips()).toEqual([]);
    expect(alice.sync.isShared(tripId)).toBe(false);
    expect(server.tables.trips.map((row) => row.id)).toEqual([tripId]);
    expect(server.tables.trips.map((row) => row.id)).not.toContain(solo);

    await bob.sync.syncNow();
    expect(trip(bob)!.name).toBe('Goa');
  });

  it('on sign-out removes shared trips from the phone but keeps ones never uploaded', async () => {
    server.offline = true;
    const localOnly = alice.store.createTrip({ name: 'Never uploaded', myName: 'Alice', familyName: 'Sharma' });
    await alice.sync.syncNow();
    await alice.sync.signOut();

    expect(alice.store.getTrips().map((candidate) => candidate.id)).toEqual([localOnly]);
    expect(alice.sync.isShared(tripId)).toBe(false);
    expect(server.tables.trips).toHaveLength(1);
  });
});
