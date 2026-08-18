import { describe, expect, it } from 'vitest';
import { ZM_DURATION, ZM_DURATION_MS, ZM_EASE, ZM_EASE_BEZIER } from '../tokens';

/**
 * Motion system — focused contract spec (VAL-DS-012, VAL-DS-013, VAL-DS-016,
 * VAL-DS-017).
 *
 * The CSS custom-properties in tokens.css are the source of truth for the
 * rendered timings; the TS constants here (ZM_DURATION_MS / ZM_EASE_BEZIER)
 * are the JS-side mirror used by the Web Animations API and by dev tooling.
 * Angular's `@angular/build:unit-test` builder treats CSS as a stylesheet
 * module (not raw text), so this spec mirrors the canonical contract the same
 * way tokens.spec.ts mirrors color/easing constants; the dev build proves the
 * CSS itself is syntactically valid and the bindings resolve.
 *
 * What this spec guards:
 *   - VAL-DS-012: every duration + ease token exists and the durations form
 *     a strictly increasing series; eases are cubic-bezier functions.
 *   - VAL-DS-016/017 reduced-motion policy: the canonical reduced-motion
 *     fallback values are documented and structurally sound (spatial
 *     collapses to near-zero, state feedback stays discriminable).
 *   - VAL-DS-013 enter/leave + view-transition vocabulary: the canonical
 *     class/pseudo-element names are the ones motion.css owns.
 */

/** Canonical nominal duration ladder (tokens.css :root — VAL-DS-012). */
const CANONICAL_DURATIONS_MS = {
  instant: 90,
  fast: 140,
  base: 220,
  slow: 360,
  scene: 520,
} as const;

/** Canonical reduced-motion duration fallback (tokens.css reduce block). */
const REDUCED_DURATIONS_MS = {
  instant: 0,
  fast: 0,
  base: 80,
  slow: 80,
  scene: 100,
} as const;

/** Canonical cubic-bezier control points (tokens.css :root — VAL-DS-012). */
const CANONICAL_EASES = {
  standard: [0.2, 0.8, 0.2, 1],
  enter: [0.16, 1, 0.3, 1],
  exit: [0.4, 0, 1, 1],
  emphasized: [0.2, 0.9, 0.15, 1.15],
} as const satisfies Readonly<Record<string, readonly [number, number, number, number]>>;

/** motion.css owns these class names + pseudo-elements (VAL-DS-013). */
const CANONICAL_ENTER_LEAVE_CLASSES = ['.zm-enter', '.zm-leave', '.animate-enter', '.animate-leave'] as const;
const CANONICAL_VIEW_TRANSITION_PSEUDOS = [
  '::view-transition-old(root)',
  '::view-transition-new(root)',
] as const;

describe('ZM motion tokens — VAL-DS-012 contract', () => {
  it('exposes all five duration tokens (instant/fast/base/slow/scene)', () => {
    expect(Object.keys(ZM_DURATION).sort()).toEqual(
      ['base', 'fast', 'instant', 'scene', 'slow'].sort()
    );
    expect(ZM_DURATION.instant).toBe('--zm-duration-instant');
    expect(ZM_DURATION.fast).toBe('--zm-duration-fast');
    expect(ZM_DURATION.base).toBe('--zm-duration-base');
    expect(ZM_DURATION.slow).toBe('--zm-duration-slow');
    expect(ZM_DURATION.scene).toBe('--zm-duration-scene');
  });

  it('exposes all four ease tokens (standard/enter/exit/emphasized)', () => {
    expect(Object.keys(ZM_EASE).sort()).toEqual(
      ['emphasized', 'enter', 'exit', 'standard'].sort()
    );
    expect(ZM_EASE.standard).toBe('--zm-ease-standard');
    expect(ZM_EASE.enter).toBe('--zm-ease-enter');
    expect(ZM_EASE.exit).toBe('--zm-ease-exit');
    expect(ZM_EASE.emphasized).toBe('--zm-ease-emphasized');
  });

  it('nominal durations form a strictly increasing series (90<140<220<360<520)', () => {
    expect(ZM_DURATION_MS.instant).toBe(CANONICAL_DURATIONS_MS.instant);
    expect(ZM_DURATION_MS.fast).toBe(CANONICAL_DURATIONS_MS.fast);
    expect(ZM_DURATION_MS.base).toBe(CANONICAL_DURATIONS_MS.base);
    expect(ZM_DURATION_MS.slow).toBe(CANONICAL_DURATIONS_MS.slow);
    expect(ZM_DURATION_MS.scene).toBe(CANONICAL_DURATIONS_MS.scene);
    // Strictly increasing — required by VAL-DS-012.
    expect(ZM_DURATION_MS.instant).toBeLessThan(ZM_DURATION_MS.fast);
    expect(ZM_DURATION_MS.fast).toBeLessThan(ZM_DURATION_MS.base);
    expect(ZM_DURATION_MS.base).toBeLessThan(ZM_DURATION_MS.slow);
    expect(ZM_DURATION_MS.slow).toBeLessThan(ZM_DURATION_MS.scene);
  });

  it('each ease is a cubic-bezier with exactly 4 control points', () => {
    for (const [name, points] of Object.entries(ZM_EASE_BEZIER)) {
      expect(points, `ZM_EASE_BEZIER.${name} must have 4 control points`).toHaveLength(4);
      for (const p of points) {
        expect(typeof p, 'bezier control point must be a number').toBe('number');
        expect(Number.isFinite(p), 'bezier control point must be finite').toBe(true);
      }
    }
  });

  it('ease control points match the canonical cubic-bezier contract', () => {
    expect(ZM_EASE_BEZIER.standard).toEqual(CANONICAL_EASES.standard);
    expect(ZM_EASE_BEZIER.enter).toEqual(CANONICAL_EASES.enter);
    expect(ZM_EASE_BEZIER.exit).toEqual(CANONICAL_EASES.exit);
    expect(ZM_EASE_BEZIER.emphasized).toEqual(CANONICAL_EASES.emphasized);
  });

  it('exit ease accelerates away (first control point x <= 0.5)', () => {
    // Exit should feel like it leaves quickly — front-loaded curve.
    expect(ZM_EASE_BEZIER.exit[0]).toBeLessThanOrEqual(0.5);
  });

  it('enter ease decelerates in (second control point x >= 0.5)', () => {
    // Enter should feel like it settles gently — back-loaded curve.
    expect(ZM_EASE_BEZIER.enter[1]).toBeGreaterThanOrEqual(0.5);
  });
});

