import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

/**
 * ZmRadio — ZosyalMedya design-system radio primitive.
 *
 * Contract (VAL-DS-024):
 *
 *   - **Native primitive**. A real `<input type="radio">` carries the
 *     semantic role/state to AT. Group radios by giving every option the
 *     same `name` (REQUIRED for keyboard + form semantics). The browser
 *     delivers arrow-key navigation within a same-name group for free
 *     (Up/Down + Left/Right cycle, per WAI-ARIA radiogroup pattern).
 *
 *   - **Persistent label**. A real `<label for=id>` wraps the row; the label
 *     text remains visible at rest, when selected, when disabled, and when in
 *     error.
 *
 *   - **State communicated via icon + position, never color alone**. The
 *     selected state fills the outer ring AND renders a solid dot in the
 *     center (a non-color cue). The dot is a distinct shape from the checkbox
 *     checkmark so the control type reads in a static frame.
 *
 *   - **State coverage**: rest, hover, focus-visible, selected, unselected,
 *     disabled, error, high-contrast (author-side reinforcement). Under
 *     Windows high-contrast / forced-colors the ring edge + dot + focus ring
 *     remain visible.
 *
 *   - **Selection emission**. The component emits `selected` with its `value`
 *     whenever this radio becomes the chosen one (native `change` event).
 *     Parent forms typically listen on each radio in the group and update
 *     the bound value; the `checked` input mirrors the current group value.
 *
 * Consumes ONLY the `--zm-selection-*` component layer (tokens.css §3).
 *
 * Engine: CSS transitions only (`.zm-feedback` vocabulary). No
 * `@angular/animations` triggers. Reduced motion collapses durations via the
 * `--zm-duration-*` token cascade; state survives via the dot + filled ring.
 *
 * @example
 * <zm-radio name="visibility" value="public"  label="Herkese açık"
 *           [checked]="vis()==='public'"  (selected)="vis.set($event)" />
 * <zm-radio name="visibility" value="followers" label="Takipçiler"
 *           [checked]="vis()==='followers'" (selected)="vis.set($event)" />
 */
let nextZmRadioId = 0;

@Component({
  selector: 'zm-radio',
  templateUrl: './radio.component.html',
  styleUrl: './radio.component.css',
  host: { class: 'zm-radio' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ZmRadioComponent {
  /** Persistent label text. REQUIRED — placeholder is never the only label. */
  readonly label = input.required<string>();

  /** The form value this radio represents. REQUIRED — emitted via `selected`
   *  when this radio becomes the chosen option. */
  readonly value = input.required<string>();

  /** Group name. REQUIRED for keyboard + form semantics: every radio in a
   *  group MUST share the same `name` so the browser handles arrow-key
   *  cycling and only-one-checked semantics. */
  readonly name = input.required<string>();

  /** Whether this radio is currently the chosen option in its group. */
  readonly checked = input<boolean>(false);

  /** Hard-disabled. */
  readonly disabled = input<boolean>(false);

  /** Required marker (adds `required` attr + a visual asterisk on the label). */
  readonly required = input<boolean>(false);

  /** Error text. When non-empty: aria-invalid=true + aria-describedby points
   *  to this node + the danger ring around the radio. */
  readonly error = input<string>('');

  /** Optional helper text. Shown below the row; tied via aria-describedby. */
  readonly helper = input<string>('');

  /** Author-side high-contrast reinforcement. */
  readonly highContrast = input<boolean>(false);

  /** Optional explicit id. When omitted, a stable generated id is used so the
   *  `<label for>` association is always wired. */
  readonly id = input<string>('');

  /** Emitted with this radio's `value` when it becomes the chosen option. */
  readonly selected = output<string>();

  /** Forwarded native focus + blur events. */
  readonly focused = output<void>();
  readonly blurred = output<void>();

  /** Resolved id for the input + label for/id wiring. */
  readonly resolvedId = computed<string>(() => {
    const explicit = this.id();
    return explicit ? explicit : `zm-radio-${nextZmRadioId++}`;
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

  /** Native change handler — emits this radio's value when it is selected.
   *  Native semantics guarantee this fires only when transitioning TO checked
   *  within the group. */
  onChange(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    if (target?.checked) {
      this.selected.emit(this.value());
    }
  }
}
