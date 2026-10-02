import { EDITION_PATH } from './editions';
import type { HelpKitView } from './types';

/**
 * Addresses, as plain functions. Two rules matter most here.
 *
 * **Origins are compared, never re-parsed.** The resolver's `siteUrl` is made canonical once
 * (`parseOrigin`: lowercase, no default port, no user info). After that, a URL the WebView
 * reports is on the site only when it *starts with* that origin followed by the end, `/`, `?` or
 * `#` — so `https://acme.example.app@evil.com/` and `https://acme.example.app.evil.com/` never are.
 * A URL the browser reported is already normalised; one that somehow isn't fails closed.
 *
 * **https only, except a local address in development**, for `config.host` and for the site alike:
 * `http:` passes only in a development build (`__DEV__`) and only for localhost, 127.0.0.1,
 * 10.0.2.2 (the Android emulator's view of the computer), `*.localhost`, `*.nip.io`, `*.sslip.io`
 * or a private IPv4 address.
 */

/** Where the help center's app pages live, on the site's HelpKit subdomain. */
export const MOBILE_BASE = '/_mobile';

/** An App ID: sixteen random bytes as base64url. */
export const APP_ID = /^[A-Za-z0-9_-]{22}$/;

const SLUG = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const MAX_SLUG = 80;
/** The longest query the search box takes. */
export const MAX_QUERY = 100;

/** An article's or collection's slug, or null when it couldn't be one. */
export function cleanSlug(value: unknown): string | null {
  return typeof value === 'string' && value.length <= MAX_SLUG && SLUG.test(value) ? value : null;
}

/** Words for the search box: trimmed, no longer than it takes, or null when there are none. */
export function cleanQuery(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const q = value.trim().slice(0, MAX_QUERY).trim();
  return q || null;
}

export interface Origin {
  /** `scheme://host[:port]`, lowercase, without a default port. */
  origin: string;
  scheme: 'http' | 'https';
  host: string;
  /** Anything after the origin in what was given: a path, query or fragment. */
  rest: string;
}

const URLISH = /^([A-Za-z][A-Za-z0-9+.-]*):\/\/([^/?#]*)(.*)$/s;
const LABEL = '[a-z0-9](?:[a-z0-9-]*[a-z0-9])?';
const HOST_PORT = new RegExp(`^(${LABEL}(?:\\.${LABEL})*)(?::(\\d{1,5}))?$`);

/**
 * An http(s) address made canonical and reduced to its origin, or null when it isn't one. No user
 * info, no backslashes, no percent-escapes and no whitespace in the host, no IPv6 literal and no
 * port out of range: an address that needs any of those isn't one this SDK should load.
 */
export function parseOrigin(value: unknown): Origin | null {
  if (typeof value !== 'string' || value.length > 2048) return null;
  const match = URLISH.exec(value);
  if (!match) return null;
  const scheme = match[1]!.toLowerCase();
  if (scheme !== 'http' && scheme !== 'https') return null;
  const hostPort = HOST_PORT.exec(match[2]!.toLowerCase());
  if (!hostPort) return null;
  const host = hostPort[1]!;
  const portText = hostPort[2];
  let port = '';
  if (portText !== undefined) {
    const number = Number(portText);
    if (number < 1 || number > 65535) return null;
    const isDefault = (scheme === 'https' && number === 443) || (scheme === 'http' && number === 80);
    if (!isDefault) port = `:${number}`;
  }
  const rest = match[3]!;
  if (/[\s\\]/.test(rest)) return null;
  return { origin: `${scheme}://${host}${port}`, scheme, host, rest };
}

function isPrivateIPv4(host: string): boolean {
  const parts = /^(\d{1,3})\.(\d{1,3})\.(\d{1,3})\.(\d{1,3})$/.exec(host);
  if (!parts) return false;
  const [a, b, c, d] = parts.slice(1).map(Number) as [number, number, number, number];
  if ([a, b, c, d].some((n) => n > 255)) return false;
  return a === 10 || a === 127 || (a === 172 && b >= 16 && b <= 31) || (a === 192 && b === 168);
}

/** A host a development build may reach over plain http: the developer's own computer, or its network. */
export function isLocalDevHost(host: string): boolean {
  return (
    host === 'localhost' ||
    host.endsWith('.localhost') ||
    host === '10.0.2.2' ||
    host.endsWith('.nip.io') ||
    host.endsWith('.sslip.io') ||
    isPrivateIPv4(host)
  );
}

/** An origin this SDK may load or ask: https, or http for a local address in a development build. */
export function allowedOrigin(value: unknown, dev: boolean): Origin | null {
  const parsed = parseOrigin(value);
  if (!parsed) return null;
  if (parsed.scheme === 'https') return parsed;
  return dev && isLocalDevHost(parsed.host) ? parsed : null;
}

export interface ViewRequest {
  view: HelpKitView;
  slug?: string;
  q?: string;
}

/**
 * A view's path under the site's origin: the only thing an address ever carries. No contact field,
 * no metadata, no identity. In an edition other than the main one, its path comes first
 * (`/_mobile/de/articles/x`), as the site serves it; `edition` is a path the resolver listed
 * (editions.ts), and anything that isn't one segment is left out rather than put in the address.
 */
export function viewPath(request: ViewRequest, edition = ''): string {
  const base = edition && EDITION_PATH.test(edition) ? `${MOBILE_BASE}/${edition}` : MOBILE_BASE;
  switch (request.view) {
    case 'article':
      return request.slug ? `${base}/articles/${request.slug}` : base;
    case 'category':
      return request.slug ? `${base}/collections/${request.slug}` : base;
    case 'search':
      return request.q ? `${base}?q=${encodeURIComponent(request.q)}` : base;
    case 'contact':
      return `${base}/contact`;
    default:
      return base;
  }
}

/** Whether a URL is on `origin` (a canonical one, from parseOrigin), by exact prefix. */
export function isOnOrigin(url: string, origin: string): boolean {
  if (!url.startsWith(origin)) return false;
  const next = url.charAt(origin.length);
  return next === '' || next === '/' || next === '?' || next === '#';
}

/**
 * Whether a URL is one of the help center's app pages: on `origin`, and exactly `/_mobile` or under
 * `/_mobile/`, in exact case, as the site serves them. A path with a backslash, a dot segment or a
 * percent-escaped dot, slash or backslash is none of them: the pages never make one.
 */
export function isMobileUrl(url: string, origin: string): boolean {
  if (!isOnOrigin(url, origin)) return false;
  const rest = url.slice(origin.length);
  if (!rest.startsWith(MOBILE_BASE)) return false;
  const next = rest.charAt(MOBILE_BASE.length);
  if (next !== '' && next !== '/' && next !== '?' && next !== '#') return false;
  const path = rest.split(/[?#]/, 1)[0]!;
  if (/\\|%2e|%2f|%5c/i.test(path)) return false;
  return !/(^|\/)\.{1,2}(\/|$)/.test(path);
}

/** A URL's scheme, lowercase, or null when it has none. */
export function schemeOf(url: string): string | null {
  const match = /^([A-Za-z][A-Za-z0-9+.-]*):/.exec(url);
  return match ? match[1]!.toLowerCase() : null;
}
