import { NEUTRAL } from '../theme';
import { readAnswer, resolveSite, resolverUrl, RESOLVE_TIMEOUT_MS } from '../resolve';

const HOST = 'https://app.example.com';
const APP_ID = 'k3Jd9QwLx0VbN2pRt7yZ_a';

const YES = {
  v: 1,
  show: true,
  siteUrl: 'https://acme.helpkit.app',
  name: 'Acme Help',
  lang: 'en',
  dir: 'ltr',
  theme: 'auto',
  style: 'branded',
  header: { light: { bg: '#0F766E', fg: '#FFFFFF' }, dark: { bg: '#0C5D57', fg: '#FFFFFF' } },
  background: { light: '#FFFFFF', dark: '#0C0A09' },
};

function answering(status: number, body: unknown) {
  return jest.fn(async () => ({
    status,
    text: async () => (typeof body === 'string' ? body : JSON.stringify(body)),
  })) as unknown as jest.Mock & typeof fetch;
}

describe('the question', () => {
  test('GET <host>/api/mobile-apps/<App ID>, with no cookies', async () => {
    const fetchImpl = answering(200, YES);
    await resolveSite({ host: `${HOST}/`, projectId: APP_ID, dev: false, fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(1);
    const [url, init] = fetchImpl.mock.calls[0] as [string, RequestInit];
    expect(url).toBe(`${HOST}/api/mobile-apps/${APP_ID}`);
    expect(init).toMatchObject({ method: 'GET', credentials: 'omit', headers: { Accept: 'application/json' } });
    expect(init.signal).toBeDefined();
  });

  test('nothing is asked without a usable projectId or host', async () => {
    const fetchImpl = answering(200, YES);
    await expect(resolveSite({ host: HOST, projectId: 'acme', dev: false, fetchImpl })).resolves.toEqual({
      kind: 'unavailable',
      reason: 'projectId',
    });
    await expect(resolveSite({ host: undefined, projectId: APP_ID, dev: false, fetchImpl })).resolves.toEqual({
      kind: 'unavailable',
      reason: 'host',
    });
    await expect(resolveSite({ host: 'http://app.example.com', projectId: APP_ID, dev: true, fetchImpl })).resolves.toEqual({
      kind: 'unavailable',
      reason: 'host',
    });
    await expect(resolveSite({ host: 'http://localhost:3212', projectId: APP_ID, dev: false, fetchImpl })).resolves.toEqual({
      kind: 'unavailable',
      reason: 'host',
    });
    expect(fetchImpl).not.toHaveBeenCalled();
  });

  test('a local http host is fine in development', () => {
    expect(resolverUrl('http://localhost:3212', APP_ID, true)).toBe(`http://localhost:3212/api/mobile-apps/${APP_ID}`);
  });

  test('every open asks again: nothing is kept, yes or no', async () => {
    const fetchImpl = answering(200, YES);
    await resolveSite({ host: HOST, projectId: APP_ID, dev: false, fetchImpl });
    await resolveSite({ host: HOST, projectId: APP_ID, dev: false, fetchImpl });
    expect(fetchImpl).toHaveBeenCalledTimes(2);
  });
});

describe('the answers', () => {
  test('yes: the site, checked', async () => {
    const result = await resolveSite({ host: HOST, projectId: APP_ID, dev: false, fetchImpl: answering(200, YES) });
    expect(result).toEqual({
      kind: 'ok',
      site: {
        origin: 'https://acme.helpkit.app',
        name: 'Acme Help',
        theme: 'auto',
        style: 'branded',
        header: YES.header,
        background: YES.background,
      },
    });
  });

  test('unknown and off are "not available"', () => {
    expect(readAnswer(200, { v: 1, show: false, reason: 'unknown' }, false)).toEqual({ kind: 'unavailable', reason: 'unknown' });
    expect(readAnswer(200, { v: 1, show: false, reason: 'off' }, false)).toEqual({ kind: 'unavailable', reason: 'off' });
    expect(readAnswer(200, { v: 1, show: false, reason: 'something-new' }, false)).toEqual({ kind: 'unavailable', reason: 'off' });
  });

  test('a 503, or "unavailable", is an error worth trying again', async () => {
    const result = await resolveSite({
      host: HOST,
      projectId: APP_ID,
      dev: false,
      fetchImpl: answering(503, { v: 1, show: false, reason: 'unavailable' }),
    });
    expect(result).toMatchObject({ kind: 'error', error: 'server' });
    expect(readAnswer(200, { v: 1, show: false, reason: 'unavailable' }, false)).toMatchObject({ kind: 'error' });
    expect(readAnswer(500, YES, false)).toMatchObject({ kind: 'error', error: 'server' });
    expect(readAnswer(404, YES, false)).toMatchObject({ kind: 'error', error: 'server' });
  });

  test('an answer this version can’t read is an error', async () => {
    const notJson = await resolveSite({ host: HOST, projectId: APP_ID, dev: false, fetchImpl: answering(200, '<html>') });
    expect(notJson).toMatchObject({ kind: 'error', error: 'server' });
    for (const body of [
      null,
      [],
      'yes',
      { ...YES, v: 2 },
      { ...YES, v: '1' },
      { v: 1 },
      { ...YES, show: 'true' },
      { ...YES, siteUrl: undefined },
      { ...YES, siteUrl: 'http://acme.helpkit.app' },
      { ...YES, siteUrl: 'https://acme.helpkit.app@evil.com' },
      { ...YES, siteUrl: 'javascript:alert(1)' },
    ]) {
      expect(readAnswer(200, body, false)).toMatchObject({ kind: 'error', error: 'server' });
    }
  });

  test('siteUrl is reduced to its origin; http only for a local address in development', () => {
    expect(readAnswer(200, { ...YES, siteUrl: 'https://ACME.helpkit.app:443/somewhere?x' }, false)).toMatchObject({
      site: { origin: 'https://acme.helpkit.app' },
    });
    expect(readAnswer(200, { ...YES, siteUrl: 'http://acme.localhost:3212' }, true)).toMatchObject({
      site: { origin: 'http://acme.localhost:3212' },
    });
    expect(readAnswer(200, { ...YES, siteUrl: 'http://acme.localhost:3212' }, false)).toMatchObject({ kind: 'error' });
  });

  test('how it looks falls back, piece by piece, to the page’s own colours', () => {
    const result = readAnswer(
      200,
      {
        ...YES,
        name: `  ${'N'.repeat(300)}  `,
        theme: 'sepia',
        style: 'loud',
        header: { light: { bg: 'teal', fg: '#FFFFFF' }, dark: { bg: '#0C5D57', fg: 'x' } },
        background: { light: '#fff', dark: 3 },
      },
      false,
    );
    expect(result).toEqual({
      kind: 'ok',
      site: {
        origin: 'https://acme.helpkit.app',
        name: 'N'.repeat(200),
        theme: 'auto',
        style: 'branded',
        header: { light: NEUTRAL.light, dark: { bg: '#0C5D57', fg: '#FFFFFF' } },
        background: { light: NEUTRAL.light.bg, dark: NEUTRAL.dark.bg },
      },
    });
    expect(readAnswer(200, { ...YES, name: '', header: undefined, background: null }, false)).toMatchObject({
      site: { name: null, header: NEUTRAL, background: { light: '#FFFFFF', dark: '#0C0A09' } },
    });
    expect(readAnswer(200, { ...YES, style: 'minimal', theme: 'dark' }, false)).toMatchObject({ site: { style: 'minimal', theme: 'dark' } });
  });
});

describe('failures', () => {
  test('no network', async () => {
    const fetchImpl = jest.fn(async () => {
      throw new TypeError('Network request failed');
    }) as unknown as typeof fetch;
    await expect(resolveSite({ host: HOST, projectId: APP_ID, dev: false, fetchImpl })).resolves.toEqual({
      kind: 'error',
      error: 'network',
    });
  });

  test('a question stopped from outside (the sheet closed) ends', async () => {
    const outside = new AbortController();
    const fetchImpl = jest.fn(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    ) as unknown as typeof fetch;
    const pending = resolveSite({ host: HOST, projectId: APP_ID, dev: false, fetchImpl, signal: outside.signal });
    outside.abort();
    await expect(pending).resolves.toEqual({ kind: 'error', error: 'network' });
  });

  test('ten seconds without an answer is a timeout', async () => {
    jest.useFakeTimers();
    try {
      const fetchImpl = jest.fn(
        (_url: string, init: RequestInit) =>
          new Promise((_resolve, reject) => {
            init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
          }),
      ) as unknown as typeof fetch;
      const pending = resolveSite({ host: HOST, projectId: APP_ID, dev: false, fetchImpl });
      jest.advanceTimersByTime(RESOLVE_TIMEOUT_MS - 1);
      await Promise.resolve();
      jest.advanceTimersByTime(1);
      await expect(pending).resolves.toEqual({ kind: 'error', error: 'timeout' });
    } finally {
      jest.useRealTimers();
    }
  });
});
