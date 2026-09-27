import { useCallback, useEffect, useLayoutEffect, useRef, useState, type ReactNode, type RefObject } from 'react';
import {
  AccessibilityInfo,
  Animated,
  BackHandler,
  Easing,
  Modal,
  Platform,
  StatusBar,
  StyleSheet,
  View,
  useColorScheme,
  useWindowDimensions,
  type Text,
} from 'react-native';
import { SafeAreaProvider, useSafeAreaInsets } from 'react-native-safe-area-context';
import { WebView } from 'react-native-webview';
import type { ShouldStartLoadRequest } from 'react-native-webview/lib/WebViewTypes';
import { Header } from './Header';
import { useKeyboardOverlap } from './keyboard';
import { debugLog, devWarn, isDev } from './log';
import { createSheet, type PageSource, type Phase } from './sheet';
import { StateView } from './StateView';
import { store, type Host, type OpenRequest } from './store';
import { sheetStrings, sheetTitle } from './strings';
import { readableOn, sheetTheme } from './theme';
import type { HelpKitConfig, HelpKitProps } from './types';
import { VERSION } from './version';

/**
 * `<HelpKit projectId config />`: mounted once, at the root of the app. It draws nothing until a
 * `HelpKitSDK.open*` call, then shows the help center in a sheet: a native header over a WebView
 * of the help center's app pages (`/_mobile` on the site's HelpKit subdomain).
 *
 * **How the sheet is presented differs by platform, on purpose.**
 *
 * - **iOS: a Modal page sheet.** Swipe down to dismiss, the system's own sheet, and WKWebView
 *   scrolls a focused field above the keyboard by itself.
 * - **Android: a view over the app, in the app's own window — not a Modal.** An Android Modal is a
 *   separate dialog window, and under edge-to-edge (every app on Android 15 and later) that window
 *   neither shrinks for the keyboard nor reliably hears keyboard events, so the keyboard would cover
 *   the contact form's fields and its Send button. In the app's own window the keyboard is heard,
 *   and the sheet makes room for it (keyboard.ts). Back is Android's back button, through
 *   `BackHandler`, which RN 0.81 and later route through Android 16's new back dispatch. This is
 *   why `<HelpKit>` goes last in the app's root, outside anything that pads or clips: there, it can
 *   cover the whole screen. (Chosen without a device to hand; the README's device checklist is how
 *   it gets confirmed.)
 *
 * Only this file imports react-native-webview.
 */

/** Everything Android and iOS need to leave the sheet's policy to decide; see links.ts. */
const EVERY_ORIGIN = ['*'];
/** Screen readers move to the title once the sheet has slid in. */
const FOCUS_DELAY_MS = 400;
const USER_AGENT = `HelpKitRN/${VERSION}`;

let sessions = 0;

interface Session {
  id: number;
  request: OpenRequest;
}

/** Whether the reader asked the system for less motion. */
function useReduceMotion(): boolean {
  const [reduce, setReduce] = useState(false);
  useEffect(() => {
    let live = true;
    AccessibilityInfo.isReduceMotionEnabled().then(
      (on) => {
        if (live) setReduce(on === true);
      },
      () => undefined,
    );
    const subscription = AccessibilityInfo.addEventListener('reduceMotionChanged', (on) => setReduce(on === true));
    return () => {
      live = false;
      subscription.remove();
    };
  }, []);
  return reduce;
}

export function HelpKit({ projectId, config }: HelpKitProps) {
  const [session, setSession] = useState<Session | null>(null);
  const [visible, setVisible] = useState(false);
  const openRef = useRef(false);
  const debugRef = useRef<boolean | undefined>(config?.debug);
  const events = useRef<((event: 'fields' | 'signOut') => void) | null>(null);
  const reduceMotion = useReduceMotion();

  useLayoutEffect(() => {
    debugRef.current = config?.debug;
  });

  const close = useCallback(() => {
    if (!openRef.current) return;
    openRef.current = false;
    setVisible(false);
    debugLog(debugRef.current, 'closed');
    // iOS keeps the sheet's content while it slides away, and lets it go once dismissed (onDismiss).
    if (Platform.OS !== 'ios') setSession(null);
  }, []);

  useEffect(() => {
    const host: Host = {
      open(request) {
        if (Platform.OS !== 'ios' && Platform.OS !== 'android') {
          devWarn('The help sheet is native only (iOS and Android). On this platform HelpKitSDK does nothing.', 'platform');
          return;
        }
        debugLog(debugRef.current, `opening ${request.view}`);
        if (openRef.current) {
          // Already open: the sheet shows this view instead.
          setSession((current) => (current ? { ...current, request } : { id: ++sessions, request }));
          return;
        }
        openRef.current = true;
        setSession({ id: ++sessions, request });
        setVisible(true);
      },
      close,
      isOpen: () => openRef.current,
      fieldsChanged: () => events.current?.('fields'),
      signOutRequested: () => events.current?.('signOut'),
    };
    return store.register(host);
  }, [close]);

  if (!session) return null;

  const sheet = (
    <HelpSheet key={session.id} projectId={projectId} config={config} request={session.request} onClose={close} events={events} />
  );

  if (Platform.OS === 'ios') {
    return (
      <Modal
        visible={visible}
        presentationStyle="pageSheet"
        animationType={reduceMotion ? 'none' : 'slide'}
        allowSwipeDismissal
        onRequestClose={close}
        onDismiss={() => {
          if (!openRef.current) setSession(null);
        }}
      >
        <SafeAreaProvider>{sheet}</SafeAreaProvider>
      </Modal>
    );
  }
  return <AndroidSheet reduceMotion={reduceMotion}>{sheet}</AndroidSheet>;
}

