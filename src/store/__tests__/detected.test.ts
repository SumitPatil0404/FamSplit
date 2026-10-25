import { fillIn, isDuplicate, nameFromUpiId, paidOn, settleUpMatches, tripsFor, type DetectedPayment } from '../detected-match';
import type { StoredTrip } from '../trips';

// Rajesh (on this phone) paid ₹3,000 for all three, so Priya owes him ₹1,000 inside the Sharma
// family and Rahul, head of the Patel family, owes him ₹1,000 between families.
const trip: StoredTrip = {
  id: 't1',
  name: 'Goa',
  createdAt: '2026-10-01T08:00:00.000Z',
  inviteCode: 'ABCD2345',
  meId: 'm1',
  families: [
    { id: 'f1', name: 'Sharma', headId: 'm1', color: '#6C4DF6' },
    { id: 'f2', name: 'Patel', headId: 'm3', color: '#10B981' },
  ],
  members: [
    { id: 'm1', name: 'Rajesh Sharma', familyId: 'f1' },
    { id: 'm2', name: 'Priya Sharma', familyId: 'f1' },
    { id: 'm3', name: 'Rahul Patel', familyId: 'f2', upiId: 'rahul@okaxis' },
  ],
  expenses: [
    {
      id: 'e1',
      date: '2026-10-02T08:00:00.000Z',
      description: 'Hotel',
      amount: 300000,
      paidBy: { m1: 300000 },
      split: { type: 'equal', memberIds: ['m1', 'm2', 'm3'] },
    },
  ],
  payments: [],
};

function received(details: Partial<DetectedPayment>): DetectedPayment {
  return {
    id: 'a1',
    direction: 'credit',
    amount: 100000,
    seenAt: '2026-10-24T10:00:00.000Z',
    text: '',
    status: 'new',
    ...details,
  };
}

const owers = (payment: DetectedPayment, trips = [trip]) =>
  settleUpMatches(trips, payment).map(({ transfer, byName, byAmount }) => ({ from: transfer.fromMemberId, byName, byAmount }));

describe('settleUpMatches', () => {
  it('puts the right person for the right amount first', () => {
    expect(owers(received({ party: 'Rahul Patel' }))).toEqual([
      { from: 'm3', byName: true, byAmount: true },
      { from: 'm2', byName: false, byAmount: true },
    ]);
  });

  it('matches a part payment by name or UPI ID', () => {
    expect(owers(received({ amount: 50000, upiId: 'RAHUL@okaxis' }))).toEqual([{ from: 'm3', byName: true, byAmount: false }]);
    expect(owers(received({ amount: 50000, party: 'PRIYA SHA' }))).toEqual([{ from: 'm2', byName: true, byAmount: false }]);
  });

  it('does not take a different surname for the same person', () => {
    expect(owers(received({ amount: 50000, party: 'Rahul Kumar' }))).toEqual([]);
  });

  it('only looks at money received, on trips where this phone has said who it is', () => {
    expect(owers(received({ direction: 'debit', party: 'Rahul Patel' }))).toEqual([]);
    expect(owers(received({ party: 'Rahul Patel' }), [{ ...trip, meId: '' }])).toEqual([]);
  });

  it('stops offering a payment once it has been recorded', () => {
    const paid = { ...trip, payments: [{ id: 'p1', date: '2026-10-24T10:00:00.000Z', fromMemberId: 'm3', toMemberId: 'm1', amount: 100000 }] };
    expect(owers(received({ party: 'Rahul Patel' }), [paid])).toEqual([{ from: 'm2', byName: false, byAmount: true }]);
  });
});

describe('isDuplicate', () => {
  const first = received({ reference: '123456789012' });

  it('uses the reference number when both alerts have one', () => {
    expect(isDuplicate([first], received({ reference: '123456789012', seenAt: '2026-10-25T10:00:00.000Z' }))).toBe(true);
    expect(isDuplicate([first], received({ reference: '999999999999' }))).toBe(false);
  });

  it('otherwise treats the same amount within a few minutes as the same payment', () => {
    expect(isDuplicate([first], received({ seenAt: '2026-10-24T10:04:00.000Z' }))).toBe(true);
    expect(isDuplicate([first], received({ seenAt: '2026-10-24T10:30:00.000Z' }))).toBe(false);
    expect(isDuplicate([first], received({ direction: 'debit', seenAt: '2026-10-24T10:04:00.000Z' }))).toBe(false);
  });
});

describe('fillIn', () => {
  it('adds what a second alert for the same payment knows, without replacing anything', () => {
    const fromApp = received({ direction: 'debit', amount: 30000, text: 'You paid ₹300' });
    const fromBank = { direction: 'debit' as const, amount: 30000, party: 'Zomato', reference: '881122334455', date: '2026-10-25' };
    expect(fillIn(fromApp, fromBank)).toMatchObject({ party: 'Zomato', reference: '881122334455', date: '2026-10-25', text: 'You paid ₹300' });
    expect(fillIn({ ...fromApp, party: 'Zomato Ltd' }, fromBank).party).toBe('Zomato Ltd');
  });
});

describe('nameFromUpiId', () => {
  it('turns the part before the @ into a name', () => {
    expect(nameFromUpiId('swiggy@icici')).toBe('Swiggy');
    expect(nameFromUpiId('rahul.sharma@okaxis')).toBe('Rahul Sharma');
    expect(nameFromUpiId('IRCTC@ybl')).toBe('Irctc');
    expect(nameFromUpiId('bharatpe.90012345@yesbank')).toBe('Bharatpe');
  });

  it('leaves out phone numbers and shop QR codes', () => {
    expect(nameFromUpiId('9876543210@ybl')).toBe('');
    expect(nameFromUpiId('paytmqr2810050501011ab12cd@paytm')).toBe('');
  });
});

describe('tripsFor', () => {
  const paid = received({ direction: 'debit', date: '2026-10-03' });
  const other: StoredTrip = { ...trip, id: 't2', name: 'Manali', createdAt: '2026-10-20T08:00:00.000Z', expenses: [] };

  it('puts the trip whose dates cover the payment first, then the one used most recently', () => {
    // Goa's only expense is on 2 October, so a payment on the 3rd falls inside it.
    expect(tripsFor(paid, [other, trip]).map((candidate) => candidate.name)).toEqual(['Goa', 'Manali']);
    expect(tripsFor(received({ direction: 'debit', date: '2026-10-22' }), [trip, other]).map((candidate) => candidate.name)).toEqual([
      'Manali',
      'Goa',
    ]);
  });

  it('leaves out finalised trips and ones where this phone has not said who it is', () => {
    expect(tripsFor(paid, [{ ...trip, finalizedAt: '2026-10-10T00:00:00.000Z' }, { ...other, meId: '' }])).toEqual([]);
  });
});

describe('paidOn', () => {
  it('uses the day the bank gives, or else when the alert was seen', () => {
    expect(new Date(paidOn(received({ date: '2026-10-20' }))).getDate()).toBe(20);
    expect(paidOn(received({}))).toBe('2026-10-24T10:00:00.000Z');
  });
});
