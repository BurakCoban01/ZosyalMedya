import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/**
 * ZmErrorState — recoverable error surface with retry (role=alert).
 *
 * Contract (VAL-DS-028): an error state must name the specific cause, describe
 * the consequence, and offer a concrete recovery action — almost always
 * "Tekrar dene" wired to the real operation that failed (docs/agent/
 * 13-ANTI-SLOP.md §8). It is NOT a generic "Bir şeyler ters gitti".
 *
 * Accessibility (VAL-DS-028): the host carries `role="alert"` so the message
 * is announced assertively when the surface mounts. The host is also
 * `aria-atomic=true` so the whole block is read as one utterance (icon label
 * is `aria-hidden`; the title + description carry the announcement).
 *
 * Status never color-only (VAL-DS-029): the danger accent color is coupled
 * with a distinct alert glyph (alert-triangle with an exclamation), so the
 * error state is discriminable from success/warning/empty in grayscale.
 *
 * Consumes ONLY `--zm-state-*` component-layer tokens. No hardcoded hex.
 *
 * @example
 * <zm-error-state
 *   title="Akış şu anda yenilenemedi"
 *   description="Bağlantınızı kontrol edip yeniden deneyin; taslaklarınız korunur."
 *   retryLabel="Tekrar dene"
 *   (retry)="reloadFeed()"
 * ></zm-error-state>
 */
@Component({
  selector: 'zm-error-state',
  standalone: true,
  styleUrl: './error-state.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'zm-state zm-error-state',
    '[attr.role]': '"alert"',
    '[attr.aria-atomic]': '"true"',
    '[attr.aria-label]': 'title()',
  },
  template: `
    <span class="zm-state__icon zm-state__icon--danger" aria-hidden="true">
      <!-- Distinct alert glyph (alert-triangle + exclamation) so the error
           reads in grayscale, separate from success/warning/empty (VAL-DS-029). -->
      <svg viewBox="0 0 48 48" focusable="false">
        <path
          d="M24 6l19 33H5z"
          fill="none"
          stroke="currentColor"
          stroke-width="2.6"
          stroke-linejoin="round"
        />
        <path
          d="M24 19v9"
          stroke="currentColor"
          stroke-width="2.8"
          stroke-linecap="round"
        />
        <circle cx="24" cy="34" r="2.2" fill="currentColor" />
      </svg>
    </span>

    <h2 class="zm-state__title">{{ title() }}</h2>
    @if (description()) {
      <p class="zm-state__description">{{ description() }}</p>
    }

    <div class="zm-state__actions">
      @if (retryLabel()) {
        <button
          type="button"
          class="zm-state__action zm-state__action--primary zm-feedback"
          (click)="retry.emit()"
        >
          {{ retryLabel() }}
        </button>
      }
      <!-- Projected secondary actions (e.g. "Taslağı aç", "Destek"). -->
      <ng-content></ng-content>
    </div>
  `,
})
export class ZmErrorStateComponent {
  /** Specific Turkish title naming the cause (e.g. "Akış şu anda
   *  yenilenemedi"). Avoid generic "Bir şeyler ters gitti". */
  readonly title = input<string>('');

  /** One-line description: consequence + reassurance (e.g. "Bağlantınızı
   *  kontrol edip yeniden deneyin; taslaklarınız korunur."). */
  readonly description = input<string>('');

  /** Retry button label. Defaults to the canonical Turkish "Tekrar dene". */
  readonly retryLabel = input<string>('Tekrar dene');

  /** Emitted when the retry button is activated. Wire to the real operation. */
  readonly retry = output<void>();
}
