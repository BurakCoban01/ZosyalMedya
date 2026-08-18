import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

/**
 * ZmCheckbox — ZosyalMedya design-system checkbox primitive.
 *
 * Contract (VAL-DS-024):
 *
 *   - **Native primitive**. A real `<input type="checkbox">` carries the
 *     semantic role/state to AT (no ARIA reimplementation). The visible
 *     square box + checkmark glyph are a presentational overlay drawn above
 *     the (visually-hidden but functional) native input, so click/touch,
 *     keyboard Space, form participation, and AT state come for free.
 *
 *   - **Persistent label**. A real `<label for=id>` wraps the row; the label
 *     text remains visible at rest, when checked, when disabled, and when in
 *     error. Placeholder is never a label substitute.
 *
 *   - **State communicated via icon + position, never color alone**. The
 *     checked state fills the box AND renders a checkmark glyph (a non-color
 *     cue). The indeterminate state renders a dash glyph (a different
 *     non-color cue). Disabled dims the row; error couples the danger ring
 *     with the message text. Every state is discriminable in a static frame.
 *
 *   - **State coverage**: rest, hover, focus-visible, checked, unchecked,
 *     indeterminate, disabled, error, high-contrast (author-side
 *     reinforcement). Under Windows high-contrast / forced-colors the box
 *     edge and focus ring remain visible.
 *
 *   - **Keyboard**. Space toggles the native checkbox (browser-native); the
 *     label and the visible box both forward the click to the input. No
 *     custom keyboard handler is wired so the platform behavior stays correct.
 *
 * Consumes ONLY the `--zm-selection-*` component layer (tokens.css §3),
 * which composes the semantic `--zm-brand` / `--zm-text-*` / `--zm-border-*` /
 * `--zm-focus` / `--zm-danger` roles. No hardcoded hex (VAL-DS-002).
 *
 * Engine: CSS transitions only (the `.zm-feedback` vocabulary). No
 * `@angular/animations` triggers. Reduced motion collapses durations via the
 * `--zm-duration-*` token cascade; the state survives via the glyph + the
 * filled box (both static-frame cues).
 *
 * @example
 * <zm-checkbox label="E-posta bildirimleri al"
 *              [checked]="emailOpt()"
 *              helper="Haftalık özet gönderir"
 *              (checkedChange)="emailOpt.set($event)" />
 * <zm-checkbox label="Şartları kabul ediyorum"
 *              [error]="termsError()" />
 */
let nextZmCheckboxId = 0;

@Component({
  selector: 'zm-checkbox',
  templateUrl: './checkbox.component.html',
  styleUrl: './checkbox.component.css',
  host: { class: 'zm-checkbox' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ZmCheckboxComponent {
  /** Persistent label text. REQUIRED — placeholder is never the only label. */
  readonly label = input.required<string>();

  /** Checked state (two-way bindable with `checkedChange`). */
  readonly checked = input<boolean>(false);

  /** Indeterminate state. Visual-only third state; does not toggle `checked`.
   *  When true, the box shows a dash glyph. The native indeterminate property
   *  is set so AT (that support it) announce "karışık". */
  readonly indeterminate = input<boolean>(false);

  /** Hard-disabled. */
  readonly disabled = input<boolean>(false);

  /** Required marker (adds `required` attr + a visual asterisk on the label). */
  readonly required = input<boolean>(false);

  /** Read-only (the underlying input becomes `readonly` semantically; native
   *  checkboxes have no readonly attribute, so we use aria-readonly + disable
   *  pointer events on the label so the state is honest). */
  readonly readonly = input<boolean>(false);

  /** Error text. When non-empty: aria-invalid=true + aria-describedby points
   *  to this node + the danger ring around the box. */
  readonly error = input<string>('');

  /** Optional helper text. Shown below the row; tied via aria-describedby. */
  readonly helper = input<string>('');

  /** Field name (form submission). */
  readonly name = input<string>('');

  /** The string form value submitted when checked (mirrors native checkbox). */
  readonly value = input<string>('');

  /** Author-side high-contrast reinforcement (doubles the structural border). */
  readonly highContrast = input<boolean>(false);

  /** Optional explicit id. When omitted, a stable generated id is used so the
   *  `<label for>` association is always wired. */
  readonly id = input<string>('');

  /** Emitted whenever the checked state changes (native `change` event). */
  readonly checkedChange = output<boolean>();

  /** Forwarded native focus + blur events (composition convenience). */
  readonly focused = output<void>();
  readonly blurred = output<void>();

  /** Resolved id for the input + label for/id wiring. */
  readonly resolvedId = computed<string>(() => {
    const explicit = this.id();
    return explicit ? explicit : `zm-checkbox-${nextZmCheckboxId++}`;
  });

  /** Stable element ids for the helper + error nodes. */
  readonly helperId = computed<string>(() => `${this.resolvedId()}--helper`);
  readonly errorId = computed<string>(() => `${this.resolvedId()}--error`);

  /** True when the field currently presents an error (drives aria-invalid). */
  readonly hasError = computed<boolean>(() => this.error().trim().length > 0);

  /** aria-describedby resolves to helper and/or error node ids. Null when none. */
  readonly describedBy = computed<string | null>(() => {
    const refs: string[] = [];
    if (this.helper().trim().length > 0) refs.push(this.helperId());
    if (this.hasError()) refs.push(this.errorId());
    return refs.length > 0 ? refs.join(' ') : null;
  });

  /** Native change handler — reads the new checked state and emits it. */
  onChange(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.checkedChange.emit(target?.checked ?? false);
  }
}
