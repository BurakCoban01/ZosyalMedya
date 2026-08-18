import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * ZmSkeleton — non-content placeholder for loading states.
 *
 * Renders one or more shimmer blocks that reserve layout space while real
 * content loads, preventing CLS and signalling "data is on its way" without
 * fabricating fake content. The shimmer is a CSS gradient animation over
 * `transform: translateX(...)` (transform/opacity only — never a layout
 * property), so it is cheap and interruptible.
 *
 * Accessibility (VAL-DS-028): the skeleton itself is purely decorative. It
 * carries `aria-hidden="true"` so screen readers skip the placeholder
 * rectangles; the loading semantics MUST be communicated by the SURROUNDING
 * container (e.g. `aria-busy="true"` on the list/region that owns the
 * skeleton). The skeleton never announces "loading" on its own — that would
 * compete with the container's live status.
 *
 * Reduced motion (VAL-DS-016): the shimmer animation collapses to a static
 * tonal block via the `--zm-skeleton-duration` token cascade (tokens.css §5
 * sets it to 0ms under `prefers-reduced-motion: reduce` AND the product
 * `[data-reduce-motion]` toggle). The block keeps its tonal separation so
 * the placeholder is still readable in a static frame; only the motion is
 * removed. There is no looping animation under reduced motion.
 *
 * Variants:
 *   - `text`    — a single line at body-text height (default).
 *   - `circle`  — a square rounded to a pill, for avatars/icons.
 *   - `rect`    — a generic block (use `width`/`height` for media/cards).
 *
 * Use `lines` on the `text` variant to render a multi-line paragraph skeleton;
 * the last line is shortened to a realistic ragged edge.
 *
 * Consumes ONLY `--zm-skeleton-*` tokens (which compose `--zm-surface-*` and
 * `--zm-duration-scene`); no hardcoded hex anywhere.
 */
export type ZmSkeletonVariant = 'text' | 'circle' | 'rect';

@Component({
  selector: 'zm-skeleton',
  standalone: true,
  styleUrl: './skeleton.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'zm-skeleton',
    '[attr.data-variant]': 'variant()',
    '[attr.role]': '"presentation"',
    '[attr.aria-hidden]': '"true"',
  },
  template: `
    @if (variant() === 'text') {
      @for (line of textLines(); track $index) {
        <span
          class="zm-skeleton__bar"
          [class.is-short]="line.short"
          [style.height]="'var(--zm-skeleton-text-height)'"
        ></span>
      }
    } @else {
      <span
        class="zm-skeleton__bar"
        [style.width]="resolvedSize()"
        [style.height]="resolvedHeight()"
      ></span>
    }
  `,
})
export class ZmSkeletonComponent {
  /** Shape of the placeholder. `text` renders one or more line bars; `circle`
   *  and `rect` render a single block at `width`/`height`. */
  readonly variant = input<ZmSkeletonVariant>('text');

  /** Width of the block (circle/rect) or the first text line. Accepts any CSS
   *  length; defaults to `100%` for text and `2.5rem` for circle/rect. */
  readonly width = input<string>('');

  /** Height of the block (circle/rect only). Accepts any CSS length; defaults
   *  to the resolved width for circle and `1rem` for rect. */
  readonly height = input<string>('');

  /** Number of text lines to render (text variant only). The last line is
   *  shortened to a realistic ragged edge so the block reads as a paragraph
   *  skeleton, not a stack of identical bars. */
  readonly lines = input<number>(1);

  /** Resolved CSS length for the single-block variants. Falls back to the
   *  variant-appropriate default when the caller does not pass `width`. */
  readonly resolvedSize = computed<string>(() => {
    const w = this.width();
    if (w) return w;
    return this.variant() === 'circle' ? '2.5rem' : '100%';
  });

  /** Resolved CSS height for the single-block variants (circle/rect). Falls
   *  back to the resolved width for `circle` (square) and `1rem` for `rect`
   *  when the caller does not pass `height`. */
  readonly resolvedHeight = computed<string>(() => {
    const h = this.height();
    if (h) return h;
    return this.variant() === 'circle' ? this.resolvedSize() : '1rem';
  });

  /** Text-line records for the `text` variant. The last line is marked short
   *  so the CSS can render a ragged edge (≈ 60% width). */
  readonly textLines = computed<readonly { short: boolean }[]>(() => {
    const count = Math.max(1, Math.floor(this.lines()));
    const out: { short: boolean }[] = [];
    for (let i = 0; i < count; i++) {
      out.push({ short: i === count - 1 && count > 1 });
    }
    return out;
  });
}
