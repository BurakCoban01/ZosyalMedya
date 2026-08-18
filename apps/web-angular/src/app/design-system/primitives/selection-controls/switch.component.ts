import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

/**
 * ZmSwitch — ZosyalMedya design-system toggle switch primitive.
 *
 * Contract (VAL-DS-024):
 *
 *   - **Semantic role**. Uses `role="switch"` with `aria-checked` mirroring
 *     the on/off state, layered over a native checkbox so the underlying
 *     form/keyboard behavior (Space to toggle, form participation, focus)
 *     comes for free while AT announce the switch semantics.
 *
 *   - **Persistent label**. A real `<label for=id>` wraps the row; the label
 *     text remains visible at rest, when on, when disabled, and when in
 *     error.
 *
 *   - **State communicated via icon + position, never color alone**. The on
 *     state slides the thumb to the opposite side of the track (position
 *     cue) AND fills the track (color reinforcement). Off sits at the start
 *     side; on at the end side. A pending state shows an inline spinner +
 *     `aria-busy`; an error state couples the danger ring with the message
 *     text. Every state is discriminable in a static frame.
 *
 *   - **State coverage**: rest, hover, focus-visible, on, off, disabled,
 *     loading/pending, error, high-contrast (author-side reinforcement).
 *     Under Windows high-contrast / forced-colors the track edge, thumb, and
 *     focus ring remain visible.
 *
 *   - **Keyboard**. Space toggles the switch (native checkbox semantics).
 *
 * Consumes ONLY the `--zm-selection-*` + `--zm-switch-*` component layers
 * (tokens.css §3). Engine: CSS transitions on `transform`/`opacity`/color
 * only (`.zm-feedback` vocabulary). No `@angular/animations` triggers.
 * Reduced motion collapses the slide to a near-instant opacity/state change;
 * the on/off state survives via the thumb position + track fill.
 *
 * @example
 * <zm-switch label="Karanlık tema"
 *            [checked]="dark()"
 *            (checkedChange)="dark.set($event)" />
 * <zm-switch label="İki adımlı doğrulama"
 *            [loading]="mfaSaving()"
 *            [checked]="mfaOn()"
 *            (checkedChange)="toggleMfa()" />
 */
let nextZmSwitchId = 0;

@Component({
  selector: 'zm-switch',
  templateUrl: './switch.component.html',
  styleUrl: './switch.component.css',
  host: { class: 'zm-switch' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ZmSwitchComponent {
  /** Persistent label text. REQUIRED — placeholder is never the only label. */
  readonly label = input.required<string>();

  /** On/off state (two-way bindable with `checkedChange`). */
  readonly checked = input<boolean>(false);

  /** Pending state. When true: aria-busy=true, host disabled (no double
   *  submit), inline spinner overlay. The slide still reflects the LAST
   *  committed `checked` value so the user sees the current state, not the
   *  in-flight target. */
  readonly loading = input<boolean>(false);

  /** Hard-disabled (impermeable). Also implied by `loading`. */
  readonly disabled = input<boolean>(false);

  /** Required marker (adds `required` attr + a visual asterisk on the label). */
  readonly required = input<boolean>(false);

  /** Error text. When non-empty: aria-invalid=true + aria-describedby points
   *  to this node + the danger ring around the switch. */
  readonly error = input<string>('');

  /** Optional helper text. Shown below the row; tied via aria-describedby. */
  readonly helper = input<string>('');

  /** Field name (form submission). */
  readonly name = input<string>('');

  /** The string form value submitted when on (mirrors native checkbox value). */
  readonly value = input<string>('');

  /** Author-side high-contrast reinforcement. */
  readonly highContrast = input<boolean>(false);

  /** Optional explicit id. When omitted, a stable generated id is used so the
   *  `<label for>` association is always wired. */
  readonly id = input<string>('');

  /** Emitted whenever the on/off state changes (native `change` event). */
  readonly checkedChange = output<boolean>();

  /** Forwarded native focus + blur events. */
  readonly focused = output<void>();
  readonly blurred = output<void>();

  /** Resolved id for the input + label for/id wiring. */
  readonly resolvedId = computed<string>(() => {
    const explicit = this.id();
    return explicit ? explicit : `zm-switch-${nextZmSwitchId++}`;
  });

  /** Stable element ids for the helper + error nodes. */
  readonly helperId = computed<string>(() => `${this.resolvedId()}--helper`);
  readonly errorId = computed<string>(() => `${this.resolvedId()}--error`);

  readonly hasError = computed<boolean>(() => this.error().trim().length > 0);

  readonly describedBy = computed<string | null>(() => {
    const refs: string[] = [];
    if (this.helper().trim().length > 0) refs.push(this.helperId());
    if (this.hasError()) refs.push(this.errorId());
    return refs.length > 0 ? refs.join(' ') : null;
  });

  /** True when the switch must be disabled (explicit or loading). */
  readonly isDisabled = computed<boolean>(() => this.disabled() || this.loading());

  /** Native change handler — emits the new checked state. */
  onChange(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.checkedChange.emit(target?.checked ?? false);
  }
}
