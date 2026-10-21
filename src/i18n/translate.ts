import { hi } from './hi';
import { mr } from './mr';

export type Language = 'en' | 'hi' | 'mr';
export type Params = Record<string, string | number>;

/**
 * Translates an English sentence. The English text is the key, so anything without a
 * translation yet simply shows in English. `{name}` placeholders are filled from params.
 */
export type T = (text: string, params?: Params) => string;

const DICTIONARIES: Record<Language, Record<string, string>> = { en: {}, hi, mr };

export const LANGUAGE_NAMES: Record<Language, string> = { en: 'English', hi: 'हिन्दी', mr: 'मराठी' };

function fill(text: string, params?: Params): string {
  return params ? text.replace(/\{(\w+)\}/g, (match, key: string) => (key in params ? String(params[key]) : match)) : text;
}

export function translator(language: Language): T {
  const dictionary = DICTIONARIES[language];
  return (text, params) => fill(dictionary[text] ?? text, params);
}

export const englishT = translator('en');

/**
 * Marks English text made outside components, such as sync errors, for translation where it is
 * shown. It changes nothing; it only lets the dictionary check find the text.
 */
export const msg = (text: string) => text;

/** "1 person" / "3 people": picks the form by count and fills in {count}. */
export function plural(t: T, count: number, one: string, many: string): string {
  return t(count === 1 ? one : many, { count });
}

export { hi, mr };
