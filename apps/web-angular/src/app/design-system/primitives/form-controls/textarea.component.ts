import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

/**
 * ZmTextarea — ZosyalMedya design-system multi-line text input primitive.
 *
 * Contract (VAL-DS-021 / VAL-DS-023): same field contract as ZmInput —
 * persistent `<label>`, optional helper, error tied via `aria-describedby`,
 * `aria-invalid` on error, and the rest / hover / focus-visible / disabled /
 * error / high-contrast state matrix. There is no password-reveal affordance
 * (textareas are plain text). Consumes ONLY the `--zm-input-*` component
 * layer; no hardcoded hex (VAL-DS-002).
 *
 * The label is REQUIRED (placeholder is never the only label) and remains
 * visible when the field is populated or in error. The control reserves a
 * stable `rows` min-height so the field does not collapse on empty state.
 *
 * @example
 * <zm-textarea label="Bio" [helper]="'Maks 280 karakter'" [maxlength]="280"
 *              [value]="bio()" (valueChange)="bio.set($event)" />
 */
export type ZmTextareaResize = 'none' | 'vertical' | 'both';

let nextZmTextareaId = 0;

@Component({
  selector: 'zm-textarea',
  templateUrl: './textarea.component.html',
  styleUrl: './textarea.component.css',
  host: { class: 'zm-textarea' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ZmTextareaComponent {
  /** Persistent label. REQUIRED. */
  readonly label = input.required<string>();

  /** Current value. */
  readonly value = input<string>('');

  /** Placeholder. Hint only — never the sole label. */
  readonly placeholder = input<string>('');

  /** Optional helper text. */
  readonly helper = input<string>('');

  /** Error text. When non-empty: aria-invalid=true + describedby → error node. */
  readonly error = input<string>('');

  /** Hard-disabled. */
  readonly disabled = input<boolean>(false);

  /** Required marker. */
  readonly required = input<boolean>(false);

  /** Read-only. */
  readonly readonly = input<boolean>(false);

  /** Visible rows (height hint). */
  readonly rows = input<number>(4);

  /** Visible columns (width hint; usually overridden by the field width). */
  readonly cols = input<number | null>(null);

  /** Max character count. */
  readonly maxlength = input<number | null>(null);

  /** Resize behavior. Defaults to `vertical` (height-only; width follows the
   *  form cell). `none` fixes the height; `both` allows free resize. */
  readonly resize = input<ZmTextareaResize>('vertical');

  /** Field name. */
  readonly name = input<string>('');

  /** Author-side high-contrast reinforcement. */
  readonly highContrast = input<boolean>(false);

  /** Optional explicit id. */
  readonly id = input<string>('');

  /** Emitted on every input event with the current value. */
  readonly valueChange = output<string>();

  /** Forwarded focus + blur events. */
  readonly focused = output<void>();
  readonly blurred = output<void>();

  readonly resolvedId = computed<string>(() => {
    const explicit = this.id();
    return explicit ? explicit : `zm-textarea-${nextZmTextareaId++}`;
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

  /** Native resize attribute passthrough. */
  readonly resizeAttr = computed<string>(() => this.resize());

  onInput(event: Event): void {
    const target = event.target as HTMLTextAreaElement | null;
    this.valueChange.emit(target?.value ?? '');
  }
}
