import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import type { ZmButtonVariant, ZmButtonSize } from './button.component';

/**
 * ZmIconButton — icon-only action control.
 *
 * Contract (VAL-DS-020):
 *   - ALWAYS has an accessible name (the `ariaLabel` input is `required` so the
 *     compiler enforces it at every call site — an icon button without a name
 *     is a hard build/compile error, not a runtime hope).
 *   - Hit area meets the WCAG 2.2 44×44 CSS-px minimum via the
 *     `--zm-button-icon-size` token on the native button's min-width/min-height.
 *   - Exposes a visual tooltip on hover AND keyboard focus whose text mirrors
 *     the accessible name (sighted users get the same affordance AT users do).
 *
 * Variants mirror `ZmButton` (`primary | secondary | quiet | danger`); the
 * default is `quiet` because most icon buttons are low-emphasis actions (save,
 * share, react, open menu). Use `primary` for the singular principal icon action
 * of a surface and `danger` for destructive icon actions (delete, remove).
 *
 * Toggle semantics: set `pressed` to reflect `aria-pressed="true"` and the
 * selected treatment (e.g. a filled bookmark when saved).
 *
 * Loading mirrors ZmButton: the projected icon is replaced by an aria-hidden
 * spinner, the host exposes `aria-busy="true"`, and the button is disabled to
 * prevent double submission. The fixed 44×44 target guarantees no layout shift.
 *
 * Consumes ONLY `--zm-button-*` / `--zm-*` tokens. No hardcoded hex (VAL-DS-002).
 */
@Component({
  selector: 'zm-icon-button',
  template: `
    <button
      type="button"
      class="zm-icon-button__btn zm-feedback"
      [attr.type]="type()"
      [attr.data-variant]="variant()"
      [attr.data-size]="size()"
      [class.is-loading]="loading()"
      [class.is-pressed]="pressed()"
      [class.is-error]="error()"
      [class.is-high-contrast]="highContrast()"
      [disabled]="isDisabled()"
      [attr.aria-label]="ariaLabel()"
      [attr.aria-busy]="loading() ? 'true' : null"
      [attr.aria-pressed]="pressed() ? 'true' : null"
      (click)="clicked.emit()"
    >
      @if (loading()) {
        <span class="zm-icon-button__spinner" aria-hidden="true" role="presentation"></span>
      } @else {
        <span class="zm-icon-button__icon" aria-hidden="true">
          <ng-content></ng-content>
        </span>
      }
      <!--
        Visual tooltip. aria-hidden=true because it duplicates the button's
        aria-label (no double-read for AT). role=tooltip would imply an AT
        relationship we deliberately avoid; the accessible name is owned by the
        button itself. CSS reveals the tooltip on :hover and :focus-within so
        keyboard users receive the same hint as pointer users (VAL-DS-020).
      -->
      <span class="zm-icon-button__tooltip" aria-hidden="true">{{ tooltipText() }}</span>
    </button>
  `,
  styleUrl: './icon-button.component.css',
  host: { class: 'zm-icon-button' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ZmIconButtonComponent {
  /** Accessible name. REQUIRED — an icon button without a name is a defect.
   *  The `input.required()` signature makes every call site fail to compile
   *  until a name is supplied. */
  readonly ariaLabel = input.required<string>();

  /** Tooltip text. Defaults to the accessible name; override only when the
   *  verbose hint should differ from the concise AT name (rare). */
  readonly tooltip = input<string>();

  /** Visual variant. Defaults to `quiet` (most icon buttons are low-emphasis). */
  readonly variant = input<ZmButtonVariant>('quiet');

  /** Density. `md` = the full 44×44 target; `sm` keeps the 44×44 hit region but
   *  renders a smaller visible glyph (the padded transparent target guarantees
   *  the WCAG minimum even when the visible icon is small). */
  readonly size = input<ZmButtonSize>('md');

  /** Pending state. Replaces the projected icon with an aria-hidden spinner,
   *  sets aria-busy=true, disables the button. */
  readonly loading = input<boolean>(false);

  /** Hard-disabled. Also implied by `loading`. */
  readonly disabled = input<boolean>(false);

  /** Toggle/pressed affordance (aria-pressed). Use for binary icon actions
   *  (bookmark, follow, mute). */
  readonly pressed = input<boolean>(false);

  /** Error state. Couples the danger ring with the variant color. */
  readonly error = input<boolean>(false);

  /** Author-side high-contrast reinforcement (see ZmButton). */
  readonly highContrast = input<boolean>(false);

  /** Native button type. Defaults to `button`. */
  readonly type = input<'button' | 'submit' | 'reset'>('button');

  /** Emitted on a confirmed click (suppressed while loading or disabled). */
  readonly clicked = output<void>();

  /** Tooltip text resolves to the explicit input or falls back to the name. */
  readonly tooltipText = computed<string>(() => this.tooltip() ?? this.ariaLabel());

  /** True when the native button must be disabled (explicit or loading). */
  readonly isDisabled = computed<boolean>(() => this.disabled() || this.loading());
}
