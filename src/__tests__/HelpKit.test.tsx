import { act, render, screen, fireEvent } from '@testing-library/react-native';
import { AccessibilityInfo, BackHandler, Keyboard, Linking, Platform, StatusBar, useColorScheme } from 'react-native';
import { injectionScript } from '../bridge';
import { HelpKit } from '../HelpKit';
import { forgetWarnings } from '../log';
import { HelpKitSDK } from '../sdk';
import { CRASH_WINDOW_MS, HTTP_GRACE_MS, LOAD_TIMEOUT_MS, UP_ANSWER_MS } from '../sheet';
import { store } from '../store';
import type { HelpKitConfig } from '../types';
import { forgetWebViews, lastWebView, webViews, type MockWebViewInstance } from './support/webview';

const HOST = 'https://app.example.com';
const APP_ID = 'k3Jd9QwLx0VbN2pRt7yZ_a';
const SITE = 'https://acme.helpkit.app';

const YES = {
  v: 1,
  show: true,
  siteUrl: SITE,
  name: 'Acme Help',
  lang: 'en',
  dir: 'ltr',
  theme: 'auto',
  style: 'branded',
  header: { light: { bg: '#0F766E', fg: '#FFFFFF' }, dark: { bg: '#0C5D57', fg: '#FFFFFF' } },
  background: { light: '#FFFFFF', dark: '#0C0A09' },
};

/** What the resolver lists for a site in English and German, with Traditional Chinese and two versions. */
const EDITIONS = [
  { path: '', kind: 'main', language: 'en', label: 'English' },
  { path: 'de', kind: 'language', language: 'de', label: 'Deutsch' },
  { path: 'zh-hant', kind: 'language', language: 'zh-Hant', label: '繁體中文' },
  { path: 'v1', kind: 'version', language: 'en', label: 'v1' },
  { path: 'v2', kind: 'version', language: 'en', label: 'v2' },
];

type Reply = { status: number; body: unknown };

let replies: Reply[];
let fetchMock: jest.Mock;
let openURL: jest.SpyInstance;
let warn: jest.SpyInstance;
const realOS = Platform.OS;

function setOS(os: typeof Platform.OS) {
  (Platform as { OS: string }).OS = os;
}

beforeEach(() => {
  store.reset();
  forgetWarnings();
  forgetWebViews();
  replies = [];
  fetchMock = jest.fn(async () => {
    const reply = replies.shift() ?? { status: 200, body: YES };
    return { status: reply.status, text: async () => (typeof reply.body === 'string' ? reply.body : JSON.stringify(reply.body)) };
  });
  global.fetch = fetchMock as unknown as typeof fetch;
  openURL = jest.spyOn(Linking, 'openURL').mockResolvedValue(true);
  warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
  (useColorScheme as jest.Mock).mockReturnValue('light');
  (AccessibilityInfo.isReduceMotionEnabled as jest.Mock).mockResolvedValue(false);
  setOS('ios');
});

afterEach(() => {
  setOS(realOS);
  openURL.mockRestore();
  warn.mockRestore();
  jest.useRealTimers();
});

async function mount(config: Partial<HelpKitConfig> = {}, projectId = APP_ID) {
  await render(<HelpKit projectId={projectId} config={{ host: HOST, ...config }} />);
}

/** Runs a call, lets the resolver answer, and returns the WebView drawn. */
async function openWith(call: () => void = () => HelpKitSDK.open()): Promise<MockWebViewInstance> {
  await act(async () => {
    call();
  });
  await act(async () => undefined);
  return lastWebView();
}

async function fromPage(webView: MockWebViewInstance, message: unknown, url = `${SITE}/_mobile`) {
  await act(async () => {
    webView.props.onMessage({ nativeEvent: { data: typeof message === 'string' ? message : JSON.stringify(message), url } });
  });
}

const ready = (webView: MockWebViewInstance, url?: string) => fromPage(webView, { helpkit: 1, type: 'ready' }, url);
const state = (webView: MockWebViewInstance, up: boolean) => fromPage(webView, { helpkit: 1, type: 'state', up });

function scripts(webView: MockWebViewInstance): string[] {
  return webView.handle.injectJavaScript.mock.calls.map(([script]) => script as string);
}

