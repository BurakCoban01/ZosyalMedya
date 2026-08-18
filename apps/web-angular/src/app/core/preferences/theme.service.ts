import { DOCUMENT } from '@angular/common';
import { Injectable, computed, inject, signal } from '@angular/core';

/**
 * ThemeService — applies the user's color-theme and reduce-motion preferences
 * to the document root, persists them across reloads, and follows the OS
 * `prefers-color-scheme` / `prefers-reduced-motion` signals whenever the user
 * chooses `system` mode.
 *
 * No-flash contract (VAL-DS-005): the actual pre-paint application happens in
 * the inline script in `index.html`, which runs synchronously in <head> before
 * the first frame. This service mirrors the SAME resolution logic in Angular
 * land so that (a) the choice stays correct after the Angular app boots, and
 * (b) runtime changes (cycle, OS-media change) are reflected live. The keys
 * and the resolution rule below MUST stay in sync with that inline script.
 *
 * Persistence contract (VAL-DS-006): only the user's mode choice is written to
 * localStorage — never tokens, IDs, secrets, or derived state. The two keys
 * (`THEME_STORAGE_KEY`, `MOTION_STORAGE_KEY`) store one short mode string each.
 *
 * Tuning note: dark theme tokens live in
 * `design-system/tokens/tokens.css` under `[data-theme="dark"]` and are tuned
 * independently (warm-neutral light surfaces vs blue-charcoal coal surfaces —
 * NOT a mechanical inversion). This service only flips the attribute; it never
 * redefines colors.
 */
@Injectable({ providedIn: 'root' })
export class ThemeService {
  private readonly document = inject(DOCUMENT);

  /** MediaQueryList for `prefers-color-scheme: dark` (null when unavailable). */
  private readonly colorSchemeMql = this.buildMql('(prefers-color-scheme: dark)');
  /** MediaQueryList for `prefers-reduced-motion: reduce` (null when unavailable). */
  private readonly reducedMotionMql = this.buildMql('(prefers-reduced-motion: reduce)');

  /** Live OS color-scheme preference. Updated by the matchMedia listener. */
  private readonly osPrefersDark = signal<boolean>(this.colorSchemeMql?.matches ?? false);
  /** Live OS reduced-motion preference. Updated by the matchMedia listener. */
  private readonly osPrefersReduced = signal<boolean>(this.reducedMotionMql?.matches ?? false);

  /** User-choosable color-theme modes. `system` follows `prefers-color-scheme`. */
  readonly themeMode = signal<ThemeMode>(this.readStoredTheme());
  /** User-choosable reduce-motion modes. `system` follows `prefers-reduced-motion`. */
  readonly motionMode = signal<MotionMode>(this.readStoredMotion());

  /** The concrete theme currently applied to the document root. */
  readonly resolvedTheme = computed<ResolvedTheme>(() => {
    const mode = this.themeMode();
    if (mode === 'system') {
      return this.osPrefersDark() ? 'dark' : 'light';
    }
    return mode;
  });

  /** Whether motion should be reduced for the current state (product toggle OR OS). */
  readonly reducesMotion = computed<boolean>(() => {
    const mode = this.motionMode();
    if (mode === 'system') {
      return this.osPrefersReduced();
    }
    return mode === 'reduce';
  });

  constructor() {
    // Live-track OS color-scheme. When the OS flips between light and dark
    // (e.g. DevTools emulation, OS dark mode at sunset), the resolved theme
    // follows synchronously (VAL-DS-006: within one frame).
    this.colorSchemeMql?.addEventListener('change', (event: MediaQueryListEvent) => {
      this.osPrefersDark.set(event.matches);
      this.syncToDocument();
    });

    // Same for OS reduced-motion while in `system` motion mode.
    this.reducedMotionMql?.addEventListener('change', (event: MediaQueryListEvent) => {
      this.osPrefersReduced.set(event.matches);
      this.syncToDocument();
    });

    // Apply synchronously on construction. The pre-paint script in index.html
    // has already set the same value before first paint; this re-applies the
    // service-resolved value idempotently so the DOM is guaranteed correct
    // immediately after construction (even under lazy injection).
    this.syncToDocument();
  }

  /**
   * Set the color-theme mode. Persists to localStorage and applies the change
   * to the document root synchronously. Idempotent.
   */
  setTheme(mode: ThemeMode): void {
    this.themeMode.set(mode);
    this.writeStoredTheme(mode);
    this.syncToDocument();
  }

  /**
   * Cycle the color-theme mode in VAL-DS-006 order:
   * `system → light → dark → system`. Convenient for a single shell control.
   */
  cycleTheme(): void {
    const current = this.themeMode();
    const next: ThemeMode = current === 'system' ? 'light'
      : current === 'light' ? 'dark'
      : 'system';
    this.setTheme(next);
  }

  /**
   * Set the reduce-motion mode. Persists and re-applies synchronously.
   * `system` defers to the OS `prefers-reduced-motion` query;
   * `reduce` / `full` are explicit.
   */
  setMotion(mode: MotionMode): void {
    this.motionMode.set(mode);
    this.writeStoredMotion(mode);
    this.syncToDocument();
  }

