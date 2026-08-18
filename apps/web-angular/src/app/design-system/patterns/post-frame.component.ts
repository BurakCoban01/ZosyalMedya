import {
  ChangeDetectionStrategy,
  Component,
  input,
} from '@angular/core';

/**
 * ZmPostFrame — the editorial structural shell for a single post.
 *
 * This is a reusable PRESENTATION pattern (not feed-specific). It establishes
 * the Living Editorial Network reading rhythm for a post:
 *
 *   - a calm `<article>` landmark on the reading surface, with a strategic
 *     `raised` variant (subtle surface lift) reserved for content that should
 *     stand apart (media, polls) — NOT applied to every post, so the stream
 *     keeps a varied rhythm rather than reading as a uniform card grid
 *     (VAL-FEED-021);
 *   - a reserved thread-line motif in a leading gutter — a signature Living
 *     Editorial Network motif — that is purely decorative (`aria-hidden`,
 *     `pointer-events:none`) and NEVER crosses body text (VAL-DS-034);
 *   - a default content slot (the post body / variants) and a footer slot
 *     projected by the consumer (the action bar / composer).
 *
 * The frame does NOT own post data or interactions — it is a structural +
 * art-direction primitive. Feed-specific rendering lives in `ZmPostCard`.
 *
 * Engine: CSS only (no `@angular/animations`). Consumes ONLY `--zm-post-frame-*`
 * component-layer tokens (no hardcoded hex). Reduced-motion collapses the
 * enter animation to opacity-only; forced-colors keeps edges visible.
 *
 * @example
 * <zm-post-frame [raised]="hasMedia" [discoveryReason]="reason">
 *   <header zm-post-identity>…</header>
 *   <div class="post-body">…</div>
 *   <footer zm-post-actions>…</footer>   // projected
 * </zm-post-frame>
 */
@Component({
  selector: 'zm-post-frame',
  standalone: true,
  styleUrl: './post-frame.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'zm-post-frame',
    '[class.zm-post-frame--raised]': 'raised()',
    '[attr.data-discovery]': 'discoveryReason() ? true : null',
  },
  template: `
    <!-- Reserved thread-line gutter: a signature Living Editorial Network motif.
         Purely decorative (aria-hidden), never crosses body text, sits in a
         reserved leading column so the motif never competes with content. -->
    <span class="zm-post-frame__gutter" aria-hidden="true">
      <svg
        class="zm-post-frame__thread"
        viewBox="0 0 2 100"
        preserveAspectRatio="none"
        focusable="false"
      >
        <path
          d="M1 0 V 100"
          fill="none"
          stroke="currentColor"
          stroke-width="1.5"
          stroke-linecap="round"
          stroke-dasharray="2 5"
        />
      </svg>
    </span>

    <div class="zm-post-frame__content">
      <ng-content />
    </div>
  `,
})
export class ZmPostFrameComponent {
  /** Strategic raised surface. Apply to media/poll-bearing posts so they lift
   *  off the calm stream; leave false for ordinary posts so the stream keeps
   *  its editorial rhythm (VAL-FEED-021). */
  readonly raised = input<boolean>(false);

  /** Optional discovery ranking reason echoed as a data attribute so the
   *  consumer (or assistive tech) can read it; the visible reason chip is
   *  rendered by the consumer inside the content slot. */
  readonly discoveryReason = input<string | null>(null);
}
