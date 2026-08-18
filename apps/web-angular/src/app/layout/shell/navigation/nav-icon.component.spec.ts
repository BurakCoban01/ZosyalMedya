import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { NavIconName } from './nav-catalog';
import { ZmNavIconComponent } from './nav-icon.component';

/**
 * ZmNavIcon — focused verification for the shared nav icon vocabulary
 * introduced by `m2-tablet-mobile-navigation` (single normalized family for
 * desktop rail, tablet compact rail, mobile-web bottom bar).
 *
 * Guards:
 *   - VAL-DS-033 — one normalized family (authored SVG, single stroke
 *     language, currentColor; no icon library, no <img>/<use>);
 *   - VAL-DS-035 — no emoji, no stock/blob imagery;
 *   - the host is aria-hidden + focusable=false so AT skips the glyph and
 *     reads only the parent interactive element's accessible name.
 */

const ALL_ICONS: ReadonlyArray<NavIconName> = [
  'akis', 'kesfet', 'mesajlar', 'bildirimler', 'profil',
  'baglantilar', 'sorular', 'kaydedilenler', 'ayarlar', 'yonetim',
  'compose', 'signout', 'more', 'context',
];

async function renderIcon(icon: NavIconName, size = '1.5rem'): Promise<HTMLElement> {
  // Reset between mounts: several tests iterate the full vocabulary in a loop
  // within a single `it`, so configureTestingModule must start from a clean
  // module each call (proven pattern from the m1-iconography recovery).
  TestBed.resetTestingModule();
  await TestBed.configureTestingModule({ imports: [ZmNavIconComponent] }).compileComponents();
  const fixture = TestBed.createComponent(ZmNavIconComponent);
  fixture.componentRef.setInput('icon', icon);
  fixture.componentRef.setInput('size', size);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('ZmNavIconComponent — single normalized family (VAL-DS-033/035)', () => {
  it('renders an authored inline SVG for every vocabulary key', async () => {
    for (const icon of ALL_ICONS) {
      const host = await renderIcon(icon);
      const svg = host.querySelector('svg');
      expect(svg, `icon "${icon}" should render an SVG`).not.toBeNull();
      const shapes = svg?.querySelectorAll('path, circle, rect, line');
      expect(shapes?.length ?? 0, `icon "${icon}" should contain authored shapes`).toBeGreaterThan(0);
    }
  });

  it('uses currentColor across the family (stroke OR fill, single color source)', async () => {
    for (const icon of ALL_ICONS) {
      const host = await renderIcon(icon);
      // Most icons use stroked currentColor paths; the "more" icon uses filled
      // currentColor dots. Either is valid as long as color comes from one
      // source (currentColor) so the parent controls tone via `color`.
      const colored = host.querySelectorAll('[stroke="currentColor"], [fill="currentColor"]');
      expect(colored.length, `icon "${icon}" should use currentColor (stroke or fill)`).toBeGreaterThan(0);
    }
  });

  it('never loads an external image / icon library (<img>, <use href>, <foreignObject>)', async () => {
    for (const icon of ALL_ICONS) {
      const host = await renderIcon(icon);
      expect(host.querySelectorAll('img, use, foreignObject')).toHaveLength(0);
    }
  });

  it('stamps data-icon on the host for state-driven CSS hooks', async () => {
    const host = await renderIcon('akis');
    expect(host.getAttribute('data-icon')).toBe('akis');
  });

  it('exposes the host as aria-hidden + the SVG as focusable=false (no double-read)', async () => {
    const host = await renderIcon('akis');
    expect(host.getAttribute('aria-hidden')).toBe('true');
    const svg = host.querySelector('svg');
    expect(svg?.getAttribute('focusable')).toBe('false');
    expect(svg?.getAttribute('aria-hidden')).toBe('true');
  });

  it('respects the size input via --zm-nav-icon-size (no layout shift on swap)', async () => {
    const host = await renderIcon('akis', '2rem');
    expect(host.style.getPropertyValue('--zm-nav-icon-size')).toBe('2rem');
  });
});
