import { TestBed } from '@angular/core/testing';
import { beforeEach, describe, expect, it } from 'vitest';
import { DOCUMENT } from '@angular/common';
import {
  MOTION_STORAGE_KEY,
  THEME_STORAGE_KEY,
  ThemeService,
} from './theme.service';

/**
 * ThemeService — focused verification for m1-dark-theme-and-service.
 *
 * Guards the assertions this feature fulfills:
 *   - VAL-DS-005: ThemeService applies the choice (data-theme + color-scheme
 *     via tokens.css) before first paint. The no-flash guarantee itself is
 *     proven by the browser reload probe (see docs/task-evidence); this spec
 *     proves the service owns the document state after boot.
 *   - VAL-DS-006: theme choice persists to localStorage (preference-only),
 *     `system` mode follows prefers-color-scheme live, and the cycle order is
 *     system → light → dark → system.
 *   - VAL-DS-007: reduceMotion preference is wired (applies a document flag the
 *     token CSS turns into reduced motion; OS path already worked via @media).
 *
 * matchMedia is stubbed per-test so the OS preference is controllable.
 * localStorage is provided by jsdom and cleared between tests.
 */

/** Build a stub MediaQueryList whose `matches` and listeners we control. */
function stubMql(initialMatches: boolean): { mql: MediaQueryList; setMatches: (m: boolean) => void } {
  const listeners = new Set<(e: MediaQueryListEvent) => void>();
  let matches = initialMatches;
  const mql = {
    matches,
    media: '',
    onchange: null,
    addEventListener: (_type: string, listener: (e: MediaQueryListEvent) => void) => {
      listeners.add(listener);
    },
    removeEventListener: (_type: string, listener: (e: MediaQueryListEvent) => void) => {
      listeners.delete(listener);
    },
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  } as unknown as MediaQueryList;
  const setMatches = (m: boolean): void => {
    matches = m;
    (mql as { matches: boolean }).matches = m;
    const event = { matches: m, media: '' } as MediaQueryListEvent;
    for (const listener of listeners) {
      listener(event);
    }
  };
  return { mql, setMatches };
}

/** Install a matchMedia stub on the test window that routes queries to MQLs. */
function installMatchMedia(colorDark: boolean, reduceMotion: boolean): {
  setColorDark: (m: boolean) => void;
  setReduceMotion: (m: boolean) => void;
} {
  const color = stubMql(colorDark);
  const motion = stubMql(reduceMotion);
  const win = TestBed.inject(DOCUMENT).defaultView!;
  win.matchMedia = (query: string): MediaQueryList => {
    if (query.includes('color-scheme')) return color.mql;
    if (query.includes('reduced-motion')) return motion.mql;
    return stubMql(false).mql;
  };
  return {
    setColorDark: color.setMatches,
    setReduceMotion: motion.setMatches,
  };
}

/** Wipe the two preference keys (and the whole store for safety). */
function clearPreferences(document: Document): void {
  const storage = document.defaultView!.localStorage;
  storage.clear();
}

