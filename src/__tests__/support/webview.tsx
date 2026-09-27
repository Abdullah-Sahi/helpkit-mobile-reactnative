import { forwardRef, useEffect, useImperativeHandle, useState } from 'react';
import { View } from 'react-native';

/**
 * A stand-in for react-native-webview's WebView: a plain View that keeps the props it was given,
 * and whose ref offers the methods the SDK calls, as jest.fn()s. Tests read the props and call its
 * event handlers themselves, as the real WebView would.
 */

export interface MockWebViewHandle {
  injectJavaScript: jest.Mock;
  stopLoading: jest.Mock;
  reload: jest.Mock;
  goBack: jest.Mock;
}

export interface MockWebViewInstance {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- the WebView's props, as given
  props: Record<string, any>;
  handle: MockWebViewHandle;
  mounted: boolean;
}

/** Every WebView made, oldest first. */
export const webViews: MockWebViewInstance[] = [];

export function lastWebView(): MockWebViewInstance {
  const instance = webViews[webViews.length - 1];
  if (!instance) throw new Error('No WebView has been drawn.');
  return instance;
}

export function forgetWebViews(): void {
  webViews.length = 0;
}

// eslint-disable-next-line @typescript-eslint/no-explicit-any -- the WebView's props, as given
export const WebView = forwardRef<MockWebViewHandle, Record<string, any>>(function MockWebView(props, ref) {
  const [instance] = useState<MockWebViewInstance>(() => {
    const made: MockWebViewInstance = {
      props,
      handle: { injectJavaScript: jest.fn(), stopLoading: jest.fn(), reload: jest.fn(), goBack: jest.fn() },
      mounted: true,
    };
    webViews.push(made);
    return made;
  });
  instance.props = props;
  useImperativeHandle(ref, () => instance.handle, [instance]);
  useEffect(
    () => () => {
      instance.mounted = false;
    },
    [instance],
  );
  return <View testID="helpkit-webview" />;
});

export default WebView;
