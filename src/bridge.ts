/**
 * The app's side of protocol 1 with the help center's `/_mobile` pages. The contract, and its one
 * written copy, is the web app's `docs/mobile.md` ("The protocol"); `docs/protocol.md` here links to
 * it, and the tests in `__tests__/bridge.test.ts` are the executable copy on this side.
 *
 * **Page to app**: `window.ReactNativeWebView.postMessage(JSON.stringify({ helpkit: 1, type, … }))`
 * with `type` one of `ready`, `state` (`up: boolean`) and `close`. On Android every frame of the
 * page can post these, so each is a hint: the worst a forged one can do is close the sheet or show
 * a Back that does nothing.
 *
 * **App to page**: a fixed script, run with `injectJavaScript`, that dispatches a `helpkit:app`
 * event on the page's `window` — never `postMessage`, which any frame could imitate. No value is
 * ever put into the script as text: the message is JSON-encoded twice, so it reaches the page as one
 * string literal that the page parses.
 */

/** The protocol's version, on both sides. */
export const PROTOCOL = 1;

/** The longest page message believed. The real ones are a few dozen characters. */
export const MAX_PAGE_MESSAGE = 1024;

/** The longest each contact field may be: the API's own limits, which the page checks again. */
export const FIELD_LIMITS = { name: 100, email: 254, subject: 150, metadata: 2000 } as const;

export type ContactField = keyof typeof FIELD_LIMITS;

/** What the app offers for the contact form. Only what it offers is here. */
export type Prefill = Partial<Record<ContactField, string>>;

/** From the page. */
export type PageMessage = { type: 'ready' } | { type: 'state'; up: boolean } | { type: 'close' };

/** To the page. */
export type AppMessage = { type: 'up' } | { type: 'signOut' } | { type: 'prefill'; fields: Prefill };

/**
 * A message from the page, or null for anything this version doesn't understand: not a string,
 * longer than any real one, not JSON, another protocol version, or an unknown type. Unknown keys
 * are dropped.
 */
export function readPageMessage(data: unknown): PageMessage | null {
  if (typeof data !== 'string' || data.length > MAX_PAGE_MESSAGE) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(data);
  } catch {
    return null;
  }
  if (typeof parsed !== 'object' || parsed === null || Array.isArray(parsed)) return null;
  const message = parsed as Record<string, unknown>;
  if (message.helpkit !== PROTOCOL) return null;
  switch (message.type) {
    case 'ready':
      return { type: 'ready' };
    case 'close':
      return { type: 'close' };
    case 'state':
      return typeof message.up === 'boolean' ? { type: 'state', up: message.up } : null;
    default:
      return null;
  }
}

/** What the page's `helpkit:app` event carries as its `detail`. */
export function appPayload(message: AppMessage): Record<string, unknown> {
  if (message.type !== 'prefill') return { helpkit: PROTOCOL, type: message.type };
  // A field left out is a field not offered, which is how the app takes one back.
  return { helpkit: PROTOCOL, type: 'prefill', ...message.fields };
}

/**
 * U+2028 and U+2029 are line terminators in older JavaScript engines, even inside a string
 * literal, and JSON.stringify leaves them as they are.
 */
const LINE_SEPARATOR = String.fromCharCode(0x2028);
const PARAGRAPH_SEPARATOR = String.fromCharCode(0x2029);

function scriptSafe(json: string): string {
  return json.split(LINE_SEPARATOR).join('\\u2028').split(PARAGRAPH_SEPARATOR).join('\\u2029');
}

/**
 * The script `injectJavaScript` runs for a message: always this template, and nothing else.
 *
 * The page checks again, where the browser parsed them, that it is on the site's origin, under
 * `/_mobile`, and inside the app (`window.ReactNativeWebView`); otherwise nothing happens. The
 * trailing `true;` is what react-native-webview asks an injected script to end with.
 */
export function injectionScript(origin: string, message: AppMessage): string {
  const ORIGIN = scriptSafe(JSON.stringify(origin));
  const PAYLOAD = scriptSafe(JSON.stringify(JSON.stringify(appPayload(message))));
  return [
    '(function () {',
    `  if (location.origin !== ${ORIGIN} || !window.ReactNativeWebView) return;`,
    '  if (location.pathname !== "/_mobile" && location.pathname.indexOf("/_mobile/") !== 0) return;',
    `  window.dispatchEvent(new CustomEvent("helpkit:app", { detail: JSON.parse(${PAYLOAD}) }));`,
    '})();',
    'true;',
  ].join('\n');
}