describe('opening', () => {
  test('nothing is drawn, and nothing asked, until a call', async () => {
    await mount();
    expect(screen.toJSON()).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
  });

  test('open: the resolver, then the WebView at /_mobile on the site’s subdomain', async () => {
    await mount();
    await act(async () => {
      HelpKitSDK.open();
    });
    expect(fetchMock).toHaveBeenCalledWith(`${HOST}/api/mobile-apps/${APP_ID}`, expect.objectContaining({ credentials: 'omit' }));
    await act(async () => undefined);
    expect(lastWebView().props.source).toEqual({ uri: `${SITE}/_mobile` });
    expect(HelpKitSDK.isOpen()).toBe(true);
    expect(screen.getByTestId('helpkit-loading')).toBeOnTheScreen();
  });

  test.each([
    ['openArticle', () => HelpKitSDK.openArticle('reset-your-password'), '/_mobile/articles/reset-your-password'],
    ['openCategory', () => HelpKitSDK.openCategory('billing'), '/_mobile/collections/billing'],
    ['openSearch', () => HelpKitSDK.openSearch('refund policy'), '/_mobile?q=refund%20policy'],
    ['openContact', () => HelpKitSDK.openContact(), '/_mobile/contact'],
  ])('%s', async (_name, call, path) => {
    await mount();
    const webView = await openWith(call);
    expect(webView.props.source).toEqual({ uri: `${SITE}${path}` });
  });

  test('a call made just before mounting opens once mounted', async () => {
    HelpKitSDK.openContact();
    await mount();
    await act(async () => undefined);
    expect(lastWebView().props.source).toEqual({ uri: `${SITE}/_mobile/contact` });
  });

  test('the WebView’s settings', async () => {
    await mount();
    const { props } = await openWith();
    expect(props).toMatchObject({
      originWhitelist: ['*'],
      javaScriptEnabled: true,
      domStorageEnabled: true,
      sharedCookiesEnabled: false,
      thirdPartyCookiesEnabled: false,
      allowsBackForwardNavigationGestures: false,
      applicationNameForUserAgent: 'HelpKitRN/0.1.0',
      webviewDebuggingEnabled: true,
    });
    // Never incognito (it would clear the whole app's cookies on Android), no media, nothing else injected.
    for (const absent of [
      'incognito',
      'injectedJavaScript',
      'injectedJavaScriptBeforeContentLoaded',
      'injectedJavaScriptObject',
      'allowsInlineMediaPlayback',
      'allowsFullscreenVideo',
      'setSupportMultipleWindows',
      'textZoom',
      'forceDarkOn',
    ]) {
      expect(props).not.toHaveProperty(absent);
    }
  });

  test('WebView debugging is never on in a release build, whatever config.debug says', async () => {
    const dev = (globalThis as unknown as { __DEV__: boolean }).__DEV__;
    (globalThis as unknown as { __DEV__: boolean }).__DEV__ = false;
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    try {
      await mount({ debug: true });
      const { props } = await openWith();
      expect(props).not.toHaveProperty('webviewDebuggingEnabled');
    } finally {
      (globalThis as unknown as { __DEV__: boolean }).__DEV__ = dev;
      log.mockRestore();
    }
  });

  test('a new open* while open shows that view, in a new WebView', async () => {
    await mount();
    const first = await openWith();
    await ready(first);
    await openWith(() => HelpKitSDK.openArticle('refunds'));
    expect(webViews).toHaveLength(2);
    expect(lastWebView().props.source).toEqual({ uri: `${SITE}/_mobile/articles/refunds` });
    expect(fetchMock).toHaveBeenCalledTimes(1);
  });

  test('closing while the help center is being found stops the question', async () => {
    let signal: AbortSignal | undefined;
    fetchMock.mockImplementationOnce(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => {
          signal = init.signal ?? undefined;
          init.signal?.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );
    await mount();
    await act(async () => HelpKitSDK.open());
    expect(signal?.aborted).toBe(false);
    await act(async () => HelpKitSDK.close());
    expect(signal?.aborted).toBe(true);
    expect(webViews).toHaveLength(0);
  });

  test('every open asks the resolver again', async () => {
    await mount();
    await openWith();
    await act(async () => HelpKitSDK.close());
    await openWith();
    expect(fetchMock).toHaveBeenCalledTimes(2);
  });
});

describe('iOS: a page sheet', () => {
  function modal() {
    const found = screen.container.queryAll((node) => node.type === 'Modal');
    if (!found[0]) throw new Error('no Modal');
    return found[0];
  }

  test('pageSheet, swipe to dismiss, sliding', async () => {
    await mount();
    await openWith();
    expect(modal().props).toMatchObject({ visible: true, presentationStyle: 'pageSheet', allowSwipeDismissal: true, animationType: 'slide' });
  });

  test('reduced motion: no slide', async () => {
    (AccessibilityInfo.isReduceMotionEnabled as jest.Mock).mockResolvedValue(true);
    await mount();
    await act(async () => undefined);
    await openWith();
    expect(modal().props.animationType).toBe('none');
  });

  test('a swipe down closes it', async () => {
    await mount();
    await openWith();
    await act(async () => modal().props.onRequestClose());
    expect(HelpKitSDK.isOpen()).toBe(false);
    expect(screen.container.queryAll((node) => node.type === 'Modal')).toHaveLength(0);
  });
});

describe('the header', () => {
  test('the title, Close always, Back only while the page has somewhere to go', async () => {
    await mount();
    const webView = await openWith();
    expect(screen.getByRole('header', { name: 'Acme Help' })).toBeOnTheScreen();
    const close = screen.getByRole('button', { name: 'Close' });
    expect(close.props.hitSlop).toEqual({ top: 6, bottom: 6, left: 6, right: 6 });
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
    await ready(webView);
    await state(webView, true);
    expect(screen.getByRole('button', { name: 'Back' })).toBeOnTheScreen();
    await state(webView, false);
    expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
  });

  test('the title: this opening’s, else the app’s, else the site’s name', async () => {
    await mount({ headerTitle: () => 'Hilfe' });
    await openWith();
    expect(screen.getByRole('header', { name: 'Hilfe' })).toBeOnTheScreen();
    await act(async () => HelpKitSDK.close());
    await openWith(() => HelpKitSDK.open({ headerTitle: 'Support' }));
    expect(screen.getByRole('header', { name: 'Support' })).toBeOnTheScreen();
  });

  test('"Help" while the site is being found; the app’s own words', async () => {
    // An answer that never comes, until the sheet closes and the question is stopped, as fetch would be.
    fetchMock.mockImplementationOnce(
      (_url: string, init: RequestInit) =>
        new Promise((_resolve, reject) => init.signal?.addEventListener('abort', () => reject(new Error('aborted')))),
    );
    await mount({ strings: { help: 'Aide', close: 'Fermer' } });
    await act(async () => HelpKitSDK.open());
    expect(screen.getByRole('header', { name: 'Aide' })).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Fermer' })).toBeOnTheScreen();
  });

  test('Close closes', async () => {
    await mount();
    await openWith();
    await fireEvent.press(screen.getByRole('button', { name: 'Close' }));
    expect(HelpKitSDK.isOpen()).toBe(false);
  });

  test('screen readers start at the title', async () => {
    jest.useFakeTimers();
    await mount();
    await openWith();
    await act(async () => jest.advanceTimersByTime(500));
    expect(AccessibilityInfo.sendAccessibilityEvent).toHaveBeenCalledWith(expect.anything(), 'focus');
  });
});

describe('the protocol', () => {
  test('ready: contact fields are offered, as the documented script', async () => {
    await mount();
    HelpKitSDK.setContactFields({ name: 'Ada', email: 'ada@example.com', metadata: { appVersion: '2.4.1' } });
    const webView = await openWith(() => HelpKitSDK.openContact());
    expect(scripts(webView)).toEqual([]);
    await ready(webView, `${SITE}/_mobile/contact`);
    expect(scripts(webView)).toEqual([
      injectionScript(SITE, {
        type: 'prefill',
        fields: { name: 'Ada', email: 'ada@example.com', metadata: '{"appVersion":"2.4.1"}' },
      }),
    ]);
  });

  test('setContactFields while open offers again; null takes everything back', async () => {
    await mount();
    const webView = await openWith();
    await ready(webView);
    await act(async () => HelpKitSDK.setContactFields({ subject: 'Refund' }));
    await act(async () => HelpKitSDK.setContactFields(null));
    expect(scripts(webView)).toEqual([
      injectionScript(SITE, { type: 'prefill', fields: { subject: 'Refund' } }),
      injectionScript(SITE, { type: 'prefill', fields: {} }),
    ]);
  });

  test('nothing is sent before ready', async () => {
    await mount();
    const webView = await openWith();
    await act(async () => HelpKitSDK.setContactFields({ name: 'Ada' }));
    expect(scripts(webView)).toEqual([]);
  });

  test('a sign-out asked for while closed goes after the next ready, before any fields', async () => {
    await mount();
    HelpKitSDK.signOut();
    HelpKitSDK.setContactFields({ name: 'Bea' });
    const webView = await openWith();
    await ready(webView);
    expect(scripts(webView)).toEqual([
      injectionScript(SITE, { type: 'signOut' }),
      injectionScript(SITE, { type: 'prefill', fields: { name: 'Bea' } }),
    ]);
    // Sent once.
    await ready(webView);
    expect(scripts(webView).filter((script) => script.includes('signOut'))).toHaveLength(1);
  });

  test('a sign-out while open goes at once, and forgets the fields', async () => {
    await mount();
    HelpKitSDK.setContactFields({ name: 'Ada' });
    const webView = await openWith();
    await ready(webView);
    await act(async () => HelpKitSDK.signOut());
    expect(scripts(webView).at(-1)).toBe(injectionScript(SITE, { type: 'signOut' }));
    // The page signs the reader out and reloads: nothing more is sent — the fields went with them.
    const sent = scripts(webView).length;
    await ready(webView);
    expect(scripts(webView)).toHaveLength(sent);
  });

  test('the page’s close closes the sheet', async () => {
    await mount();
    const webView = await openWith();
    await fromPage(webView, { helpkit: 1, type: 'close' });
    expect(HelpKitSDK.isOpen()).toBe(false);
  });

  test('messages from anywhere but the site’s app pages, or not the protocol, are ignored', async () => {
    await mount();
    const webView = await openWith();
    await fromPage(webView, { helpkit: 1, type: 'close' }, 'https://evil.com/_mobile');
    await fromPage(webView, { helpkit: 1, type: 'close' }, `${SITE}/articles/x`);
    await fromPage(webView, { helpkit: 2, type: 'close' });
    await fromPage(webView, 'close');
    await fromPage(webView, { helpkit: 1, type: 'close', pad: 'x'.repeat(2000) });
    expect(HelpKitSDK.isOpen()).toBe(true);
  });
});

describe('Back', () => {
  test('with somewhere to go: up is sent, and the page’s answer keeps the sheet open', async () => {
    jest.useFakeTimers();
    await mount();
    const webView = await openWith();
    await ready(webView);
    await state(webView, true);
    await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    expect(scripts(webView).at(-1)).toBe(injectionScript(SITE, { type: 'up' }));
    await state(webView, false);
    await act(async () => jest.advanceTimersByTime(UP_ANSWER_MS + 10));
    expect(HelpKitSDK.isOpen()).toBe(true);
  });

  test('no answer within half a second: the sheet closes itself', async () => {
    jest.useFakeTimers();
    await mount();
    const webView = await openWith();
    await ready(webView);
    await state(webView, true);
    await fireEvent.press(screen.getByRole('button', { name: 'Back' }));
    await act(async () => jest.advanceTimersByTime(UP_ANSWER_MS + 10));
    expect(HelpKitSDK.isOpen()).toBe(false);
  });

  describe('Android', () => {
    type BackListener = Parameters<typeof BackHandler.addEventListener>[1];
    let listeners: BackListener[];
    beforeEach(() => {
      setOS('android');
      listeners = [];
      jest.spyOn(BackHandler, 'addEventListener').mockImplementation((_name, listener) => {
        listeners.push(listener);
        return { remove: () => listeners.splice(listeners.indexOf(listener), 1) };
      });
    });

    const pressBack = () => act(async () => listeners.at(-1)?.({} as never));

    test('the back button goes up while the page has somewhere to go, then closes', async () => {
      await mount();
      const webView = await openWith();
      await ready(webView);
      await state(webView, true);
      await pressBack();
      expect(scripts(webView).at(-1)).toBe(injectionScript(SITE, { type: 'up' }));
      expect(HelpKitSDK.isOpen()).toBe(true);
      await state(webView, false);
      await pressBack();
      expect(HelpKitSDK.isOpen()).toBe(false);
      expect(listeners).toHaveLength(0);
    });

    test('a page that hasn’t said ready yet: back closes', async () => {
      await mount();
      await openWith();
      await pressBack();
      expect(HelpKitSDK.isOpen()).toBe(false);
    });

    test('a new document (a reload after signing in) forgets the old Back', async () => {
      await mount();
      const webView = await openWith();
      await ready(webView);
      await state(webView, true);
      await act(async () => webView.props.onLoadStart({ nativeEvent: { url: `${SITE}/_mobile`, loading: true } }));
      expect(screen.queryByRole('button', { name: 'Back' })).toBeNull();
      await pressBack();
      expect(HelpKitSDK.isOpen()).toBe(false);
    });

    test('an in-page move (Android reports it as a load start, not loading) keeps Back', async () => {
      await mount();
      const webView = await openWith();
      await ready(webView);
      await state(webView, true);
      await act(async () => webView.props.onLoadStart({ nativeEvent: { url: `${SITE}/_mobile/articles/x`, loading: false } }));
      expect(screen.getByRole('button', { name: 'Back' })).toBeOnTheScreen();
    });

    test('an in-page move made while the page is still loading: its next state brings the page back', async () => {
      // Android sends the move as a load start with loading still true, as if a new document began.
      await mount();
      const webView = await openWith();
      await ready(webView);
      await state(webView, false);
      await act(async () => webView.props.onLoadStart({ nativeEvent: { url: `${SITE}/_mobile/articles/x`, loading: true } }));
      await act(async () => HelpKitSDK.setContactFields({ email: 'reader@example.org' }));
      await state(webView, true);

      // The fields offered while it looked new reach the page, and Back goes up rather than closing.
      expect(scripts(webView)).toContain(injectionScript(SITE, { type: 'prefill', fields: { email: 'reader@example.org' } }));
      await pressBack();
      expect(scripts(webView).at(-1)).toBe(injectionScript(SITE, { type: 'up' }));
      expect(HelpKitSDK.isOpen()).toBe(true);
    });

    test('a view over the app, not a Modal, with status-bar icons that read on the header', async () => {
      const push = jest.spyOn(StatusBar, 'pushStackEntry');
      const replace = jest.spyOn(StatusBar, 'replaceStackEntry');
      const pop = jest.spyOn(StatusBar, 'popStackEntry');
      await mount();
      await openWith();
      expect(screen.container.queryAll((node) => node.type === 'Modal')).toHaveLength(0);
      expect(screen.getByTestId('helpkit-sheet')).toBeOnTheScreen();
      // The page's neutral colours while the site is found, then its header's.
      expect(push).toHaveBeenCalledWith(expect.objectContaining({ barStyle: 'dark-content', backgroundColor: '#FFFFFF' }));
      expect(replace).toHaveBeenLastCalledWith(
        expect.anything(),
        expect.objectContaining({ barStyle: 'light-content', backgroundColor: '#0F766E' }),
      );
      await act(async () => HelpKitSDK.close());
      expect(pop).toHaveBeenCalled();
      push.mockRestore();
      replace.mockRestore();
      pop.mockRestore();
    });

    test('the keyboard is listened for while the sheet is open', async () => {
      const addListener = jest.spyOn(Keyboard, 'addListener');
      await mount();
      await openWith();
      expect(addListener).toHaveBeenCalledWith('keyboardDidShow', expect.any(Function));
      expect(addListener).toHaveBeenCalledWith('keyboardDidHide', expect.any(Function));
      addListener.mockRestore();
    });
  });
});

describe('links', () => {
  test('the app pages stay; everything else leaves by Linking, or is refused', async () => {
    await mount();
    const { props } = await openWith();
    const decide = (url: string, extra: object = {}) => props.onShouldStartLoadWithRequest({ url, isTopFrame: true, ...extra });
    expect(decide(`${SITE}/_mobile/articles/x`)).toBe(true);
    expect(decide('https://example.com/a')).toBe(false);
    expect(openURL).toHaveBeenLastCalledWith('https://example.com/a');
    expect(decide('mailto:help@acme.com')).toBe(false);
    expect(openURL).toHaveBeenLastCalledWith('mailto:help@acme.com');
    openURL.mockClear();
    expect(decide('javascript:alert(1)')).toBe(false);
    expect(decide('myapp://settings')).toBe(false);
    expect(decide('https://youtube.com/embed/x', { isTopFrame: false })).toBe(false);
    expect(openURL).not.toHaveBeenCalled();
  });

  test('a new window leaves the app', async () => {
    await mount();
    const { props } = await openWith();
    await act(async () => props.onOpenWindow({ nativeEvent: { targetUrl: 'https://example.com/b' } }));
    expect(openURL).toHaveBeenCalledWith('https://example.com/b');
    await act(async () => props.onOpenWindow({ nativeEvent: { targetUrl: 'intent://x' } }));
    expect(openURL).toHaveBeenCalledTimes(1);
  });

  test('onOpenLink owns every link out', async () => {
    const onOpenLink = jest.fn();
    await mount({ onOpenLink });
    const { props } = await openWith();
    props.onShouldStartLoadWithRequest({ url: 'https://example.com/a', isTopFrame: true });
    await act(async () => props.onOpenWindow({ nativeEvent: { targetUrl: 'mailto:a@b.c' } }));
    expect(onOpenLink.mock.calls).toEqual([['https://example.com/a'], ['mailto:a@b.c']]);
    expect(openURL).not.toHaveBeenCalled();
  });

  test('a page outside the help center that loads anyway is taken away, and the last help page shown', async () => {
    setOS('android');
    await mount();
    const webView = await openWith();
    await ready(webView);
    await act(async () => webView.props.onNavigationStateChange({ url: `${SITE}/_mobile/articles/x` }));
    await act(async () => webView.props.onLoadStart({ nativeEvent: { url: 'https://evil.com/login', loading: true } }));
    expect(webView.handle.stopLoading).toHaveBeenCalled();
    expect(openURL).toHaveBeenCalledWith('https://evil.com/login');
    expect(webViews).toHaveLength(2);
    expect(lastWebView().props.source).toEqual({ uri: `${SITE}/_mobile/articles/x` });
    // The old WebView's own late report of the same page changes nothing more.
    await act(async () => webView.props.onNavigationStateChange({ url: 'https://evil.com/login' }));
    expect(webViews).toHaveLength(2);
  });

  test('leaving twice before the page is back is the error state, not a loop', async () => {
    setOS('android');
    await mount();
    await openWith();
    await act(async () => lastWebView().props.onLoadStart({ nativeEvent: { url: 'https://evil.com/a', loading: true } }));
    await act(async () => lastWebView().props.onLoadStart({ nativeEvent: { url: 'https://evil.com/a', loading: true } }));
    expect(screen.getByText('Couldn’t load help')).toBeOnTheScreen();
    expect(openURL).toHaveBeenCalledTimes(1);
  });
});

describe('errors', () => {
  test('a load error: "Couldn’t load help"; Try again asks again and goes back where the reader was', async () => {
    await mount();
    const webView = await openWith();
    await ready(webView);
    await act(async () => webView.props.onNavigationStateChange({ url: `${SITE}/_mobile/articles/refunds` }));
    const preventDefault = jest.fn();
    await act(async () => webView.props.onError({ nativeEvent: { code: -1009, url: SITE }, preventDefault }));
    expect(preventDefault).toHaveBeenCalled();
    expect(screen.getByText('Couldn’t load help')).toBeOnTheScreen();
    expect(screen.queryByTestId('helpkit-webview')).toBeNull();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    await act(async () => undefined);
    expect(fetchMock).toHaveBeenCalledTimes(2);
    expect(lastWebView().props.source).toEqual({ uri: `${SITE}/_mobile/articles/refunds` });
  });

  test('announced on iOS', async () => {
    await mount();
    const webView = await openWith();
    await act(async () => webView.props.onError({ nativeEvent: { code: -1009 }, preventDefault: () => undefined }));
    expect(AccessibilityInfo.announceForAccessibility).toHaveBeenCalledWith('Couldn’t load help');
  });

  test('15 seconds without the page finishing', async () => {
    jest.useFakeTimers();
    await mount();
    await openWith();
    await act(async () => jest.advanceTimersByTime(LOAD_TIMEOUT_MS + 1));
    expect(screen.getByText('Couldn’t load help')).toBeOnTheScreen();
  });

  test('a 5xx page that never says ready is an error; one that does (billing’s paused page, say) is shown', async () => {
    jest.useFakeTimers();
    await mount();
    let webView = await openWith();
    await act(async () => webView.props.onHttpError({ nativeEvent: { statusCode: 503 } }));
    await act(async () => webView.props.onLoadEnd({ nativeEvent: {} }));
    await ready(webView);
    await act(async () => jest.advanceTimersByTime(HTTP_GRACE_MS + 10));
    expect(screen.getByTestId('helpkit-webview')).toBeOnTheScreen();

    await act(async () => HelpKitSDK.close());
    webView = await openWith();
    await act(async () => webView.props.onHttpError({ nativeEvent: { statusCode: 502 } }));
    await act(async () => webView.props.onLoadEnd({ nativeEvent: {} }));
    await act(async () => jest.advanceTimersByTime(HTTP_GRACE_MS + 10));
    expect(screen.getByText('Couldn’t load help')).toBeOnTheScreen();
  });

  test('a 404 is the page’s own, and is left alone', async () => {
    jest.useFakeTimers();
    await mount();
    const webView = await openWith(() => HelpKitSDK.openArticle('gone'));
    await act(async () => webView.props.onHttpError({ nativeEvent: { statusCode: 404 } }));
    await act(async () => webView.props.onLoadEnd({ nativeEvent: {} }));
    await act(async () => jest.advanceTimersByTime(HTTP_GRACE_MS + 10));
    expect(screen.getByTestId('helpkit-webview')).toBeOnTheScreen();
    expect(screen.queryByTestId('helpkit-loading')).toBeNull();
  });

  test('a renderer crash reloads; a second within 30 seconds is an error', async () => {
    jest.useFakeTimers();
    await mount();
    const webView = await openWith();
    await act(async () => webView.props.onRenderProcessGone({ nativeEvent: { didCrash: true } }));
    expect(webViews).toHaveLength(2);
    expect(lastWebView().props.source).toEqual({ uri: `${SITE}/_mobile` });
    await act(async () => jest.advanceTimersByTime(CRASH_WINDOW_MS - 1000));
    await act(async () => lastWebView().props.onContentProcessDidTerminate({ nativeEvent: {} }));
    expect(screen.getByText('Couldn’t load help')).toBeOnTheScreen();
  });

  test('the resolver down (503) is an error, with Try again', async () => {
    replies.push({ status: 503, body: { v: 1, show: false, reason: 'unavailable' } });
    await mount();
    await act(async () => HelpKitSDK.open());
    await act(async () => undefined);
    expect(screen.getByText('Couldn’t load help')).toBeOnTheScreen();
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    await act(async () => undefined);
    expect(lastWebView().props.source).toEqual({ uri: `${SITE}/_mobile` });
  });

  test('no network', async () => {
    fetchMock.mockImplementationOnce(async () => {
      throw new TypeError('Network request failed');
    });
    await mount();
    await act(async () => HelpKitSDK.open());
    await act(async () => undefined);
    expect(screen.getByText('Couldn’t load help')).toBeOnTheScreen();
  });
});

describe('not available', () => {
  test.each([
    ['an App ID nobody has', { v: 1, show: false, reason: 'unknown' }, 'No help center has this App ID'],
    ['app mode off, or not on the plan', { v: 1, show: false, reason: 'off' }, 'switched off'],
  ])('%s: "Help isn’t available right now", with Try again, and a warning that says why', async (_name, body, why) => {
    replies.push({ status: 200, body });
    await mount();
    await act(async () => HelpKitSDK.open());
    await act(async () => undefined);
    expect(screen.getByText('Help isn’t available right now')).toBeOnTheScreen();
    expect(screen.getByRole('button', { name: 'Try again' })).toBeOnTheScreen();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining(why));
    expect(openURL).not.toHaveBeenCalled();
    expect(webViews).toHaveLength(0);
  });

  test('a projectId that isn’t an App ID asks nothing', async () => {
    await mount({}, 'acme');
    await act(async () => HelpKitSDK.open());
    await act(async () => undefined);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText('Help isn’t available right now')).toBeOnTheScreen();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining("isn't an App ID"));
  });

  test('an http host outside development', async () => {
    await mount({ host: 'http://app.example.com' });
    await act(async () => HelpKitSDK.open());
    await act(async () => undefined);
    expect(fetchMock).not.toHaveBeenCalled();
    expect(screen.getByText('Help isn’t available right now')).toBeOnTheScreen();
  });
});

