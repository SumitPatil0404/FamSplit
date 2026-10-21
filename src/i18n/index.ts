import { getLocales } from 'expo-localization';
import Storage from 'expo-sqlite/kv-store';
import { useSyncExternalStore } from 'react';
import { AppState } from 'react-native';

import { translator, type Language, type T } from './translate';

export * from './translate';

/** "system" follows the phone's language, if FamSplit speaks it. */
export type LanguageChoice = Language | 'system';

const CHOICE_KEY = 'famsplit.language';

function phoneLanguage(): Language {
  try {
    const code = getLocales()[0]?.languageCode;
    return code === 'hi' || code === 'mr' ? code : 'en';
  } catch {
    return 'en';
  }
}

function readChoice(): LanguageChoice {
  const saved = Storage.getItemSync(CHOICE_KEY);
  return saved === 'en' || saved === 'hi' || saved === 'mr' ? saved : 'system';
}

type State = { choice: LanguageChoice; language: Language; phone: Language; t: T };

function build(choice: LanguageChoice): State {
  const phone = phoneLanguage();
  const language = choice === 'system' ? phone : choice;
  return { choice, language, phone, t: translator(language) };
}

let state = build(readChoice());
const listeners = new Set<() => void>();

function set(next: State) {
  state = next;
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void) {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

const getState = () => state;

// Android lets people change the phone's language while the app is open.
AppState.addEventListener('change', (status) => {
  if (status === 'active' && state.choice === 'system' && phoneLanguage() !== state.language) {
    set(build('system'));
  }
});

export function setLanguage(choice: LanguageChoice) {
  Storage.setItemSync(CHOICE_KEY, choice);
  set(build(choice));
}

export function useLanguage(): State {
  return useSyncExternalStore(subscribe, getState, getState);
}

/** The translate function for the current language; components re-render when it changes. */
export function useT(): T {
  return useLanguage().t;
}

/** For code outside components, such as notifications. */
export function currentT(): T {
  return state.t;
}
