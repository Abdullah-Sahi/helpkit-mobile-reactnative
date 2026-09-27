import { decideLoaded, decideNavigation, decideNewWindow, type NavigationRequest } from '../links';

const SITE = 'https://acme.helpkit.app';

const top = (url: string, extra: Partial<NavigationRequest> = {}): NavigationRequest => ({ url, isTopFrame: true, ...extra });

describe('the link policy (links.ts table)', () => {
  test.each([
    ['the front page', `${SITE}/_mobile`, 'stay'],
    ['a search box', `${SITE}/_mobile?q=refund`, 'stay'],
    ['an article', `${SITE}/_mobile/articles/reset`, 'stay'],
    ['a collection', `${SITE}/_mobile/collections/billing`, 'stay'],
    ['the contact view', `${SITE}/_mobile/contact?from=reset`, 'stay'],
    ['the site’s full article page', `${SITE}/articles/reset`, 'outside'],
    ['the site’s front page', `${SITE}/`, 'outside'],
    ['an upload', `${SITE}/uploads/a.png`, 'outside'],
    ['/_MOBILE in another case', `${SITE}/_MOBILE`, 'outside'],
    ['/_mobile on another site', 'https://evil.com/_mobile', 'outside'],
    ['a look-alike host', `${SITE}.evil.com/_mobile`, 'outside'],
    ['user info', `${SITE}@evil.com/_mobile`, 'outside'],
    ['another site', 'https://example.com/page', 'outside'],
    ['plain http elsewhere', 'http://example.com/', 'outside'],
    ['mail', 'mailto:help@acme.com', 'outside'],
    ['about:blank in the top frame', 'about:blank', 'refuse'],
    ['about:srcdoc', 'about:srcdoc', 'refuse'],
    ['javascript:', 'javascript:alert(1)', 'refuse'],
    ['data:', 'data:text/html,<p>hi</p>', 'refuse'],
    ['file:', 'file:///etc/passwd', 'refuse'],
    ['blob:', `blob:${SITE}/1234`, 'refuse'],
    ['intent:', 'intent://scan/#Intent;scheme=zxing;end', 'refuse'],
    ['tel:', 'tel:+15551234', 'refuse'],
    ['sms:', 'sms:+15551234', 'refuse'],
    ['an app’s own scheme', 'myapp://settings', 'refuse'],
    ['no scheme', '/_mobile', 'refuse'],
  ])('%s', (_name, url, expected) => {
    expect(decideNavigation(top(url), SITE)).toBe(expected);
  });

  test('Android says nothing of frames: treated as the top frame', () => {
    expect(decideNavigation({ url: `${SITE}/_mobile/articles/x` }, SITE)).toBe('stay');
    expect(decideNavigation({ url: 'https://example.com/' }, SITE)).toBe('outside');
  });

  test('a sub-frame never loads anything: the app pages have none', () => {
    expect(decideNavigation(top('https://www.youtube.com/embed/x', { isTopFrame: false }), SITE)).toBe('refuse');
    expect(decideNavigation(top(`${SITE}/_mobile`, { isTopFrame: false }), SITE)).toBe('refuse');
  });

  test('a new window (iOS: no target frame) never opens inside the sheet', () => {
    expect(decideNavigation(top('https://example.com/', { hasTargetFrame: false }), SITE)).toBe('outside');
    expect(decideNavigation(top(`${SITE}/_mobile/articles/x`, { hasTargetFrame: false }), SITE)).toBe('outside');
    expect(decideNavigation(top('mailto:a@b.c', { hasTargetFrame: false, isTopFrame: false }), SITE)).toBe('outside');
    expect(decideNavigation(top('javascript:alert(1)', { hasTargetFrame: false }), SITE)).toBe('refuse');
  });
});

describe('new windows', () => {
  test('http(s) and mail leave; nothing else does', () => {
    expect(decideNewWindow('https://example.com/')).toBe('outside');
    expect(decideNewWindow('http://example.com/')).toBe('outside');
    expect(decideNewWindow('mailto:a@b.c')).toBe('outside');
    for (const url of ['javascript:alert(1)', 'data:text/html,x', 'myapp://x', 'tel:1', 'about:blank', 'file:///x']) {
      expect(decideNewWindow(url)).toBe('refuse');
    }
  });
});

describe('the check after the fact', () => {
  test('the app pages are fine; about: carries nothing; anything else is taken away', () => {
    expect(decideLoaded(`${SITE}/_mobile/articles/x`, SITE)).toBe('ok');
    expect(decideLoaded('about:blank', SITE)).toBe('ignore');
    expect(decideLoaded('https://evil.com/login', SITE)).toBe('recover');
    expect(decideLoaded(`${SITE}/articles/x`, SITE)).toBe('recover');
    expect(decideLoaded('data:text/html,x', SITE)).toBe('recover');
  });
});