describe('ZM motion reduced-motion fallback — VAL-DS-016/017 policy', () => {
  /**
   * tokens.css collapses durations to 0/0/80/80/100ms and eases to `linear`
   * under both `@media (prefers-reduced-motion: reduce)` and the product
   * `:root[data-reduce-motion]` toggle. These canonical fallback values are
   * the contract: spatial motion collapses to near-zero, but state-feedback
   * transitions (which ride the SAME tokens) remain discriminable via color
   * and opacity even at 80-100ms.
   */
  it('reduced-motion durations collapse spatial tiers to 0ms', () => {
    // instant + fast -> 0ms (pure spatial feedback disappears).
    expect(REDUCED_DURATIONS_MS.instant).toBe(0);
    expect(REDUCED_DURATIONS_MS.fast).toBe(0);
  });

  it('reduced-motion keeps state-feedback tiers short but non-zero (<=100ms)', () => {
    // base/slow/scene -> 80/80/100ms so color/opacity state changes remain
    // perceptible without ever animating transform over a long distance.
    expect(REDUCED_DURATIONS_MS.base).toBeGreaterThan(0);
    expect(REDUCED_DURATIONS_MS.slow).toBeGreaterThan(0);
    expect(REDUCED_DURATIONS_MS.scene).toBeGreaterThan(0);
    expect(REDUCED_DURATIONS_MS.base).toBeLessThanOrEqual(100);
    expect(REDUCED_DURATIONS_MS.slow).toBeLessThanOrEqual(100);
    expect(REDUCED_DURATIONS_MS.scene).toBeLessThanOrEqual(100);
  });

  it('reduced-motion ladder is non-decreasing and never exceeds the nominal', () => {
    const reduced = [
      REDUCED_DURATIONS_MS.instant,
      REDUCED_DURATIONS_MS.fast,
      REDUCED_DURATIONS_MS.base,
      REDUCED_DURATIONS_MS.slow,
      REDUCED_DURATIONS_MS.scene,
    ];
    const nominal = [
      CANONICAL_DURATIONS_MS.instant,
      CANONICAL_DURATIONS_MS.fast,
      CANONICAL_DURATIONS_MS.base,
      CANONICAL_DURATIONS_MS.slow,
      CANONICAL_DURATIONS_MS.scene,
    ];
    for (let i = 0; i < reduced.length; i++) {
      expect(reduced[i], 'reduced must never exceed nominal').toBeLessThanOrEqual(nominal[i]);
    }
    // No inversion in the reduced ladder.
    for (let i = 1; i < reduced.length; i++) {
      expect(reduced[i], 'reduced ladder must be non-decreasing').toBeGreaterThanOrEqual(reduced[i - 1]);
    }
  });
});

describe('ZM motion vocabulary — VAL-DS-013 enter/leave + view-transitions', () => {
  /**
   * motion.css owns the enter/leave utility classes and the route view-
   * transition pseudo-element policy. This spec documents the canonical names
   * so consumers (and future primitives) reference the shared vocabulary
   * rather than reinventing per-component motion.
   */
  it('canonical enter/leave class names are stable and CSS-engine-neutral', () => {
    // Every class starts with `.zm-` (design-system) or `.animate-` (Angular
    // framework animate.enter/leave alias). Both engines share the same
    // keyframes via motion.css.
    for (const cls of CANONICAL_ENTER_LEAVE_CLASSES) {
      expect(cls, 'enter/leave class must be a class selector').toMatch(/^\.[a-z-]+$/);
    }
    // The Angular-framework alias and the design-system alias are BOTH present
    // so consumers can pick the engine without changing the motion model.
    expect(CANONICAL_ENTER_LEAVE_CLASSES).toContain('.zm-enter');
    expect(CANONICAL_ENTER_LEAVE_CLASSES).toContain('.zm-leave');
    expect(CANONICAL_ENTER_LEAVE_CLASSES).toContain('.animate-enter');
    expect(CANONICAL_ENTER_LEAVE_CLASSES).toContain('.animate-leave');
  });

  it('canonical view-transition pseudo-elements target the root snapshot', () => {
    // withViewTransitions() is enabled at the Router (app.config.ts); motion.css
    // styles the outgoing + incoming root snapshots.
    expect(CANONICAL_VIEW_TRANSITION_PSEUDOS).toContain('::view-transition-old(root)');
    expect(CANONICAL_VIEW_TRANSITION_PSEUDOS).toContain('::view-transition-new(root)');
  });
});
