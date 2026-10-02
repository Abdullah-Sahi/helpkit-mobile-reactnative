import { Linking, Platform } from 'react-native';
import { injectionScript, readPageMessage, type AppMessage } from './bridge';
import { chooseEdition, cleanLanguage, cleanVersion } from './editions';
import { decideLoaded, decideNavigation, decideNewWindow, type NavigationRequest } from './links';
import { debugLog, devWarn, isDev } from './log';
import { resolveSite, type Resolution, type Site } from './resolve';
import { store, type OpenRequest } from './store';
import type { HelpKitConfig } from './types';
import { isMobileUrl, parseOrigin, viewPath } from './url';

/**
 * What the open sheet does, apart from drawing: find the help center, show its view, keep the
 * WebView on the help center's app pages, talk protocol 1 with them, and fall back to a native
 * state when they can't be shown. HelpKit.tsx draws what this decides and hands it the WebView's
 * events. Plain code with no React in it, so every rule here is tested through a mocked WebView.
 *
 * **Per document.** A page says `ready` once it runs, then `state` (whether Back has somewhere to
 * go) after every move. Until the current document has said `ready`, nothing is sent to it; Back
 * then simply closes the sheet.
 *
 * **Back.** When the page said it has somewhere to go, Back sends it `up`; if no `state` answers
 * within half a second (a page that hasn't hydrated, a bare error page), the sheet closes itself.
 * Otherwise Back closes. The WebView's own history is never used: every move inside `/_mobile`
 * replaces, and every link out of it opens outside.
 *
 * **The check after the fact.** On Android the link policy's answer is only waited for 250 ms,
 * after which the WebView loads the page anyway. So every page the WebView reports, on either
 * platform, is checked again: anything other than the help center's app pages is stopped, and the
 * last good app page is loaded again — once; if that goes wrong too, the error state.
 *
 * **Which edition.** Each view opens in the edition the app's version or language chooses from those
 * the resolver listed (editions.ts), at `/_mobile/<path>/…`; with neither, or on a site with one
 * language, at `/_mobile/…` as before. A reader who picks another language on the front page stays
 * in it until the next `open*`, which follows the app's settings again.
 *
 * **Errors.** No network, a main-frame load error at any time, 15 seconds without the page
 * finishing, a 5xx whose page never says `ready`, or a second renderer crash within 30 seconds:
 * "Couldn't load help", with Try again, which asks again and reloads the last good app page.
 */

/** A load that hasn't finished after this long is shown as an error: never an endless spinner. */
export const LOAD_TIMEOUT_MS = 15_000;
/** How long Back waits for the page to answer `up` before closing the sheet itself. */
export const UP_ANSWER_MS = 500;
/** A renderer that dies twice within this long is an error, not something to reload again. */
export const CRASH_WINDOW_MS = 30_000;
/** How long a 5xx page has, after it loads, to say `ready` (a page of ours) before it counts as an error. */
export const HTTP_GRACE_MS = 2_000;

export type Phase = { kind: 'resolving' } | { kind: 'unavailable' } | { kind: 'error' } | { kind: 'page'; site: Site };

/** The WebView to draw: its address, and a key that changes whenever it must be made anew. */
export interface PageSource {
  uri: string;
  key: number;
}

/** What the sheet draws from. */
export interface SheetView {
  setPhase(phase: Phase): void;
  setPage(page: PageSource | null): void;
  setUp(up: boolean): void;
  setSpinner(on: boolean): void;
  setProgress(progress: number | null): void;
}

/** The WebView's methods this uses. */
export interface WebViewHandle {
  injectJavaScript(script: string): void;
  stopLoading(): void;
}

export interface SheetInputs {
  projectId: string;
  config: HelpKitConfig;
  request: OpenRequest;
  /** Closes the sheet (HelpKit's close). */
  close: () => void;
}

export type Sheet = ReturnType<typeof createSheet>;

type Timer = ReturnType<typeof setTimeout>;

