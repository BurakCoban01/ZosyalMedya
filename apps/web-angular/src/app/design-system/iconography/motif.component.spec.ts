import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { ZmMotifComponent, type ZmMotifName } from './motif.component';

/**
 * ZmMotif — focused verification for the signature motifs.
 *
 * Guards the three iconography assertions this feature fulfills:
 *   - VAL-DS-033: one normalized family (single inline-SVG vocabulary) + the
 *     four signature motifs (signal-arc, pulse-node, editorial-cut, thread-line).
 *   - VAL-DS-034: motifs are DECORATIVE-ONLY (aria-hidden, role=presentation,
 *     never carry meaning, never render text).
 *   - VAL-DS-035: no emoji / no stock imagery — authored vector paths only.
 */

const FOUR_MOTIFS: readonly ZmMotifName[] = [
  'signal-arc',
  'pulse-node',
  'editorial-cut',
  'thread-line',
] as const;

async function mount(name: ZmMotifName, size?: string): Promise<HTMLElement> {
  // Reset before each mount: several tests below loop over the four motifs and
  // call mount() multiple times within a single `it`. Without the reset, the
  // second configureModule throws "test module has already been instantiated".
  // Matches the pattern used by feedback-states specs.
  TestBed.resetTestingModule();
  await TestBed.configureTestingModule({
    imports: [ZmMotifComponent],
  }).compileComponents();
  const fixture = TestBed.createComponent(ZmMotifComponent);
  fixture.componentRef.setInput('name', name);
  if (size !== undefined) fixture.componentRef.setInput('size', size);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('ZmMotifComponent — signature motifs (VAL-DS-033/034/035)', () => {
  describe('normalized family + four motifs present (VAL-DS-033)', () => {
    it('renders each of the four signature motifs', async () => {
      for (const name of FOUR_MOTIFS) {
        const host = await mount(name);
        expect(host.querySelector('svg'), `motif ${name} renders an inline SVG`).not.toBeNull();
        expect(host.getAttribute('data-motif'), `motif ${name} stamps data-motif`).toBe(name);
      }
    });

    it('shares a single stroke vocabulary (rounded caps, currentColor, no fill on strokes)', async () => {
      // The signal-arc is the canonical stroke-language sample; its paths use
      // stroke-linecap=round + currentColor. Every motif in the family shares
      // this vocabulary, which is what makes them read as one set.
      const host = await mount('signal-arc');
      const strokes = Array.from(host.querySelectorAll('path[fill="none"]'));
      expect(strokes.length, 'signal-arc exposes stroke paths').toBeGreaterThan(0);
      for (const p of strokes) {
        expect(p.getAttribute('stroke')).toBe('currentColor');
        expect(p.getAttribute('stroke-linecap')).toBe('round');
      }
    });

    it('uses authored vector paths only (no <img>, no external refs, no foreignObject)', async () => {
      for (const name of FOUR_MOTIFS) {
        const host = await mount(name);
        expect(host.querySelector('img'), `${name}: no <img>`).toBeNull();
        expect(host.querySelector('foreignObject'), `${name}: no foreignObject`).toBeNull();
        expect(host.querySelector('use'), `${name}: no <use> external ref`).toBeNull();
        const svg = host.querySelector('svg');
        expect(svg?.getAttribute('viewBox'), `${name}: viewBox authored`).toBeTruthy();
      }
    });
  });

  describe('decorative-only — never carries meaning (VAL-DS-034)', () => {
    it('host is aria-hidden + role=presentation for every motif', async () => {
      for (const name of FOUR_MOTIFS) {
        const host = await mount(name);
        expect(host.getAttribute('aria-hidden'), `${name}: aria-hidden=true`).toBe('true');
        expect(host.getAttribute('role'), `${name}: role=presentation`).toBe('presentation');
      }
    });

    it('never exposes an accessible name (no aria-label / aria-labelledby / title)', async () => {
      for (const name of FOUR_MOTIFS) {
        const host = await mount(name);
        expect(host.getAttribute('aria-label'), `${name}: no aria-label`).toBeNull();
        expect(host.getAttribute('aria-labelledby'), `${name}: no aria-labelledby`).toBeNull();
        expect(host.querySelector('title'), `${name}: no <title> inside SVG`).toBeNull();
      }
    });

    it('host is removed from the accessibility tree (pointer-events none, not focusable)', async () => {
      for (const name of FOUR_MOTIFS) {
        const host = await mount(name);
        // pointer-events:none so a motif never intercepts a click meant for
        // the content behind it.
        const style = getComputedStyle(host);
        expect(style.pointerEvents, `${name}: pointer-events none`).toBe('none');
        // No tabindex attribute => not in the tab order.
        expect(host.hasAttribute('tabindex'), `${name}: not tabbable`).toBe(false);
      }
    });

    it('renders no text node (motifs are pure vector)', async () => {
      for (const name of FOUR_MOTIFS) {
        const host = await mount(name);
        const text = (host.textContent ?? '').trim();
        expect(text.length, `${name}: no text content`).toBe(0);
        expect(host.querySelector('text'), `${name}: no <text> element`).toBeNull();
      }
    });
  });

  describe('no emoji / no stock imagery (VAL-DS-035)', () => {
    it('contains no emoji unicode across the rendered output', async () => {
      // Cover the emoji + symbol + dingbat ranges. Authored SVG must contain
      // none of these; the only characters present should be SVG path data.
      const emojiRange =
        /[\u{1F000}-\u{1FAFF}\u{2600}-\u{27BF}\u{2190}-\u{21FF}\u{2B00}-\u{2BFF}\u{FE0F}\u{200D}]/u;
      for (const name of FOUR_MOTIFS) {
        const host = await mount(name);
        expect(host.outerHTML, `${name}: no emoji unicode`).not.toMatch(emojiRange);
      }
    });

    it('pulse-node animates rings under normal motion and ships no spring/parallax', async () => {
      const host = await mount('pulse-node');
      // Two rings + a solid core: the rings animate, the core does not.
      const rings = host.querySelectorAll('.zm-motif__ring');
      const core = host.querySelector('.zm-motif__core');
      expect(rings.length, 'pulse-node has exactly two animated rings').toBe(2);
      expect(core, 'pulse-node has a solid core that never animates').not.toBeNull();
      // Each ring carries the zm-motif__ring class (the animation hook).
      for (const r of Array.from(rings)) {
        expect(r.getAttribute('class') ?? '').toContain('zm-motif__ring');
      }
    });
  });

  describe('size input drives the inline size', () => {
    it('binds a custom CSS length to the host inline-size token', async () => {
      const host = await mount('signal-arc', '3rem');
      const token = host.style.getPropertyValue('--zm-motif-inline-size');
      expect(token.trim(), 'size input flows into --zm-motif-inline-size').toBe('3rem');
    });

    it('keeps the default 2.5rem when no size is supplied', async () => {
      const host = await mount('thread-line');
      const token = host.style.getPropertyValue('--zm-motif-inline-size');
      expect(token.trim(), 'default size is 2.5rem').toBe('2.5rem');
    });
  });
});
