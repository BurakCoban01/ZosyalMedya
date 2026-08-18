import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ZmSkeletonComponent } from '../../../design-system/primitives/feedback-states';

/**
 * Feed skeleton — initial-loading placeholder that mirrors a populated stream.
 *
 * Renders N post-shaped skeletons so the loading state reserves realistic
 * layout (no CLS when real posts arrive) and reads as "a feed is arriving",
 * not a generic spinner. Each skeleton row mirrors the populated post frame:
 * avatar circle + identity lines + body text lines + a quiet action row.
 *
 * Accessibility (VAL-FEED-001, VAL-FEED-024): the host region carries
 * `aria-busy="true"` and an `aria-label` so AT announces the feed is loading.
 * The inner `zm-skeleton` blocks are themselves `aria-hidden` (purely
 * decorative) — the busy semantics live on THIS container, not the bars.
 *
 * Reduced motion (VAL-DS-016): the shimmer collapses to a static tonal block
 * via the `--zm-skeleton-duration` token cascade (0ms under reduced-motion).
 * The skeleton keeps its tonal separation so the placeholder is still
 * readable in a static frame.
 */
@Component({
  selector: 'zm-feed-skeleton',
  standalone: true,
  imports: [ZmSkeletonComponent],
  styleUrl: './feed-skeleton.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'zm-feed-skeleton',
    '[attr.role]': '"status"',
    '[attr.aria-busy]': '"true"',
    '[attr.aria-label]': 'ariaLabel()',
  },
  template: `
    @for (row of rows(); track $index) {
      <article class="zm-feed-skeleton__post" aria-hidden="true">
        <header class="zm-feed-skeleton__head">
          <zm-skeleton variant="circle" [width]="'2.7rem'" />
          <div class="zm-feed-skeleton__identity">
            <zm-skeleton variant="text" [width]="'9rem'" />
            <zm-skeleton variant="text" [width]="'5rem'" />
          </div>
        </header>
        <div class="zm-feed-skeleton__body">
          <zm-skeleton variant="text" [lines]="3" />
        </div>
        <footer class="zm-feed-skeleton__actions">
          <zm-skeleton variant="rect" [width]="'3.5rem'" [height]="'1rem'" />
          <zm-skeleton variant="rect" [width]="'4rem'" [height]="'1rem'" />
          <zm-skeleton variant="rect" [width]="'3rem'" [height]="'1rem'" />
        </footer>
      </article>
    }
  `,
})
export class ZmFeedSkeletonComponent {
  /** Number of post-shaped placeholder rows to render. Default 3. */
  readonly count = input<number>(3);

  /** Accessible label announced while the skeleton shows. */
  readonly ariaLabel = input<string>('Akış yükleniyor');

  /** Row index array for the `@for` loop. Clamped to a sane range. */
  readonly rows = computed<readonly number[]>(() => {
    const n = Math.min(8, Math.max(1, Math.floor(this.count())));
    return Array.from({ length: n }, (_, i) => i);
  });
}