describe('privacy', () => {
  test('contact field values never reach the console, even with debug on', async () => {
    const log = jest.spyOn(console, 'log').mockImplementation(() => undefined);
    const error = jest.spyOn(console, 'error').mockImplementation(() => undefined);
    try {
      await mount({ debug: true });
      HelpKitSDK.setContactFields({ name: 'Zelda-Secret', email: 'zelda-secret@example.com', metadata: { token: 'zelda-secret' } });
      const webView = await openWith(() => HelpKitSDK.openContact());
      await ready(webView, `${SITE}/_mobile/contact`);
      await act(async () => HelpKitSDK.setContactFields({ subject: 'zelda-secret subject', phone: 'zelda-secret' } as never));
      await act(async () => HelpKitSDK.close());
      expect(log).toHaveBeenCalled();
      for (const spy of [log, warn, error]) {
        for (const call of spy.mock.calls) {
          expect(JSON.stringify(call).toLowerCase()).not.toContain('zelda-secret');
        }
      }
    } finally {
      log.mockRestore();
      error.mockRestore();
    }
  });

  test('nothing but the view, and the edition, goes in the address', async () => {
    replies.push({ status: 200, body: { ...YES, editions: EDITIONS } });
    await mount({ language: 'de' });
    HelpKitSDK.setContactFields({ name: 'Ada', email: 'ada@example.com', subject: 'Hi', metadata: 'v=1' });
    const webView = await openWith(() => HelpKitSDK.openContact());
    expect(webView.props.source.uri).toBe(`${SITE}/_mobile/de/contact`);
  });
});

