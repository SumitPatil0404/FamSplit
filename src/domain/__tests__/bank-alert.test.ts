import { parseBankAlert } from '../bank-alert';

// Written in the style of each bank's and app's alerts; numbers and names are made up.
describe('parseBankAlert: bank SMS', () => {
  it('reads an SBI UPI debit, which has no currency sign', () => {
    expect(
      parseBankAlert(
        'Dear UPI user A/C X1234 debited by 500.0 on date 24Oct26 trf to ZOMATO Refno 123456789012. If not u? call 1800111109. -SBI',
      ),
    ).toEqual({
      direction: 'debit',
      amount: 50000,
      party: 'Zomato',
      date: '2026-10-24',
      account: '1234',
      reference: '123456789012',
    });
  });

  it('reads an SBI UPI credit', () => {
    expect(
      parseBankAlert('Dear SBI UPI User, ur A/cX1234 credited by Rs500 on 24Oct26 by (Ref no 123456789012)'),
    ).toEqual({ direction: 'credit', amount: 50000, date: '2026-10-24', account: '1234', reference: '123456789012' });
  });

  it('reads an SBI card spend', () => {
    expect(
      parseBankAlert(
        'Rs.1,200.00 spent on your SBI Credit Card ending 1234 at ZOMATO on 24/10/26. Trxn. not done by you? Report at https://sbicard.com/Dispute',
      ),
    ).toEqual({ direction: 'debit', amount: 120000, party: 'Zomato', date: '2026-10-24', account: '1234' });
  });

  it('reads an HDFC UPI payment to a person', () => {
    expect(
      parseBankAlert(
        'Sent Rs.500.00 From HDFC Bank A/C *1234 To Rahul Sharma On 24/10/26 Ref 123456789012 Not You? Call 18002586161/SMS BLOCK UPI to 7308080808',
      ),
    ).toEqual({
      direction: 'debit',
      amount: 50000,
      party: 'Rahul Sharma',
      date: '2026-10-24',
      account: '1234',
      reference: '123456789012',
    });
  });

  it('reads an HDFC credit from a UPI ID', () => {
    expect(
      parseBankAlert(
        'Credit Alert! Rs.500.00 credited to HDFC Bank A/c XX1234 on 24-10-26 from VPA rahul@okicici (UPI 123456789012)',
      ),
    ).toEqual({
      direction: 'credit',
      amount: 50000,
      upiId: 'rahul@okicici',
      date: '2026-10-24',
      account: '1234',
      reference: '123456789012',
    });
  });

  it('reads an HDFC card spend', () => {
    expect(
      parseBankAlert(
        'Spent Rs.1200 On HDFC Bank Card 1234 At ZOMATO On 2026-10-24:13:45:10 Not You? To Block+Reissue Call 18002586161/SMS BLOCK CC 1234 to 7308080808',
      ),
    ).toEqual({ direction: 'debit', amount: 120000, party: 'Zomato', date: '2026-10-24', account: '1234' });
  });

  it('reads an ICICI debit, where the payee comes after the amount', () => {
    expect(
      parseBankAlert(
        'ICICI Bank Acct XX234 debited for Rs 1200.00 on 24-Oct-26; ZOMATO credited. UPI:123456789012. Call 18002662 for dispute. SMS BLOCK 234 to 9215676766.',
      ),
    ).toEqual({
      direction: 'debit',
      amount: 120000,
      party: 'Zomato',
      date: '2026-10-24',
      account: '234',
      reference: '123456789012',
    });
  });

  it('reads an ICICI credit', () => {
    expect(
      parseBankAlert(
        'Dear Customer, Acct XX234 is credited with Rs 500.00 on 24-Oct-26 from RAHUL SHARMA. UPI:123456789012-ICICI Bank.',
      ),
    ).toEqual({
      direction: 'credit',
      amount: 50000,
      party: 'Rahul Sharma',
      date: '2026-10-24',
      account: '234',
      reference: '123456789012',
    });
  });

  it('reads Axis Bank debits and credits', () => {
    expect(
      parseBankAlert(
        'INR 1200.00 debited A/c no. XX1234 24-10-26, 13:45:10 UPI/P2M/123456789012/ZOMATO Not you? SMS BLOCKUPI Cust ID to 919951860002 Axis Bank',
      ),
    ).toEqual({
      direction: 'debit',
      amount: 120000,
      party: 'Zomato',
      date: '2026-10-24',
      account: '1234',
      reference: '123456789012',
    });
    expect(
      parseBankAlert('INR 500.00 credited to A/c no. XX1234 24-10-26, 13:45:10 IST UPI/P2A/123456789012/RAHUL SHA - Axis Bank'),
    ).toEqual({
      direction: 'credit',
      amount: 50000,
      party: 'Rahul Sha',
      date: '2026-10-24',
      account: '1234',
      reference: '123456789012',
    });
  });

  it('reads Kotak payments to and from UPI IDs', () => {
    expect(
      parseBankAlert(
        'Sent Rs.500.00 from Kotak Bank AC X1234 to rahul@okaxis on 24-10-26.UPI Ref 123456789012. Not you, https://kotak.com/KBANKT/Fraud',
      ),
    ).toEqual({
      direction: 'debit',
      amount: 50000,
      upiId: 'rahul@okaxis',
      date: '2026-10-24',
      account: '1234',
      reference: '123456789012',
    });
    expect(
      parseBankAlert('Received Rs.500.00 in your Kotak Bank AC X1234 from rahul@okaxis on 24-10-26.UPI Ref:123456789012.'),
    ).toEqual({
      direction: 'credit',
      amount: 50000,
      upiId: 'rahul@okaxis',
      date: '2026-10-24',
      account: '1234',
      reference: '123456789012',
    });
  });

  it('takes the payment, not the balance that follows or comes first', () => {
    expect(
      parseBankAlert('Rs.1,200.00 debited from A/c XX1234 on 24-10-26 to VPA zomato@hdfcbank. Avl Bal Rs 10,500.00'),
    ).toMatchObject({ amount: 120000, upiId: 'zomato@hdfcbank' });
    expect(parseBankAlert('Avl bal: INR 9,800.00. INR 1,200.00 debited from A/c XX1234 at ZOMATO')).toMatchObject({
      amount: 120000,
      party: 'Zomato',
    });
  });
});