const UNAVAILABLE_WHY: Record<Extract<Resolution, { kind: 'unavailable' }>['reason'], string> = {
  projectId:
    "projectId isn't an App ID. Copy yours from the HelpKit dashboard: Settings, then the Mobile app card (22 characters).",
  host: "config.host isn't an address this SDK may use. Give it HelpKit's own https address, as the snippet on the dashboard's Mobile app card does; plain http works only for a local address in a development build.",
  unknown: "No help center has this App ID. Check projectId against the dashboard's Mobile app card.",
  off: "This help center's mobile app is switched off, or isn't on its plan. Turn it on in the dashboard: Settings, then Mobile app.",
};

export function createSheet(view: SheetView, initial: SheetInputs) {
  let inputs = initial;
  let webView: WebViewHandle | null = null;
  let phase: Phase['kind'] = 'resolving';
  let site: Site | null = null;
  /** Each resolution's number: an answer to an earlier one is dropped. */
  let resolution = 0;
  let disposed = false;
  /** The question being asked now, so closing the sheet can stop it. */
  let asking: AbortController | null = null;
  let requestSeen: OpenRequest = initial.request;

  /** The live WebView's key; events from any other are stale. -1 while none is drawn. */
  let live = -1;
  let nextKey = 0;
  let ready = false;
  let up = false;
  let spinner = true;
  let progressing = false;
  let httpFailed = false;
  let recovered = false;
  let crashedAt: number | null = null;
  let currentUrl: string | null = null;
  let lastGood: string | null = null;
  let retryFrom: string | null = null;
  let lastOutside: { url: string; at: number } | null = null;
  const timers: { load?: Timer; up?: Timer; http?: Timer } = {};

  const debug = (message: string) => debugLog(inputs.config?.debug, message);

  function stop(name: keyof typeof timers) {
    const timer = timers[name];
    if (timer !== undefined) clearTimeout(timer);
    timers[name] = undefined;
  }

  function stopAll() {
    stop('load');
    stop('up');
    stop('http');
  }

  function setPhase(next: Phase) {
    phase = next.kind;
    view.setPhase(next);
  }

  function setUp(next: boolean) {
    up = next;
    view.setUp(next);
  }

  function setSpinner(next: boolean) {
    spinner = next;
    view.setSpinner(next);
  }

  function setProgress(next: number | null) {
    progressing = next !== null;
    view.setProgress(next);
  }

  function startLoadTimer() {
    stop('load');
    timers.load = setTimeout(() => {
      timers.load = undefined;
      fail('timeout');
    }, LOAD_TIMEOUT_MS);
  }

  /**
   * The document is listening: what was held for it goes now. A held sign-out goes first, so
   * nothing offered for the next person meets the last one's pass.
   */
  function listening() {
    ready = true;
    recovered = false;
    httpFailed = false;
    stop('load');
    stop('http');
    if (spinner) setSpinner(false);
    if (canSend() && store.takeSignOut()) send({ type: 'signOut' });
    if (store.fields) send({ type: 'prefill', fields: store.fields });
  }

  /** A new document starts: nothing is sent to it, and Back closes, until it says `ready`. */
  function newDocument() {
    ready = false;
    httpFailed = false;
    stop('up');
    stop('http');
    setUp(false);
  }

  /** Draws a WebView, anew, at an app page. */
  function show(uri: string) {
    nextKey += 1;
    live = nextKey;
    currentUrl = uri;
    lastGood = uri;
    newDocument();
    setSpinner(true);
    setProgress(null);
    view.setPage({ uri, key: live });
    startLoadTimer();
  }

  /** "Couldn't load help", with Try again. */
  function fail(why: 'network' | 'server' | 'timeout' | 'crash', detail?: string) {
    stopAll();
    live = -1;
    ready = false;
    setUp(false);
    setProgress(null);
    view.setPage(null);
    setPhase({ kind: 'error' });
    debug(`couldn't load help (${why}${detail ? `: ${detail}` : ''})`);
  }

  async function resolve() {
    const mine = ++resolution;
    stopAll();
    live = -1;
    ready = false;
    site = null;
    setUp(false);
    setProgress(null);
    view.setPage(null);
    setPhase({ kind: 'resolving' });

    const { projectId, config } = inputs;
    const host = parseOrigin(config?.host);
    if (host && host.rest !== '' && host.rest !== '/') {
      devWarn(`config.host is HelpKit's address alone; "${host.rest}" after it is ignored.`, 'host-path');
    }
    debug('asking which help center this App ID names');
    asking?.abort();
    const question = new AbortController();
    asking = question;
    const answer = await resolveSite({ host: config?.host, projectId, dev: isDev(), signal: question.signal });
    if (asking === question) asking = null;
    if (disposed || mine !== resolution) return;

    if (answer.kind === 'unavailable') {
      devWarn(UNAVAILABLE_WHY[answer.reason]);
      debug(`not available (${answer.reason})`);
      setPhase({ kind: 'unavailable' });
      return;
    }
    if (answer.kind === 'error') {
      if (answer.detail?.startsWith('answer version')) {
        devWarn(`HelpKit answered in a version this SDK doesn't read (${answer.detail}). Update helpkit-react-native.`);
      }
      fail(answer.error, answer.detail);
      return;
    }

    site = answer.site;
    setPhase({ kind: 'page', site });
    // Try again comes back to the page the reader had reached, when it is still on this site.
    const again = retryFrom !== null && isMobileUrl(retryFrom, site.origin) ? retryFrom : null;
    retryFrom = null;
    show(again ?? addressOf(site, inputs.request));
  }

  /**
   * Where an opening goes: its view, in the edition the app's settings choose. The opening's own
   * version, then setVersion's, then config's; then setLanguage's language, then config's.
   */
  function addressOf(on: Site, request: OpenRequest): string {
    const version = cleanVersion(request.options.version) ?? store.version ?? cleanVersion(inputs.config?.version);
    const language = store.language ?? cleanLanguage(inputs.config?.language);
    const choice = chooseEdition(on.editions, { version, language });
    if (choice.unknownVersion) {
      const versions = on.editions.filter((edition) => edition.kind === 'version').map((edition) => edition.path);
      const asked = choice.unknownVersion.slice(0, 40);
      devWarn(
        `This help center offers no version "${asked}" (${versions.length > 0 ? `its versions: ${versions.join(', ')}` : 'it has no versions'}), so it opens as if none were set. A version is offered once it is launched on the dashboard's Languages & versions page.`,
        `version:${asked}`,
      );
    }
    debug(choice.path ? `opening the "${choice.path}" edition` : 'opening the main edition');
    return `${on.origin}${viewPath(request, choice.path)}`;
  }

  /** Whether a message can go to the page now: it said `ready`, and the WebView is on an app page. */
  function canSend(): boolean {
    return webView !== null && site !== null && ready && currentUrl !== null && isMobileUrl(currentUrl, site.origin);
  }

  function send(message: AppMessage): boolean {
    if (!canSend() || !webView || !site) return false;
    webView.injectJavaScript(injectionScript(site.origin, message));
    return true;
  }

  /** Hands a link to the app's `onOpenLink`, or to the phone. The same one twice in a row within `within` ms is opened once. */
  function openOutside(url: string, within: number) {
    const now = Date.now();
    if (lastOutside && lastOutside.url === url && now - lastOutside.at < within) return;
    lastOutside = { url, at: now };
    const handler = inputs.config?.onOpenLink;
    if (typeof handler === 'function') {
      try {
        handler(url);
      } catch {
        devWarn('config.onOpenLink threw while opening a link from the help center.');
      }
      return;
    }
    Linking.openURL(url).catch(() => debug("the phone couldn't open a link from the help center"));
  }

  /**
   * The check after the fact, for every page the WebView reports. True when it is an app page and
   * the event may be handled; false when it was ignored, or taken away.
   */
  function recheck(url: string): boolean {
    if (!site) return false;
    const decision = decideLoaded(url, site.origin);
    if (decision === 'ok') {
      lastGood = url;
      return true;
    }
    if (decision === 'ignore') return false;

    // Something other than the help center's app pages is loading under the app's header.
    webView?.stopLoading();
    // It was a link the reader followed (the policy has usually handed it out already).
    if (decideNewWindow(url) === 'outside') openOutside(url, 10_000);
    if (recovered || lastGood === null) {
      fail('server', 'left the help center twice');
      return false;
    }
    recovered = true;
    debug('a page outside the help center started loading; showing the last help page again');
    show(lastGood);
    return false;
  }

  return {
    update(next: SheetInputs) {
      inputs = next;
    },

    attach(handle: WebViewHandle | null) {
      webView = handle;
    },

    start() {
      disposed = false;
      void resolve();
    },

    dispose() {
      disposed = true;
      asking?.abort();
      asking = null;
      stopAll();
      live = -1;
    },

    /** An `open*` call while the sheet is open: its view, anew (a new back stack). */
    navigate(request: OpenRequest) {
      if (request === requestSeen) return;
      requestSeen = request;
      if (phase === 'page' && site) show(addressOf(site, request));
      else if (phase !== 'resolving') void resolve();
      // While resolving, the answer opens inputs.request, which is this one.
    },

    retry() {
      retryFrom = lastGood;
      void resolve();
    },

    /** The header's Back, and Android's back button. */
    back() {
      if (phase === 'page' && up && send({ type: 'up' })) {
        stop('up');
        timers.up = setTimeout(() => {
          timers.up = undefined;
          inputs.close();
        }, UP_ANSWER_MS);
        return;
      }
      inputs.close();
    },

    /** From HelpKitSDK while the sheet is open. */
    onEvent(event: 'fields' | 'signOut') {
      if (event === 'fields') {
        // An empty offer takes back whatever was offered before.
        send({ type: 'prefill', fields: store.fields ?? {} });
        return;
      }
      if (canSend() && store.takeSignOut()) send({ type: 'signOut' });
    },

    onShouldStart(request: NavigationRequest): boolean {
      if (!site) return false;
      const decision = decideNavigation(request, site.origin);
      if (decision === 'outside') openOutside(request.url, 1_000);
      else if (decision === 'refuse') debug('refused a navigation the help center has no use for');
      return decision === 'stay';
    },

    onOpenWindow(url: string) {
      if (decideNewWindow(url) === 'outside') openOutside(url, 1_000);
    },

    onLoadStart(key: number, url: string, loading: boolean) {
      if (key !== live) return;
      currentUrl = url;
      if (!recheck(url)) return;
      // iOS reports only real loads here; Android also reports every in-page move, while `loading`
      // is false.
      if (Platform.OS === 'ios' || loading) {
        newDocument();
        startLoadTimer();
        if (!spinner) setProgress(0);
      }
    },

    onNavigation(key: number, url: string) {
      if (key !== live) return;
      currentUrl = url;
      recheck(url);
    },

    onProgress(key: number, progress: number) {
      if (key !== live || !progressing) return;
      setProgress(Math.max(0, Math.min(1, progress)));
    },

    onLoadEnd(key: number) {
      if (key !== live) return;
      stop('load');
      if (spinner) setSpinner(false);
      setProgress(null);
      if (httpFailed && !ready) {
        stop('http');
        timers.http = setTimeout(() => {
          timers.http = undefined;
          if (!ready) fail('server', 'the page answered with an error');
        }, HTTP_GRACE_MS);
      }
    },

    onError(key: number) {
      if (key !== live) return;
      fail('network');
    },

    onHttpError(key: number, statusCode: number) {
      if (key !== live) return;
      // A 4xx is the page's own (not found, sign in, paused) and is shown as it is. A 5xx is ours
      // only if it never becomes one of the help center's pages.
      if (statusCode >= 500 && !ready) httpFailed = true;
    },

    onProcessGone(key: number) {
      if (key !== live) return;
      const now = Date.now();
      if (crashedAt !== null && now - crashedAt < CRASH_WINDOW_MS) {
        fail('crash');
        return;
      }
      crashedAt = now;
      debug('the WebView stopped; loading the help page again');
      if (lastGood) show(lastGood);
      else fail('crash');
    },

    onMessage(key: number, data: unknown, url: string) {
      if (key !== live || !site || !isMobileUrl(url, site.origin)) return;
      const message = readPageMessage(data);
      if (!message) return;
      currentUrl = url;
      switch (message.type) {
        case 'ready':
          listening();
          setUp(false);
          return;
        case 'state':
          stop('up');
          // A page only says `state` after it has said `ready`, from the same bridge. So a state while
          // this side thinks the document is new means it isn't: Android reports an in-page move made
          // before the page finished loading as a load start with `loading` still true (the flag is
          // load progress, not "a new document"). Without this, Back would close the whole sheet and
          // nothing more would reach the page until it was reloaded.
          if (!ready) listening();
          setUp(message.up);
          return;
        case 'close':
          inputs.close();
          return;
      }
    },
  };
}
