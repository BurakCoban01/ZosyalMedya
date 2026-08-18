import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

/**
 * ZmButton — ZosyalMedya design-system button primitive.
 *
 * Variants: `primary | secondary | quiet | danger`. A page should rarely show
 * more than one primary action per decision area (docs/agent/03-DESIGN-SYSTEM
 * §9). Consumes ONLY `--zm-button-*` component-layer tokens (which compose the
 * semantic `--zm-brand` / `--zm-text-*` / `--zm-danger` roles); no hardcoded
 * hex anywhere in this component's CSS.
 *
 * State matrix (VAL-DS-018): rest, hover, focus-visible, pressed (:active),
 * selected (aria-pressed), disabled, loading, error, high-contrast. Each state
 * is visually discriminable AND carries a non-color cue (position/weight/icon)
 * so it remains readable under reduced motion and forced-colors (VAL-DS-017,
 * VAL-DS-023).
 *
 * Loading (VAL-DS-019): preserves button width and accessible name. The label
 * is kept in the DOM at `opacity: 0` (NOT display:none / visibility:hidden) so
 * its text node continues to supply the button's accessible name while a
 * presentational spinner (`aria-hidden`) overlays the label region. The host
 * button exposes `aria-busy="true"` and is set `disabled` to block double
 * submission. Because `opacity` does not affect layout, `getBoundingClientRect()
 * .width` is stable to within a sub-pixel when toggling loading.
 *
 * Engine: CSS transitions only (`.zm-feedback` vocabulary; no
 * `@angular/animations` triggers). Reduced motion collapses durations via the
 * `--zm-duration-*` token cascade (tokens.css §5), and the loop kill-switch in
 * motion.css parks the spinner — state feedback survives via color/icon/text.
 */
export type ZmButtonVariant = 'primary' | 'secondary' | 'quiet' | 'danger';
export type ZmButtonSize = 'md' | 'sm';

@Component({
  selector: 'zm-button',
  templateUrl: './button.component.html',
  styleUrl: './button.component.css',
  host: { class: 'zm-button' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ZmButtonComponent {
  /** Visual variant. `primary` is the default because the most common projected
   *  use is the primary action of a decision area; override to `secondary` /
   *  `quiet` / `danger` for the supporting roles. */
  readonly variant = input<ZmButtonVariant>('primary');

  /** Density. `md` is the standard 40px min-height control; `sm` is for dense
   *  toolbars / inline rows (still meets WCAG 2.2 target via padding). */
  readonly size = input<ZmButtonSize>('md');

  /** Pending state. When true: aria-busy=true, host disabled (no double
   *  submit), label opacity:0 (width + name preserved), spinner overlay. */
  readonly loading = input<boolean>(false);

  /** Hard-disabled (impermeable). Also implied by `loading`. */
  readonly disabled = input<boolean>(false);

  /** Toggle/selected affordance. Reflects `aria-pressed` and adds the
   *  persistent selected treatment (brand indicator + tone). Use for buttons
   *  that represent a binary state (e.g. follow, save). */
  readonly selected = input<boolean>(false);

  /** Error/validation state. Couples the danger ring with the variant color so
   *  the state is never communicated by color alone (the ring shape persists). */
  readonly error = input<boolean>(false);

  /** High-contrast / forced-colors强化 treatment. Adds a reinforced structural
   *  border so the control edge survives Windows high-contrast AND author-side
   *  high-contrast themes. The OS-level forced-colors path is handled by the
   *  `@media (forced-colors: active)` rule in tokens.css + button.component.css. */
  readonly highContrast = input<boolean>(false);

  /** Native button type. Defaults to `button` (never accidentally submits a form). */
  readonly type = input<'button' | 'submit' | 'reset'>('button');

  /** Full-width (block-level) button. Use for primary actions in narrow stacks
   *  (auth forms, mobile sheets). Off by default. */
  readonly block = input<boolean>(false);

  /** Emitted on a confirmed click (suppressed while loading or disabled). */
  readonly clicked = output<void>();

  /** True when the native button must be disabled (explicit or loading). */
  readonly isDisabled = computed<boolean>(() => this.disabled() || this.loading());
}
