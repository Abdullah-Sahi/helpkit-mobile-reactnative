/**
 * The public types. The names mirror helpkit.so's React Native SDK, so an app moving across keeps
 * its calls; the behaviour is this SDK's own (README.md).
 */

/** The words the native sheet draws itself. The help center's pages bring their own. */
export interface HelpKitStrings {
  /** The title until the help center's own name is known. "Help". */
  help?: string;
  /** The header's Back button, for screen readers. "Back". */
  back?: string;
  /** The header's Close button, for screen readers. "Close". */
  close?: string;
  /** Said while the help center loads. "Loading help". */
  loading?: string;
  /** "Couldn't load help". */
  errorTitle?: string;
  /** "Check your connection and try again." */
  errorBody?: string;
  /** "Try again". */
  retry?: string;
  /** "Help isn't available right now". */
  unavailableTitle?: string;
  /** "Please try again later." */
  unavailableBody?: string;
}

/** What `<HelpKit>` takes as `config`. Read each time the sheet opens, so a changed value is seen. */
export interface HelpKitConfig {
  /**
   * HelpKit's own address, where the SDK asks which help center the App ID names: the dashboard's
   * snippet fills it in. Required until HelpKit has a production address of its own. `https:`,
   * except for a local address during development.
   */
  host: string;
  /** The sheet's title: a string, or a function for your own translations. Defaults to the help center's name. */
  headerTitle?: string | (() => string);
  /** Accepted and kept, for helpkit.so parity. Versions don't exist yet, so nothing is sent. */
  version?: string;
  /**
   * Diagnostics in the console. Never the contact fields, and never WebView debugging: that is on
   * in development builds only, whatever this says.
   */
  debug?: boolean;
  /**
   * Given every link that leaves the help center (http, https and mailto), instead of the SDK
   * opening it with `Linking`: for an in-app browser, or your own universal links.
   */
  onOpenLink?: (url: string) => void;
  /** Your words for the native sheet. */
  strings?: HelpKitStrings;
}

export interface HelpKitProps {
  /** The App ID from the dashboard's Mobile app card: public, not a secret, and it never changes. */
  projectId: string;
  config: HelpKitConfig;
}

/** Options for one opening, as helpkit.so takes them. */
export interface HelpKitOpenOptions {
  /** The title for this opening only. */
  headerTitle?: string | (() => string);
  /** Accepted, for helpkit.so parity. Versions don't exist yet, so nothing is sent. */
  version?: string;
}

/**
 * What the contact form offers the reader, filled in only where they left a field empty. Held in
 * memory only: never stored, never put in an address, never logged.
 */
export interface ContactFields {
  name?: string | null;
  email?: string | null;
  subject?: string | null;
  /**
   * Details your app attaches, such as its version and the platform: a string, or a plain object,
   * which is sent as JSON. Shown to the reader before sending, and to the team marked "not
   * verified". Never a secret, and never proof of who somebody is.
   */
  metadata?: string | Record<string, unknown> | null;
}

/** The views the sheet opens at. */
export type HelpKitView = 'home' | 'article' | 'category' | 'search' | 'contact';