describe('parseBankAlert: UPI app notifications', () => {
  it('reads payments made', () => {
    expect(parseBankAlert('You paid ₹1,200 to Zomato')).toEqual({ direction: 'debit', amount: 120000, party: 'Zomato' });
    expect(parseBankAlert('Paid ₹1,200 to Zomato')).toEqual({ direction: 'debit', amount: 120000, party: 'Zomato' });
    expect(parseBankAlert('Paid Rs.1200 to Zomato from Paytm Balance')).toEqual({
      direction: 'debit',
      amount: 120000,
      party: 'Zomato',
    });
  });

  it('reads payments received, including "paid you"', () => {
    expect(parseBankAlert('Rahul Sharma paid you ₹500')).toEqual({ direction: 'credit', amount: 50000, party: 'Rahul Sharma' });
    expect(parseBankAlert('Received ₹500 from Rahul Sharma')).toEqual({
      direction: 'credit',
      amount: 50000,
      party: 'Rahul Sharma',
    });
  });
});

describe('parseBankAlert: not payments', () => {
  it.each([
    ['an OTP', '123456 is your OTP for txn of Rs.1200.00 at ZOMATO on HDFC Bank card 1234. Valid for 5 mins.'],
    ['a payment request', 'Rahul has requested Rs.500 from you on Google Pay'],
    ['a failed payment', 'Your payment of Rs 500 to Zomato failed. Any amount debited will be refunded.'],
    ['an upcoming autopay', 'Rs.1,500 will be debited from your account on 01-11-26 for Netflix autopay'],
    ['an offer', 'Get up to ₹500 cashback on your first UPI payment!'],
    ['a loan offer', 'You have a pre-approved loan of Rs 2,00,000. Apply now'],
    ['a bill reminder', 'Payment of Rs 4,500 is due on 05-11-26'],
    ['a balance message', 'Your A/c XX1234 balance is Rs 12,000.00 as on 24-10-26'],
    ['a message with no amount', 'Your order has been shipped'],
  ])('ignores %s', (_, text) => {
    expect(parseBankAlert(text)).toBeNull();
  });
});
