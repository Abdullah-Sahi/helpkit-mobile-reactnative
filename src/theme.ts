/**
 * The sheet's colours: its header, the background behind the page, and the status bar's icons.
 * Pure functions, from the resolver's answer and the device's colour scheme.
 *
 * The resolver sends the header for each theme, worked out exactly as the page draws its own band
 * (so the two meet without a seam), and the page's background for each. Which of each pair is
 * drawn follows the page's own rule: a site set to `light` or `dark` is always that; `auto` follows
 * the device.
 */

export interface Colors {
  /** Background, `#RRGGBB`. */
  bg: string;
  /** Text and icons on it, `#RRGGBB`. */
  fg: string;
}

export type SiteTheme = 'light' | 'dark' | 'auto';

export interface ThemePair<T> {
  light: T;
  dark: T;
}

/** The page's own background and text in each theme, for the sheet before the site is known. */
export const NEUTRAL: ThemePair<Colors> = {
  light: { bg: '#FFFFFF', fg: '#1C1917' },
  dark: { bg: '#0C0A09', fg: '#FAFAF9' },
};

export interface SheetTheme {
  scheme: 'light' | 'dark';
  header: Colors;
  /** Behind the WebView and under the home indicator, so nothing flashes white in dark mode. */
  background: string;
  /** Status-bar icons that read on the header. */
  statusBar: 'light-content' | 'dark-content';
}

export function isHexColor(value: unknown): value is string {
  return typeof value === 'string' && /^#[0-9A-Fa-f]{6}$/.test(value);
}

/** Relative luminance (WCAG) of a `#RRGGBB` colour, 0 to 1. */
export function luminance(hex: string): number {
  const channel = (at: number) => {
    const value = parseInt(hex.slice(at, at + 2), 16) / 255;
    return value <= 0.03928 ? value / 12.92 : ((value + 0.055) / 1.055) ** 2.4;
  };
  return 0.2126 * channel(1) + 0.7152 * channel(3) + 0.0722 * channel(5);
}

/** Whichever of white or near-black reads better on a colour. */
export function readableOn(bg: string): string {
  const light = luminance(bg);
  // Contrast against white vs against #1C1917, whose luminance is about 0.010.
  return 1.05 / (light + 0.05) >= (light + 0.05) / 0.06 ? '#FFFFFF' : '#1C1917';
}

/**
 * A header colour pair from the resolver, checked: both colours `#RRGGBB`. A bad text colour is
 * worked out from the background; a bad background falls back to the page's own pair.
 */
export function colorPair(value: unknown, fallback: Colors): Colors {
  if (typeof value !== 'object' || value === null) return fallback;
  const { bg, fg } = value as Record<string, unknown>;
  if (!isHexColor(bg)) return fallback;
  return { bg: bg.toUpperCase(), fg: isHexColor(fg) ? fg.toUpperCase() : readableOn(bg) };
}

/** Light or dark, by the page's rule: fixed for a `light` or `dark` site, the device's for `auto`. */
export function schemeFor(theme: SiteTheme, device: string | null | undefined): 'light' | 'dark' {
  if (theme === 'light' || theme === 'dark') return theme;
  return device === 'dark' ? 'dark' : 'light';
}

export interface ThemedSite {
  theme: SiteTheme;
  header: ThemePair<Colors>;
  background: ThemePair<string>;
}

/** The sheet's colours now. Before the site is known, the page's neutral pair for the device's scheme. */
export function sheetTheme(site: ThemedSite | null, device: string | null | undefined): SheetTheme {
  const scheme = schemeFor(site?.theme ?? 'auto', device);
  const header = site ? site.header[scheme] : NEUTRAL[scheme];
  const background = site ? site.background[scheme] : NEUTRAL[scheme].bg;
  return {
    scheme,
    header,
    background,
    statusBar: luminance(header.fg) > 0.5 ? 'light-content' : 'dark-content',
  };
}
