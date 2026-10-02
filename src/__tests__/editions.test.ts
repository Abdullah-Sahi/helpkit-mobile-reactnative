import { chooseEdition, editionInLanguage, type Edition } from '../editions';

const MAIN: Edition = { path: '', kind: 'main', language: 'en', label: 'English' };
const GERMAN: Edition = { path: 'de', kind: 'language', language: 'de', label: 'Deutsch' };
const BOKMAL: Edition = { path: 'nb', kind: 'language', language: 'nb', label: 'Norsk bokmål' };
const SIMPLIFIED: Edition = { path: 'zh-hans', kind: 'language', language: 'zh-Hans', label: '简体中文' };
const TRADITIONAL: Edition = { path: 'zh-hant', kind: 'language', language: 'zh-Hant', label: '繁體中文' };
const V2: Edition = { path: 'v2', kind: 'version', language: 'en', label: 'v2' };
const V2_GERMAN: Edition = { path: 'v2-de', kind: 'version', language: 'de', label: 'v2 (Deutsch)' };

const ALL = [MAIN, GERMAN, BOKMAL, SIMPLIFIED, TRADITIONAL, V2, V2_GERMAN];

describe('a language', () => {
  test('its exact tag first, in any case or with an underscore', () => {
    expect(editionInLanguage('de', ALL)).toBe('de');
    expect(editionInLanguage('ZH-hant', ALL)).toBe('zh-hant');
    expect(editionInLanguage('zh_Hans', ALL)).toBe('zh-hans');
    expect(editionInLanguage('en', ALL)).toBe('');
  });

  test('then the same language, wherever it is spoken', () => {
    expect(editionInLanguage('de-AT', ALL)).toBe('de');
    expect(editionInLanguage('de_CH', ALL)).toBe('de');
    expect(editionInLanguage('en-GB', ALL)).toBe('');
    expect(editionInLanguage('en-Latn-US', ALL)).toBe('');
  });

  test('Chinese by script: the tag’s own, else by its region as a browser’s Intl.Locale would', () => {
    expect(editionInLanguage('zh-Hant-HK', ALL)).toBe('zh-hant');
    expect(editionInLanguage('zh-TW', ALL)).toBe('zh-hant');
    expect(editionInLanguage('zh-HK', ALL)).toBe('zh-hant');
    expect(editionInLanguage('zh-MO', ALL)).toBe('zh-hant');
    expect(editionInLanguage('zh-CN', ALL)).toBe('zh-hans');
    expect(editionInLanguage('zh-SG', ALL)).toBe('zh-hans');
    expect(editionInLanguage('zh', ALL)).toBe('zh-hans');
    expect(editionInLanguage('zh-US', ALL)).toBe('zh-hant');
    expect(editionInLanguage('zh-Hans-US', ALL)).toBe('zh-hans');
    expect(editionInLanguage('zh-TW', [MAIN, SIMPLIFIED])).toBeNull();
  });

  test('old codes some phones still report', () => {
    expect(editionInLanguage('no', ALL)).toBe('nb');
    expect(editionInLanguage('no-NO', ALL)).toBe('nb');
    expect(editionInLanguage('nn', ALL)).toBeNull();
    expect(editionInLanguage('iw-IL', [MAIN, { path: 'he', kind: 'language', language: 'he', label: 'עברית' }])).toBe('he');
    expect(editionInLanguage('in', [MAIN, { path: 'id', kind: 'language', language: 'id', label: 'Bahasa Indonesia' }])).toBe('id');
  });

  test('never a version, and nothing for a language the site isn’t written in', () => {
    expect(editionInLanguage('de', [MAIN, V2_GERMAN])).toBeNull();
    expect(editionInLanguage('fr', ALL)).toBeNull();
    expect(editionInLanguage('German', ALL)).toBeNull();
    expect(editionInLanguage(null, ALL)).toBeNull();
    expect(editionInLanguage('de', [])).toBeNull();
  });
});

describe('choosing', () => {
  test('a version the site offers, by its label', () => {
    expect(chooseEdition(ALL, { version: 'v2', language: null })).toEqual({ path: 'v2', unknownVersion: null });
    expect(chooseEdition(ALL, { version: ' V2-DE ', language: null })).toEqual({ path: 'v2-de', unknownVersion: null });
  });

  test('a version comes before the language', () => {
    expect(chooseEdition(ALL, { version: 'v2', language: 'de' })).toEqual({ path: 'v2', unknownVersion: null });
  });

  test('a version is matched among the versions only', () => {
    expect(chooseEdition(ALL, { version: 'de', language: null })).toEqual({ path: '', unknownVersion: 'de' });
  });

  test('a version the site doesn’t offer falls through to the language, then the main edition, and is named', () => {
    expect(chooseEdition(ALL, { version: 'v3', language: 'de-AT' })).toEqual({ path: 'de', unknownVersion: 'v3' });
    expect(chooseEdition(ALL, { version: 'v3', language: null })).toEqual({ path: '', unknownVersion: 'v3' });
    expect(chooseEdition([], { version: 'v2', language: 'de' })).toEqual({ path: '', unknownVersion: 'v2' });
  });

  test('the language, else the main edition', () => {
    expect(chooseEdition(ALL, { version: null, language: 'de' })).toEqual({ path: 'de', unknownVersion: null });
    expect(chooseEdition(ALL, { version: '  ', language: 'fr' })).toEqual({ path: '', unknownVersion: null });
    expect(chooseEdition(ALL, { version: null, language: null })).toEqual({ path: '', unknownVersion: null });
  });
});
