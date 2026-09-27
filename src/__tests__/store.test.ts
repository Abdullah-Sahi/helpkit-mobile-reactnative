import { forgetWarnings } from '../log';
import { HelpKitSDK } from '../sdk';
import { cleanContactFields, QUEUED_FOR_MS, store, type Host, type OpenRequest } from '../store';

function fakeHost(): Host & { opened: OpenRequest[]; closed: number; fields: number; signOuts: number } {
  const host = {
    opened: [] as OpenRequest[],
    closed: 0,
    fields: 0,
    signOuts: 0,
    open(request: OpenRequest) {
      host.opened.push(request);
    },
    close() {
      host.closed += 1;
    },
    isOpen: () => host.opened.length > host.closed,
    fieldsChanged() {
      host.fields += 1;
    },
    signOutRequested() {
      host.signOuts += 1;
    },
  };
  return host;
}

let warn: jest.SpyInstance;

beforeEach(() => {
  store.reset();
  forgetWarnings();
  warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  warn.mockRestore();
  jest.useRealTimers();
});

describe('calls before <HelpKit> mounts', () => {
  test('are kept, the last one wins, and it opens on mount, with one warning', () => {
    HelpKitSDK.open();
    HelpKitSDK.openArticle('reset-your-password', { headerTitle: 'Help' });
    expect(warn).toHaveBeenCalledTimes(1);
    const host = fakeHost();
    store.register(host);
    expect(host.opened).toEqual([{ view: 'article', slug: 'reset-your-password', options: { headerTitle: 'Help' } }]);
  });

  test('are forgotten after 5 seconds', () => {
    jest.useFakeTimers();
    HelpKitSDK.openContact();
    jest.advanceTimersByTime(QUEUED_FOR_MS + 1);
    const host = fakeHost();
    store.register(host);
    expect(host.opened).toEqual([]);
  });

  test('close cancels a kept call', () => {
    HelpKitSDK.open();
    HelpKitSDK.close();
    const host = fakeHost();
    store.register(host);
    expect(host.opened).toEqual([]);
  });

  test('isOpen is false with nothing mounted', () => {
    expect(HelpKitSDK.isOpen()).toBe(false);
  });
});

describe('more than one <HelpKit>', () => {
  test('warns; the last mounted receives calls, and hands back when it unmounts', () => {
    const first = fakeHost();
    const second = fakeHost();
    store.register(first);
    const unmountSecond = store.register(second);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('More than one <HelpKit>'));
    HelpKitSDK.open();
    expect(second.opened).toHaveLength(1);
    expect(first.opened).toHaveLength(0);
    unmountSecond();
    HelpKitSDK.openContact();
    expect(first.opened).toEqual([{ view: 'contact', options: {} }]);
  });
});

