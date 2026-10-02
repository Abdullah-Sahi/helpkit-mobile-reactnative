import {
  allowedOrigin,
  cleanQuery,
  cleanSlug,
  isLocalDevHost,
  isMobileUrl,
  isOnOrigin,
  parseOrigin,
  schemeOf,
  viewPath,
} from '../url';

const SITE = 'https://acme.helpkit.app';

describe('view paths', () => {
  test('each call has its address under /_mobile, and nothing else rides along', () => {
    expect(viewPath({ view: 'home' })).toBe('/_mobile');
    expect(viewPath({ view: 'search', q: 'refund' })).toBe('/_mobile?q=refund');
    expect(viewPath({ view: 'search', q: 'a b&c=d/é' })).toBe('/_mobile?q=a%20b%26c%3Dd%2F%C3%A9');
    expect(viewPath({ view: 'article', slug: 'reset-your-password' })).toBe('/_mobile/articles/reset-your-password');
    expect(viewPath({ view: 'category', slug: 'billing' })).toBe('/_mobile/collections/billing');
    expect(viewPath({ view: 'contact' })).toBe('/_mobile/contact');
  });

  test('a view missing what it needs is the front page', () => {
    expect(viewPath({ view: 'article' })).toBe('/_mobile');
    expect(viewPath({ view: 'category' })).toBe('/_mobile');
    expect(viewPath({ view: 'search' })).toBe('/_mobile');
  });

  test('in another edition, its path comes first', () => {
    expect(viewPath({ view: 'home' }, 'de')).toBe('/_mobile/de');
    expect(viewPath({ view: 'search', q: 'rückgabe' }, 'de')).toBe('/_mobile/de?q=r%C3%BCckgabe');
    expect(viewPath({ view: 'article', slug: 'install' }, 'v2')).toBe('/_mobile/v2/articles/install');
    expect(viewPath({ view: 'category', slug: 'billing' }, 'zh-hans')).toBe('/_mobile/zh-hans/collections/billing');
    expect(viewPath({ view: 'contact' }, 'v2.1')).toBe('/_mobile/v2.1/contact');
    expect(viewPath({ view: 'article' }, 'de')).toBe('/_mobile/de');
  });

  test('the main edition, or anything that isn’t one segment, adds nothing', () => {
    expect(viewPath({ view: 'contact' }, '')).toBe('/_mobile/contact');
    for (const bad of ['..', 'de/x', 'DE', '-de', 'de-', 'a b', '%2e', 'x'.repeat(21), '/de']) {
      expect(viewPath({ view: 'article', slug: 'install' }, bad)).toBe('/_mobile/articles/install');
    }
  });

  test('an edition’s address is still one of the help center’s app pages', () => {
    expect(isMobileUrl(`${SITE}${viewPath({ view: 'article', slug: 'install' }, 'v2')}`, SITE)).toBe(true);
    expect(isMobileUrl(`${SITE}${viewPath({ view: 'home' }, 'de')}`, SITE)).toBe(true);
  });
});

describe('slugs and queries', () => {
  test('a slug is lowercase letters, digits and single hyphens, at most 80 long', () => {
    expect(cleanSlug('reset-your-password')).toBe('reset-your-password');
    expect(cleanSlug('a1')).toBe('a1');
    expect(cleanSlug('x'.repeat(80))).toBe('x'.repeat(80));
    for (const bad of ['x'.repeat(81), 'Reset', 'a--b', '-a', 'a-', 'a/b', '../x', 'a b', '', 'é', 42, null, undefined]) {
      expect(cleanSlug(bad)).toBeNull();
    }
  });

  test('a query is trimmed and cut to 100', () => {
    expect(cleanQuery('  refund  ')).toBe('refund');
    expect(cleanQuery('x'.repeat(150))).toBe('x'.repeat(100));
    expect(cleanQuery(`${'x'.repeat(99)}   y`)).toBe('x'.repeat(99));
    expect(cleanQuery('   ')).toBeNull();
    expect(cleanQuery(7)).toBeNull();
  });
});

