/**
 * The SDK's console. Two kinds of line, and neither ever carries a contact field's value:
 *
 * - **warnings**, in development builds only, for something the app's developer should fix;
 * - **diagnostics**, only when the app sets `config.debug`.
 */

const PREFIX = '[HelpKit]';

/** A development build: `__DEV__`, looked for safely, so plain Node (the scripts) can load this too. */
export function isDev(): boolean {
  return typeof __DEV__ !== 'undefined' && __DEV__ === true;
}

const said = new Set<string>();

/** A warning for the app's developer, in development builds only; with `once`, only the first time. */
export function devWarn(message: string, once?: string): void {
  if (!isDev()) return;
  if (once) {
    if (said.has(once)) return;
    said.add(once);
  }
  console.warn(`${PREFIX} ${message}`);
}

/** A diagnostic line, when the app asked for them. */
export function debugLog(enabled: boolean | undefined, message: string): void {
  if (enabled === true) console.log(`${PREFIX} ${message}`);
}

/** For tests: every once-only warning may be said again. */
export function forgetWarnings(): void {
  said.clear();
}