describe('the calls', () => {
  let host: ReturnType<typeof fakeHost>;
  beforeEach(() => {
    host = fakeHost();
    store.register(host);
  });

  test('each view', () => {
    HelpKitSDK.open();
    HelpKitSDK.openArticle('a-1');
    HelpKitSDK.openCategory('billing');
    HelpKitSDK.openSearch('  refund policy  ');
    HelpKitSDK.openContact({ headerTitle: () => 'Contact', version: 'de' });
    expect(host.opened.map(({ view, slug, q }) => ({ view, slug, q }))).toEqual([
      { view: 'home', slug: undefined, q: undefined },
      { view: 'article', slug: 'a-1', q: undefined },
      { view: 'category', slug: 'billing', q: undefined },
      { view: 'search', slug: undefined, q: 'refund policy' },
      { view: 'contact', slug: undefined, q: undefined },
    ]);
    expect(host.opened[4]?.options.version).toBe('de');
    expect(typeof host.opened[4]?.options.headerTitle).toBe('function');
  });

  test('a bad slug or query opens the front page, with a warning', () => {
    HelpKitSDK.openArticle('../../admin');
    HelpKitSDK.openCategory('Billing');
    HelpKitSDK.openSearch('   ');
    expect(host.opened.map((request) => request.view)).toEqual(['home', 'home', 'home']);
    expect(warn).toHaveBeenCalledTimes(3);
  });

  test('options: only a string or function title, and a string version', () => {
    HelpKitSDK.open({ headerTitle: 7, version: {}, extra: 1 } as never);
    expect(host.opened[0]?.options).toEqual({});
  });

  test('close and isOpen reach the mounted sheet', () => {
    HelpKitSDK.open();
    expect(HelpKitSDK.isOpen()).toBe(true);
    HelpKitSDK.close();
    expect(host.closed).toBe(1);
    expect(HelpKitSDK.isOpen()).toBe(false);
  });

  test('setVersion is kept and does nothing else', () => {
    HelpKitSDK.setVersion(' de ');
    expect(store.version).toBe('de');
    HelpKitSDK.setVersion('');
    expect(store.version).toBeNull();
    expect(host.opened).toEqual([]);
  });

  test('setContactFields tells the sheet; signOut forgets the fields and holds a sign-out', () => {
    HelpKitSDK.setContactFields({ name: 'Ada', email: 'ada@example.com' });
    expect(store.fields).toEqual({ name: 'Ada', email: 'ada@example.com' });
    expect(host.fields).toBe(1);
    HelpKitSDK.signOut();
    expect(store.fields).toBeNull();
    expect(host.signOuts).toBe(1);
    expect(store.takeSignOut()).toBe(true);
    expect(store.takeSignOut()).toBe(false);
  });

  test('setContactFields(null) and {} clear them', () => {
    HelpKitSDK.setContactFields({ name: 'Ada' });
    HelpKitSDK.setContactFields(null);
    expect(store.fields).toBeNull();
    HelpKitSDK.setContactFields({ name: 'Ada' });
    HelpKitSDK.setContactFields({});
    expect(store.fields).toBeNull();
  });

  test('something that isn’t an object is ignored, with a warning', () => {
    HelpKitSDK.setContactFields({ name: 'Ada' });
    HelpKitSDK.setContactFields('Ada' as never);
    expect(store.fields).toEqual({ name: 'Ada' });
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe('checking contact fields', () => {
  test('the four keys only, each a string', () => {
    expect(cleanContactFields({ name: 'Ada', email: 'a@b.c', subject: 'Hi', metadata: 'v=1', phone: '555', userId: 7 })).toEqual({
      name: 'Ada',
      email: 'a@b.c',
      subject: 'Hi',
      metadata: 'v=1',
    });
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('dropped phone, userId'));
    expect(cleanContactFields({ name: 42, email: ['a'], subject: { s: 1 } })).toBeNull();
  });

  test('a plain object of metadata is sent as JSON; anything else is dropped', () => {
    expect(cleanContactFields({ metadata: { appVersion: '2.4.1', platform: 'ios' } })).toEqual({
      metadata: '{"appVersion":"2.4.1","platform":"ios"}',
    });
    expect(cleanContactFields({ metadata: ['a'] })).toBeNull();
    expect(cleanContactFields({ metadata: new Date(0) })).toBeNull();
    const circular: Record<string, unknown> = {};
    circular.self = circular;
    expect(cleanContactFields({ metadata: circular, name: 'Ada' })).toEqual({ name: 'Ada' });
    expect(cleanContactFields({ metadata: { big: 10n } })).toBeNull();
  });

  test('the API’s limits: name 100, email 254, subject 150, metadata 2,000; longer is dropped', () => {
    const at = { name: 'n'.repeat(100), email: 'e'.repeat(254), subject: 's'.repeat(150), metadata: 'm'.repeat(2000) };
    expect(cleanContactFields(at)).toEqual(at);
    const over = { name: 'n'.repeat(101), email: 'e'.repeat(255), subject: 's'.repeat(151), metadata: 'm'.repeat(2001) };
    expect(cleanContactFields(over)).toBeNull();
    expect(warn).toHaveBeenCalledTimes(4);
  });

  test('a blank field offers nothing', () => {
    expect(cleanContactFields({ name: '   ', email: 'a@b.c', subject: null, metadata: undefined })).toEqual({ email: 'a@b.c' });
  });

  test('no warning ever shows a value', () => {
    const secret = 'zz-secret-value-zz';
    cleanContactFields({ name: secret.repeat(20), email: secret.repeat(20), subject: secret.repeat(20), metadata: secret.repeat(200) });
    cleanContactFields({ name: 7, metadata: [secret] });
    expect(warn.mock.calls.length).toBeGreaterThanOrEqual(5);
    for (const call of warn.mock.calls) {
      expect(call.join(' ')).not.toContain('secret-value');
    }
  });
});
