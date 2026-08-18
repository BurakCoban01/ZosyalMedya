import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * ZmMotif — authored SVG signature motifs of the Living Editorial Network.
 *
 * Contract (VAL-DS-033 / VAL-DS-034 / VAL-DS-035):
 *
 *   - **Decorative-only.** Every motif is purely ornamental. The host carries
 *     `aria-hidden="true"` + `role="presentation"` and the SVGs expose no
 *     accessible name, so assistive tech skips them. Meaning NEVER depends on
 *     a motif — if a motif were removed the interface would still be fully
 *     understandable. This is the defining property of a signature motif vs.
 *     an icon (an icon carries meaning and needs an accessible name).
 *   - **Never cross text (VAL-DS-034).** Motifs are placed only in non-text
 *     regions: header/hero corners, section separators, active-state
 *     indicators beside (not behind) labels, timeline gutters. Consumers MUST
 *     not position a motif under body/heading text. The motif's own color is
 *     a low-chroma surface tone (`--zm-motif-*`), never a brand/danger fill
 *     that could compromise adjacent text contrast.
 *   - **One normalized family (VAL-DS-033).** Authored inline SVG, single
 *     stroke language (rounded caps, 1.5–2px strokes), `currentColor`. No
 *     icon library, no emoji, no stock imagery. The four motifs share a
 *     visual vocabulary so they read as one family.
 *   - **No emoji / no 3D blobs / no stock (VAL-DS-035).** Pure vector marks.
 *
 * The four signature motifs of the art direction:
 *
 *   - `signal-arc`      — concentric broadcast arcs from an origin point.
 *                         Header/hero accent; suggests emanation/reach.
 *   - `pulse-node`      — a node with radiating rings. Live/active indicator
 *                         (nav active state, presence, realtime). The outer
 *                         rings pulse under normal motion and settle static
 *                         under reduced motion (state still conveyed by the
 *                         solid center + ring geometry).
 *   - `editorial-cut`   — an asymmetric section separator with an editorial
 *                         notch. Used BETWEEN sections, never under text.
 *   - `thread-line`     — a vertical connecting thread with nodes. Timeline /
 *                         connection gutter; runs alongside content, never
 *                         across it.
 *
 * Engine: CSS only (no `@angular/animations`). The pulse animation is a CSS
 * keyframe on the ring opacity/transform; reduced-motion collapses it to a
 * static ring via the `--zm-duration-motif-pulse` token cascade + the
 * `:host-context([data-reduce-motion])` + `@media (prefers-reduced-motion)`
 * pair (see button.component.css for the encapsulation note).
 *
 * @example
 * <!-- Decorative header accent (motif in a non-text corner) -->
 * <zm-motif name="signal-arc" class="hero__accent"></zm-motif>
 * <!-- Active nav indicator beside the label, never behind it -->
 * <zm-motif name="pulse-node" class="nav__active-dot"></zm-motif>
 */
export type ZmMotifName = 'signal-arc' | 'pulse-node' | 'editorial-cut' | 'thread-line';

@Component({
  selector: 'zm-motif',
  standalone: true,
  styleUrl: './motif.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'zm-motif',
    role: 'presentation',
    'aria-hidden': 'true',
    '[attr.data-motif]': 'name()',
    '[style.--zm-motif-inline-size]': 'sizeCss()',
  },
  template: `
    @switch (name()) {
      @case ('signal-arc') {
        <!--
          Signal arc — concentric broadcast arcs from an origin point (bottom-left).
          Suggests emanation / reach / a signal traveling outward. Read as a single
          family with the other motifs: rounded caps, ~2px strokes, currentColor.
        -->
        <svg viewBox="0 0 80 44" focusable="false" preserveAspectRatio="xMidYMid meet">
          <path class="zm-motif__stroke" d="M6 38 Q 40 6 74 38" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
          <path class="zm-motif__stroke" d="M16 38 Q 40 14 64 38" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.7" />
          <path class="zm-motif__stroke" d="M26 38 Q 40 22 54 38" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" opacity="0.45" />
          <circle class="zm-motif__origin" cx="8" cy="38" r="2.4" fill="currentColor" />
        </svg>
      }
      @case ('pulse-node') {
        <!--
          Pulse node — a solid center with radiating rings. The two outer rings
          pulse (CSS keyframe on .zm-motif__ring) under normal motion; under
          reduced motion both rings are fully static and the solid center still
          reads as an active node. Used as a live/active indicator beside a label.
        -->
        <svg viewBox="0 0 32 32" focusable="false" preserveAspectRatio="xMidYMid meet">
          <circle class="zm-motif__ring zm-motif__ring--outer" cx="16" cy="16" r="13" fill="none" stroke="currentColor" stroke-width="1.25" opacity="0.25" />
          <circle class="zm-motif__ring zm-motif__ring--inner" cx="16" cy="16" r="8" fill="none" stroke="currentColor" stroke-width="1.5" opacity="0.5" />
          <circle class="zm-motif__core" cx="16" cy="16" r="3.2" fill="currentColor" />
        </svg>
      }
      @case ('editorial-cut') {
        <!--
          Editorial cut — a section separator with an asymmetric editorial notch.
          A clean rule breaks and offsets, like a magazine section break. Used
          BETWEEN sections (in the gutter), never as an underline under text.
        -->
        <svg viewBox="0 0 160 12" focusable="false" preserveAspectRatio="none">
          <line class="zm-motif__rule" x1="0" y1="6" x2="68" y2="6" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" />
          <line class="zm-motif__rule" x1="92" y1="6" x2="160" y2="6" stroke="currentColor" stroke-width="1.25" stroke-linecap="round" />
          <path class="zm-motif__notch" d="M72 2 L80 10 L88 2" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" stroke-linejoin="round" />
        </svg>
      }
      @case ('thread-line') {
        <!--
          Thread line — a vertical connecting thread with nodes. Timeline /
          connection gutter. Runs ALONGSIDE content in a reserved gutter, never
          across body text. Three nodes suggest a sequence without claiming a
          count.
        -->
        <svg viewBox="0 0 24 84" focusable="false" preserveAspectRatio="xMidYMid meet">
          <line class="zm-motif__thread" x1="12" y1="6" x2="12" y2="78" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
          <circle class="zm-motif__node" cx="12" cy="14" r="3" fill="currentColor" />
          <circle class="zm-motif__node" cx="12" cy="42" r="3" fill="currentColor" />
          <circle class="zm-motif__node" cx="12" cy="70" r="3" fill="currentColor" />
        </svg>
      }
    }
  `,
})
export class ZmMotifComponent {
  /** Which signature motif to render. Required. */
  readonly name = input.required<ZmMotifName>();

  /**
   * Inline size (CSS length). The motif scales to a square-ish frame; the SVG
   * `preserveAspectRatio` keeps each motif's intrinsic proportions. Use any CSS
   * length (`'2rem'`, `'40px'`, `'clamp(2rem, 4vw, 3rem)'`). Defaults to a
   * moderate decorative size; consumers override per context.
   */
  readonly size = input<string>('2.5rem');

  /** Resolve the size input into a CSS custom property value for the host. */
  readonly sizeCss = computed(() => this.size());
}
