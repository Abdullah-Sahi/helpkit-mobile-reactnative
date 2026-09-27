import { colorPair, NEUTRAL, readableOn, schemeFor, sheetTheme, type ThemedSite } from '../theme';

const branded: ThemedSite = {
  theme: 'auto',
  header: { light: { bg: '#0F766E', fg: '#FFFFFF' }, dark: { bg: '#0C5D57', fg: '#FFFFFF' } },
  background: { light: '#FFFFFF', dark: '#0C0A09' },
};

describe('light or dark, by the page’s rule', () => {
  test('a light or dark site is always that; auto follows the device', () => {
    expect(schemeFor('light', 'dark')).toBe('light');
    expect(schemeFor('dark', 'light')).toBe('dark');
    expect(schemeFor('auto', 'dark')).toBe('dark');
    expect(schemeFor('auto', 'light')).toBe('light');
    expect(schemeFor('auto', null)).toBe('light');
    expect(schemeFor('auto', 'unspecified')).toBe('light');
  });
});

describe('the sheet’s colours', () => {
  test('before the site is known: the page’s neutral pair for the device', () => {
    expect(sheetTheme(null, 'light')).toMatchObject({ header: NEUTRAL.light, background: '#FFFFFF', statusBar: 'dark-content' });
    expect(sheetTheme(null, 'dark')).toMatchObject({ header: NEUTRAL.dark, background: '#0C0A09', statusBar: 'light-content' });
  });

  test('branded: the band’s colour in light, dimmed in dark, as the resolver worked them out', () => {
    expect(sheetTheme(branded, 'light')).toEqual({
      scheme: 'light',
      header: { bg: '#0F766E', fg: '#FFFFFF' },
      background: '#FFFFFF',
      statusBar: 'light-content',
    });
    expect(sheetTheme(branded, 'dark')).toMatchObject({ header: { bg: '#0C5D57' }, background: '#0C0A09' });
  });

  test('a site fixed to light stays light on a dark device', () => {
    expect(sheetTheme({ ...branded, theme: 'light' }, 'dark').header.bg).toBe('#0F766E');
  });

  test('a pale header gets dark status-bar icons', () => {
    const pale: ThemedSite = { ...branded, header: { light: { bg: '#FDE68A', fg: '#1C1917' }, dark: NEUTRAL.dark } };
    expect(sheetTheme(pale, 'light').statusBar).toBe('dark-content');
  });
});

describe('checking a colour pair', () => {
  test('a good pair is kept, in capitals', () => {
    expect(colorPair({ bg: '#0f766e', fg: '#ffffff' }, NEUTRAL.light)).toEqual({ bg: '#0F766E', fg: '#FFFFFF' });
  });

  test('a bad text colour is worked out from the background', () => {
    expect(colorPair({ bg: '#0F766E', fg: 'white' }, NEUTRAL.light)).toEqual({ bg: '#0F766E', fg: '#FFFFFF' });
    expect(colorPair({ bg: '#FDE68A' }, NEUTRAL.light)).toEqual({ bg: '#FDE68A', fg: '#1C1917' });
  });

  test('a bad background falls back to the page’s own pair', () => {
    for (const bad of [{ bg: 'red', fg: '#FFFFFF' }, { bg: '#FFF' }, { bg: '#GGGGGG' }, null, 'x', 7]) {
      expect(colorPair(bad, NEUTRAL.dark)).toEqual(NEUTRAL.dark);
    }
  });

  test('readable text', () => {
    expect(readableOn('#000000')).toBe('#FFFFFF');
    expect(readableOn('#FFFFFF')).toBe('#1C1917');
    expect(readableOn('#0F766E')).toBe('#FFFFFF');
  });
});
