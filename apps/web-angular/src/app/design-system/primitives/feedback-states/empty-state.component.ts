import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/**
 * ZmEmptyState — "there is nothing here yet" surface with a useful next action.
 *
 * Contract (VAL-DS-028): an empty state must NOT be a dead end. It renders a
 * clear icon, a specific Turkish title, a one-line description that names the
 * cause AND a useful next step (docs/agent/13-ANTI-SLOP.md §8: reason +
 * consequence + next step), and a concrete primary action the user can take
 * right now (create, discover, refresh filters, follow someone, etc.).
 *
 * Accessibility: the host is a generic `role="group"` region with an accessible
 * name derived from `title`. It is NOT an alert (emptiness is expected, not an
 * error). The loading/empty distinction is the container's responsibility; the
 * empty state is reached only when loading has resolved to zero items. Use
 * `<section aria-labelledby="…">` or `<ng-content>` projection for custom
 * actions when the simple `(action)` output is not enough.
 *
 * Status never color-only (VAL-DS-029): the icon glyph is distinct from the
 * error/permission glyphs (an open signal/arc — "nothing flowing yet"), so the
 * state is readable in grayscale.
 *
 * Consumes ONLY `--zm-state-*` component-layer tokens. No hardcoded hex.
 *
 * @example
 * <zm-empty-state
 *   title="Akışın henüz boş"
 *   description="Takip ettiğin kişilerin gönderileri burada görünür."
 *   actionLabel="Keşfetten başla"
 *   (action)="goDiscover()"
 * ></zm-empty-state>
 */
@Component({
  selector: 'zm-empty-state',
  standalone: true,
  styleUrl: './empty-state.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'zm-state zm-empty-state',
    '[attr.role]': '"group"',
    '[attr.aria-label]': 'title()',
  },
  template: `
    <span class="zm-state__icon" aria-hidden="true">
      <!-- An open signal-arc motif: "nothing is flowing into the stream yet".
           Distinct from the error (alert-x) and permission (lock) glyphs so
           the state reads in grayscale (VAL-DS-029). -->
      <svg viewBox="0 0 48 48" focusable="false">
        <path
          d="M10 32c6-10 22-10 28 0"
          fill="none"
          stroke="currentColor"
          stroke-width="2.4"
          stroke-linecap="round"
        />
        <path
          d="M16 36c3-5 13-5 16 0"
          fill="none"
          stroke="currentColor"
          stroke-width="2.4"
          stroke-linecap="round"
          opacity="0.55"
        />
        <circle cx="24" cy="42" r="2.2" fill="currentColor" />
      </svg>
    </span>

    <h2 class="zm-state__title">{{ title() }}</h2>
    @if (description()) {
      <p class="zm-state__description">{{ description() }}</p>
    }

    <div class="zm-state__actions">
      @if (actionLabel()) {
        <button
          type="button"
          class="zm-state__action zm-feedback"
          (click)="action.emit()"
        >
          {{ actionLabel() }}
        </button>
      }
      <!-- Custom secondary actions / links projected by the caller. -->
      <ng-content select="[zmEmptySecondary]"></ng-content>
      <ng-content></ng-content>
    </div>
  `,
})
export class ZmEmptyStateComponent {
  /** Specific Turkish title naming the empty situation (e.g. "Akışın henüz
   *  boş"). Avoid generic "İçerik yok". */
  readonly title = input<string>('');

  /** One-line description: cause + useful next step. Anti-slop §8 style. */
  readonly description = input<string>('');

  /** Primary next-action label (e.g. "Keşfetten başla"). When empty, no
   *  primary action button renders (use projected content for custom UI). */
  readonly actionLabel = input<string>('');

  /** Emitted when the primary action button is activated. */
  readonly action = output<void>();
}
