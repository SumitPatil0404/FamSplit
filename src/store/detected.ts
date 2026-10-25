import Storage from 'expo-sqlite/kv-store';
import { useSyncExternalStore } from 'react';

import { parseBankAlert } from '@/domain';

import { isDuplicate, type DetectedPayment } from './detected-match';
import { newId } from './trips';

export { paidOn, settleUpMatches, type DetectedPayment, type SettleUpMatch } from './detected-match';

const DETECTED_KEY = 'famsplit.detected.v1';
/** Older alerts are dropped, so the list never grows without end. */
const KEEP_DAYS = 60;

function load(): DetectedPayment[] {
  try {
    const raw = Storage.getItemSync(DETECTED_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

let detected = load();
const listeners = new Set<() => void>();

function save(next: DetectedPayment[]) {
  const cutoff = Date.now() - KEEP_DAYS * 24 * 60 * 60 * 1000;
  detected = next.filter((payment) => Date.parse(payment.seenAt) >= cutoff);
  Storage.setItemSync(DETECTED_KEY, JSON.stringify(detected));
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getDetected = () => detected;

/** Newest first. */
export function useDetected(): DetectedPayment[] {
  return useSyncExternalStore(subscribe, getDetected, getDetected);
}

export function findDetected(id: string | undefined): DetectedPayment | undefined {
  return detected.find((payment) => payment.id === id);
}

export type AddResult = { payment: DetectedPayment } | { problem: 'notPayment' | 'duplicate' };

/** Reads an alert and keeps it if it is a payment not already in the list. */
export function addDetected(text: string, options: { source?: string; seenAt?: string } = {}): AddResult {
  const alert = parseBankAlert(text);
  if (!alert) {
    return { problem: 'notPayment' };
  }
  const seenAt = options.seenAt ?? new Date().toISOString();
  if (isDuplicate(detected, { ...alert, seenAt })) {
    return { problem: 'duplicate' };
  }
  const payment: DetectedPayment = { ...alert, id: newId('alert'), seenAt, text, source: options.source, status: 'new' };
  save([payment, ...detected]);
  return { payment };
}

export function markDetected(id: string, status: DetectedPayment['status'], tripId?: string) {
  save(detected.map((payment) => (payment.id === id ? { ...payment, status, tripId } : payment)));
}
