import { useCallback, useEffect, useRef, useState } from 'react';
import { Keyboard, type KeyboardEvent, type View } from 'react-native';

/**
 * Keeping the contact form above the keyboard on Android.
 *
 * On Android the sheet is a view in the app's own window, not a Modal (HelpKit.tsx says why). In an
 * app that draws edge to edge — every app on Android 15 and later — the window no longer shrinks
 * for the keyboard, so the sheet makes room itself: it measures how far the keyboard reaches over
 * it and pads its bottom by that much, which shrinks the WebView, which tells the page (its visual
 * viewport shrinks) to bring the field being typed in back into view.
 *
 * When the window does shrink (an older app that resizes for the keyboard), the sheet's bottom is
 * already above the keyboard, the overlap is 0, and nothing is added twice.
 */

/** How far a keyboard whose top is at `keyboardTop` reaches over a frame ending at `frameBottom`. */
export function keyboardOverlap(frameBottom: number, keyboardTop: number | null): number {
  if (keyboardTop === null || !Number.isFinite(keyboardTop) || !Number.isFinite(frameBottom)) return 0;
  return Math.max(0, Math.round(frameBottom - keyboardTop));
}

export function useKeyboardOverlap(enabled: boolean) {
  const ref = useRef<View | null>(null);
  const keyboardTop = useRef<number | null>(null);
  const [overlap, setOverlap] = useState(0);

  const measure = useCallback(() => {
    const view = ref.current;
    if (!view || typeof view.measureInWindow !== 'function') return;
    view.measureInWindow((_x, y, _width, height) => {
      setOverlap(keyboardOverlap(y + height, keyboardTop.current));
    });
  }, []);

  useEffect(() => {
    if (!enabled) return undefined;
    const shown = Keyboard.addListener('keyboardDidShow', (event: KeyboardEvent) => {
      keyboardTop.current = event.endCoordinates.screenY;
      measure();
    });
    const hidden = Keyboard.addListener('keyboardDidHide', () => {
      keyboardTop.current = null;
      setOverlap(0);
    });
    return () => {
      shown.remove();
      hidden.remove();
    };
  }, [enabled, measure]);

  return { ref, overlap: enabled ? overlap : 0, onLayout: enabled ? measure : undefined };
}
