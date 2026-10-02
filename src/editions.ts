/**
 * Which of a help center's editions an opening shows: its main language, another language, or a
 * version of the product (HelpKit's item 26). The resolver lists what the app may open, and the SDK
 * picks one by the app's own settings, first match wins:
 *
 * 1. **The version**: the opening's `{ version }`, else `HelpKitSDK.setVersion()`'s, else
 *    `config.version`. It is matched against the site's versions only, by their label in any case.
 * 2. **The language**: `HelpKitSDK.setLanguage()`'s, else `config.language`. It is matched against the
 *    main edition and the language editions: the exact tag first, then the same language (`de` for
 *    `de-AT`), kept apart by script for Chinese, as the site's own widget matches a page's language
 *    (`editionInLanguage` in helpkit-web's lib/editions.ts). A version is never picked by language.
 * 3. **The main edition**, at `/_mobile` as before.
 *
 * A version the site doesn't offer falls through to the language, with a warning in development, as
 * the widget's does: never a "not found". The SDK only ever opens a path the resolver listed, so a
 * version that is never made, deleted, or not yet launched opens the help center the app would have
 * shown without it; and an answer from a HelpKit without editions opens the main edition, as before.
 */

/** One of the editions the resolver offers: the main one (path `''`), then each language and version. */
export interface Edition {
  /** `''` for the main edition; otherwise the one segment after `/_mobile`, like `de` or `v2`. */
  path: string;
  kind: 'main' | 'language' | 'version';
  /** Its language, as a tag: `de`, `zh-Hant`. */
  language: string;
  /** Its name, as the site's switcher shows it: "Deutsch", "v2". */
  label: string;
}

/** An edition's path: one segment of lowercase letters, digits, dots and hyphens, as the API makes them. */
export const EDITION_PATH = /^[a-z0-9](?:[a-z0-9.-]{0,18}[a-z0-9])?$/;

const KINDS = new Set<string>(['main', 'language', 'version']);
const MAX_EDITIONS = 50;
const MAX_LABEL = 80;
const MAX_TAG = 35;
/** A language tag as apps hold one: `de`, `de-AT`, `zh-Hant-TW`, or Android's `de_AT`. */
const TAG = /^[A-Za-z]{2,3}(?:[-_][A-Za-z0-9]{1,8})*$/;

/**
 * The resolver's `editions`, checked. An entry with a path that isn't one segment, a kind this version
 * doesn't know, or no language is left out; nothing from this list reaches an address unchecked. An
 * answer without the list (a HelpKit from before editions) is the main edition alone.
 */
export function readEditions(value: unknown): Edition[] {
  if (!Array.isArray(value)) return [];
  const editions: Edition[] = [];
  for (const entry of value.slice(0, MAX_EDITIONS)) {
    if (typeof entry !== 'object' || entry === null) continue;
    const { path, kind, language, label } = entry as Record<string, unknown>;
    if (typeof path !== 'string' || typeof kind !== 'string' || !KINDS.has(kind)) continue;
    if (kind === 'main' ? path !== '' : !EDITION_PATH.test(path)) continue;
    if (typeof language !== 'string' || !TAG.test(language) || language.length > MAX_TAG) continue;
    editions.push({
      path,
      kind: kind as Edition['kind'],
      language,
      label: typeof label === 'string' && label.trim() ? label.trim().slice(0, MAX_LABEL) : path || language,
    });
  }
  return editions;
}

/** A version as the app gave it, trimmed and lowercase, or null when it gave none. */
export function cleanVersion(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const version = value.trim().toLowerCase();
  return version ? version : null;
}

/** A language tag as the app gave it, trimmed, or null when it isn't one. */
export function cleanLanguage(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const tag = value.trim();
  return tag.length <= MAX_TAG && TAG.test(tag) ? tag : null;
}

/** Old codes some phones still report, for the language a site's list calls by its current one. */
const SAME_AS: Readonly<Record<string, string>> = { no: 'nb', iw: 'he', in: 'id' };
/**
 * Where Chinese is taken to be written in Traditional characters when a tag names a region and no
 * script: the regions for which the Unicode CLDR's likely-subtags data, which browsers' `Intl.Locale`
 * uses, fills in Hant. So `zh-TW` here and in a browser open the same edition.
 */
const TRADITIONAL = new Set(['TW', 'HK', 'MO', 'AU', 'BN', 'GB', 'GF', 'ID', 'PA', 'PF', 'PH', 'SR', 'TH', 'US', 'VN']);

/**
 * A tag's language, and its script where that tells two of a site's languages apart. Of the 34
 * languages a site can be written in, only Chinese comes in two scripts (`zh-Hans`, `zh-Hant`), so the
 * script is worked out for Chinese alone: the tag's own, or else by its region as a browser would
 * (TRADITIONAL, above), and Simplified without one. Plain string rules rather than `Intl.Locale`, so
 * the choice doesn't depend on whether the app's JavaScript engine has it.
 */
function likely(tag: string): { language: string; script: string } {
  const [first = '', ...rest] = tag.split(/[-_]/);
  const language = SAME_AS[first.toLowerCase()] ?? first.toLowerCase();
  if (language !== 'zh') return { language, script: '' };
  const script = rest.find((part) => /^[A-Za-z]{4}$/.test(part))?.toLowerCase();
  if (script) return { language, script };
  const region = rest.find((part) => /^[A-Za-z]{2}$/.test(part))?.toUpperCase();
  return { language, script: region && TRADITIONAL.has(region) ? 'hant' : 'hans' };
}

/**
 * The path of the edition written in `language` — `''` for the main one — or null when none is. The
 * main edition and language editions only: a version is named by whoever chooses it.
 */
export function editionInLanguage(language: unknown, editions: readonly Edition[]): string | null {
  const tag = cleanLanguage(language);
  if (!tag) return null;
  const candidates = editions.filter((edition) => edition.kind !== 'version');
  const asked = tag.replace(/_/g, '-').toLowerCase();
  const exact = candidates.find((edition) => edition.language.toLowerCase() === asked);
  if (exact) return exact.path;

  const wanted = likely(tag);
  const near = candidates.find((edition) => {
    const theirs = likely(edition.language);
    return theirs.language === wanted.language && theirs.script === wanted.script;
  });
  return near ? near.path : null;
}

export interface EditionChoice {
  /** `''` for the main edition. */
  path: string;
  /** The version the app asked for when the site offers none by that name; null otherwise. */
  unknownVersion: string | null;
}

/** Which edition to open, by the rules at the top of this file. */
export function chooseEdition(
  editions: readonly Edition[],
  wanted: { version: string | null; language: string | null },
): EditionChoice {
  const version = cleanVersion(wanted.version);
  if (version) {
    const found = editions.find((edition) => edition.kind === 'version' && edition.path === version);
    if (found) return { path: found.path, unknownVersion: null };
  }
  return { path: editionInLanguage(wanted.language, editions) ?? '', unknownVersion: version };
}
