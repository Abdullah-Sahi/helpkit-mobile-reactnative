import { NEUTRAL, colorPair, isHexColor, type Colors, type SiteTheme, type ThemePair } from './theme';
import { APP_ID, allowedOrigin } from './url';

/**
 * The SDK's first question, asked each time the sheet opens: which help center does this App ID
 * name, where are its app pages, and how should the sheet around them look?
 *
 *     GET {host}/api/mobile-apps/{projectId}      no cookies, JSON, 10-second limit
 *     200 { v: 1, show: true, siteUrl, name, lang, dir, theme, style, header, background }
 *     200 { v: 1, show: false, reason: "unknown" | "off" }
 *     503 { v: 1, show: false, reason: "unavailable" }
 *
 * **Nothing is kept**, yes or no: one small read per open is cheap next to the page it opens, and
 * an owner switching the app off, or renaming the site, reaches the very next open.
 *
 * Only `unknown` and `off` mean "not available". A 503, a timeout, no network, or an answer this
 * version can't read is an error, which the reader can try again.
 */

export const RESOLVE_TIMEOUT_MS = 10_000;

const MAX_NAME = 200;

export interface Site {
  /** The site's HelpKit subdomain, canonical: the only origin the sheet shows, injects into or believes. */
  origin: string;
  /** The help center's name, for the title; null when the answer had none. */
  name: string | null;
  theme: SiteTheme;
  style: 'branded' | 'minimal';
  header: ThemePair<Colors>;
  background: ThemePair<string>;
}

export type Resolution =
  | { kind: 'ok'; site: Site }
  /**
   * Nothing to show, and trying again won't change that: `unknown` (no help center has this App
   * ID), `off` (its app mode is off, or not on its plan), or the app's own `projectId` or `host`
   * isn't one (nothing is asked).
   */
  | { kind: 'unavailable'; reason: 'unknown' | 'off' | 'projectId' | 'host' }
  /** Worth trying again: `network` (no answer), `timeout`, or `server` (a 5xx, or an answer this version can't read). */
  | { kind: 'error'; error: 'network' | 'timeout' | 'server'; detail?: string };

export interface ResolveOptions {
  host: unknown;
  projectId: unknown;
  /** A development build: allows http for a local address. */
  dev: boolean;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** Aborts the question, as when the sheet closes before the answer. */
  signal?: AbortSignal;
}

/** The resolver's address for an App ID, or the reason there can't be one. */
export function resolverUrl(host: unknown, projectId: unknown, dev: boolean): string | 'host' | 'projectId' {
  if (typeof projectId !== 'string' || !APP_ID.test(projectId)) return 'projectId';
  const origin = allowedOrigin(host, dev);
  if (!origin) return 'host';
  return `${origin.origin}/api/mobile-apps/${projectId}`;
}

export async function resolveSite(options: ResolveOptions): Promise<Resolution> {
  const url = resolverUrl(options.host, options.projectId, options.dev);
  if (url === 'host' || url === 'projectId') return { kind: 'unavailable', reason: url };

  const fetchImpl = options.fetchImpl ?? fetch;
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => {
    timedOut = true;
    controller.abort();
  }, options.timeoutMs ?? RESOLVE_TIMEOUT_MS);
  const giveUp = () => controller.abort();
  if (options.signal?.aborted) giveUp();
  options.signal?.addEventListener('abort', giveUp);

  let status: number;
  let text: string;
  try {
    // No cookies, no session: the App ID and nothing else.
    const response = await fetchImpl(url, {
      method: 'GET',
      credentials: 'omit',
      headers: { Accept: 'application/json' },
      signal: controller.signal,
    });
    status = response.status;
    text = await response.text();
  } catch {
    return { kind: 'error', error: timedOut ? 'timeout' : 'network' };
  } finally {
    clearTimeout(timer);
    options.signal?.removeEventListener('abort', giveUp);
  }

  let body: unknown;
  try {
    body = JSON.parse(text);
  } catch {
    return { kind: 'error', error: 'server', detail: `status ${status}, not JSON` };
  }
  return readAnswer(status, body, options.dev);
}

/** The resolver's answer, checked. */
export function readAnswer(status: number, body: unknown, dev: boolean): Resolution {
  if (status !== 200) return { kind: 'error', error: 'server', detail: `status ${status}` };
  if (typeof body !== 'object' || body === null || Array.isArray(body)) {
    return { kind: 'error', error: 'server', detail: 'not an object' };
  }
  const answer = body as Record<string, unknown>;
  if (answer.v !== 1) {
    return { kind: 'error', error: 'server', detail: `answer version ${String(answer.v)}; this SDK reads version 1` };
  }

  if (answer.show === false) {
    if (answer.reason === 'unknown') return { kind: 'unavailable', reason: 'unknown' };
    if (answer.reason === 'unavailable') return { kind: 'error', error: 'server', detail: 'unavailable' };
    // "off", or a reason a later server adds: it said not to show, and asking again won't change that.
    return { kind: 'unavailable', reason: 'off' };
  }
  if (answer.show !== true) return { kind: 'error', error: 'server', detail: 'no show' };

  const origin = allowedOrigin(answer.siteUrl, dev);
  if (!origin) return { kind: 'error', error: 'server', detail: 'siteUrl is not an address this SDK loads' };

  const header = (typeof answer.header === 'object' && answer.header !== null ? answer.header : {}) as Record<string, unknown>;
  const background = (typeof answer.background === 'object' && answer.background !== null ? answer.background : {}) as Record<
    string,
    unknown
  >;
  const name = typeof answer.name === 'string' && answer.name.trim() ? answer.name.trim().slice(0, MAX_NAME) : null;

  // How it looks is checked and, where it doesn't check out, falls back to the page's own
  // colours: a colour the SDK can't read is no reason to keep the help center from a reader.
  return {
    kind: 'ok',
    site: {
      origin: origin.origin,
      name,
      theme: answer.theme === 'light' || answer.theme === 'dark' ? answer.theme : 'auto',
      style: answer.style === 'minimal' ? 'minimal' : 'branded',
      header: { light: colorPair(header.light, NEUTRAL.light), dark: colorPair(header.dark, NEUTRAL.dark) },
      background: {
        light: isHexColor(background.light) ? background.light.toUpperCase() : NEUTRAL.light.bg,
        dark: isHexColor(background.dark) ? background.dark.toUpperCase() : NEUTRAL.dark.bg,
      },
    },
  };
}
