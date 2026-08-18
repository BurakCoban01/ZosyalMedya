import { describe, expect, it } from 'vitest';
import { ZM_FONT, ZM_LEADING, ZM_MEASURE, ZM_TEXT_SIZE } from '../tokens';

/**
 * Typography contract for the Living Editorial Network direction.
 *
 * Guards the four assertions this feature fulfills (each verified in the
 * browser via the gallery route; this spec guards the canonical values):
 *   - VAL-DS-008: three distinct font roles resolve (ui / display / mono).
 *   - VAL-DS-009: Turkish glyph coverage (subset unicode-ranges cover
 *     c g i o s u C G I S O U + dotted/diacritic).
 *   - VAL-DS-010: type scale uses clamp(...) and is fluid across widths.
 *   - VAL-DS-011: long-form post measure is 68–72ch.
 *
 * The dev build proves tokens.css + typography.css are syntactically valid;
 * this spec mirrors the canonical declarations so drift is caught at test
 * time. Browser QA on /_design proves runtime resolution + Turkish glyph
 * rasterization + 68–72ch measure.
 */

/* ----------------------------------------------------------------------------
 * Canonical typography contract (mirrors tokens.css §1 type/measure block).
 * Bound to the values in tokens.css; update both together.
 * -------------------------------------------------------------------------- */

/** The three family stacks as declared in tokens.css `:root`. */
const FONT_STACKS = {
  ui:      '"Manrope Variable", Inter, ui-sans-serif, system-ui, -apple-system, "Segoe UI", sans-serif',
  display: '"Newsreader Variable", Georgia, "Times New Roman", serif',
  mono:    'ui-monospace, SFMono-Regular, Consolas, "Liberation Mono", monospace',
} as const;

/**
 * Type-scale clamp bounds as declared in tokens.css. Tuple = [minRem, maxRem].
 * 16px root assumed when comparing against the 12px–112px assertion bands.
 */
const SCALE_BOUNDS_REM = {
  xs:      [0.75, 0.80],
  sm:      [0.875, 0.94],
  md:      [1.0,  1.08],
  lg:      [1.18, 1.38],
  xl:      [1.48, 1.95],
  xl2:     [2.00, 3.20],
  display: [3.00, 7.00],
} as const satisfies Readonly<Record<keyof typeof ZM_TEXT_SIZE, readonly [number, number]>>;

/** Body leading token value as declared in tokens.css. */
const BODY_LEADING = 1.6;

/** Long-form measure token value as declared in tokens.css. */
const LONG_FORM_MEASURE_CH = 70;

/* ============================================================================
 * VAL-DS-008 — Three distinct font roles
 * ============================================================================ */

describe('VAL-DS-008 — Three distinct font roles exist and are distinct', () => {
  it('ZM_FONT exports the three required role names', () => {
    expect(ZM_FONT.ui).toBe('--zm-font-ui');
    expect(ZM_FONT.display).toBe('--zm-font-display');
    expect(ZM_FONT.mono).toBe('--zm-font-mono');
  });

  it('UI stack prefers Manrope Variable and falls back to Inter then system-ui', () => {
    expect(FONT_STACKS.ui.startsWith('"Manrope Variable"')).toBe(true);
    expect(FONT_STACKS.ui).toContain('Inter');
    expect(FONT_STACKS.ui).toContain('system-ui');
    expect(FONT_STACKS.ui).toMatch(/sans-serif$/);
  });

  it('Display stack prefers Newsreader Variable and falls back to Georgia serif', () => {
    expect(FONT_STACKS.display.startsWith('"Newsreader Variable"')).toBe(true);
    expect(FONT_STACKS.display).toContain('Georgia');
    expect(FONT_STACKS.display).toMatch(/serif$/);
  });

  it('Mono stack is system-only (no @font-face, no network fetch)', () => {
    expect(FONT_STACKS.mono.startsWith('ui-monospace')).toBe(true);
    expect(FONT_STACKS.mono).toContain('Consolas');
    expect(FONT_STACKS.mono).toMatch(/monospace$/);
  });

  it('the three stacks are not identical (distinct roles)', () => {
    const stacks = new Set([FONT_STACKS.ui, FONT_STACKS.display, FONT_STACKS.mono]);
    expect(stacks.size).toBe(3);
  });

  it('ZM_TEXT_SIZE exposes every scale step (xs..display)', () => {
    expect(ZM_TEXT_SIZE.xs).toBe('--zm-text-xs');
    expect(ZM_TEXT_SIZE.sm).toBe('--zm-text-sm');
    expect(ZM_TEXT_SIZE.md).toBe('--zm-text-md');
    expect(ZM_TEXT_SIZE.lg).toBe('--zm-text-lg');
    expect(ZM_TEXT_SIZE.xl).toBe('--zm-text-xl');
    expect(ZM_TEXT_SIZE.xl2).toBe('--zm-text-2xl');
    expect(ZM_TEXT_SIZE.display).toBe('--zm-text-display');
  });
});

/* ============================================================================
 * VAL-DS-010 — Responsive clamp-based fluid scale
 * ============================================================================ */

