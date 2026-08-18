/**
 * ZosyalMedya Design System — Token name constants (TypeScript side).
 *
 * CSS custom properties (var(--zm-*)) are the SOURCE OF TRUTH and are consumed
 * directly in component CSS / Tailwind utilities. This module exists only for
 * the narrow cases where JS needs a token NAME (not a resolved value):
 *
 *   - Web Animations API keyframes (element.animate(...)) — timing/duration constants.
 *   - Canvas / SVG imperative drawing (signal arc, pulse node motifs) — token names
 *     resolved at runtime via getComputedStyle when a live value is required.
 *   - Dev tooling / assertion specs that enumerate the canonical token set.
 *
 * Rules:
 *   - NEVER hardcode hex/rgb/oklch in TS. If you need the resolved VALUE, read it
 *     from the cascade: `getComputedStyle(element).getPropertyValue(ZM.color.brand)`.
 *   - Keep this file in sync with ./tokens.css. The tokens.spec.ts guards the
 *     canonical semantic set so drift is caught at test time.
 */

/** A CSS custom-property name in the `--zm-*` namespace, with leading `--`. */
export type ZmVarName = `--zm-${string}`;

/** Helper: wrap a registered token name in `var(...)`. */
export function zmVar(name: ZmVarName, fallback?: string): string {
  return fallback ? `var(${name}, ${fallback})` : `var(${name})`;
}

/* ----------------------------------------------------------------------------
 * Semantic color role tokens (mirrors tokens.css §2)
 * -------------------------------------------------------------------------- */
export const ZM_COLOR = {
  canvas: '--zm-canvas',
  canvasRaised: '--zm-canvas-raised',
  surface1: '--zm-surface-1',
  surface2: '--zm-surface-2',
  surface3: '--zm-surface-3',
  text1: '--zm-text-1',
  text2: '--zm-text-2',
  text3: '--zm-text-3',
  borderSubtle: '--zm-border-subtle',
  borderStrong: '--zm-border-strong',
  brand: '--zm-brand',
  brandHover: '--zm-brand-hover',
  brandOn: '--zm-brand-on',
  discovery: '--zm-discovery',
  info: '--zm-info',
  success: '--zm-success',
  warning: '--zm-warning',
  danger: '--zm-danger',
  focus: '--zm-focus',
  scrim: '--zm-scrim'
} as const satisfies Readonly<Record<string, ZmVarName>>;

export type ZmColorRole = keyof typeof ZM_COLOR;

/* ----------------------------------------------------------------------------
 * Typography (mirrors tokens.css §1 type/family)
 * -------------------------------------------------------------------------- */
export const ZM_FONT = {
  ui: '--zm-font-ui',
  display: '--zm-font-display',
  mono: '--zm-font-mono'
} as const satisfies Readonly<Record<string, ZmVarName>>;

export const ZM_TEXT_SIZE = {
  xs: '--zm-text-xs',
  sm: '--zm-text-sm',
  md: '--zm-text-md',
  lg: '--zm-text-lg',
  xl: '--zm-text-xl',
  xl2: '--zm-text-2xl',
  display: '--zm-text-display'
} as const satisfies Readonly<Record<string, ZmVarName>>;

export const ZM_LEADING = {
  display: '--zm-leading-display',
  tight: '--zm-leading-tight',
  ui: '--zm-leading-ui',
  body: '--zm-leading-body',
  loose: '--zm-leading-loose'
} as const satisfies Readonly<Record<string, ZmVarName>>;

/* ----------------------------------------------------------------------------
 * Measure (reading width). long-form is sized in `ch` so the browser tracks
 * the rendered font's advance width; the others are rem-based column caps.
 * -------------------------------------------------------------------------- */
export const ZM_MEASURE = {
  body: '--zm-measure-body',
  longForm: '--zm-measure-long-form',
  feed: '--zm-measure-feed',
  bleed: '--zm-measure-bleed'
} as const satisfies Readonly<Record<string, ZmVarName>>;

/* ----------------------------------------------------------------------------
 * Shape (radius) and elevation (shadow)
 * -------------------------------------------------------------------------- */
export const ZM_RADIUS = {
  xs: '--zm-radius-xs',
  sm: '--zm-radius-sm',
  md: '--zm-radius-md',
  lg: '--zm-radius-lg',
  xl: '--zm-radius-xl',
  xl2: '--zm-radius-2xl',
  pill: '--zm-radius-pill'
} as const satisfies Readonly<Record<string, ZmVarName>>;

/* ----------------------------------------------------------------------------
 * Shape roles (radius kinds), border weights, separator roles, and material-
 * depth (elevation) tiers — mirrors tokens.css §2c. Components consume these
 * in preference to the raw primitives above.
 * -------------------------------------------------------------------------- */