describe('parseOrigin', () => {
  test('canonical: lowercase, no default port, reduced to the origin', () => {
    expect(parseOrigin('https://ACME.HelpKit.app/')?.origin).toBe(SITE);
    expect(parseOrigin('HTTPS://acme.helpkit.app:443/x?y#z')?.origin).toBe(SITE);
    expect(parseOrigin('http://localhost:80')?.origin).toBe('http://localhost');
    expect(parseOrigin('http://acme.localhost:3212')?.origin).toBe('http://acme.localhost:3212');
    expect(parseOrigin('https://app.example.com/helpkit')?.rest).toBe('/helpkit');
  });

  test('hostile and unusable addresses are none', () => {
    for (const bad of [
      'https://acme.helpkit.app@evil.com/',
      'https://user:pass@acme.helpkit.app/',
      'https://acme.helpkit.app\\@evil.com/',
      'https://acme.helpkit.app%2eevil.com/',
      'https://acme.helpkit.app./',
      'https://[::1]/',
      'https://acme.helpkit.app:0/',
      'https://acme.helpkit.app:65536/',
      'https://acme .helpkit.app/',
      'https://acme.helpkit.app/a b',
      'https:acme.helpkit.app',
      '//acme.helpkit.app',
      'javascript://acme.helpkit.app/%0aalert(1)',
      'ftp://acme.helpkit.app',
      'file:///etc/passwd',
      '',
      42,
      null,
    ]) {
      expect(parseOrigin(bad)).toBeNull();
    }
  });
});

describe('the http rule', () => {
  test('https is always allowed', () => {
    expect(allowedOrigin('https://app.example.com', false)?.origin).toBe('https://app.example.com');
    expect(allowedOrigin('https://app.example.com', true)?.origin).toBe('https://app.example.com');
  });

  test('http only in development, and only for a local address', () => {
    const local = [
      'http://localhost:3212',
      'http://127.0.0.1:3212',
      'http://10.0.2.2:3212',
      'http://acme.localhost:3212',
      'http://acme.192-168-1-20.nip.io:3212',
      'http://acme.192-168-1-20.sslip.io',
      'http://192.168.1.20:3212',
      'http://172.16.0.4',
      'http://172.31.255.1',
      'http://10.1.2.3',
    ];
    for (const address of local) {
      expect(allowedOrigin(address, true)).not.toBeNull();
      expect(allowedOrigin(address, false)).toBeNull();
    }
    for (const remote of ['http://app.example.com', 'http://172.32.0.1', 'http://8.8.8.8', 'http://nip.io', 'http://999.1.1.1']) {
      expect(allowedOrigin(remote, true)).toBeNull();
    }
  });

  test('local hosts', () => {
    expect(isLocalDevHost('localhost')).toBe(true);
    expect(isLocalDevHost('evil-localhost.com')).toBe(false);
    expect(isLocalDevHost('localhost.evil.com')).toBe(false);
    expect(isLocalDevHost('nip.io.evil.com')).toBe(false);
  });
});

describe('comparing by prefix', () => {
  test('on the origin', () => {
    expect(isOnOrigin(SITE, SITE)).toBe(true);
    expect(isOnOrigin(`${SITE}/`, SITE)).toBe(true);
    expect(isOnOrigin(`${SITE}?q`, SITE)).toBe(true);
    expect(isOnOrigin(`${SITE}#x`, SITE)).toBe(true);
    expect(isOnOrigin(`${SITE}.evil.com/`, SITE)).toBe(false);
    expect(isOnOrigin(`${SITE}@evil.com/`, SITE)).toBe(false);
    expect(isOnOrigin(`${SITE}:8443/`, SITE)).toBe(false);
    expect(isOnOrigin('https://ACME.helpkit.app/', SITE)).toBe(false);
    expect(isOnOrigin('http://acme.helpkit.app/', SITE)).toBe(false);
  });

  test('the app pages: /_mobile exactly or under it, in exact case', () => {
    for (const good of ['/_mobile', '/_mobile/', '/_mobile?q=x', '/_mobile#top', '/_mobile/articles/x', '/_mobile/contact?from=x']) {
      expect(isMobileUrl(`${SITE}${good}`, SITE)).toBe(true);
    }
    for (const bad of [
      '',
      '/',
      '/_mobilex',
      '/_MOBILE',
      '/_Mobile/x',
      '/articles/x',
      '/uploads/x.png',
      '/_mobile/../articles/x',
      '/_mobile/./x',
      '/_mobile/%2e%2e/x',
      '/_mobile/%2E%2E/x',
      '/_mobile%2farticles',
      '/_mobile\\..\\x',
      '/help-mobile/acme',
    ]) {
      expect(isMobileUrl(`${SITE}${bad}`, SITE)).toBe(false);
    }
    expect(isMobileUrl('https://evil.com/_mobile', SITE)).toBe(false);
    expect(isMobileUrl(`${SITE}.evil.com/_mobile`, SITE)).toBe(false);
    expect(isMobileUrl(`${SITE}@evil.com/_mobile`, SITE)).toBe(false);
  });

  test('schemes', () => {
    expect(schemeOf('HTTPS://x')).toBe('https');
    expect(schemeOf('mailto:a@b.c')).toBe('mailto');
    expect(schemeOf('about:blank')).toBe('about');
    expect(schemeOf('/relative')).toBeNull();
  });
});
