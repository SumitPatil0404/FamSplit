import Storage from 'expo-sqlite/kv-store';

const WELCOME_SEEN_KEY = 'famsplit.welcomeSeen.v1';

/** Whether this phone has already been shown how FamSplit works. */
export function hasSeenWelcome(): boolean {
  return Storage.getItemSync(WELCOME_SEEN_KEY) === 'yes';
}

export function markWelcomeSeen() {
  Storage.setItemSync(WELCOME_SEEN_KEY, 'yes');
}
