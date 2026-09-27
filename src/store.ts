import { FIELD_LIMITS, type ContactField, type Prefill } from './bridge';
import { devWarn } from './log';
import type { HelpKitOpenOptions, HelpKitView } from './types';

/**
 * The SDK's state between `HelpKitSDK` (callable from anywhere) and the mounted `<HelpKit>`: one
 * module, in memory, and nothing written anywhere. The package is ESM only, so an app can't end up
 * with two copies of it and calls that reach nobody.
 *
 * - **A call made before `<HelpKit>` mounts is kept**, not dropped: the last `open*` wins, and it
 *   opens when `<HelpKit>` mounts — within 5 seconds. Later than that it is forgotten, so an app that
 *   mounts `<HelpKit>` only after, say, signing in doesn't get a sheet nobody asked for just then.
 * - **A second `<HelpKit>`** gets a development warning. The one mounted last receives the calls;
 *   when it unmounts, the one before takes over again.
 * - **Contact fields** are held here, checked, and offered to the page after each `ready`.
 * - **A sign-out** asked for while the sheet is closed is held, and sent after the next `ready`,
 *   before any contact fields.
 */

export interface OpenRequest {
  view: HelpKitView;
  slug?: string;
  q?: string;
  options: HelpKitOpenOptions;
}

/** What a mounted `<HelpKit>` does for the SDK. */
export interface Host {
  open(request: OpenRequest): void;
  close(): void;
  isOpen(): boolean;
  /** The contact fields changed (or were cleared). */
  fieldsChanged(): void;
  /** `HelpKitSDK.signOut()` was called; the host takes the held sign-out when it can send it. */
  signOutRequested(): void;
}

/** How long a call made before `<HelpKit>` mounts is kept. */
export const QUEUED_FOR_MS = 5_000;

const FIELDS = Object.keys(FIELD_LIMITS) as ContactField[];

function isPlainObject(value: unknown): value is Record<string, unknown> {
  if (typeof value !== 'object' || value === null || Array.isArray(value)) return false;
  const proto: unknown = Object.getPrototypeOf(value);
  return proto === Object.prototype || proto === null;
}

/**
 * `setContactFields`' argument, checked: the four known keys only, each a string within the API's
 * limit (name 100, email 254, subject 150, metadata 2,000); `metadata` may also be a plain object,
 * sent as JSON. Anything else is dropped with a development warning that never shows the value.
 * A blank field offers nothing. Null, `{}`, or nothing usable clears them all.
 *
 * `undefined` as a result means "not an object at all": the call is ignored.
 */
export function cleanContactFields(input: unknown): Prefill | null | undefined {
  if (input === null || input === undefined) return null;
  if (!isPlainObject(input)) {
    devWarn('setContactFields takes an object: { name, email, subject, metadata }. This call was ignored.');
    return undefined;
  }

  const unknown = Object.keys(input).filter((key) => !(FIELDS as string[]).includes(key));
  if (unknown.length > 0) {
    devWarn(`setContactFields keeps only name, email, subject and metadata; it dropped ${unknown.join(', ')}.`);
  }

  const fields: Prefill = {};
  for (const field of FIELDS) {
    let value: unknown = input[field];
    if (value === undefined || value === null) continue;
    if (field === 'metadata' && isPlainObject(value)) {
      try {
        value = JSON.stringify(value);
      } catch {
        devWarn('setContactFields: metadata could not be turned into JSON, so it was dropped.');
        continue;
      }
    }
    if (typeof value !== 'string') {
      devWarn(
        field === 'metadata'
          ? 'setContactFields: metadata must be a string or a plain object, so it was dropped.'
          : `setContactFields: ${field} must be a string, so it was dropped.`,
      );
      continue;
    }
    if (!value.trim()) continue;
    if (value.length > FIELD_LIMITS[field]) {
      devWarn(`setContactFields: ${field} is longer than ${FIELD_LIMITS[field]} characters, so it was dropped.`);
      continue;
    }
    fields[field] = value;
  }
  return Object.keys(fields).length > 0 ? fields : null;
}

class Store {
  private hosts: Host[] = [];
  private queued: { request: OpenRequest; at: number } | null = null;
  private held = false;
  /** The contact fields the app offers, or null. In memory only. */
  fields: Prefill | null = null;
  /** `setVersion`'s value: kept, and sent nowhere until versions exist. */
  version: string | null = null;

  private active(): Host | null {
    return this.hosts[this.hosts.length - 1] ?? null;
  }

  /** A `<HelpKit>` has mounted. It is given a call made just before, if there was one. */
  register(host: Host): () => void {
    if (this.hosts.length > 0) {
      devWarn(
        'More than one <HelpKit> is mounted. Mount it once, at the root of your app; the one mounted last receives the calls.',
        'second-mount',
      );
    }
    this.hosts.push(host);
    const queued = this.queued;
    this.queued = null;
    if (queued && Date.now() - queued.at <= QUEUED_FOR_MS) host.open(queued.request);
    return () => {
      const at = this.hosts.lastIndexOf(host);
      if (at >= 0) this.hosts.splice(at, 1);
    };
  }

  open(request: OpenRequest): void {
    const host = this.active();
    if (host) {
      host.open(request);
      return;
    }
    this.queued = { request, at: Date.now() };
    devWarn(
      'HelpKitSDK was called before <HelpKit> mounted. It opens once <HelpKit> mounts, if that is within 5 seconds.',
      'before-mount',
    );
  }

  close(): void {
    this.queued = null;
    this.active()?.close();
  }

  isOpen(): boolean {
    return this.active()?.isOpen() ?? false;
  }

  setFields(fields: Prefill | null): void {
    this.fields = fields;
    this.active()?.fieldsChanged();
  }

  /** The app's own sign-out: whatever it offered for the person signing out goes too. */
  signOut(): void {
    this.fields = null;
    this.held = true;
    this.active()?.signOutRequested();
  }

  /** Whether a sign-out is waiting to be sent; taking it clears it. */
  takeSignOut(): boolean {
    const held = this.held;
    this.held = false;
    return held;
  }

  /** For tests: as if the app had just started. */
  reset(): void {
    this.hosts = [];
    this.queued = null;
    this.held = false;
    this.fields = null;
    this.version = null;
  }
}

export const store = new Store();
