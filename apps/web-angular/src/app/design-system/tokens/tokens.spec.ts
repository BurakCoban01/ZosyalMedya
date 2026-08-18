import { describe, expect, it } from 'vitest';
import {
  ZM_BORDER_WIDTH,
  ZM_COLOR,
  ZM_DURATION,
  ZM_DURATION_MS,
  ZM_EASE,
  ZM_EASE_BEZIER,
  ZM_ELEVATION,
  ZM_FONT,
  ZM_LEADING,
  ZM_MEASURE,
  ZM_RADIUS,
  ZM_RADIUS_ROLE,
  ZM_SEPARATOR,
  ZM_SHADOW,
  ZM_SPACE,
  ZM_TEXT_SIZE,
  ZM_TOKENS,
  ZM_Z,
  type ZmVarName,
  zmVar
} from './index';

/**
 * Canonical semantic + bridge contract. The TS module is the consumption surface
 * for JS-side users (Web Animations API, canvas drawing, dev tooling). These
 * names MUST stay in lock-step with tokens.css; the dev build proves the CSS is
 * syntactically valid and the @theme bridge resolves.
 */
const CANONICAL_COLOR = {
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
} as const;

function assertEveryValueIsZmVar(record: Readonly<Record<string, ZmVarName>>): void {
  for (const [key, value] of Object.entries(record)) {
    expect(value, `token "${key}" must be a --zm-* name`).toMatch(/^--zm-/);
  }
}

