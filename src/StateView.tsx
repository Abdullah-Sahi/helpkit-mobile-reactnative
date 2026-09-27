import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

/**
 * What the sheet shows in place of the help center: while it is found, when there is none to show,
 * and when it couldn't be loaded. Native, so it works with no network and no page. Each change is
 * announced to screen readers — here as a live region on Android; HelpKit.tsx announces on iOS.
 */

export type StateKind = 'loading' | 'unavailable' | 'error';

export interface StateViewProps {
  kind: StateKind;
  title: string;
  body?: string;
  retryLabel?: string;
  onRetry?: () => void;
  /** Text on the sheet's background. */
  color: string;
}

export function StateView({ kind, title, body, retryLabel, onRetry, color }: StateViewProps) {
  if (kind === 'loading') {
    return (
      <View style={styles.center} accessibilityLiveRegion="polite" testID="helpkit-loading">
        <ActivityIndicator color={color} accessibilityLabel={title} />
      </View>
    );
  }
  return (
    <View style={styles.center} accessibilityLiveRegion="polite" testID={`helpkit-${kind}`}>
      <Text style={[styles.title, { color }]} accessibilityRole="header">
        {title}
      </Text>
      {body ? <Text style={[styles.body, { color }]}>{body}</Text> : null}
      {onRetry && retryLabel ? (
        <Pressable
          testID="helpkit-retry"
          onPress={onRetry}
          accessibilityRole="button"
          accessibilityLabel={retryLabel}
          style={({ pressed }) => [styles.retry, { borderColor: color }, pressed && styles.pressed]}
        >
          <Text style={[styles.retryText, { color }]}>{retryLabel}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    paddingHorizontal: 32,
    paddingBottom: 48,
  },
  title: {
    fontSize: 17,
    fontWeight: '600',
    textAlign: 'center',
  },
  body: {
    marginTop: 8,
    fontSize: 15,
    lineHeight: 21,
    textAlign: 'center',
    opacity: 0.75,
  },
  retry: {
    marginTop: 20,
    minHeight: 44,
    minWidth: 120,
    paddingHorizontal: 20,
    borderRadius: 22,
    borderWidth: StyleSheet.hairlineWidth * 2,
    alignItems: 'center',
    justifyContent: 'center',
  },
  retryText: {
    fontSize: 15,
    fontWeight: '600',
  },
  pressed: {
    opacity: 0.6,
  },
});