describe('languages and versions', () => {
  function offering(editions: unknown = EDITIONS) {
    replies.push({ status: 200, body: { ...YES, editions } });
  }

  test('with neither set, the main edition, as before', async () => {
    offering();
    await mount();
    const webView = await openWith(() => HelpKitSDK.openArticle('install'));
    expect(webView.props.source.uri).toBe(`${SITE}/_mobile/articles/install`);
  });

  test('config.language opens the edition in the app’s language, by its language when not its exact tag', async () => {
    offering();
    await mount({ language: 'de-AT' });
    const webView = await openWith(() => HelpKitSDK.openSearch('rückgabe'));
    expect(webView.props.source.uri).toBe(`${SITE}/_mobile/de?q=r%C3%BCckgabe`);
  });

  test('setLanguage wins over config.language, and a language the site isn’t written in opens the main one', async () => {
    offering();
    offering();
    await mount({ language: 'de' });
    HelpKitSDK.setLanguage('fr-CA');
    await openWith(() => HelpKitSDK.open());
    expect(lastWebView().props.source.uri).toBe(`${SITE}/_mobile`);
    await act(async () => HelpKitSDK.close());
    HelpKitSDK.setLanguage(null);
    await openWith(() => HelpKitSDK.open());
    expect(lastWebView().props.source.uri).toBe(`${SITE}/_mobile/de`);
    expect(warn).not.toHaveBeenCalled();
  });

  test('a version comes first: the opening’s own, then setVersion’s, then config’s', async () => {
    offering();
    offering();
    offering();
    await mount({ version: 'v1', language: 'de' });
    await openWith(() => HelpKitSDK.openArticle('install'));
    expect(lastWebView().props.source.uri).toBe(`${SITE}/_mobile/v1/articles/install`);
    await act(async () => HelpKitSDK.close());
    HelpKitSDK.setVersion('V2');
    await openWith(() => HelpKitSDK.openArticle('install'));
    expect(lastWebView().props.source.uri).toBe(`${SITE}/_mobile/v2/articles/install`);
    await act(async () => HelpKitSDK.close());
    await openWith(() => HelpKitSDK.openArticle('install', { version: 'v1' }));
    expect(lastWebView().props.source.uri).toBe(`${SITE}/_mobile/v1/articles/install`);
  });

  test('a version the site doesn’t offer: the language, else the main edition, with one warning in development', async () => {
    offering();
    offering();
    await mount({ version: 'v9', language: 'de' });
    await openWith(() => HelpKitSDK.openContact());
    expect(lastWebView().props.source.uri).toBe(`${SITE}/_mobile/de/contact`);
    await act(async () => HelpKitSDK.close());
    await openWith(() => HelpKitSDK.openContact());
    const said = warn.mock.calls.map(([line]) => String(line)).filter((line) => line.includes('"v9"'));
    expect(said).toHaveLength(1);
    expect(said[0]).toContain('its versions: v1, v2');
  });

  test('an answer without editions (a HelpKit from before them) opens the main edition, whatever is set', async () => {
    await mount({ version: 'v2', language: 'de' });
    const webView = await openWith(() => HelpKitSDK.openArticle('install'));
    expect(webView.props.source.uri).toBe(`${SITE}/_mobile/articles/install`);
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('it has no versions'));
  });

  test('a path the SDK can’t put in an address is never opened', async () => {
    offering([
      { path: '', kind: 'main', language: 'en', label: 'English' },
      { path: '../admin', kind: 'language', language: 'de', label: 'Deutsch' },
    ]);
    await mount({ language: 'de' });
    const webView = await openWith(() => HelpKitSDK.open());
    expect(webView.props.source.uri).toBe(`${SITE}/_mobile`);
  });

  test('a new open* while open follows the settings at that moment; Try again keeps the page reached', async () => {
    offering();
    offering();
    await mount();
    const first = await openWith(() => HelpKitSDK.open());
    expect(first.props.source.uri).toBe(`${SITE}/_mobile`);
    await ready(first);
    HelpKitSDK.setLanguage('zh-TW');
    await openWith(() => HelpKitSDK.openArticle('install'));
    expect(lastWebView().props.source.uri).toBe(`${SITE}/_mobile/zh-hant/articles/install`);
    // The reader moved on in the page; a failed load, then Try again, comes back there.
    await act(async () => lastWebView().props.onNavigationStateChange({ url: `${SITE}/_mobile/zh-hant/collections/start` }));
    await act(async () => lastWebView().props.onError({ nativeEvent: { code: -1009 }, preventDefault: () => undefined }));
    await fireEvent.press(screen.getByRole('button', { name: 'Try again' }));
    await act(async () => undefined);
    expect(lastWebView().props.source.uri).toBe(`${SITE}/_mobile/zh-hant/collections/start`);
  });
});

describe('other platforms', () => {
  test('on the web, the calls do nothing but warn', async () => {
    setOS('web');
    await mount();
    await act(async () => HelpKitSDK.open());
    expect(screen.toJSON()).toBeNull();
    expect(fetchMock).not.toHaveBeenCalled();
    expect(warn).toHaveBeenCalledWith(expect.stringContaining('native only'));
  });
});
