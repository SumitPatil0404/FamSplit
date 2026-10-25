import { guessCategory } from './categories';
import { markDetected, PERSONAL, type DetectedPayment, type SettleUpMatch } from './detected';
import { paidOn, tripExpenseFrom } from './detected-match';
import { deletePersonalExpense, savePersonalExpense } from './personal';
import { addPayment, deleteExpense, deletePayment, newId, saveExpense, type StoredTrip } from './trips';

/**
 * One tap on a bank payment. Each action happens at once and returns how to take it back, for the
 * "tap to undo" message. The payment remembers what it created, so it can also be put back later.
 */
export type Undo = () => void;

export function addPaymentToTrip(payment: DetectedPayment, trip: StoredTrip, description: string): Undo {
  const expense = tripExpenseFrom(payment, trip, newId('exp'), description);
  saveExpense(trip.id, expense);
  markDetected(payment.id, 'added', trip.id, expense.id);
  return () => putBack({ ...payment, status: 'added', tripId: trip.id, createdId: expense.id });
}

export function savePaymentAsPersonal(payment: DetectedPayment, description: string): Undo {
  const id = newId('pex');
  savePersonalExpense({ id, description, amount: payment.amount, category: guessCategory(description).id, date: paidOn(payment) });
  markDetected(payment.id, 'added', PERSONAL, id);
  return () => putBack({ ...payment, status: 'added', tripId: PERSONAL, createdId: id });
}

export function ignorePayment(payment: DetectedPayment): Undo {
  markDetected(payment.id, 'dismissed');
  return () => putBack({ ...payment, status: 'dismissed' });
}

/** Records that the person paid, for the amount that actually arrived. */
export function settleWithPayment(payment: DetectedPayment, match: SettleUpMatch): Undo {
  const { trip, transfer } = match;
  const paymentId = addPayment(trip.id, { fromMemberId: transfer.fromMemberId, toMemberId: transfer.toMemberId, amount: payment.amount });
  markDetected(payment.id, 'added', trip.id, paymentId);
  return () => putBack({ ...payment, status: 'added', tripId: trip.id, createdId: paymentId });
}

/** Takes back whatever sorting the payment created, and puts it back in the list to sort. */
export function putBack(payment: DetectedPayment) {
  if (payment.status === 'added' && payment.createdId) {
    if (payment.tripId === PERSONAL) {
      deletePersonalExpense(payment.createdId);
    } else if (payment.tripId && payment.direction === 'credit') {
      deletePayment(payment.tripId, payment.createdId);
    } else if (payment.tripId) {
      deleteExpense(payment.tripId, payment.createdId);
    }
  }
  markDetected(payment.id, 'new');
}
