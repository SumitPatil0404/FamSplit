import { CATEGORIES } from '@/store/categories';

import { hi, mr } from '../translate';

// Jest runs this in Node; the app itself has no Node types, so declare the little that is used.
declare const require: (module: string) => any;
declare const __dirname: string;
const { readdirSync, readFileSync, statSync } = require('fs');
const { join } = require('path');

/** Every English text the app passes to t() or msg(), found by reading the source. */
function usedKeys(): Set<string> {
  const keys = new Set<string>(CATEGORIES.map((category) => category.label));
  const walk = (dir: string) => {
    for (const name of readdirSync(dir)) {
      const path = join(dir, name);
      if (statSync(path).isDirectory()) {
        if (name !== '__tests__' && name !== 'i18n') {
          walk(path);
        }
      } else if (/\.tsx?$/.test(name)) {
        const source = readFileSync(path, 'utf8');
        for (const match of source.matchAll(/\b(?:t|msg)\(\s*'((?:[^'\\]|\\.)*)'/g)) {
          keys.add(match[1].replace(/\\'/g, "'"));
        }
        // plural(t, count, 'one', 'many')
        for (const match of source.matchAll(/plural\(\s*t\s*,[^,]+,\s*'([^']*)'\s*,\s*'([^']*)'/g)) {
          keys.add(match[1]);
          keys.add(match[2]);
        }
      }
    }
  };
  walk(join(__dirname, '..', '..'));
  return keys;
}

const placeholders = (text: string) => [...text.matchAll(/\{(\w+)\}/g)].map((match) => match[1]).sort();

describe.each([
  ['Hindi', hi],
  ['Marathi', mr],
])('%s', (_language, dictionary) => {
  const keys = usedKeys();

  it('translates every text the app shows', () => {
    expect([...keys].filter((key) => !(key in dictionary))).toEqual([]);
  });

  it('keeps the same {placeholders} as the English', () => {
    expect(
      Object.entries(dictionary).filter(([english, translated]) => placeholders(english).join() !== placeholders(translated).join()),
    ).toEqual([]);
  });

  it('has no leftover texts the app no longer uses', () => {
    expect(Object.keys(dictionary).filter((key) => !keys.has(key))).toEqual([]);
  });
});
