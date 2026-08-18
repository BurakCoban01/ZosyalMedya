import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

/**
 * ZmSelect — ZosyalMedya design-system single-choice select primitive.
 *
 * Contract (VAL-DS-021 / VAL-DS-023): same field contract as ZmInput —
 * persistent `<label>`, optional helper, error tied via `aria-describedby`,
 * `aria-invalid` on error, and the rest / hover / focus-visible / disabled /
 * error / high-contrast state matrix.
 *
 * Implementation notes:
 *
 *   - Wraps the **native** `<select>` (not a custom listbox). The native
 *     control gives us correct mobile/AT behavior, keyboard arrow-key
 *     navigation, and the OS option popup for free. We restyle its resting
 *     box via `appearance: none` + the `--zm-input-*` tokens and add a
 *     decorative chevron positioned over the trailing padding.
 *
 *   - The chevron is an inline SVG using `currentColor`, so it follows the
 *     theme AND forced-colors remapping (no hex in a `data:` URI; VAL-DS-002).
 *     It is `aria-hidden` + `pointer-events: none` so it never interferes with
 *     the select's click target or its AX tree.
 *
 *   - `<option>` elements are projected via `<ng-content>` so consumers write
 *     `<zm-select><option value="...">...</zm-select>`. The select's `value`
 *     binds to `[value]` and emits `(valueChange)` on change.
 *
 * @example
 * <zm-select label="Görünürlük" [value]="vis()" (valueChange)="vis.set($event)">
 *   <option value="public">Herkese açık</option>
 *   <option value="followers">Takipçiler</option>
 * </zm-select>
 */
let nextZmSelectId = 0;

@Component({
  selector: 'zm-select',
  templateUrl: './select.component.html',
  styleUrl: './select.component.css',
  host: { class: 'zm-select' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ZmSelectComponent {
  /** Persistent label. REQUIRED. */
  readonly label = input.required<string>();

  /** Current value (the selected option's value attr). */
  readonly value = input<string>('');

  /** Optional helper text. */
  readonly helper = input<string>('');

  /** Error text. When non-empty: aria-invalid=true + describedby → error node. */
  readonly error = input<string>('');

  /** Hard-disabled. Disables the native select. */
  readonly disabled = input<boolean>(false);

  /** Required marker. */
  readonly required = input<boolean>(false);

  /** Field name. */
  readonly name = input<string>('');

  /** Author-side high-contrast reinforcement. */
  readonly highContrast = input<boolean>(false);

  /** Optional explicit id. */
  readonly id = input<string>('');

  /** Emitted on change with the selected option value. */
  readonly valueChange = output<string>();

  /** Forwarded focus + blur events. */
  readonly focused = output<void>();
  readonly blurred = output<void>();

  readonly resolvedId = computed<string>(() => {
    const explicit = this.id();
    return explicit ? explicit : `zm-select-${nextZmSelectId++}`;
  });

  readonly helperId = computed<string>(() => `${this.resolvedId()}--helper`);
  readonly errorId = computed<string>(() => `${this.resolvedId()}--error`);

  readonly hasError = computed<boolean>(() => this.error().trim().length > 0);

  readonly describedBy = computed<string | null>(() => {
    const refs: string[] = [];
    if (this.helper().trim().length > 0) refs.push(this.helperId());
    if (this.hasError()) refs.push(this.errorId());
    return refs.length > 0 ? refs.join(' ') : null;
  });

  /** Native `<select>` change handler — reads select.value (the selected
   *  option's value attribute). */
  onChange(event: Event): void {
    const target = event.target as HTMLSelectElement | null;
    this.valueChange.emit(target?.value ?? '');
  }
}