export const ZM_RADIUS_ROLE = {
  control: '--zm-radius-control',
  field: '--zm-radius-field',
  card: '--zm-radius-card',
  sheet: '--zm-radius-sheet'
} as const satisfies Readonly<Record<string, ZmVarName>>;

export const ZM_BORDER_WIDTH = {
  hair: '--zm-border-width-hair',
  strong: '--zm-border-width-strong'
} as const satisfies Readonly<Record<string, ZmVarName>>;

export const ZM_SEPARATOR = {
  color: '--zm-separator',
  colorStrong: '--zm-separator-strong',
  rule: '--zm-separator-rule',
  ruleStrong: '--zm-separator-rule-strong'
} as const satisfies Readonly<Record<string, ZmVarName>>;

/** Material-depth (elevation) tiers — the seven-layer system (design-system §6). */
export const ZM_ELEVATION = {
  canvas: '--zm-elevation-canvas',
  page: '--zm-elevation-page',
  raised: '--zm-elevation-raised',
  sticky: '--zm-elevation-sticky',
  popover: '--zm-elevation-popover',
  dialog: '--zm-elevation-dialog',
  urgent: '--zm-elevation-urgent'
} as const satisfies Readonly<Record<string, ZmVarName>>;

export const ZM_SHADOW = {
  sm: '--zm-shadow-sm',
  md: '--zm-shadow-md',
  lg: '--zm-shadow-lg'
} as const satisfies Readonly<Record<string, ZmVarName>>;

/* ----------------------------------------------------------------------------
 * Motion (duration ms + easing). Use these for Web Animations API timings.
 * -------------------------------------------------------------------------- */
export const ZM_DURATION = {
  instant: '--zm-duration-instant',
  fast: '--zm-duration-fast',
  base: '--zm-duration-base',
  slow: '--zm-duration-slow',
  scene: '--zm-duration-scene'
} as const satisfies Readonly<Record<string, ZmVarName>>;

export const ZM_EASE = {
  standard: '--zm-ease-standard',
  enter: '--zm-ease-enter',
  exit: '--zm-ease-exit',
  emphasized: '--zm-ease-emphasized'
} as const satisfies Readonly<Record<string, ZmVarName>>;

/** Numeric duration values (ms) for direct use in element.animate() options. */
export const ZM_DURATION_MS = {
  instant: 90,
  fast: 140,
  base: 220,
  slow: 360,
  scene: 520
} as const satisfies Readonly<Record<string, number>>;

/** Cubic-bezier control points for direct use in element.animate() easing. */
export const ZM_EASE_BEZIER = {
  standard: [0.2, 0.8, 0.2, 1] as const,
  enter: [0.16, 1, 0.3, 1] as const,
  exit: [0.4, 0, 1, 1] as const,
  emphasized: [0.2, 0.9, 0.15, 1.15] as const
};

/* ----------------------------------------------------------------------------
 * Spacing scale (4px base; direct rem values for imperative layout, e.g. canvas)
 * -------------------------------------------------------------------------- */
export const ZM_SPACE = {
  0: '--zm-space-0',
  1: '--zm-space-1',
  2: '--zm-space-2',
  3: '--zm-space-3',
  4: '--zm-space-4',
  5: '--zm-space-5',
  6: '--zm-space-6',
  8: '--zm-space-8',
  10: '--zm-space-10',
  12: '--zm-space-12',
  16: '--zm-space-16',
  20: '--zm-space-20',
  24: '--zm-space-24'
} as const satisfies Readonly<Record<string, ZmVarName>>;

/* ----------------------------------------------------------------------------
 * Layering (z-index)
 * -------------------------------------------------------------------------- */
export const ZM_Z = {
  canvas: '--zm-z-canvas',
  surface: '--zm-z-surface',
  raised: '--zm-z-raised',
  sticky: '--zm-z-sticky',
  popover: '--zm-z-popover',
  dialog: '--zm-z-dialog',
  toast: '--zm-z-toast',
  syslayer: '--zm-z-syslayer'
} as const satisfies Readonly<Record<string, ZmVarName>>;

/* ----------------------------------------------------------------------------
 * Aggregate record (for dev tooling / specs that iterate the canonical set).
 * -------------------------------------------------------------------------- */
export const ZM_TOKENS = {
  color: ZM_COLOR,
  font: ZM_FONT,
  textSize: ZM_TEXT_SIZE,
  leading: ZM_LEADING,
  measure: ZM_MEASURE,
  radius: ZM_RADIUS,
  radiusRole: ZM_RADIUS_ROLE,
  borderWidth: ZM_BORDER_WIDTH,
  separator: ZM_SEPARATOR,
  shadow: ZM_SHADOW,
  elevation: ZM_ELEVATION,
  duration: ZM_DURATION,
  ease: ZM_EASE,
  space: ZM_SPACE,
  z: ZM_Z
} as const;

export type ZmTokenGroup = keyof typeof ZM_TOKENS;
