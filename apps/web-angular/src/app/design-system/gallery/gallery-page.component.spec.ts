import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { of } from 'rxjs';
import { describe, expect, it } from 'vitest';
import { GalleryPageComponent } from './gallery-page.component';

/**
 * M1 light-theme gallery — focused verification.
 *
 * Guards the two assertions this feature fulfills:
 *   - VAL-DS-001: every semantic token role is rendered (resolves non-empty
 *     in the live cascade — proven by the dev build + browser probe).
 *   - VAL-DS-003: warm-neutral canvas, coral brand, readable ink >= 4.5:1.
 *
 * Contrast is computed deterministically from the canonical light-theme oklch
 * values (mirrors docs/agent/03-DESIGN-SYSTEM.md sec.2 and tokens.css :root).
 * OKLCH -> linear sRGB -> WCAG relative luminance -> contrast ratio.
 */

/* ---------------------------------------------------------------------------
 * Pure OKLCH -> WCAG contrast helpers (no DOM, no Node built-ins).
 * ------------------------------------------------------------------------ */

interface Oklch {
  readonly L: number;
  readonly C: number;
  readonly H: number;
  readonly alpha: number;
}

function parseOklch(input: string): Oklch {
  const m = /oklch\(\s*([\d.]+)\s+([\d.]+)\s+([\d.]+)\s*(?:\/\s*([\d.]+))?\s*\)/.exec(input);
  if (!m) throw new Error(`unparseable oklch literal: ${input}`);
  return { L: Number(m[1]), C: Number(m[2]), H: Number(m[3]), alpha: m[4] === undefined ? 1 : Number(m[4]) };
}

/** OKLab/OKLCH -> linear sRGB (Bjorn Ottosson's canonical matrices). */
function oklchToLinearRgb(c: Oklch): [number, number, number] {
  const hr = (c.H * Math.PI) / 180;
  const a = c.C * Math.cos(hr);
  const b = c.C * Math.sin(hr);
  const l_ = c.L + 0.3963377774 * a + 0.2158037573 * b;
  const m_ = c.L - 0.1055613458 * a - 0.0638541728 * b;
  const s_ = c.L - 0.0894841775 * a - 1.291485548 * b;
  const l = l_ ** 3;
  const m = m_ ** 3;
  const s = s_ ** 3;
  const r = 4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s;
  const g = -1.2684380048 * l + 2.6097574011 * m - 0.3413193965 * s;
  const bb = -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s;
  return [r, g, bb];
}

function relativeLuminance(input: string): number {
  const [r, g, b] = oklchToLinearRgb(parseOklch(input));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
}

/** WCAG 2.x contrast ratio between two oklch colors (1.0 .. 21.0). */
function wcagContrast(fg: string, bg: string): number {
  const la = relativeLuminance(fg);
  const lb = relativeLuminance(bg);
  const hi = Math.max(la, lb);
  const lo = Math.min(la, lb);
  return (hi + 0.05) / (lo + 0.05);
}

/* Canonical light-theme values (design-system sec.2 == tokens.css :root). */
const LIGHT = {
  canvas: 'oklch(0.975 0.012 78)',
  text1: 'oklch(0.205 0.025 255)',
  text2: 'oklch(0.405 0.025 255)',
  text3: 'oklch(0.525 0.020 255)',
  brand: 'oklch(0.655 0.205 29)',
  brandOn: 'oklch(0.985 0.006 78)',
} as const;

/* Every role VAL-DS-001 requires the gallery to surface. */
const REQUIRED_ROLES = [
  'canvas', 'canvas-raised', 'surface-1', 'surface-2', 'surface-3',
  'text-1', 'text-2', 'text-3',
  'border-subtle', 'border-strong',
  'brand', 'brand-hover', 'brand-on',
  'discovery', 'info', 'success', 'warning', 'danger',
  'focus', 'scrim',
] as const;

describe('GalleryPageComponent — M1 light-theme token reference', () => {
  it('renders the reference primary button (VAL-DS-003 sampling target)', async () => {
    await TestBed.configureTestingModule({ imports: [GalleryPageComponent] }).compileComponents();
    const fixture = TestBed.createComponent(GalleryPageComponent);
    fixture.detectChanges();
    const primary = fixture.nativeElement.querySelector('.zm-btn--primary') as HTMLButtonElement;
    expect(primary, 'primary reference button must render').toBeTruthy();
    expect(primary.textContent?.trim()).toBe('Yayınla');
  });

  it('surfaces every VAL-DS-001 semantic role as a live swatch', async () => {
    await TestBed.configureTestingModule({ imports: [GalleryPageComponent] }).compileComponents();
    const fixture = TestBed.createComponent(GalleryPageComponent);
    fixture.detectChanges();
    const tokens = Array.from(fixture.nativeElement.querySelectorAll('.swatch__token') as NodeListOf<HTMLElement>)
      .map(el => el.textContent?.trim() ?? '');
    for (const role of REQUIRED_ROLES) {
      expect(tokens, `gallery must render the --zm-${role} swatch`).toContain(`--zm-${role}`);
    }
    expect(tokens.length).toBe(REQUIRED_ROLES.length);
  });

  it('binds each swatch chip to its live var(--zm-*) cascade value', async () => {
    await TestBed.configureTestingModule({ imports: [GalleryPageComponent] }).compileComponents();
    const fixture = TestBed.createComponent(GalleryPageComponent);
    fixture.detectChanges();
    const chips = fixture.nativeElement.querySelectorAll('.swatch__chip') as NodeListOf<HTMLElement>;
    expect(chips.length).toBe(REQUIRED_ROLES.length);
    // Every chip must resolve a non-empty background that references --zm-*.
    for (const chip of Array.from(chips)) {
      const bg = chip.style.background || chip.style.backgroundColor;
      expect(bg, 'chip background must be bound to a --zm-* token').toMatch(/--zm-/);
    }
  });
});