/**
 * Android's sheet: a view over the whole app, sliding up (or simply there, with reduced motion).
 * Its own SafeAreaProvider measures the insets of the space it covers.
 */
function AndroidSheet({ reduceMotion, children }: { reduceMotion: boolean; children: ReactNode }) {
  const { height } = useWindowDimensions();
  const [offset] = useState(() => new Animated.Value(reduceMotion ? 0 : 1));

  useEffect(() => {
    if (reduceMotion) {
      offset.setValue(0);
      return undefined;
    }
    const slide = Animated.timing(offset, {
      toValue: 0,
      duration: 260,
      easing: Easing.out(Easing.cubic),
      useNativeDriver: true,
    });
    slide.start();
    return () => slide.stop();
  }, [offset, reduceMotion]);

  const translateY = offset.interpolate({ inputRange: [0, 1], outputRange: [0, height] });
  return (
    <SafeAreaProvider style={styles.overlay} testID="helpkit-overlay">
      <Animated.View style={[styles.fill, { transform: [{ translateY }] }]}>{children}</Animated.View>
    </SafeAreaProvider>
  );
}

interface HelpSheetProps {
  projectId: string;
  config: HelpKitConfig;
  request: OpenRequest;
  onClose: () => void;
  events: RefObject<((event: 'fields' | 'signOut') => void) | null>;
}