describe('ThemeService', () => {
  let document: Document;

  beforeEach(async () => {
    await TestBed.configureTestingModule({}).compileComponents();
    document = TestBed.inject(DOCUMENT);
    clearPreferences(document);
  });

  // --------------------------------------------------------------------------
  // VAL-DS-006 — persistence + system mode + cycle order
  // --------------------------------------------------------------------------

  it('defaults to system mode on first visit (no stored preference)', () => {
    installMatchMedia(false, false);
    const service = TestBed.inject(ThemeService);
    expect(service.themeMode()).toBe('system');
    expect(service.motionMode()).toBe('system');
  });

  it('reads the stored theme mode on construction (preference honored after reload)', () => {
    document.defaultView!.localStorage.setItem(THEME_STORAGE_KEY, 'dark');
    installMatchMedia(false, false);
    const service = TestBed.inject(ThemeService);
    expect(service.themeMode()).toBe('dark');
    expect(service.resolvedTheme()).toBe('dark');
  });

  it('falls back to system when the stored value is corrupt or unknown', () => {
    document.defaultView!.localStorage.setItem(THEME_STORAGE_KEY, 'neon-pink');
    installMatchMedia(false, false);
    const service = TestBed.inject(ThemeService);
    expect(service.themeMode()).toBe('system');
  });

  it('setTheme persists ONLY the mode string to localStorage (no secrets/derived state)', () => {
    installMatchMedia(false, false);
    const service = TestBed.inject(ThemeService);
    service.setTheme('dark');

    const storage = document.defaultView!.localStorage;
    expect(storage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    // Preference-only contract: the only written keys are the two mode strings.
    const writtenKeys = Object.keys({ ...storage }) as string[];
    expect(writtenKeys).toEqual(expect.arrayContaining([THEME_STORAGE_KEY]));
    // No value contains tokens, IDs, or anything beyond the mode literal.
    for (const key of writtenKeys) {
      const value = storage.getItem(key);
      expect(value, `${key} must be a short mode literal`).toMatch(/^(system|light|dark|reduce|full)$/);
    }
  });

  it('cycleTheme walks system → light → dark → system (VAL-DS-006 order)', () => {
    installMatchMedia(false, false);
    const service = TestBed.inject(ThemeService);

    expect(service.themeMode()).toBe('system');
    service.cycleTheme();
    expect(service.themeMode()).toBe('light');
    service.cycleTheme();
    expect(service.themeMode()).toBe('dark');
    service.cycleTheme();
    expect(service.themeMode()).toBe('system');
  });

  it('cycleTheme persists each step (choice survives reload)', () => {
    installMatchMedia(false, false);
    const storage = document.defaultView!.localStorage;
    const service = TestBed.inject(ThemeService);

    service.cycleTheme(); // → light
    expect(storage.getItem(THEME_STORAGE_KEY)).toBe('light');
    service.cycleTheme(); // → dark
    expect(storage.getItem(THEME_STORAGE_KEY)).toBe('dark');
    service.cycleTheme(); // → system
    expect(storage.getItem(THEME_STORAGE_KEY)).toBe('system');
  });

  // --------------------------------------------------------------------------
  // VAL-DS-006 — system mode follows prefers-color-scheme live
  // --------------------------------------------------------------------------

  it('system mode resolves dark when OS prefers dark', () => {
    installMatchMedia(true, false);
    const service = TestBed.inject(ThemeService);
    expect(service.resolvedTheme()).toBe('dark');
  });

  it('system mode resolves light when OS prefers light', () => {
    installMatchMedia(false, false);
    const service = TestBed.inject(ThemeService);
    expect(service.resolvedTheme()).toBe('light');
  });

  it('flips resolved theme within one signal tick when OS color-scheme changes (system mode)', () => {
    const controls = installMatchMedia(false, false);
    const service = TestBed.inject(ThemeService);
    expect(service.resolvedTheme()).toBe('light');

    controls.setColorDark(true);
    expect(service.resolvedTheme()).toBe('dark');

    controls.setColorDark(false);
    expect(service.resolvedTheme()).toBe('light');
  });

  it('explicit light/dark does NOT flip when OS changes (only system follows OS)', () => {
    const controls = installMatchMedia(false, false);
    const service = TestBed.inject(ThemeService);
    service.setTheme('light');
    controls.setColorDark(true);
    expect(service.resolvedTheme()).toBe('light');

    service.setTheme('dark');
    controls.setColorDark(false);
    expect(service.resolvedTheme()).toBe('dark');
  });

  // --------------------------------------------------------------------------
  // VAL-DS-005 — applies data-theme to the document root (no-flash partner)
  // --------------------------------------------------------------------------

  it('applies data-theme="dark" to <html> when service resolves dark', () => {
    installMatchMedia(true, false);
    TestBed.inject(ThemeService);
    expect(document.documentElement.dataset['theme']).toBe('dark');
  });

  it('applies data-theme="light" to <html> when service resolves light', () => {
    installMatchMedia(false, false);
    TestBed.inject(ThemeService);
    expect(document.documentElement.dataset['theme']).toBe('light');
  });

  it('updates data-theme live when setTheme is called', () => {
    installMatchMedia(false, false);
    const service = TestBed.inject(ThemeService);
    expect(document.documentElement.dataset['theme']).toBe('light');

    service.setTheme('dark');
    expect(document.documentElement.dataset['theme']).toBe('dark');

    service.setTheme('light');
    expect(document.documentElement.dataset['theme']).toBe('light');
  });

  // --------------------------------------------------------------------------
  // VAL-DS-007 — reduceMotion preference is wired
  // --------------------------------------------------------------------------

  it('reduceMotion defaults to system mode and resolves via OS query', () => {
    installMatchMedia(false, true);
    const service = TestBed.inject(ThemeService);
    expect(service.motionMode()).toBe('system');
    expect(service.reducesMotion()).toBe(true);
  });

  it('setMotion persists + applies data-reduce-motion flag on <html>', () => {
    installMatchMedia(false, false);
    const service = TestBed.inject(ThemeService);
    expect(service.reducesMotion()).toBe(false);
    expect(document.documentElement.dataset['reduceMotion']).toBeUndefined();

    service.setMotion('reduce');
    expect(service.reducesMotion()).toBe(true);
    expect(document.documentElement.dataset['reduceMotion']).toBe('');
    expect(document.defaultView!.localStorage.getItem(MOTION_STORAGE_KEY)).toBe('reduce');

    service.setMotion('full');
    expect(service.reducesMotion()).toBe(false);
    expect(document.documentElement.dataset['reduceMotion']).toBeUndefined();
    expect(document.defaultView!.localStorage.getItem(MOTION_STORAGE_KEY)).toBe('full');
  });

  it('reduceMotion follows the OS query live while in system mode', () => {
    const controls = installMatchMedia(false, false);
    const service = TestBed.inject(ThemeService);
    expect(service.reducesMotion()).toBe(false);

    controls.setReduceMotion(true);
    expect(service.reducesMotion()).toBe(true);
    expect(document.documentElement.dataset['reduceMotion']).toBe('');

    controls.setReduceMotion(false);
    expect(service.reducesMotion()).toBe(false);
    expect(document.documentElement.dataset['reduceMotion']).toBeUndefined();
  });
});
