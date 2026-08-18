import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';

/**
 * ZmPermissionState — "you don't have access" surface with rationale + path.
 *
 * Contract (VAL-DS-028): a permission-denied state must explain WHY access is
 * needed / denied and offer a concrete path to request it (or to navigate to
 * a surface the user CAN access). It is never a bare "Yetkisiz" dead end.
 *
 * Accessibility: the host is a generic `role="group"` region (permission state
 * is informational, not an alert — it is reached because the user's role does
 * not include the required permission, which is an expected condition, not an
 * error). The accessible name comes from `title`. If the surface replaces an
 * error message after a 403, prefer rendering it with `role="status"` from the
 * caller (set on the wrapping container) so the transition is announced.
 *
 * Status never color-only (VAL-DS-029): the discovery accent color is coupled
 * with a distinct lock glyph, so the permission state is discriminable from
 * error/empty/success in grayscale.
 *
 * Consumes ONLY `--zm-state-*` component-layer tokens. No hardcoded hex.
 *
 * @example
 * <zm-permission-state
 *   title="Bu panel yalnızca yöneticilere açıktır"
 *   description="İçerik denetimi yetkisi gerektirir; erişim talebi gönderilebilir."
 *   actionLabel="Erişim talep et"
 *   (action)="requestAccess()"
 * ></zm-permission-state>
 */
@Component({
  selector: 'zm-permission-state',
  standalone: true,
  styleUrl: './permission-state.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'zm-state zm-permission-state',
    '[attr.role]': '"group"',
    '[attr.aria-label]': 'title()',
  },
  template: `
    <span class="zm-state__icon zm-state__icon--discovery" aria-hidden="true">
      <!-- Distinct lock glyph so the permission state reads in grayscale,
           separate from error (alert-triangle) and empty (signal-arc). -->
      <svg viewBox="0 0 48 48" focusable="false">
        <rect
          x="11" y="22" width="26" height="20" rx="4"
          fill="none" stroke="currentColor" stroke-width="2.6"
        />
        <path
          d="M16 22v-6a8 8 0 0 1 16 0v6"
          fill="none" stroke="currentColor" stroke-width="2.6" stroke-linecap="round"
        />
        <circle cx="24" cy="31" r="2.6" fill="currentColor" />
        <path
          d="M24 33.6V37"
          stroke="currentColor" stroke-width="2.6" stroke-linecap="round"
        />
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
          class="zm-state__action zm-state__action--primary zm-feedback"
          (click)="action.emit()"
        >
          {{ actionLabel() }}
        </button>
      }
      <!-- Projected secondary path (e.g. "Herkese açık akışa dön" link). -->
      <ng-content></ng-content>
    </div>
  `,
})
export class ZmPermissionStateComponent {
  /** Specific Turkish title naming what is gated (e.g. "Bu panel yalnızca
   *  yöneticilere açıktır"). */
  readonly title = input<string>('');

  /** One-line rationale: why access is needed / denied + the path forward
   *  (e.g. "İçerik denetimi yetkisi gerektirir; erişim talebi gönderilebilir."). */
  readonly description = input<string>('');

  /** Primary path label (e.g. "Erişim talep et" or "Herkese açık akışa dön"). */
  readonly actionLabel = input<string>('');

  /** Emitted when the primary action is activated. */
  readonly action = output<void>();
}