function HelpSheet({ projectId, config, request, onClose, events }: HelpSheetProps) {
  const insets = useSafeAreaInsets();
  const device = useColorScheme();
  const android = Platform.OS === 'android';
  const keyboard = useKeyboardOverlap(android);
  const titleRef = useRef<Text | null>(null);

  const [phase, setPhase] = useState<Phase>({ kind: 'resolving' });
  const [page, setPage] = useState<PageSource | null>(null);
  const [up, setUp] = useState(false);
  const [spinner, setSpinner] = useState(true);
  const [progress, setProgress] = useState<number | null>(null);
  const [sheet] = useState(() =>
    createSheet({ setPhase, setPage, setUp, setSpinner, setProgress }, { projectId, config, request, close: onClose }),
  );

  // The latest props, read whenever the sheet needs them: a changed config is seen at once.
  useLayoutEffect(() => {
    sheet.update({ projectId, config, request, close: onClose });
  });

  useEffect(() => {
    sheet.start();
    return () => sheet.dispose();
  }, [sheet]);

  // A new open* while open.
  useEffect(() => {
    sheet.navigate(request);
  }, [sheet, request]);

  useEffect(() => {
    const listener = sheet.onEvent;
    events.current = listener;
    return () => {
      if (events.current === listener) events.current = null;
    };
  }, [sheet, events]);

  useEffect(() => {
    if (!android) return undefined;
    const subscription = BackHandler.addEventListener('hardwareBackPress', () => {
      sheet.back();
      return true;
    });
    return () => subscription.remove();
  }, [android, sheet]);

  // The title is where a screen reader starts.
  useEffect(() => {
    const timer = setTimeout(() => {
      const node = titleRef.current;
      if (node) AccessibilityInfo.sendAccessibilityEvent(node, 'focus');
    }, FOCUS_DELAY_MS);
    return () => clearTimeout(timer);
  }, []);

  const strings = sheetStrings(config?.strings);

  // iOS hears state changes this way; Android through the state view's live region.
  const said = useRef<Phase['kind']>('resolving');
  useEffect(() => {
    const before = said.current;
    said.current = phase.kind;
    if (Platform.OS !== 'ios' || before === phase.kind) return;
    const words =
      phase.kind === 'error'
        ? strings.errorTitle
        : phase.kind === 'unavailable'
          ? strings.unavailableTitle
          : phase.kind === 'resolving'
            ? strings.loading
            : null;
    if (words) AccessibilityInfo.announceForAccessibility(words);
  }, [phase.kind, strings.errorTitle, strings.unavailableTitle, strings.loading]);

  const site = phase.kind === 'page' ? phase.site : null;
  const theme = sheetTheme(site, device);
  const text = readableOn(theme.background);
  const title = sheetTitle([request.options.headerTitle, config?.headerTitle, site?.name], strings.help);
  const key = page?.key ?? -1;

  return (
    <View
      ref={keyboard.ref}
      onLayout={keyboard.onLayout}
      style={[styles.fill, { backgroundColor: theme.background }]}
      accessibilityViewIsModal
      testID="helpkit-sheet"
    >
      {/* Android: the sheet is under the status bar, so its icons are chosen to read on the header
          (and, where the app isn't edge-to-edge, the bar takes the header's colour). iOS: above a
          page sheet the status bar sits over the dimmed app, not the header, so it is left to the
          system. Both are on the README's device checklist. */}
      {android ? <StatusBar barStyle={theme.statusBar} backgroundColor={theme.header.bg} animated /> : null}
      <View
        style={{
          backgroundColor: theme.header.bg,
          paddingTop: insets.top,
          paddingLeft: insets.left,
          paddingRight: insets.right,
        }}
      >
        <Header
          title={title}
          colors={theme.header}
          backLabel={strings.back}
          closeLabel={strings.close}
          onBack={site && up ? sheet.back : null}
          onClose={onClose}
          titleRef={titleRef}
        />
        {progress !== null ? (
          <View
            testID="helpkit-progress"
            style={[styles.progress, { width: `${Math.round(progress * 100)}%`, backgroundColor: theme.header.fg }]}
          />
        ) : null}
      </View>

      <View style={[styles.fill, { paddingLeft: insets.left, paddingRight: insets.right }]}>
        {phase.kind === 'resolving' ? <StateView kind="loading" title={strings.loading} color={text} /> : null}
        {phase.kind === 'unavailable' ? (
          <StateView
            kind="unavailable"
            title={strings.unavailableTitle}
            body={strings.unavailableBody}
            retryLabel={strings.retry}
            onRetry={sheet.retry}
            color={text}
          />
        ) : null}
        {phase.kind === 'error' ? (
          <StateView
            kind="error"
            title={strings.errorTitle}
            body={strings.errorBody}
            retryLabel={strings.retry}
            onRetry={sheet.retry}
            color={text}
          />
        ) : null}
        {phase.kind === 'page' && page ? (
          <View style={styles.fill}>
            <WebView
              key={page.key}
              ref={sheet.attach}
              source={{ uri: page.uri }}
              style={[styles.fill, { backgroundColor: theme.background }]}
              originWhitelist={EVERY_ORIGIN}
              onShouldStartLoadWithRequest={(request: ShouldStartLoadRequest) =>
                sheet.onShouldStart({
                  url: request.url,
                  isTopFrame: request.isTopFrame,
                  hasTargetFrame: (request as { hasTargetFrame?: boolean }).hasTargetFrame,
                })
              }
              onOpenWindow={(event) => sheet.onOpenWindow(event.nativeEvent.targetUrl)}
              onMessage={(event) => sheet.onMessage(key, event.nativeEvent.data, event.nativeEvent.url)}
              onLoadStart={(event) => sheet.onLoadStart(key, event.nativeEvent.url, event.nativeEvent.loading)}
              onNavigationStateChange={(navigation) => sheet.onNavigation(key, navigation.url)}
              onLoadProgress={(event) => sheet.onProgress(key, event.nativeEvent.progress)}
              onLoadEnd={() => sheet.onLoadEnd(key)}
              onError={(event) => {
                // Ours to show, not the library's own error view.
                event.preventDefault();
                sheet.onError(key);
              }}
              onHttpError={(event) => sheet.onHttpError(key, event.nativeEvent.statusCode)}
              onRenderProcessGone={() => sheet.onProcessGone(key)}
              onContentProcessDidTerminate={() => sheet.onProcessGone(key)}
              javaScriptEnabled
              domStorageEnabled
              sharedCookiesEnabled={false}
              thirdPartyCookiesEnabled={false}
              allowsBackForwardNavigationGestures={false}
              applicationNameForUserAgent={USER_AGENT}
              // Development builds only. On Android this switches inspection on for every WebView
              // in the app, so `config.debug` never does it in a release build.
              {...(isDev() ? { webviewDebuggingEnabled: true } : null)}
            />
            {spinner ? (
              <View style={[StyleSheet.absoluteFill, { backgroundColor: theme.background }]}>
                <StateView kind="loading" title={strings.loading} color={text} />
              </View>
            ) : null}
          </View>
        ) : null}
      </View>

      <View style={{ height: Math.max(insets.bottom, keyboard.overlap), backgroundColor: theme.background }} />
    </View>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
  overlay: {
    position: 'absolute',
    top: 0,
    right: 0,
    bottom: 0,
    left: 0,
    zIndex: 100000,
    elevation: 100,
    shadowColor: 'transparent',
  },
  progress: {
    position: 'absolute',
    left: 0,
    bottom: 0,
    height: 2,
    opacity: 0.6,
  },
});