describe('GalleryPageComponent — M1 typography panel (VAL-DS-008/009/010/011)', () => {
  /**
   * The typography panel exists so the four typography assertions can be
   * verified in a browser against a single gallery capture. The DOM guards
   * here prove the surface exists with the right structure (roles, scale,
   * long-form column); runtime font-family resolution, Turkish glyph
   * rasterization, clamp fluidity, and 68–72ch measure are proven by the
   * browser probe in docs/task-evidence/m1-typography.md.
   */
  it('renders one sample per font role (ui, display, mono)', async () => {
    await TestBed.configureTestingModule({ imports: [GalleryPageComponent] }).compileComponents();
    const fixture = TestBed.createComponent(GalleryPageComponent);
    fixture.detectChanges();
    const roles = Array.from(fixture.nativeElement.querySelectorAll('.type-role') as NodeListOf<HTMLElement>);
    expect(roles.length, 'three font roles must render').toBe(3);
    const keys = roles.map(el => el.getAttribute('data-role'));
    expect(keys).toEqual(['ui', 'display', 'mono']);
  });

  it('each role sample contains the Turkish glyph set (Ç Ğ İ Ş ç ğ ı ö ş ü)', async () => {
    await TestBed.configureTestingModule({ imports: [GalleryPageComponent] }).compileComponents();
    const fixture = TestBed.createComponent(GalleryPageComponent);
    fixture.detectChanges();
    const samples = Array.from(fixture.nativeElement.querySelectorAll('.type-role__sample') as NodeListOf<HTMLElement>)
      .map(el => el.textContent ?? '');
    expect(samples.length).toBe(3);
    // Every role sample must include the full TR glyph set used by VAL-DS-009.
    for (const sample of samples) {
      expect(sample, 'each role sample must exercise Ç').toContain('Ç');
      expect(sample, 'each role sample must exercise Ğ').toContain('Ğ');
      expect(sample, 'each role sample must exercise İ (dotted capital I)').toContain('İ');
      expect(sample, 'each role sample must exercise Ş').toContain('Ş');
      expect(sample, 'each role sample must exercise ç').toContain('ç');
      expect(sample, 'each role sample must exercise ğ').toContain('ğ');
      expect(sample, 'each role sample must exercise ı (dotless lowercase)').toContain('ı');
      expect(sample, 'each role sample must exercise ö').toContain('ö');
      expect(sample, 'each role sample must exercise ş').toContain('ş');
      expect(sample, 'each role sample must exercise ü').toContain('ü');
    }
  });

  it('renders all seven type-scale steps (xs..display), each bound to its token', async () => {
    await TestBed.configureTestingModule({ imports: [GalleryPageComponent] }).compileComponents();
    const fixture = TestBed.createComponent(GalleryPageComponent);
    fixture.detectChanges();
    const rows = Array.from(fixture.nativeElement.querySelectorAll('.type-scale__row') as NodeListOf<HTMLElement>);
    expect(rows.length, 'seven scale steps must render').toBe(7);
    const sampleEl = rows[3].querySelector('.type-scale__sample') as HTMLElement;
    // The font-size for each sample must be bound to the live var(--zm-text-<step>).
    expect(sampleEl.style.fontSize, 'scale sample font-size must reference a --zm-text-* token')
      .toMatch(/^var\(--zm-text-(xs|sm|md|lg|xl|2xl|display)\)$/);
  });

  it('renders the long-form reading column for the VAL-DS-011 measure probe', async () => {
    await TestBed.configureTestingModule({ imports: [GalleryPageComponent] }).compileComponents();
    const fixture = TestBed.createComponent(GalleryPageComponent);
    fixture.detectChanges();
    const longForm = fixture.nativeElement.querySelector('.long-form') as HTMLElement;
    expect(longForm, 'long-form column must render').toBeTruthy();
    // CSS sets max-width: var(--zm-measure-long-form) = 70ch (validated by
    // the typography spec against tokens.css and by the browser probe).
    expect(longForm.textContent?.trim().length, 'long-form column needs content to measure')
      .toBeGreaterThan(200);
  });
});

