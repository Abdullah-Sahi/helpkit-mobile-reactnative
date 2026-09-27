import type { RefObject } from 'react';
import { I18nManager, Pressable, StyleSheet, Text, View } from 'react-native';
import type { Colors } from './theme';

/**
 * The sheet's header: `[Back] Title [Close]`, drawn natively above the help center's pages.
 *
 * - The title sits in the middle, between two slots of the same width, and is the screen reader's
 *   heading. It keeps to one line, and large text can't push the buttons off.
 * - Back is there only while the page says it has somewhere to go back to. Close is always there —
 *   on a bare error page too — so the reader can always get out.
 * - Both buttons are labelled for screen readers and at least 44 points square. The icons are
 *   plain Views: no icon font, no SVG. Back points the way the app reads (right-to-left too).
 */

const SIZE = 44;
const HIT_SLOP = { top: 6, bottom: 6, left: 6, right: 6 };

export interface HeaderProps {
  title: string;
  colors: Colors;
  backLabel: string;
  closeLabel: string;
  /** Null when the page has nowhere to go back to: no Back is drawn. */
  onBack: (() => void) | null;
  onClose: () => void;
  titleRef?: RefObject<Text | null>;
}

export function Header({ title, colors, backLabel, closeLabel, onBack, onClose, titleRef }: HeaderProps) {
  return (
    <View style={[styles.bar, { backgroundColor: colors.bg }]}>
      <View style={styles.slot}>
        {onBack ? (
          <Pressable
            testID="helpkit-back"
            onPress={onBack}
            accessibilityRole="button"
            accessibilityLabel={backLabel}
            hitSlop={HIT_SLOP}
            style={({ pressed }) => [styles.button, pressed && styles.pressed]}
          >
            <Chevron color={colors.fg} />
          </Pressable>
        ) : null}
      </View>
      <Text
        ref={titleRef}
        testID="helpkit-title"
        accessibilityRole="header"
        numberOfLines={1}
        maxFontSizeMultiplier={1.3}
        style={[styles.title, { color: colors.fg }]}
      >
        {title}
      </Text>
      <View style={styles.slot}>
        <Pressable
          testID="helpkit-close"
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel={closeLabel}
          hitSlop={HIT_SLOP}
          style={({ pressed }) => [styles.button, pressed && styles.pressed]}
        >
          <Cross color={colors.fg} />
        </Pressable>
      </View>
    </View>
  );
}

/** A chevron from two sides of a square, turned to point back: left, or right in a right-to-left app. */
function Chevron({ color }: { color: string }) {
  const rtl = I18nManager.isRTL;
  return (
    <View
      style={[
        styles.chevron,
        { borderColor: color, transform: [{ translateX: rtl ? -2 : 2 }, { rotate: rtl ? '-135deg' : '45deg' }] },
      ]}
    />
  );
}

/** Two crossed bars. */
function Cross({ color }: { color: string }) {
  return (
    <View style={styles.cross}>
      <View style={[styles.bar2, { backgroundColor: color, transform: [{ rotate: '45deg' }] }]} />
      <View style={[styles.bar2, { backgroundColor: color, transform: [{ rotate: '-45deg' }] }]} />
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    minHeight: 52,
    flexDirection: 'row',
    alignItems: 'center',
    paddingHorizontal: 4,
  },
  slot: {
    width: SIZE + 8,
    alignItems: 'center',
    justifyContent: 'center',
  },
  button: {
    width: SIZE,
    height: SIZE,
    borderRadius: SIZE / 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  pressed: {
    opacity: 0.6,
  },
  title: {
    flex: 1,
    textAlign: 'center',
    fontSize: 17,
    fontWeight: '600',
  },
  chevron: {
    width: 12,
    height: 12,
    borderLeftWidth: 2,
    borderBottomWidth: 2,
  },
  cross: {
    width: 18,
    height: 18,
    alignItems: 'center',
    justifyContent: 'center',
  },
  bar2: {
    position: 'absolute',
    width: 20,
    height: 2,
    borderRadius: 1,
  },
});
