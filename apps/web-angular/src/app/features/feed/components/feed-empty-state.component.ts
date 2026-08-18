import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { ZmEmptyStateComponent } from '../../../design-system/primitives/feedback-states';

/**
 * Feed empty state — distinct surfaces for true-empty vs filtered-empty
 * (VAL-FEED-002).
 *
 * Three honest variants, each naming a specific cause + consequence + useful
 * next step (docs/agent/13-ANTI-SLOP.md §8). Never a dead end, never generic
 * "İçerik yok".
 *
 *   - `following`  — Following mode has no posts yet. Cause: you follow no one
 *                    (or no one you follow has posted). Next step: open
 *                    Discovery to find voices to follow.
 *   - `discovery`  — Discovery returned nothing recommendable right now.
 *                    Cause: the ranker has no suggestions for you yet. Next
 *                    step: share a post to seed your graph, or retry shortly.
 *   - `filtered`   — a client filter (text search) is active and matches
 *                    nothing. This is DISTINCT from the above: the stream
 *                    DOES have content, but the filter hides all of it. The
 *                    only useful action is to clear the filter, which is why
 *                    the action + copy differ (VAL-FEED-002).
 *
 * The filtered variant additionally renders the active filter context as a
 * removable chip ABOVE the empty surface, so the distinction is visual as
 * well as textual — the user sees exactly what is being filtered out.
 *
 * Consumes ONLY `--zm-state-*` (via ZmEmptyStateComponent) + `--zm-chip-*`
 * tokens. No hardcoded hex.
 */
export type FeedEmptyVariant = 'following' | 'discovery' | 'filtered';

@Component({
  selector: 'zm-feed-empty-state',
  standalone: true,
  imports: [ZmEmptyStateComponent],
  styleUrl: './feed-empty-state.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'zm-feed-empty',
    '[attr.data-variant]': 'variant()',
  },
  template: `
    @if (variant() === 'filtered') {
      <!-- Active-filter context chip — makes filtered-empty visually distinct
           from true-empty. Removable; clearing it is the primary recovery. -->
      <div class="zm-feed-empty__filter-context">
        <span class="zm-feed-empty__filter-chip" role="status">
          <span class="zm-feed-empty__filter-chip-label">Filtre:</span>
          <span class="zm-feed-empty__filter-chip-value">"{{ query() }}"</span>
          <button
            type="button"
            class="zm-feed-empty__filter-clear"
            aria-label="Filtreyi temizle"
            (click)="resetFilters.emit()"
          >
            <svg viewBox="0 0 16 16" focusable="false" aria-hidden="true">
              <path
                d="M4 4l8 8M12 4l-8 8"
                fill="none"
                stroke="currentColor"
                stroke-width="2"
                stroke-linecap="round"
              />
            </svg>
          </button>
        </span>
      </div>
      <zm-empty-state
        [title]="title()"
        [description]="description()"
        [actionLabel]="actionLabel()"
        (action)="resetFilters.emit()"
      />
    } @else {
      <zm-empty-state
        [title]="title()"
        [description]="description()"
        [actionLabel]="actionLabel()"
        (action)="primaryAction.emit()"
      />
    }
  `,
})
export class ZmFeedEmptyStateComponent {
  /** Which empty situation to render. */
  readonly variant = input<FeedEmptyVariant>('following');

  /** Active filter text (filtered variant only), shown in the context chip. */
  readonly query = input<string>('');

  /** Emitted for the primary next action on true-empty variants
   *  (following → open Discovery; discovery → publish). */
  readonly primaryAction = output<void>();

  /** Emitted when the user clears the filter (filtered variant only). */
  readonly resetFilters = output<void>();

  /** Variant-specific Turkish title (specific cause, never generic). */
  readonly title = computed<string>(() => {
    switch (this.variant()) {
      case 'following':
        return 'Akışın henüz sessiz';
      case 'discovery':
        return 'Keşfet şu an öneri sunamıyor';
      case 'filtered':
        return 'Filtrene uyan gönderi yok';
    }
  });

  /** Variant-specific description: cause + consequence + next step. */
  readonly description = computed<string>(() => {
    switch (this.variant()) {
      case 'following':
        return 'Takip ettiğin hesaplar gönderi paylaştığında burada görünür. Yeni sesler keşfetmek için Keşfet sekmesine geçebilirsin.';
      case 'discovery':
        return 'Sana önerebileceğimiz yeni bir içerik henüz oluşmadı. Kısa süre sonra tekrar dene ya da kendi gönderini paylaşarak başlat.';
      case 'filtered': {
        const q = this.query().trim();
        return q
          ? `"${q}" için yüklenen gönderilerden hiçbiri eşleşmedi. Filtreyi temizleyerek tüm akışı görebilirsin.`
          : 'Aktif filtreyle eşleşen gönderi yok. Filtreyi temizleyerek tüm akışı görebilirsin.';
      }
    }
  });

  /** Variant-specific action label. Differs between true-empty and
   *  filtered-empty (VAL-FEED-002: action differs). */
  readonly actionLabel = computed<string>(() => {
    switch (this.variant()) {
      case 'following':
        return "Keşfet'i aç";
      case 'discovery':
        return 'Gönderi paylaş';
      case 'filtered':
        return 'Filtreyi temizle';
    }
  });
}