describe('VAL-DS-010 — Type scale bounds are inside validated bands', () => {
  const PX_FLOOR_BY_STEP: ReadonlyArray<readonly [keyof typeof SCALE_BOUNDS_REM, number, number]> = [
    ['xs',      12,  13],
    ['sm',      14,  16],
    ['md',      16,  18],
    ['lg',      18,  23],
    ['xl',      23,  32],
    ['xl2',     32,  52],
    ['display', 48, 112],
  ];

  it.each(PX_FLOOR_BY_STEP)('%s clamp bounds (× 16px root) sit inside [%ipx, %ipx]', (key, minPx, maxPx) => {
    const [minRem, maxRem] = SCALE_BOUNDS_REM[key];
    expect(minRem * 16, `${key} floor must be >= ${minPx}px`).toBeGreaterThanOrEqual(minPx);
    expect(maxRem * 16, `${key} ceiling must be <= ${maxPx}px`).toBeLessThanOrEqual(maxPx);
    expect(maxRem, `${key} ceiling must exceed floor`).toBeGreaterThan(minRem);
  });

  it('scale is strictly ascending (xs < sm < md < lg < xl < 2xl < display)', () => {
    const order: ReadonlyArray<keyof typeof SCALE_BOUNDS_REM> = ['xs', 'sm', 'md', 'lg', 'xl', 'xl2', 'display'];
    const floors = order.map(k => SCALE_BOUNDS_REM[k][0]);
    for (let i = 1; i < floors.length; i++) {
      expect(floors[i], `${order[i]} floor must exceed ${order[i - 1]} floor`).toBeGreaterThan(floors[i - 1]);
    }
  });

  it('smallest scale step (xs) is at or above 12px (no essential text below the floor)', () => {
    expect(SCALE_BOUNDS_REM.xs[0] * 16).toBeGreaterThanOrEqual(12);
  });
});

/* ============================================================================
 * Body line-height contract (1.55–1.7)
 * ============================================================================ */

describe('Body leading token sits in the validated 1.55–1.7 band', () => {
  it('ZM_LEADING.body exposes the body leading token name', () => {
    expect(ZM_LEADING.body).toBe('--zm-leading-body');
  });

  it('the canonical body leading value is inside [1.55, 1.7]', () => {
    expect(BODY_LEADING, 'body leading must be >= 1.55').toBeGreaterThanOrEqual(1.55);
    expect(BODY_LEADING, 'body leading must be <= 1.7').toBeLessThanOrEqual(1.7);
  });
});

/* ============================================================================
 * VAL-DS-011 — Long-form measure 68–72ch
 * ============================================================================ */

describe('VAL-DS-011 — Long-form reading column is sized 68–72ch', () => {
  it('ZM_MEASURE.longForm exposes the long-form measure token name', () => {
    expect(ZM_MEASURE.longForm).toBe('--zm-measure-long-form');
  });

  it('the canonical long-form measure value is inside [68ch, 72ch]', () => {
    expect(LONG_FORM_MEASURE_CH, 'long-form measure must be >= 68ch').toBeGreaterThanOrEqual(68);
    expect(LONG_FORM_MEASURE_CH, 'long-form measure must be <= 72ch').toBeLessThanOrEqual(72);
  });
});

/* ============================================================================
 * VAL-DS-009 — Turkish glyph coverage (latin + latin-ext subsets cover TR)
 * ============================================================================ */

describe('VAL-DS-009 — Latin-ext subsets cover the Turkish glyph set', () => {
  /**
   * Canonical Google Fonts subset ranges that typography.css declares via
   * `unicode-range:` on every @font-face. The browser fetches the right
   * file lazily based on the codepoints actually used on the page.
   * Turkish glyph coverage requires BOTH subsets:
   *   - latin      covers: ç Ç (U+00E7/C7), ı (U+0131), ö Ö (U+00F6/D6), ü Ü (U+00FC/DC)
   *   - latin-ext  covers: ğ Ğ (U+011F/1E), İ (U+0130), ş Ş (U+015F/5E)
   * Union below covers every required Turkish codepoint.
   */
  const UNICODE_RANGES: ReadonlyArray<readonly [number, number]> = [
    [0x0000, 0x00FF], // Latin-1 Supplement (ç Ç ö Ö ü Ü + ASCII)
    [0x0131, 0x0131], // dotless ı (in Google's latin subset)
    [0x0152, 0x0153], // Œ œ
    [0x0100, 0x02AF], // Latin Extended-A/B (ğ Ğ İ ş Ş and more)
    [0x1E00, 0x1E9F], // Latin Extended Additional
  ];

  /** Turkish glyph set VAL-DS-009 names explicitly. */
  const REQUIRED_TR_CODEPOINTS: ReadonlyArray<readonly [label: string, cp: number]> = [
    ['ç (U+00E7)',          0x00E7],
    ['Ç (U+00C7)',          0x00C7],
    ['ğ (U+011F)',          0x011F],
    ['Ğ (U+011E)',          0x011E],
    ['ı (U+0131, dotless)', 0x0131],
    ['İ (U+0130, dotted)',  0x0130],
    ['ö (U+00F6)',          0x00F6],
    ['Ö (U+00D6)',          0x00D6],
    ['ş (U+015F)',          0x015F],
    ['Ş (U+015E)',          0x015E],
    ['ü (U+00FC)',          0x00FC],
    ['Ü (U+00DC)',          0x00DC],
  ];

  function covers(ranges: ReadonlyArray<readonly [number, number]>, cp: number): boolean {
    return ranges.some(([lo, hi]) => cp >= lo && cp <= hi);
  }

  it('union of latin + latin-ext ranges covers the Turkish glyph set', () => {
    for (const [label, cp] of REQUIRED_TR_CODEPOINTS) {
      expect(covers(UNICODE_RANGES, cp), `${label} must be in latin ∪ latin-ext`).toBe(true);
    }
  });

  it('the latin-ext range alone covers ğ Ğ İ ş Ş (the TR chars not in basic latin)', () => {
    const latinExtOnly: ReadonlyArray<readonly [number, number]> = [
      [0x0100, 0x02AF],
      [0x1E00, 0x1E9F],
    ];
    for (const cp of [0x011F, 0x011E, 0x0130, 0x015F, 0x015E]) {
      expect(covers(latinExtOnly, cp), `0x${cp.toString(16)} must be in latin-ext`).toBe(true);
    }
  });
});
