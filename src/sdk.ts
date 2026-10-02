import { cleanLanguage, cleanVersion } from './editions';
import { devWarn } from './log';
import { cleanContactFields, store, type OpenRequest } from './store';
import type { ContactFields, HelpKitOpenOptions } from './types';
import { cleanQuery, cleanSlug } from './url';

/**
 * `HelpKitSDK`: the calls an app makes from anywhere, once `<HelpKit>` is mounted at its root. The
 * names mirror helpkit.so's SDK. Each call only hands a request to the mounted `<HelpKit>`
 * (store.ts), which does the work.
 */

function optionsOf(options: unknown): HelpKitOpenOptions {
  if (typeof options !== 'object' || options === null) return {};
  const { headerTitle, version } = options as Record<string, unknown>;
  const clean: HelpKitOpenOptions = {};
  if (typeof headerTitle === 'string' || typeof headerTitle === 'function') {
    clean.headerTitle = headerTitle as HelpKitOpenOptions['headerTitle'];
  }
  if (typeof version === 'string') clean.version = version;
  return clean;
}

function open(request: OpenRequest): void {
  store.open(request);
}

/** A slug for a view that needs one, or the front page with a development warning. */
function bySlug(view: 'article' | 'category', slug: unknown, options: unknown): void {
  const clean = cleanSlug(slug);
  if (!clean) {
    devWarn(
      `${view === 'article' ? 'openArticle' : 'openCategory'} takes a slug: lowercase letters, digits and hyphens, the last part of its address (like "reset-your-password"). The front page opens instead.`,
    );
    open({ view: 'home', options: optionsOf(options) });
    return;
  }
  open({ view, slug: clean, options: optionsOf(options) });
}

export const HelpKitSDK = Object.freeze({
  /** Opens the help center at its front page. */
  open(options?: HelpKitOpenOptions): void {
    open({ view: 'home', options: optionsOf(options) });
  },

  /** Opens an article (on a documentation site, a page) by its slug: the last part of its address. */
  openArticle(slug: string, options?: HelpKitOpenOptions): void {
    bySlug('article', slug, options);
  },

  /** Opens a collection (on a documentation site, a top-level page) by its slug. */
  openCategory(slug: string, options?: HelpKitOpenOptions): void {
    bySlug('category', slug, options);
  },

  /** Opens the front page with these words in the search box. Nothing is searched until the reader asks. */
  openSearch(query: string, options?: HelpKitOpenOptions): void {
    const q = cleanQuery(query);
    if (!q) devWarn('openSearch takes the words to put in the search box. The front page opens instead.');
    open(q ? { view: 'search', q, options: optionsOf(options) } : { view: 'home', options: optionsOf(options) });
  },

  /** Opens the contact form. A help center that takes no messages says so, with a way home. */
  openContact(options?: HelpKitOpenOptions): void {
    open({ view: 'contact', options: optionsOf(options) });
  },

  /**
   * What the contact form offers the reader: a name, an email, a subject and metadata, each filling
   * its field only where the reader left it empty. Null or `{}` clears them. Held in memory only.
   */
  setContactFields(fields: ContactFields | null): void {
    const clean = cleanContactFields(fields);
    if (clean !== undefined) store.setFields(clean);
  },

  /**
   * The version of your help center to open from now on, by its label (`v2`), as the dashboard's
   * Languages page shows it; null or `''` clears it. It wins over `config.version`, and an opening's
   * own `{ version }` wins over it. A version the help center doesn't offer opens it as if none were
   * set, with a warning in development: never a "not found".
   */
  setVersion(version: string | null): void {
    store.version = cleanVersion(version);
  },

  /**
   * Your app's language, as a tag (`de`, `pt-BR`, `zh-Hant`), to open the help center in that
   * language when it is written in it; null or `''` clears it. It wins over `config.language`. A
   * version, when one is set, comes first. A language the help center isn't written in opens its main
   * language, as before.
   */
  setLanguage(locale: string | null): void {
    const tag = cleanLanguage(locale);
    const blank = locale === null || locale === undefined || (typeof locale === 'string' && !locale.trim());
    if (!tag && !blank) {
      devWarn('setLanguage takes a language tag, like "de", "pt-BR" or "zh-Hant". It was cleared.');
    }
    store.language = tag;
  },

  /**
   * Signs the reader out of a protected help center, and forgets the contact fields and the
   * reader's unsent draft: call it when somebody signs out of your app. With the sheet closed, it
   * happens the next time the sheet opens in this run of the app.
   */
  signOut(): void {
    store.signOut();
  },

  /** Closes the sheet. */
  close(): void {
    store.close();
  },

  /** Whether the sheet is open. */
  isOpen(): boolean {
    return store.isOpen();
  },
});