describe('ZM design tokens — TS surface', () => {
  it('every exported token name is a --zm-* custom property', () => {
    assertEveryValueIsZmVar(ZM_COLOR);
    assertEveryValueIsZmVar(ZM_FONT);
    assertEveryValueIsZmVar(ZM_TEXT_SIZE);
    assertEveryValueIsZmVar(ZM_LEADING);
    assertEveryValueIsZmVar(ZM_MEASURE);
    assertEveryValueIsZmVar(ZM_RADIUS);
    assertEveryValueIsZmVar(ZM_RADIUS_ROLE);
    assertEveryValueIsZmVar(ZM_BORDER_WIDTH);
    assertEveryValueIsZmVar(ZM_SEPARATOR);
    assertEveryValueIsZmVar(ZM_SHADOW);
    assertEveryValueIsZmVar(ZM_ELEVATION);
    assertEveryValueIsZmVar(ZM_DURATION);
    assertEveryValueIsZmVar(ZM_EASE);
    assertEveryValueIsZmVar(ZM_SPACE);
    assertEveryValueIsZmVar(ZM_Z);
  });

  it('ZM_COLOR matches the canonical semantic role contract', () => {
    expect(ZM_COLOR).toEqual(CANONICAL_COLOR);
  });

  it('exposes the three required typography families', () => {
    expect(ZM_FONT.ui).toBe('--zm-font-ui');
    expect(ZM_FONT.display).toBe('--zm-font-display');
    expect(ZM_FONT.mono).toBe('--zm-font-mono');
  });

  it('exposes a responsive type scale from xs to display', () => {
    expect(ZM_TEXT_SIZE.xs).toBe('--zm-text-xs');
    expect(ZM_TEXT_SIZE.md).toBe('--zm-text-md');
    expect(ZM_TEXT_SIZE.display).toBe('--zm-text-display');
  });

  it('exposes radius, shadow, duration, ease, space, z groups', () => {
    expect(ZM_RADIUS.md).toBe('--zm-radius-md');
    expect(ZM_RADIUS.pill).toBe('--zm-radius-pill');
    expect(ZM_SHADOW.md).toBe('--zm-shadow-md');
    expect(ZM_DURATION.base).toBe('--zm-duration-base');
    expect(ZM_EASE.enter).toBe('--zm-ease-enter');
    expect(ZM_SPACE[4]).toBe('--zm-space-4');
    expect(ZM_SPACE[24]).toBe('--zm-space-24');
    expect(ZM_Z.dialog).toBe('--zm-z-dialog');
    expect(ZM_Z.toast).toBe('--zm-z-toast');
  });

  it('exposes the measure group, including the long-form ch-based column', () => {
    expect(ZM_MEASURE.body).toBe('--zm-measure-body');
    expect(ZM_MEASURE.feed).toBe('--zm-measure-feed');
    expect(ZM_MEASURE.bleed).toBe('--zm-measure-bleed');
    // long-form is the ch-based token VAL-DS-011 verifies in the browser.
    expect(ZM_MEASURE.longForm).toBe('--zm-measure-long-form');
  });

  it('ZM_TOKENS aggregates every token group', () => {
    expect(Object.keys(ZM_TOKENS).sort()).toEqual(
      [
        'borderWidth', 'color', 'duration', 'ease', 'elevation', 'font',
        'leading', 'measure', 'radius', 'radiusRole', 'separator', 'shadow',
        'space', 'textSize', 'z'
      ].sort()
    );
    // Each group is non-empty.
    for (const [name, group] of Object.entries(ZM_TOKENS)) {
      expect(Object.keys(group).length, `ZM_TOKENS.${name} should be non-empty`).toBeGreaterThan(0);
    }
  });

  it('zmVar() wraps a token name and supports an optional fallback', () => {
    expect(zmVar(ZM_COLOR.brand)).toBe('var(--zm-brand)');
    expect(zmVar(ZM_COLOR.brand, 'transparent')).toBe('var(--zm-brand, transparent)');
  });

  it('exposes numeric duration (ms) values for the Web Animations API', () => {
    expect(ZM_DURATION_MS.instant).toBe(90);
    expect(ZM_DURATION_MS.fast).toBe(140);
    expect(ZM_DURATION_MS.base).toBe(220);
    expect(ZM_DURATION_MS.slow).toBe(360);
    expect(ZM_DURATION_MS.scene).toBe(520);
  });

  it('exposes cubic-bezier control points, each with exactly 4 points', () => {
    expect(ZM_EASE_BEZIER.enter).toEqual([0.16, 1, 0.3, 1]);
    expect(ZM_EASE_BEZIER.standard).toEqual([0.2, 0.8, 0.2, 1]);
    for (const [name, points] of Object.entries(ZM_EASE_BEZIER)) {
      expect(points, `ZM_EASE_BEZIER.${name}`).toHaveLength(4);
    }
  });

  /* --- Shape, border, separator & material-depth role contract (tokens.css §2c) --- */

  it('exposes the four radius role kinds (control/field/card/sheet)', () => {
    expect(ZM_RADIUS_ROLE.control).toBe('--zm-radius-control');
    expect(ZM_RADIUS_ROLE.field).toBe('--zm-radius-field');
    expect(ZM_RADIUS_ROLE.card).toBe('--zm-radius-card');
    expect(ZM_RADIUS_ROLE.sheet).toBe('--zm-radius-sheet');
  });

  it('radius ladder includes the reserved 2xl oversized step', () => {
    expect(ZM_RADIUS.xl2).toBe('--zm-radius-2xl');
  });

  it('exposes the two canonical border weights', () => {
    expect(ZM_BORDER_WIDTH.hair).toBe('--zm-border-width-hair');
    expect(ZM_BORDER_WIDTH.strong).toBe('--zm-border-width-strong');
  });

  it('exposes separator color roles and composed-rule shorthands', () => {
    expect(ZM_SEPARATOR.color).toBe('--zm-separator');
    expect(ZM_SEPARATOR.colorStrong).toBe('--zm-separator-strong');
    expect(ZM_SEPARATOR.rule).toBe('--zm-separator-rule');
    expect(ZM_SEPARATOR.ruleStrong).toBe('--zm-separator-rule-strong');
  });

  it('exposes the seven material-depth elevation tiers in ladder order', () => {
    // design-system §6 ladder: canvas → page → raised → sticky → popover → dialog → urgent.
    expect(Object.keys(ZM_ELEVATION)).toEqual([
      'canvas', 'page', 'raised', 'sticky', 'popover', 'dialog', 'urgent'
    ]);
    expect(ZM_ELEVATION.canvas).toBe('--zm-elevation-canvas');
    expect(ZM_ELEVATION.dialog).toBe('--zm-elevation-dialog');
    expect(ZM_ELEVATION.urgent).toBe('--zm-elevation-urgent');
  });
});