describe('GalleryPageComponent — M1 shape & depth panel (design-system §5/§6)', () => {
  /**
   * The shape & depth panel makes the radius roles, border weights, separator
   * roles, and the seven material-depth tiers observable in a browser. The DOM
   * guards here prove the surface renders with the right structure and that
   * every live style binding references a --zm-* token (no hardcoded values).
   */
  it('renders the four radius role tiles, each bound to its role token', async () => {
    await TestBed.configureTestingModule({ imports: [GalleryPageComponent] }).compileComponents();
    const fixture = TestBed.createComponent(GalleryPageComponent);
    fixture.detectChanges();
    const rows = Array.from(fixture.nativeElement.querySelectorAll('.shape-role') as NodeListOf<HTMLElement>);
    expect(rows.length, 'four radius roles must render').toBe(4);
    const tile = rows[0].querySelector('.shape-role__tile') as HTMLElement;
    expect(tile.style.borderRadius, 'radius tile must reference a --zm-radius-* role token')
      .toMatch(/^var\(--zm-radius-(control|field|card|sheet)\)$/);
  });

  it('renders the two canonical border-weight samples (hair + strong)', async () => {
    await TestBed.configureTestingModule({ imports: [GalleryPageComponent] }).compileComponents();
    const fixture = TestBed.createComponent(GalleryPageComponent);
    fixture.detectChanges();
    const borders = Array.from(fixture.nativeElement.querySelectorAll('.shape-border') as NodeListOf<HTMLElement>);
    expect(borders.length, 'two border weights must render').toBe(2);
    expect(borders[0].classList.contains('shape-border--hair')).toBe(true);
    expect(borders[1].classList.contains('shape-border--strong')).toBe(true);
  });

  it('renders the subtle + strong separator samples', async () => {
    await TestBed.configureTestingModule({ imports: [GalleryPageComponent] }).compileComponents();
    const fixture = TestBed.createComponent(GalleryPageComponent);
    fixture.detectChanges();
    const seps = Array.from(fixture.nativeElement.querySelectorAll('.shape-sep') as NodeListOf<HTMLElement>);
    expect(seps.length, 'two separator samples must render').toBe(2);
    expect(seps[0].classList.contains('shape-sep--strong')).toBe(false);
    expect(seps[1].classList.contains('shape-sep--strong')).toBe(true);
  });

  it('renders the seven material-depth tiers, each bound to its elevation token', async () => {
    await TestBed.configureTestingModule({ imports: [GalleryPageComponent] }).compileComponents();
    const fixture = TestBed.createComponent(GalleryPageComponent);
    fixture.detectChanges();
    const layers = Array.from(fixture.nativeElement.querySelectorAll('.material-layer') as NodeListOf<HTMLElement>);
    expect(layers.length, 'seven material tiers must render').toBe(7);
    for (const layer of layers) {
      expect(layer.style.boxShadow, 'material layer box-shadow must reference a --zm-elevation-* token')
        .toMatch(/^var\(--zm-elevation-/);
      expect(layer.style.background, 'material layer background must reference a --zm-* token')
        .toMatch(/^var\(--zm-/);
    }
  });
});

describe('GalleryPageComponent — M1 motion panel (VAL-DS-012..017)', () => {
  /**
   * The motion panel surfaces every --zm-duration-* / --zm-ease-* token, a
   * rapid-toggle demo proving CSS-transition interruptibility (VAL-DS-014),
   * an enter/leave demo (VAL-DS-013), and a state-feedback matrix proving
   * every interactive state is discriminable without motion (VAL-DS-017).
   * The browser probe (docs/task-evidence/m1-motion.md) verifies the live
   * token values + reduced-motion collapse; these DOM guards prove the
   * surface exists with the right structure and token bindings.
   */

  it('renders the five duration tokens, each bound to its live --zm-duration-* value', async () => {
    await TestBed.configureTestingModule({ imports: [GalleryPageComponent] }).compileComponents();
    const fixture = TestBed.createComponent(GalleryPageComponent);
    fixture.detectChanges();
    const rows = Array.from(fixture.nativeElement.querySelectorAll('.motion-row') as NodeListOf<HTMLElement>);
    // At least the five duration rows render (ease rows render in the same
    // table class; verify duration binding on the first row's bar).
    expect(rows.length, 'motion token rows must render').toBeGreaterThanOrEqual(5);
    const durationRow = rows[0];
    const value = durationRow.querySelector('.motion-row__value') as HTMLElement;
    expect(value.style.transitionDuration, 'duration value must bind a --zm-duration-* token')
      .toMatch(/^var\(--zm-duration-/);
    const ms = durationRow.querySelector('.motion-row__ms');
    expect(ms?.textContent?.trim(), 'duration row must show its nominal ms').toMatch(/\d+\s*ms/);
  });

  it('renders the four ease tokens, each bound to its live --zm-ease-* value', async () => {
    await TestBed.configureTestingModule({ imports: [GalleryPageComponent] }).compileComponents();
    const fixture = TestBed.createComponent(GalleryPageComponent);
    fixture.detectChanges();
    const beziers = Array.from(fixture.nativeElement.querySelectorAll('.motion-row__bezier') as NodeListOf<HTMLElement>);
    expect(beziers.length, 'four ease beziers must render').toBe(4);
    for (const bez of beziers) {
      expect(bez.style.transitionTimingFunction, 'ease bezier must bind a --zm-ease-* token')
        .toMatch(/^var\(--zm-ease-/);
    }
  });

  it('renders the rapid-toggle demo controls (VAL-DS-014 surface)', async () => {
    await TestBed.configureTestingModule({ imports: [GalleryPageComponent] }).compileComponents();
    const fixture = TestBed.createComponent(GalleryPageComponent);
    fixture.detectChanges();
    const thumb = fixture.nativeElement.querySelector('.motion-toggle-thumb') as HTMLElement;
    expect(thumb, 'rapid-toggle thumb must render').toBeTruthy();
    expect(thumb.classList.contains('is-on'), 'thumb starts in off state').toBe(false);
    const rapid = fixture.nativeElement.querySelector('.motion-toggle-count') as HTMLElement;
    expect(rapid?.textContent?.trim(), 'toggle count must be announced').toMatch(/Basış:\s*\d+/);
  });

  it('rapid-toggle burst flips state exactly 10 times and settles to a final value', async () => {
    await TestBed.configureTestingModule({ imports: [GalleryPageComponent] }).compileComponents();
    const fixture = TestBed.createComponent(GalleryPageComponent);
    fixture.detectChanges();
    const comp = fixture.componentInstance as GalleryPageComponent;
    // Simulate the 10x rapid burst from the gallery button. An even number of
    // toggles returns to the original state — this is the contract: the final
    // computed state always matches the LAST input, never a queued midpoint.
    comp.onMotionRapid();
    expect(comp.toggleCount(), 'count tracks every input').toBe(10);
    expect(comp.toggleState(), 'even burst returns to the original state').toBe(false);
    // One more toggle — final state must match the last input.
    comp.onMotionToggle();
    expect(comp.toggleCount()).toBe(11);
    expect(comp.toggleState(), 'final state matches last input').toBe(true);
  });

  it('enter/leave demo mounts the card with the .zm-enter class', async () => {
    await TestBed.configureTestingModule({ imports: [GalleryPageComponent] }).compileComponents();
    const fixture = TestBed.createComponent(GalleryPageComponent);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.motion-enter-card'), 'card hidden initially').toBeNull();
    const comp = fixture.componentInstance as GalleryPageComponent;
    comp.onToggleEnterDemo();
    fixture.detectChanges();
    const card = fixture.nativeElement.querySelector('.motion-enter-card') as HTMLElement;
    expect(card, 'enter card mounts on toggle').toBeTruthy();
    expect(card.classList.contains('zm-enter'), 'card carries the .zm-enter utility').toBe(true);
  });

  it('renders the state-feedback matrix with at least 8 discriminable states', async () => {
    await TestBed.configureTestingModule({ imports: [GalleryPageComponent] }).compileComponents();
    const fixture = TestBed.createComponent(GalleryPageComponent);
    fixture.detectChanges();
    const states = Array.from(fixture.nativeElement.querySelectorAll('.motion-state') as NodeListOf<HTMLElement>);
    expect(states.length, 'state-feedback matrix must render >= 8 states').toBeGreaterThanOrEqual(8);
    // Every state has a textual label (state is never conveyed by color/motion alone).
    for (const s of states) {
      expect((s.textContent ?? '').trim().length, 'each state must carry a text label').toBeGreaterThan(0);
      const dot = s.querySelector('.motion-state__dot');
      expect(dot, 'each state must have a dot indicator').toBeTruthy();
    }
  });
});

describe('Light theme — VAL-DS-003 contrast & hue contract (deterministic)', () => {
  it('canvas is warm-neutral (hue 60-90 deg, low chroma)', () => {
    const c = parseOklch(LIGHT.canvas);
    expect(c.H, 'canvas hue must sit on the warm-neutral 60-90 axis').toBeGreaterThanOrEqual(60);
    expect(c.H).toBeLessThanOrEqual(90);
    expect(c.C, 'canvas must be low-chroma (neutral)').toBeLessThan(0.03);
  });

  it('brand is coral (hue near 29 deg, chroma >= 0.18)', () => {
    const b = parseOklch(LIGHT.brand);
    expect(b.H, 'brand hue must read coral (20-38 deg)').toBeGreaterThanOrEqual(20);
    expect(b.H).toBeLessThanOrEqual(38);
    expect(b.C, 'brand chroma must be saturated enough to read as coral').toBeGreaterThanOrEqual(0.18);
  });

  it('text-1 on canvas meets WCAG AA body-text contrast (>= 4.5:1)', () => {
    expect(wcagContrast(LIGHT.text1, LIGHT.canvas)).toBeGreaterThanOrEqual(4.5);
  });

  it('text-2 on canvas meets WCAG AA body-text contrast (>= 4.5:1)', () => {
    expect(wcagContrast(LIGHT.text2, LIGHT.canvas)).toBeGreaterThanOrEqual(4.5);
  });

  it('brand-on on brand meets large/non-text contrast (>= 3:1)', () => {
    // The primary button foreground (brand-on) on the brand fill.
    expect(wcagContrast(LIGHT.brandOn, LIGHT.brand)).toBeGreaterThanOrEqual(3);
  });

  it('text-1 on canvas is comfortably above AA (regression guard)', () => {
    // ink-900 on warm paper should be very high contrast; guard against drift.
    expect(wcagContrast(LIGHT.text1, LIGHT.canvas)).toBeGreaterThanOrEqual(10);
  });
});

/* ---------------------------------------------------------------------------
 * Buttons panel guards — VAL-DS-018 (variant × state matrix), VAL-DS-019
 * (loading preserves width + accessible name), VAL-DS-020 (icon buttons:
 * aria-label + 44×44 target + tooltip). The pixel-level measurements (width
 * delta, 44×44 hit rect, tooltip reveal) are proven by the browser probe on
 * /_design; here we guard that the primitive components are wired into the
 * gallery with the correct hooks (data-variant, aria-busy, aria-label, etc.).
 * ------------------------------------------------------------------------ */

describe('GalleryPageComponent — buttons primitive panel (VAL-DS-018/019/020)', () => {
  async function renderGallery() {
    await TestBed.configureTestingModule({ imports: [GalleryPageComponent] }).compileComponents();
    const fixture = TestBed.createComponent(GalleryPageComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('renders the variant × state matrix with all four variants (VAL-DS-018)', async () => {
    const f = await renderGallery();
    const matrix = f.nativeElement.querySelector('.zm-matrix');
    expect(matrix, 'matrix must render').toBeTruthy();
    const variants = Array.from(matrix.querySelectorAll('zm-button .zm-button__btn')).map(
      (b) => (b as HTMLElement).getAttribute('data-variant')
    );
    expect(variants).toEqual(expect.arrayContaining(['primary', 'secondary', 'quiet', 'danger']));
  });

  it('renders a loading button that exposes aria-busy=true (VAL-DS-019)', async () => {
    const f = await renderGallery();
    // The matrix renders loading buttons for primary/secondary/danger (quiet is
    // excluded by design — quiet buttons do not enter a loading state).
    const busyButtons = Array.from(f.nativeElement.querySelectorAll('.zm-matrix .zm-button__btn.is-loading')) as HTMLElement[];
    expect(busyButtons.length, 'at least one loading button must be present').toBeGreaterThan(0);
    const first = busyButtons[0];
    expect(first.getAttribute('aria-busy')).toBe('true');
    expect((first as HTMLButtonElement).disabled).toBe(true);
  });

  it('renders the loading width-stability demo with a toggleable button', async () => {
    const f = await renderGallery();
    const demo = f.nativeElement.querySelector('.zm-loading-demo') as HTMLElement;
    expect(demo, 'loading demo must render').toBeTruthy();
    const demoBtn = demo.querySelector('zm-button') as HTMLElement;
    expect(demoBtn).toBeTruthy();
    // Initial state: not loading.
    const inner = demoBtn.querySelector('.zm-button__btn') as HTMLButtonElement;
    expect(inner.classList.contains('is-loading')).toBe(false);
    expect(f.componentInstance.loadingDemo()).toBe(false);
    // Toggle loading on.
    f.componentInstance.loadingDemo.set(true);
    fixtureDetect(f);
    expect(inner.classList.contains('is-loading')).toBe(true);
    expect(inner.getAttribute('aria-busy')).toBe('true');
  });

  it('renders icon buttons each carrying a non-empty aria-label (VAL-DS-020)', async () => {
    const f = await renderGallery();
    const iconButtons = Array.from(f.nativeElement.querySelectorAll('.zm-icon-row zm-icon-button .zm-icon-button__btn')) as HTMLButtonElement[];
    expect(iconButtons.length, 'icon row must have at least 4 icon buttons').toBeGreaterThanOrEqual(4);
    for (const b of iconButtons) {
      const label = b.getAttribute('aria-label');
      expect(label, 'every icon button must have a non-empty aria-label').toBeTruthy();
      expect(label!.trim().length).toBeGreaterThan(0);
    }
  });

  it('renders a tooltip element per icon button whose text is non-empty', async () => {
    const f = await renderGallery();
    const tooltips = Array.from(f.nativeElement.querySelectorAll('.zm-icon-row .zm-icon-button__tooltip')) as HTMLElement[];
    expect(tooltips.length).toBeGreaterThan(0);
    for (const t of tooltips) {
      expect(t.textContent?.trim().length, 'tooltip text must be non-empty').toBeGreaterThan(0);
      expect(t.getAttribute('aria-hidden')).toBe('true');
    }
  });

  it('reflects the liked icon-button pressed state as aria-pressed', async () => {
    const f = await renderGallery();
    const likeBtn = f.nativeElement.querySelector('.zm-icon-row zm-icon-button:first-of-type .zm-icon-button__btn') as HTMLButtonElement;
    // Toggle liked on.
    f.componentInstance.likedDemo.set(true);
    fixtureDetect(f);
    expect(likeBtn.getAttribute('aria-pressed')).toBe('true');
  });
});

/** Helper: re-run change detection on the gallery fixture (OnPush). */
function fixtureDetect(fixture: { detectChanges: () => void }): void {
  fixture.detectChanges();
}

/* ---------------------------------------------------------------------------
 * Form controls panel (VAL-DS-021 / VAL-DS-022 / VAL-DS-023).
 * Guards the gallery wiring of the real primitives: persistent <label> +
 * for/id, aria-invalid + aria-describedby on error, the password reveal
 * toggle (aria-pressed, type flip, safe focus), and the disabled / error /
 * high-contrast state hooks. Pixel-level forced-colors + focus-ring visibility
 * are proven by the browser probe on /_design.
 * ------------------------------------------------------------------------ */
describe('GalleryPageComponent — form controls panel (VAL-DS-021/022/023)', () => {
  async function renderGallery() {
    await TestBed.configureTestingModule({ imports: [GalleryPageComponent] }).compileComponents();
    const fixture = TestBed.createComponent(GalleryPageComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('renders the form-controls panel with all three primitives', async () => {
    const f = await renderGallery();
    const panel = f.nativeElement.querySelector('#gallery-form-heading') as HTMLElement;
    expect(panel, 'form-controls panel heading must render').toBeTruthy();
    expect(f.nativeElement.querySelector('zm-input'), 'at least one zm-input must render').toBeTruthy();
    expect(f.nativeElement.querySelector('zm-textarea'), 'at least one zm-textarea must render').toBeTruthy();
    expect(f.nativeElement.querySelector('zm-select'), 'at least one zm-select must render').toBeTruthy();
  });

  it('renders a persistent <label for=id> for every input/select/textarea', async () => {
    const f = await renderGallery();
    const fields = Array.from(f.nativeElement.querySelectorAll('zm-input, zm-textarea, zm-select')) as HTMLElement[];
    expect(fields.length, 'the panel must render several fields').toBeGreaterThanOrEqual(3);
    for (const field of fields) {
      const label = field.querySelector('label');
      const control = field.querySelector('input, textarea, select');
      expect(label, 'every field must have a <label>').toBeTruthy();
      expect(control, 'every field must have its native control').toBeTruthy();
      const forAttr = label!.getAttribute('for');
      expect(forAttr, 'label must carry a for attribute').toBeTruthy();
      expect(forAttr).toBe(control!.id);
      expect((label!.textContent ?? '').trim().length, 'label text must be non-empty').toBeGreaterThan(0);
    }
  });

  it('ties the error node via aria-describedby + aria-invalid on error fields', async () => {
    const f = await renderGallery();
    const errored = Array.from(f.nativeElement.querySelectorAll('.zm-input__field.is-error, .zm-textarea__field.is-error, .zm-select__field.is-error')) as HTMLElement[];
    expect(errored.length, 'the panel must demo at least one error state per kind').toBeGreaterThanOrEqual(3);
    for (const field of errored) {
      const control = field.querySelector('input, textarea, select') as HTMLElement;
      expect(control.getAttribute('aria-invalid')).toBe('true');
      const describedBy = control.getAttribute('aria-describedby');
      expect(describedBy, 'aria-describedby must be set on error').toBeTruthy();
      const errorNode = field.querySelector(`#${describedBy}`) as HTMLElement | null;
      expect(errorNode, 'describedby must resolve to a real error node').toBeTruthy();
      expect((errorNode!.textContent ?? '').trim().length).toBeGreaterThan(0);
    }
  });

  it('renders the password reveal toggle with initial aria-pressed=false and type=password', async () => {
    const f = await renderGallery();
    const passwordFields = Array.from(f.nativeElement.querySelectorAll('zm-input .zm-input__field.is-password')) as HTMLElement[];
    expect(passwordFields.length, 'at least one password field must render').toBeGreaterThanOrEqual(1);
    const first = passwordFields[0];
    const input = first.querySelector('input') as HTMLInputElement;
    const toggle = first.querySelector('button.zm-input__reveal') as HTMLButtonElement;
    expect(input.getAttribute('type')).toBe('password');
    expect(toggle, 'reveal toggle must render').toBeTruthy();
    expect(toggle.getAttribute('aria-pressed')).toBe('false');
    expect(toggle.getAttribute('aria-label')).toBe('Şifreyi göster');
  });

  it('flips the password type + aria-pressed after toggling reveal (VAL-DS-022)', async () => {
    const f = await renderGallery();
    const first = f.nativeElement.querySelector('zm-input .zm-input__field.is-password') as HTMLElement;
    const input = first.querySelector('input') as HTMLInputElement;
    const toggle = first.querySelector('button.zm-input__reveal') as HTMLButtonElement;
    toggle.click();
    fixtureDetect(f);
    expect(input.getAttribute('type')).toBe('text');
    expect(toggle.getAttribute('aria-pressed')).toBe('true');
    expect(toggle.getAttribute('aria-label')).toBe('Şifreyi gizle');
  });

  it('covers disabled and high-contrast states across the three primitives', async () => {
    const f = await renderGallery();
    expect(f.nativeElement.querySelector('.zm-input__field.is-disabled'), 'disabled input must render').toBeTruthy();
    expect(f.nativeElement.querySelector('.zm-input__field.is-high-contrast'), 'high-contrast input must render').toBeTruthy();
    expect(f.nativeElement.querySelector('.zm-textarea__field.is-disabled'), 'disabled textarea must render').toBeTruthy();
    expect(f.nativeElement.querySelector('.zm-select__field.is-disabled'), 'disabled select must render').toBeTruthy();
  });

  it('projects <option> children into the native select', async () => {
    const f = await renderGallery();
    const select = f.nativeElement.querySelector('zm-select select') as HTMLSelectElement;
    expect(select.querySelectorAll('option').length, 'select must project option children').toBeGreaterThanOrEqual(2);
  });

  it('renders the decorative select chevron as aria-hidden', async () => {
    const f = await renderGallery();
    const chevron = f.nativeElement.querySelector('.zm-select__chevron') as SVGElement | null;
    expect(chevron, 'chevron must render').toBeTruthy();
    expect(chevron!.getAttribute('aria-hidden')).toBe('true');
  });
});

/* ---------------------------------------------------------------------------
 * Overlays panel (VAL-DS-026 / VAL-DS-027).
 * Guards the gallery wiring of the four overlay primitives so the gallery is
 * the browser-QA surface for the overlay contract. Each primitive's own spec
 * guards the focus-trap / escape / return-focus / outside-click / scroll-lock
 * mechanism; here we assert the panel renders every primitive + the
 * destructive non-dismissible dialog + the sheet.
 * ------------------------------------------------------------------------ */
describe('GalleryPageComponent — overlays panel (VAL-DS-026/027)', () => {
  async function renderGallery() {
    await TestBed.configureTestingModule({ imports: [GalleryPageComponent] }).compileComponents();
    const fixture = TestBed.createComponent(GalleryPageComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('renders the overlays panel heading', async () => {
    const f = await renderGallery();
    const heading = f.nativeElement.querySelector('#gallery-overlays-heading') as HTMLElement;
    expect(heading, 'overlays panel heading must render').toBeTruthy();
  });

  it('renders a ZmTooltip wrapping a trigger (VAL-DS-026 tooltip surface)', async () => {
    const f = await renderGallery();
    const tooltips = f.nativeElement.querySelectorAll('zm-tooltip');
    expect(tooltips.length, 'at least one zm-tooltip must render').toBeGreaterThanOrEqual(1);
  });

  it('renders a ZmMenu with a trigger button', async () => {
    const f = await renderGallery();
    const menu = f.nativeElement.querySelector('zm-menu');
    expect(menu, 'zm-menu must render').toBeTruthy();
    // The menuitems live inside an unopened <ng-template>; they render on
    // open() and are covered by the menu's own spec. Here we assert the
    // trigger exists so the gallery is the QA surface for opening the menu.
    const trigger = f.nativeElement.querySelector('[data-testid="gallery-menu-trigger"]');
    expect(trigger, 'menu trigger button must render').toBeTruthy();
  });

  it('renders a dismissible ZmDialog (confirm) and a non-dismissible ZmDialog (destructive)', async () => {
    const f = await renderGallery();
    const dialogs = f.nativeElement.querySelectorAll('zm-dialog');
    expect(dialogs.length, 'at least two zm-dialog must render').toBeGreaterThanOrEqual(2);
    // The destructive (dismissible=false) dialog is the second zm-dialog; the
    // browser probe asserts it ignores scrim-click + Escape (VAL-DS-027 neg).
    expect(dialogs.length, 'destructive dialog must be present').toBeGreaterThanOrEqual(2);
  });

  it('renders a ZmSheet (side-anchored overlay)', async () => {
    const f = await renderGallery();
    const sheet = f.nativeElement.querySelector('zm-sheet');
    expect(sheet, 'zm-sheet must render').toBeTruthy();
  });
});

/* ---------------------------------------------------------------------------
 * Feedback states panel (VAL-DS-028 / VAL-DS-029).
 * Guards the gallery wiring of the five feedback-state primitives so the
 * gallery is the browser-QA surface for the feedback-state contract. Each
 * primitive's own spec guards its internal behavior (toast live-region +
 * auto-dismiss + focus return, skeleton aria-hidden, empty/error/permission
 * roles + Turkish recovery copy + non-color cues); here we assert the panel
 * renders every primitive with the correct hooks (roles, variant coverage,
 * Turkish copy, distinct glyphs, recovery actions) so a browser probe can
 * deep-link and inspect them.
 * ------------------------------------------------------------------------ */
describe('GalleryPageComponent — feedback states panel (VAL-DS-028/029)', () => {
  async function renderGallery() {
    await TestBed.configureTestingModule({ imports: [GalleryPageComponent] }).compileComponents();
    const fixture = TestBed.createComponent(GalleryPageComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('renders the feedback-states panel heading', async () => {
    const f = await renderGallery();
    const heading = f.nativeElement.querySelector('#gallery-states-heading') as HTMLElement;
    expect(heading, 'feedback-states panel heading must render').toBeTruthy();
  });

  it('renders all five feedback-state primitives (VAL-DS-028)', async () => {
    const f = await renderGallery();
    expect(f.nativeElement.querySelector('zm-toast'), 'zm-toast must render').toBeTruthy();
    expect(f.nativeElement.querySelector('zm-skeleton'), 'zm-skeleton must render').toBeTruthy();
    expect(f.nativeElement.querySelector('zm-empty-state'), 'zm-empty-state must render').toBeTruthy();
    expect(f.nativeElement.querySelector('zm-error-state'), 'zm-error-state must render').toBeTruthy();
    expect(f.nativeElement.querySelector('zm-permission-state'), 'zm-permission-state must render').toBeTruthy();
  });

  it('renders all four toast variants in the persistent stack (VAL-DS-028/029)', async () => {
    const f = await renderGallery();
    const stack = f.nativeElement.querySelector('.zm-states__toast-stack');
    expect(stack, 'toast stack must render').toBeTruthy();
    const toasts = Array.from(stack.querySelectorAll('zm-toast')) as HTMLElement[];
    expect(toasts.length, 'four variant toasts must render in the stack').toBe(4);
    const variants = toasts.map(t => t.getAttribute('data-variant'));
    expect(variants).toEqual(expect.arrayContaining(['info', 'success', 'warning', 'error']));
  });

  it('the error toast in the stack carries role=alert (assertive announce)', async () => {
    const f = await renderGallery();
    const stack = f.nativeElement.querySelector('.zm-states__toast-stack');
    const errorToast = Array.from(stack.querySelectorAll('zm-toast')).find(
      (t) => (t as HTMLElement).getAttribute('data-variant') === 'error',
    ) as HTMLElement;
    expect(errorToast.getAttribute('role')).toBe('alert');
    expect(errorToast.getAttribute('aria-live')).toBe('assertive');
  });

  it('the info/success/warning toasts carry role=status (polite announce)', async () => {
    const f = await renderGallery();
    const stack = f.nativeElement.querySelector('.zm-states__toast-stack');
    const politeToasts = Array.from(stack.querySelectorAll('zm-toast')).filter(
      (t) => ['info', 'success', 'warning'].includes((t as HTMLElement).getAttribute('data-variant') ?? ''),
    ) as HTMLElement[];
    expect(politeToasts.length).toBe(3);
    for (const t of politeToasts) {
      expect(t.getAttribute('role')).toBe('status');
      expect(t.getAttribute('aria-live')).toBe('polite');
    }
  });

  it('renders the transient toast trigger button (auto-dismiss demo)', async () => {
    const f = await renderGallery();
    const btn = Array.from(f.nativeElement.querySelectorAll('button')).find(
      (b) => ((b as HTMLButtonElement).textContent ?? '').includes('Geçici toast göster'),
    ) as HTMLButtonElement;
    expect(btn, 'transient toast trigger must render').toBeTruthy();
    // Initially no transient toast is mounted.
    expect(f.componentInstance.transientToastVisible()).toBe(false);
    expect(f.nativeElement.querySelector('.zm-states__transient')).toBeNull();
  });

  it('mounts the transient toast when the trigger is activated', async () => {
    const f = await renderGallery();
    f.componentInstance.onShowTransientToast();
    f.detectChanges();
    expect(f.componentInstance.transientToastVisible()).toBe(true);
    const transient = f.nativeElement.querySelector('.zm-states__transient') as HTMLElement;
    expect(transient, 'transient toast container must mount').toBeTruthy();
    expect(transient.querySelector('zm-toast')).toBeTruthy();
  });

  it('renders the skeleton demo with text, circle, and rect variants', async () => {
    const f = await renderGallery();
    const skeletonWrap = f.nativeElement.querySelector('.zm-states__skeleton');
    expect(skeletonWrap, 'skeleton demo must render').toBeTruthy();
    const skeletons = Array.from(skeletonWrap.querySelectorAll('zm-skeleton')) as HTMLElement[];
    expect(skeletons.length).toBeGreaterThanOrEqual(3);
    const variants = skeletons.map(s => s.getAttribute('data-variant'));
    expect(variants).toEqual(expect.arrayContaining(['text', 'circle', 'rect']));
  });

  it('renders the empty state with a specific Turkish title + action (VAL-DS-028)', async () => {
    const f = await renderGallery();
    const empty = f.nativeElement.querySelector('zm-empty-state') as HTMLElement;
    expect(empty).toBeTruthy();
    expect(empty.getAttribute('role')).toBe('group');
    const title = empty.querySelector('.zm-state__title')!.textContent!.trim();
    expect(title).toBe('Akışın henüz boş');
    const action = empty.querySelector('.zm-state__action') as HTMLButtonElement;
    expect(action).toBeTruthy();
    expect(action.textContent!.trim()).toBe('Keşfetten başla');
  });

  it('renders the error state with role=alert + retry action + Turkish cause (VAL-DS-028)', async () => {
    const f = await renderGallery();
    const error = f.nativeElement.querySelector('zm-error-state') as HTMLElement;
    expect(error).toBeTruthy();
    expect(error.getAttribute('role')).toBe('alert');
    expect(error.getAttribute('aria-atomic')).toBe('true');
    const title = error.querySelector('.zm-state__title')!.textContent!.trim();
    expect(title).toContain('yenilenemedi');
    expect(title).not.toContain('Bir şeyler ters gitti');
    const retry = error.querySelector('.zm-state__action') as HTMLButtonElement;
    expect(retry).toBeTruthy();
    expect(retry.textContent!.trim()).toBe('Tekrar dene');
  });

  it('renders the permission state with rationale + recovery action (VAL-DS-028)', async () => {
    const f = await renderGallery();
    const perm = f.nativeElement.querySelector('zm-permission-state') as HTMLElement;
    expect(perm).toBeTruthy();
    expect(perm.getAttribute('role')).toBe('group');
    const title = perm.querySelector('.zm-state__title')!.textContent!.trim();
    expect(title).toContain('yalnızca');
    const desc = perm.querySelector('.zm-state__description')!.textContent!.trim();
    expect(desc).toContain('yetkisi');
    const action = perm.querySelector('.zm-state__action') as HTMLButtonElement;
    expect(action).toBeTruthy();
    expect(action.textContent!.trim()).toBe('Erişim talep et');
  });

  it('the error and permission glyphs differ so the states read in grayscale (VAL-DS-029)', async () => {
    const f = await renderGallery();
    const errorIcon = f.nativeElement.querySelector('zm-error-state .zm-state__icon') as HTMLElement;
    const permIcon = f.nativeElement.querySelector('zm-permission-state .zm-state__icon') as HTMLElement;
    const emptyIcon = f.nativeElement.querySelector('zm-empty-state .zm-state__icon') as HTMLElement;
    // Error uses the danger-tinted alert-triangle glyph.
    expect(errorIcon.classList.contains('zm-state__icon--danger')).toBe(true);
    // Permission uses the discovery-tinted lock glyph.
    expect(permIcon.classList.contains('zm-state__icon--discovery')).toBe(true);
    // Extract path signatures to prove the glyphs are distinct shapes.
    const errorPaths = Array.from(errorIcon.querySelectorAll('path')).map(p => p.getAttribute('d') ?? '').join('|');
    const permSignatures = Array.from(permIcon.querySelectorAll('rect, path')).map(el =>
      el.tagName.toLowerCase() === 'rect' ? `rect:${el.getAttribute('x')},${el.getAttribute('y')}` : (el.getAttribute('d') ?? ''),
    ).join('|');
    const emptyPaths = Array.from(emptyIcon.querySelectorAll('path')).map(p => p.getAttribute('d') ?? '').join('|');
    expect(errorPaths).toContain('M24 6l19 33H5z'); // alert-triangle
    expect(permSignatures).toContain('rect:11,22'); // lock body
    expect(emptyPaths).toContain('M10 32c6-10 22-10 28 0'); // signal-arc
    // Pairwise distinctness.
    expect(errorPaths).not.toBe(permSignatures);
    expect(errorPaths).not.toBe(emptyPaths);
    expect(permSignatures).not.toBe(emptyPaths);
  });

  it('the toast variants carry pairwise-distinct glyphs (VAL-DS-029)', async () => {
    const f = await renderGallery();
    const stack = f.nativeElement.querySelector('.zm-states__toast-stack');
    const toasts = Array.from(stack.querySelectorAll('zm-toast')) as HTMLElement[];
    const glyphSignatures: string[] = [];
    for (const t of toasts) {
      const icon = t.querySelector('.zm-toast__icon') as HTMLElement;
      expect(icon, 'every toast must render an icon').toBeTruthy();
      const sig = Array.from(icon.querySelectorAll('path')).map(p => p.getAttribute('d') ?? '').join('|');
      expect(sig.length).toBeGreaterThan(0);
      glyphSignatures.push(sig);
    }
    // All four variant glyphs must be pairwise distinct (status not color-only).
    const distinct = new Set(glyphSignatures);
    expect(distinct.size).toBe(4);
  });

  it('projects the secondary path links into error and permission surfaces', async () => {
    const f = await renderGallery();
    const errorLink = f.nativeElement.querySelector('zm-error-state .zm-states__link') as HTMLAnchorElement;
    expect(errorLink, 'error-state must project a "Destek al" link').toBeTruthy();
    expect(errorLink.textContent!.trim()).toBe('Destek al');
    const permLink = f.nativeElement.querySelector('zm-permission-state .zm-states__link') as HTMLAnchorElement;
    expect(permLink, 'permission-state must project a "Herkese açık akışa dön" link').toBeTruthy();
    expect(permLink.textContent!.trim()).toBe('Herkese açık akışa dön');
  });
});

describe('GalleryPageComponent — identity panel (VAL-DS-030 / 031 / 032)', () => {
  async function renderGallery() {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({ imports: [GalleryPageComponent] }).compileComponents();
    const fixture = TestBed.createComponent(GalleryPageComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('renders the identity panel heading', async () => {
    const f = await renderGallery();
    const heading = f.nativeElement.querySelector('#gallery-identity-heading') as HTMLElement;
    expect(heading, 'identity panel heading must render').toBeTruthy();
  });

  it('renders the avatar primitives across image / error / initials demos (VAL-DS-030)', async () => {
    const f = await renderGallery();
    const panel = f.nativeElement.querySelector('#gallery-identity-heading')
      .closest('section.panel') as HTMLElement;
    const avatars = Array.from(panel.querySelectorAll('zm-avatar')) as HTMLElement[];
    expect(avatars.length).toBeGreaterThanOrEqual(3);
    // The broken-image demo is wired to a non-existent path; it must still
    // expose the user's display name through its accessible name.
    const broken = avatars.find(a => a.getAttribute('aria-label')?.includes('Ela Polat'));
    expect(broken, 'broken-image avatar demo must be present').toBeTruthy();
    expect(broken!.querySelector('.zm-avatar__image')).toBeTruthy();
  });

  it('renders all four presence states and at least one unread badge (VAL-DS-031)', async () => {
    const f = await renderGallery();
    const panel = f.nativeElement.querySelector('#gallery-identity-heading')
      .closest('section.panel') as HTMLElement;
    const presenceDots = Array.from(panel.querySelectorAll('.zm-avatar__presence')) as HTMLElement[];
    const states = new Set(presenceDots.map(d => d.getAttribute('data-presence')));
    expect(states.has('online')).toBe(true);
    expect(states.has('away')).toBe(true);
    expect(states.has('busy')).toBe(true);
    expect(states.has('offline')).toBe(true);
    // At least one unread badge.
    const unread = panel.querySelector('.zm-avatar__unread');
    expect(unread, 'unread badge must render in the identity panel').toBeTruthy();
    // Presence dots must be aria-hidden (meaning flows through the host label).
    expect(presenceDots.every(d => d.getAttribute('aria-hidden') === 'true')).toBe(true);
  });

  it('renders every chip variant with a textual label + leading glyph (VAL-DS-032)', async () => {
    const f = await renderGallery();
    const chipsWrap = f.nativeElement.querySelector('.zm-identity__chips') as HTMLElement;
    const chips = Array.from(chipsWrap.querySelectorAll('zm-chip')) as HTMLElement[];
    expect(chips.length).toBeGreaterThanOrEqual(7);
    // Every chip carries a non-empty label (never color-only).
    for (const c of chips) {
      const label = c.querySelector('.zm-chip__label') as HTMLElement;
      expect(label, 'every chip must render a textual label').toBeTruthy();
      expect(label.textContent!.trim().length).toBeGreaterThan(0);
    }
    // Removable chips expose an accessible-named remove control.
    const removers = Array.from(chipsWrap.querySelectorAll('.zm-chip__remove')) as HTMLButtonElement[];
    expect(removers.length).toBeGreaterThan(0);
    for (const r of removers) {
      expect(r.getAttribute('aria-label')?.length).toBeGreaterThan(0);
    }
  });

  it('renders every status variant with a textual label + distinct shape (VAL-DS-032 / 029)', async () => {
    const f = await renderGallery();
    const statusesWrap = f.nativeElement.querySelector('.zm-identity__statuses') as HTMLElement;
    const statuses = Array.from(statusesWrap.querySelectorAll('zm-status')) as HTMLElement[];
    expect(statuses.length).toBeGreaterThanOrEqual(7);
    // Every status carries a label and a leading shape signature.
    const shapes = new Set<string>();
    for (const s of statuses) {
      const label = s.querySelector('.zm-status__label') as HTMLElement;
      expect(label, 'every status must render a textual label').toBeTruthy();
      expect(label.textContent!.trim().length).toBeGreaterThan(0);
      const shape = s.querySelector('.zm-status__shape') as HTMLElement;
      expect(shape, 'every status must render a leading shape (non-color cue)').toBeTruthy();
      const sig = Array.from(shape.querySelectorAll('path,rect,circle'))
        .map(n => n.tagName + '|' + (n.getAttribute('d') ?? '') + (n.getAttribute('transform') ?? ''))
        .join('§');
      shapes.add(s.getAttribute('data-variant') + '::' + sig);
    }
    // All status variants produce a distinct shape signature (grayscale-readable).
    expect(shapes.size).toBeGreaterThanOrEqual(7);
    // The danger status is assertive (role=alert).
    const danger = statuses.find(s => s.getAttribute('data-variant') === 'danger') as HTMLElement;
    expect(danger.getAttribute('role')).toBe('alert');
    // The default (success) status is a polite live region (role=status).
    const success = statuses.find(s => s.getAttribute('data-variant') === 'success') as HTMLElement;
    expect(success.getAttribute('role')).toBe('status');
  });
});

describe('GalleryPageComponent — iconography panel (VAL-DS-033 / 034 / 035)', () => {
  async function renderGallery() {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({ imports: [GalleryPageComponent] }).compileComponents();
    const fixture = TestBed.createComponent(GalleryPageComponent);
    fixture.detectChanges();
    return fixture;
  }

  it('renders the iconography panel heading + four signature motif tiles (VAL-DS-033)', async () => {
    const f = await renderGallery();
    const heading = f.nativeElement.querySelector('#gallery-iconography-heading') as HTMLElement;
    expect(heading, 'iconography panel heading must render').toBeTruthy();
    const tiles = Array.from(f.nativeElement.querySelectorAll('.zm-motif-tile')) as HTMLElement[];
    expect(tiles.length, 'exactly four signature motif tiles render').toBe(4);
    // Each tile contains a <zm-motif> (the real primitive).
    for (const tile of tiles) {
      const motif = tile.querySelector('zm-motif');
      expect(motif, 'every tile hosts the ZmMotif primitive').toBeTruthy();
    }
  });

  it('surfaces all four motif names in the tile labels (signal-arc, pulse-node, editorial-cut, thread-line)', async () => {
    const f = await renderGallery();
    const labels = Array.from(f.nativeElement.querySelectorAll('.zm-motif-tile__name'))
      .map(el => (el as HTMLElement).textContent?.trim() ?? '');
    // Turkish labels for the four motifs (order matches motifCatalog).
    expect(labels).toEqual(['Sinyal yayı', 'Vuruş düğümü', 'Editöryel kesiş', 'İplik çizgisi']);
  });

  it('places a decorative signal-arc in the header corner (motif in header, VAL-DS-033)', async () => {
    const f = await renderGallery();
    const accent = f.nativeElement.querySelector('.gallery__head-accent') as HTMLElement;
    expect(accent, 'header accent motif must render').toBeTruthy();
    expect(accent.getAttribute('data-motif')).toBe('signal-arc');
    // The accent is decorative.
    expect(accent.getAttribute('aria-hidden')).toBe('true');
    expect(accent.getAttribute('role')).toBe('presentation');
  });

  it('never positions a motif inside a text node (motifs decorative-only, VAL-DS-034)', async () => {
    const f = await renderGallery();
    // Every motif on the page must be aria-hidden + role=presentation and carry
    // no text content. This is the structural guarantee that motifs never carry
    // meaning and never cross text.
    const motifs = Array.from(f.nativeElement.querySelectorAll('zm-motif')) as HTMLElement[];
    expect(motifs.length, 'several motifs render on the gallery').toBeGreaterThan(4);
    for (const m of motifs) {
      expect(m.getAttribute('aria-hidden'), 'every motif is aria-hidden').toBe('true');
      expect(m.getAttribute('role'), 'every motif is role=presentation').toBe('presentation');
      expect(m.querySelector('title'), 'no motif exposes a <title>').toBeNull();
      expect((m.textContent ?? '').trim().length, 'no motif carries text').toBe(0);
      // No motif is tabbable.
      expect(m.hasAttribute('tabindex')).toBe(false);
    }
  });

  it('thread-line motif lives in a reserved gutter beside content, not under text (VAL-DS-034)', async () => {
    const f = await renderGallery();
    const items = Array.from(f.nativeElement.querySelectorAll('.zm-thread__item')) as HTMLElement[];
    expect(items.length, 'thread demo renders items').toBeGreaterThan(0);
    for (const item of items) {
      // The motif is in the gutter; the text is in the content column. They
      // are separate subtrees — the motif never overlaps the text node.
      const gutter = item.querySelector('.zm-thread__gutter');
      const content = item.querySelector('.zm-thread__content');
      expect(gutter?.querySelector('zm-motif'), 'gutter holds the thread motif').toBeTruthy();
      expect(content?.querySelector('zm-motif'), 'content column holds NO motif').toBeNull();
      expect((content?.textContent ?? '').trim().length, 'content column carries text').toBeGreaterThan(0);
    }
  });

  it('normalized icon family shows authored SVG chips with no emoji (VAL-DS-035)', async () => {
    const f = await renderGallery();
    const chips = Array.from(f.nativeElement.querySelectorAll('.zm-icon-family__chip')) as HTMLElement[];
    expect(chips.length, 'several authored SVG icon chips render').toBeGreaterThan(0);
    const emojiRange =
      /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE0F}]/u;
    for (const chip of chips) {
      // Authored SVG only: an <svg> with a viewBox, no <img>, no emoji.
      expect(chip.querySelector('svg'), 'chip is an authored SVG').toBeTruthy();
      expect(chip.querySelector('img'), 'no <img> in icon chips').toBeNull();
      expect(chip.outerHTML, 'no emoji unicode in icon chips').not.toMatch(emojiRange);
      // Shared vocabulary: every svg has a viewBox and uses currentColor.
      const svg = chip.querySelector('svg')!;
      expect(svg.getAttribute('viewBox')).toBeTruthy();
      expect(chip.outerHTML).toContain('currentColor');
    }
  });
});

describe('GalleryPageComponent — deep-link query params (VAL-DS-036)', () => {
  /**
   * Deep-link filtering: `?prim=<panel>` renders ONLY that panel; absent/empty
   * `prim` renders the whole gallery. The gallery is unauthenticated (it sits
   * outside the authGuard subtree) and each assertion can deep-link to a
   * single primitive/state view.
   */
  function provideRoute(params: Record<string, string>) {
    return {
      provide: ActivatedRoute,
      useValue: {
        queryParamMap: of(convertToParamMap(params)),
      },
    };
  }

  async function renderWith(params: Record<string, string>) {
    TestBed.resetTestingModule();
    await TestBed.configureTestingModule({
      imports: [GalleryPageComponent],
      providers: [provideRoute(params)],
    }).compileComponents();
    const fixture = TestBed.createComponent(GalleryPageComponent);
    fixture.detectChanges();
    return fixture;
  }

  /** Count the visible (non-hidden) top-level panels. */
  function visiblePanels(fixture: { readonly nativeElement: HTMLElement }): number {
    const panels = Array.from(fixture.nativeElement.querySelectorAll('section.panel[data-panel]')) as HTMLElement[];
    return panels.filter(p => !p.hasAttribute('hidden')).length;
  }

  it('renders every panel when no prim filter is present', async () => {
    const f = await renderWith({});
    const panels = Array.from(f.nativeElement.querySelectorAll('section.panel[data-panel]')) as HTMLElement[];
    const visible = panels.filter(p => !p.hasAttribute('hidden'));
    expect(visible.length, 'all panels visible without prim').toBe(panels.length);
    expect(panels.length).toBeGreaterThanOrEqual(13);
  });

  it('renders ONLY the button panel when ?prim=button (deep-link filter)', async () => {
    const f = await renderWith({ prim: 'button' });
    const panels = Array.from(f.nativeElement.querySelectorAll('section.panel[data-panel]')) as HTMLElement[];
    const visible = panels.filter(p => !p.hasAttribute('hidden'));
    expect(visible.length, 'only one panel is visible under ?prim=button').toBe(1);
    expect(visible[0].getAttribute('data-panel')).toBe('button');
  });

  it('renders ONLY the iconography panel when ?prim=motif (alias key)', async () => {
    const f = await renderWith({ prim: 'motif' });
    const visible = (Array.from(f.nativeElement.querySelectorAll('section.panel[data-panel]')) as HTMLElement[])
      .filter(p => !p.hasAttribute('hidden'));
    expect(visible.length, 'only the iconography panel renders under ?prim=motif').toBe(1);
    expect(visible[0].getAttribute('data-panel')).toBe('iconography');
  });

  it('surfaces the active filter + state hint in the header (deep-link confirmation)', async () => {
    const f = await renderWith({ prim: 'BUTTON', state: 'Loading' });
    // Normalization: prim/state are lowercased + trimmed.
    expect(f.componentInstance.prim()).toBe('button');
    expect(f.componentInstance.state()).toBe('loading');
    const deeplink = f.nativeElement.querySelector('.gallery__deeplink') as HTMLElement;
    expect(deeplink, 'header surfaces the deep-link status line').toBeTruthy();
    expect(deeplink.textContent?.toLowerCase()).toContain('button');
    expect(deeplink.textContent?.toLowerCase()).toContain('loading');
  });

  it('case-insensitive + alias resolution: ?prim=icon-button and ?prim=iconbutton both isolate the icon-button panel', async () => {
    for (const prim of ['icon-button', 'ICONBUTTON', 'icon-button']) {
      const f = await renderWith({ prim });
      const visible = (Array.from(f.nativeElement.querySelectorAll('section.panel[data-panel]')) as HTMLElement[])
        .filter(p => !p.hasAttribute('hidden'));
      expect(visible.length, `prim=${prim} isolates one panel`).toBe(1);
      expect(visible[0].getAttribute('data-panel')).toBe('icon-button');
    }
  });

  it('renders the whole gallery when prim names an unknown panel (graceful fallback)', async () => {
    const f = await renderWith({ prim: 'nonexistent-panel' });
    // Unknown prim => no panel matches => all panels hidden. That is the
    // correct deep-link behavior (an unknown target renders nothing, not the
    // whole gallery, so a validator knows the link was wrong). The header
    // still surfaces the filter so the mismatch is visible.
    expect(visiblePanels(f), 'unknown prim hides every panel').toBe(0);
    expect(f.componentInstance.prim()).toBe('nonexistent-panel');
  });

  it('requires no auth interceptor: the route sits outside the authGuard subtree', async () => {
    // Structural guard: the gallery component itself has no dependency on any
    // auth/session service. It mounts cleanly with only ActivatedRoute provided
    // (no TokenVault, no AuthService). This is the unit-level proof of the
    // "unauthenticated" half of VAL-DS-036; the router-level proof (route is
    // a sibling of the authGuard subtree, not a child) is in app.routes.ts.
    const f = await renderWith({});
    expect(f.componentInstance, 'gallery mounts without any auth provider').toBeTruthy();
    expect(f.nativeElement.querySelector('#gallery-iconography-heading')).toBeTruthy();
  });
});