  // --- document application -------------------------------------------------

  /** Re-apply the current resolved theme + motion to <html>. Idempotent + safe. */
  private syncToDocument(): void {
    this.applyToDocument(this.resolvedTheme(), this.reducesMotion());
  }

  /** Set `data-theme` and `data-reduce-motion` on <html>. Idempotent + safe. */
  private applyToDocument(theme: ResolvedTheme, reduceMotion: boolean): void {
    const root = this.document.documentElement;
    root.dataset['theme'] = theme;
    if (reduceMotion) {
      root.dataset['reduceMotion'] = '';
    } else {
      delete root.dataset['reduceMotion'];
    }
  }

  // --- media-query plumbing -------------------------------------------------

  /**
   * Build a MediaQueryList, or return null when matchMedia is unavailable
   * (non-browser/test environments). Falling back to null means `system` mode
   * resolves to light / no-reduce, which is a safe default.
   */
  private buildMql(query: string): MediaQueryList | null {
    const win = this.document.defaultView;
    if (!win || typeof win.matchMedia !== 'function') {
      return null;
    }
    try {
      return win.matchMedia(query);
    } catch {
      return null;
    }
  }

  // --- persistence (preference-only; never secrets) -------------------------

  /** Read the stored theme mode; default to `system` on first visit / corruption. */
  private readStoredTheme(): ThemeMode {
    return this.readMode(THEME_STORAGE_KEY, 'system', isThemeMode);
  }

  /** Read the stored motion mode; default to `system` on first visit / corruption. */
  private readStoredMotion(): MotionMode {
    return this.readMode(MOTION_STORAGE_KEY, 'system', isMotionMode);
  }

  private writeStoredTheme(mode: ThemeMode): void {
    this.writeMode(THEME_STORAGE_KEY, mode);
  }

  private writeStoredMotion(mode: MotionMode): void {
    this.writeMode(MOTION_STORAGE_KEY, mode);
  }

  /**
   * Generic localStorage read with validation. Falls back to the default when
   * storage is unavailable or the stored value is unknown/corrupt. Never
   * throws — theme must never break the app.
   */
  private readMode<T extends string>(key: string, fallback: T, guard: (v: string) => v is T): T {
    try {
      // `?? null` normalizes the optional-chain `undefined` (no defaultView /
      // no localStorage) to `null` so the narrowing below is sound.
      const raw = this.document.defaultView?.localStorage.getItem(key) ?? null;
      if (raw !== null && raw !== '' && guard(raw)) {
        return raw;
      }
    } catch {
      /* storage blocked (private mode, sandbox) — fall through to default */
    }
    return fallback;
  }

  /** Generic localStorage write. Swallow errors so theme never breaks the app. */
  private writeMode(key: string, value: string): void {
    try {
      this.document.defaultView?.localStorage.setItem(key, value);
    } catch {
      /* ignore — non-blocking */
    }
  }
}

// --- public types -----------------------------------------------------------

/** Color-theme mode selectable by the user. */
export type ThemeMode = 'system' | 'light' | 'dark';

/**
 * Selectable theme option surfaced by account / preferences surfaces. The
 * shared catalog keeps the Turkish labels + ordering identical across the
 * account menu (desktop/tablet), the mobile "Daha fazla" sheet, and the
 * settings page, so a theme change is a single focused edit if the vocabulary
 * ever changes. `value` is the persisted {@link ThemeMode}; `label` is the
 * on-screen Turkish name; `hint` is the one-word context AT + the checkmark
 * reinforce. Safe for TS string literals (no `--zm-*` token names here).
 */
export interface ThemeOption {
  readonly value: ThemeMode;
  readonly label: string;
  readonly hint: string;
}

/** Canonical theme-option catalog consumed by every theme control surface. */
export const THEME_OPTIONS: ReadonlyArray<ThemeOption> = [
  { value: 'system', label: 'Sistem', hint: 'cihazı izler' },
  { value: 'light', label: 'Açık', hint: 'her zaman açık' },
  { value: 'dark', label: 'Koyu', hint: 'her zaman koyu' },
];

/** Concrete theme that ends up on `data-theme`. */
export type ResolvedTheme = 'light' | 'dark';

/** Reduce-motion mode selectable by the user. */
export type MotionMode = 'system' | 'reduce' | 'full';

// --- storage keys (exported for the index.html pre-paint script to mirror) ---
//
// IMPORTANT: the inline pre-paint script in `index.html` MUST use these exact
// key strings and the same mode vocabulary, so that the very first paint uses
// the same preference the Angular ThemeService reads once booted.

export const THEME_STORAGE_KEY = 'escp-pref-theme';
export const MOTION_STORAGE_KEY = 'escp-pref-motion';

// --- type guards ------------------------------------------------------------

function isThemeMode(v: string): v is ThemeMode {
  return v === 'system' || v === 'light' || v === 'dark';
}

function isMotionMode(v: string): v is MotionMode {
  return v === 'system' || v === 'reduce' || v === 'full';
}
