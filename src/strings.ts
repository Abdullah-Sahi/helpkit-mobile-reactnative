import type { HelpKitStrings } from './types';

/**
 * The native sheet's own words, in English. An app puts its own in `config.strings`; the help
 * center's pages bring theirs.
 */
export const DEFAULT_STRINGS: Required<HelpKitStrings> = {
  help: 'Help',
  back: 'Back',
  close: 'Close',
  loading: 'Loading help',
  errorTitle: 'Couldn’t load help',
  errorBody: 'Check your connection and try again.',
  retry: 'Try again',
  unavailableTitle: 'Help isn’t available right now',
  unavailableBody: 'Please try again later.',
};

const MAX_WORDS = 200;

/** The defaults, with each of the app's own that is a non-empty string, cut to 200 characters. */
export function sheetStrings(overrides: HelpKitStrings | null | undefined): Required<HelpKitStrings> {
  const words = { ...DEFAULT_STRINGS };
  if (typeof overrides !== 'object' || overrides === null) return words;
  for (const key of Object.keys(DEFAULT_STRINGS) as (keyof HelpKitStrings)[]) {
    const value: unknown = overrides[key];
    if (typeof value === 'string' && value.trim()) words[key] = value.trim().slice(0, MAX_WORDS);
  }
  return words;
}

/**
 * The sheet's title: this opening's, else the app's, else the help center's name, else "Help".
 * A title given as a function is asked each time (for the app's own translations); one that throws
 * or gives nothing is passed over.
 */
export function sheetTitle(
  candidates: (string | (() => string) | null | undefined)[],
  fallback: string,
): string {
  for (const candidate of candidates) {
    let value: unknown = candidate;
    if (typeof candidate === 'function') {
      try {
        value = candidate();
      } catch {
        value = null;
      }
    }
    if (typeof value === 'string' && value.trim()) return value.trim().slice(0, MAX_WORDS);
  }
  return fallback;
}
