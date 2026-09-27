import vm from 'node:vm';
import { appPayload, injectionScript, MAX_PAGE_MESSAGE, readPageMessage, type AppMessage } from '../bridge';

const SITE = 'https://acme.helpkit.app';

const LS = String.fromCharCode(0x2028);
const PS = String.fromCharCode(0x2029);

interface Page {
  origin?: string;
  pathname?: string;
  bridge?: boolean;
}

/**
 * Runs an injected script the way a page would: in a fresh JavaScript context with a `window`,
 * a `location` and `CustomEvent`, and records every event it dispatches.
 */
function runInPage(script: string, page: Page = {}) {
  const events: { type: string; detail: unknown }[] = [];
  class FakeCustomEvent {
    type: string;
    detail: unknown;
    constructor(type: string, init?: { detail?: unknown }) {
      this.type = type;
      this.detail = init?.detail;
    }
  }
  const window = {
    dispatchEvent(event: FakeCustomEvent) {
      // Round-tripped so the detail compares as a plain object of this realm.
      events.push({ type: event.type, detail: JSON.parse(JSON.stringify(event.detail)) });
      return true;
    },
    ReactNativeWebView: page.bridge === false ? undefined : { postMessage() {} },
  };
  const context = vm.createContext({
    window,
    location: { origin: page.origin ?? SITE, pathname: page.pathname ?? '/_mobile/contact' },
    CustomEvent: FakeCustomEvent,
  });
  const result: unknown = vm.runInContext(script, context);
  return { events, result, context };
}

describe('messages from the page', () => {
  test('the three types, and nothing else', () => {
    expect(readPageMessage('{"helpkit":1,"type":"ready"}')).toEqual({ type: 'ready' });
    expect(readPageMessage('{"helpkit":1,"type":"close"}')).toEqual({ type: 'close' });
    expect(readPageMessage('{"helpkit":1,"type":"state","up":true}')).toEqual({ type: 'state', up: true });
    expect(readPageMessage('{"helpkit":1,"type":"state","up":false,"extra":"x"}')).toEqual({ type: 'state', up: false });
  });

  test('anything unknown, malformed or oversized is ignored', () => {
    for (const bad of [
      '{"helpkit":2,"type":"ready"}',
      '{"type":"ready"}',
      '{"helpkit":"1","type":"ready"}',
      '{"helpkit":1,"type":"navigate","to":"https://evil.com"}',
      '{"helpkit":1,"type":"state"}',
      '{"helpkit":1,"type":"state","up":"yes"}',
      '{"helpkit":1}',
      '[1]',
      'null',
      '"ready"',
      'not json',
      '',
      `{"helpkit":1,"type":"ready","pad":"${'x'.repeat(MAX_PAGE_MESSAGE)}"}`,
      42,
      null,
      { helpkit: 1, type: 'ready' },
    ]) {
      expect(readPageMessage(bad)).toBeNull();
    }
  });
});

describe('the injected script', () => {
  test('dispatches exactly the message, as helpkit:app on window', () => {
    const { events, result } = runInPage(injectionScript(SITE, { type: 'up' }));
    expect(events).toEqual([{ type: 'helpkit:app', detail: { helpkit: 1, type: 'up' } }]);
    expect(result).toBe(true);
  });

  test('sign-out', () => {
    const { events } = runInPage(injectionScript(SITE, { type: 'signOut' }));
    expect(events).toEqual([{ type: 'helpkit:app', detail: { helpkit: 1, type: 'signOut' } }]);
  });

  test('hostile values arrive exactly as they were sent, and run nothing', () => {
    const fields = {
      name: `Zoë "Zed" O'Brien \\ </script><script>globalThis.hacked=1</script>`,
      email: `a${LS}b${PS}c@example.com`,
      subject: `"); globalThis.hacked = 2; ("' + ' \u0000 😀 👩‍👩‍👧 ${'`'}${'$'}{globalThis.hacked=3}${'`'}`,
      metadata: JSON.stringify({ app: '2.4.1', note: `\\"${LS}${PS}</script>`, pad: 'q"\\'.repeat(600) }).slice(0, 2000),
    };
    expect(fields.metadata.length).toBe(2000);
    const script = injectionScript(SITE, { type: 'prefill', fields });
    // Neither separator appears raw in the script text.
    expect(script.includes(LS) || script.includes(PS)).toBe(false);

    const { events, context } = runInPage(script);
    expect(events).toEqual([{ type: 'helpkit:app', detail: { helpkit: 1, type: 'prefill', ...fields } }]);
    expect((context as { hacked?: unknown }).hacked).toBeUndefined();
  });

  test('a field left out is not offered; an empty offer takes everything back', () => {
    expect(appPayload({ type: 'prefill', fields: { email: 'a@b.c' } })).toEqual({ helpkit: 1, type: 'prefill', email: 'a@b.c' });
    const { events } = runInPage(injectionScript(SITE, { type: 'prefill', fields: {} }));
    expect(events).toEqual([{ type: 'helpkit:app', detail: { helpkit: 1, type: 'prefill' } }]);
  });

  const up: AppMessage = { type: 'up' };

  test('nothing happens on another origin', () => {
    expect(runInPage(injectionScript(SITE, up), { origin: 'https://evil.com' }).events).toEqual([]);
    expect(runInPage(injectionScript(SITE, up), { origin: `${SITE}.evil.com` }).events).toEqual([]);
    expect(runInPage(injectionScript(SITE, up), { origin: 'http://acme.helpkit.app' }).events).toEqual([]);
  });

  test('nothing happens outside /_mobile', () => {
    for (const pathname of ['/', '/articles/x', '/_mobilex', '/_MOBILE', '/contact']) {
      expect(runInPage(injectionScript(SITE, up), { pathname }).events).toEqual([]);
    }
    expect(runInPage(injectionScript(SITE, up), { pathname: '/_mobile' }).events).toHaveLength(1);
  });

  test('nothing happens without the app’s bridge object', () => {
    expect(runInPage(injectionScript(SITE, up), { bridge: false }).events).toEqual([]);
  });

  test('the template is the documented one', () => {
    expect(injectionScript(SITE, up)).toBe(
      [
        '(function () {',
        '  if (location.origin !== "https://acme.helpkit.app" || !window.ReactNativeWebView) return;',
        '  if (location.pathname !== "/_mobile" && location.pathname.indexOf("/_mobile/") !== 0) return;',
        '  window.dispatchEvent(new CustomEvent("helpkit:app", { detail: JSON.parse("{\\"helpkit\\":1,\\"type\\":\\"up\\"}") }));',
        '})();',
        'true;',
      ].join('\n'),
    );
  });
});
