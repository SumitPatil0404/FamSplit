import { NativeModule, requireOptionalNativeModule } from 'expo';

/** A payment alert as the phone received it. The app decides whether it really is a payment. */
export type BankAlert = {
  text: string;
  /** The app that showed it, e.g. "com.google.android.apps.messaging". */
  source: string;
  seenAt: string;
};

type BankAlertsEvents = {
  /** An alert arrived while FamSplit was on screen; it is waiting in takePending. */
  onAlert: () => void;
};

declare class BankAlertsModule extends NativeModule<BankAlertsEvents> {
  isEnabled(): boolean;
  openSettings(): void;
  takePending(): BankAlert[];
  setTexts(one: string, many: string, channel: string): void;
}

/** Android only, and only in a build that includes it: null on iPhone, the web and Expo Go. */
export const BankAlerts = requireOptionalNativeModule<BankAlertsModule>('BankAlerts');
