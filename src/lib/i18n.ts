import am from '../i18n/am.json';
import en from '../i18n/en.json';

export type Lang = 'am' | 'en';
export type T = (key: string, vars?: Record<string, string | number>) => string;

const DICTS: Record<Lang, Record<string, string>> = { am, en };

/** Translator for one language. `{name}` placeholders are filled from `vars`; unknown keys return the key. */
export function createT(lang: Lang): T {
  const dict = DICTS[lang];
  return (key, vars) => {
    const template = dict[key] ?? key;
    if (!vars) return template;
    return template.replace(/\{(\w+)\}/g, (m, k: string) => (k in vars ? String(vars[k]) : m));
  };
}
