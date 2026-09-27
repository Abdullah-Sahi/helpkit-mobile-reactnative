import { isMobileUrl, schemeOf } from './url';

/**
 * Where each navigation goes: into the sheet, out of the app, or nowhere. Pure functions of the URL
 * and the site's origin; HelpKit.tsx carries them out.
 *
 * | navigation | decision |
 * | --- | --- |
 * | a new window (`target=_blank`, `window.open`) to http(s) or mailto | outside |
 * | a sub-frame, of any kind | refuse: the app pages have none |
 * | top frame, http(s), the site's origin, exactly `/_mobile` or under `/_mobile/` | **stay** |
 * | any other http(s), the site's own full pages and `/uploads/…` included | outside |
 * | `mailto:` | outside |
 * | everything else: `about:`, `javascript:`, `data:`, `file:`, `blob:`, `intent:`, `tel:`, `sms:`, an app's own scheme | refuse |
 *
 * Article links are http(s) and mailto only (the page's Markdown keeps nothing else), so nothing
 * else ever needs to leave. "Outside" is the app's `onOpenLink` when it gives one, else `Linking`.
 *
 * This is not the only gate. On Android, react-native-webview waits 250 ms for this answer and then
 * lets the load go ahead, so HelpKit.tsx also checks every page that does load (`decideLoaded`),
 * and the pages open every link that leaves `/_mobile` in a new window, which never loads here.
 */

export type LinkDecision = 'stay' | 'outside' | 'refuse';

export interface NavigationRequest {
  url: string;
  /** iOS: false for a sub-frame. Android doesn't say. */
  isTopFrame?: boolean;
  /** iOS: false for a navigation into a new window. */
  hasTargetFrame?: boolean;
}

/** A link that may leave the app: to the browser, or to mail. */
function mayLeave(url: string): boolean {
  const scheme = schemeOf(url);
  return scheme === 'http' || scheme === 'https' || scheme === 'mailto';
}

/** A navigation the WebView asks about (`onShouldStartLoadWithRequest`). */
export function decideNavigation(request: NavigationRequest, origin: string): LinkDecision {
  const { url } = request;
  // A new window never opens inside the sheet, whatever it points at.
  if (request.hasTargetFrame === false) return decideNewWindow(url);
  if (request.isTopFrame === false) return 'refuse';
  const scheme = schemeOf(url);
  if (scheme === 'http' || scheme === 'https') return isMobileUrl(url, origin) ? 'stay' : 'outside';
  return scheme === 'mailto' ? 'outside' : 'refuse';
}

/** A new window the page asks for (`onOpenWindow`): out of the app, or nowhere. */
export function decideNewWindow(url: string): 'outside' | 'refuse' {
  return mayLeave(url) ? 'outside' : 'refuse';
}

/**
 * A page the WebView reports it is loading or has moved to — the check after the fact. `ok` for one
 * of the app pages; `ignore` for `about:blank` and its kin, which carry nothing; `recover` for
 * anything else, which must not stay under the app's header.
 */
export function decideLoaded(url: string, origin: string): 'ok' | 'ignore' | 'recover' {
  if (isMobileUrl(url, origin)) return 'ok';
  return schemeOf(url) === 'about' ? 'ignore' : 'recover';
}
