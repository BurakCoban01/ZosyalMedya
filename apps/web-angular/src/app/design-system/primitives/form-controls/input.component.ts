import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';

/**
 * ZmInput — ZosyalMedya design-system text input primitive.
 *
 * Contract (VAL-DS-021 / VAL-DS-022 / VAL-DS-023):
 *
 *   - **Persistent label** (VAL-DS-021). The `label` input is REQUIRED — a
 *     placeholder is never the only label. The label renders as a real
 *     `<label>` element associated to the native `<input>` via `for`/`id`, so
 *     it remains visible AND correctly associated when the field is populated
 *     or in error. The label never collapses into the field on focus.
 *
 *   - **Error tied via aria-describedby** (VAL-DS-021). When `error` is
 *     non-empty, the field sets `aria-invalid="true"` and `aria-describedby`
 *     resolves to the error node (plus the helper node when both are present).
 *     The error node carries the field's ID suffix so the wiring is stable.
 *
 *   - **Password reveal with safe focus/state** (VAL-DS-022). When
 *     `type="password"`, a trailing toggle button flips the input `type`
 *     between `password` and `text`. The toggle NEVER auto-reveals (initial
 *     type is always `password`); revealing is a user click. The toggle
 *     exposes `aria-pressed` (true when revealed) and an `aria-label` that
 *     reflects the action ("Şifreyi göster" / "Şifreyi gizle"). Focus stays
 *     on the toggle button, which lives INSIDE the field control group, so
 *     focus never escapes the field on reveal.
 *
 *   - **State coverage** (VAL-DS-023): rest, hover, focus-visible, disabled,
 *     error, and high-contrast (author-side reinforcement). Under Windows
 *     high-contrast / forced-colors, the control edge and focus ring remain
 *     visible (no `border: none` without an alternative).
 *
 * Consumes ONLY the `--zm-input-*` component layer (tokens.css §3), which
 * composes the semantic `--zm-surface-*` / `--zm-text-*` / `--zm-border-*` /
 * `--zm-focus` / `--zm-danger` roles. No hardcoded hex (VAL-DS-002).
 *
 * Engine: CSS transitions only (the `.zm-feedback` vocabulary). No
 * `@angular/animations` triggers. Reduced motion collapses durations via the
 * `--zm-duration-*` token cascade; state feedback survives via color + the
 * persistent label + the error text.
 *
 * @example
 * <zm-input label="E-posta" type="email" [helper]="'user@ornek.com'"
 *           [value]="email()" (valueChange)="email.set($event)" />
 * <zm-input label="Şifre" type="password" [error]="pwdError()" />
 */
export type ZmInputType =
  | 'text'
  | 'email'
  | 'password'
  | 'search'
  | 'url'
  | 'tel'
  | 'number';

/** Module-scope ID counter so every field instance gets a stable, unique id
 *  when the consumer does not supply one. Mirrors the Angular Material pattern. */
let nextZmInputId = 0;

@Component({
  selector: 'zm-input',
  templateUrl: './input.component.html',
  styleUrl: './input.component.css',
  host: { class: 'zm-input' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ZmInputComponent {
  /** Persistent label. REQUIRED — a placeholder is never the only label. */
  readonly label = input.required<string>();

  /** Current value (string). Use with `(valueChange)` for two-way binding. */
  readonly value = input<string>('');

  /** Native input type. Defaults to `text`. `password` enables the reveal
   *  toggle (VAL-DS-022). */
  readonly type = input<ZmInputType>('text');

  /** Placeholder. Hint only — never the sole label. */
  readonly placeholder = input<string>('');

  /** Optional helper text. Shown below the field; tied via aria-describedby. */
  readonly helper = input<string>('');

  /** Error text. When non-empty: aria-invalid=true + aria-describedby points
   *  to this node + the error class drives the danger ring. */
  readonly error = input<string>('');

  /** Hard-disabled. */
  readonly disabled = input<boolean>(false);

  /** Required marker (adds `required` attr + a visual asterisk on the label). */
  readonly required = input<boolean>(false);

  /** Read-only. */
  readonly readonly = input<boolean>(false);

  /** Native autocomplete token (e.g. 'email', 'current-password', 'off'). */
  readonly autocomplete = input<string>('');

  /** Field name (form submission / labels). */
  readonly name = input<string>('');

  /** inputmode hint for mobile keyboards (e.g. 'email', 'numeric'). */
  readonly inputmode = input<string>('');

  /** Max character count. */
  readonly maxlength = input<number | null>(null);

  /** Author-side high-contrast reinforcement (see ZmButton). */
  readonly highContrast = input<boolean>(false);

  /** Optional explicit id. When omitted, a stable generated id is used so the
   *  `<label for>` association is always wired. */
  readonly id = input<string>('');

  /** Emitted on every input event with the current value. */
  readonly valueChange = output<string>();

  /** Forwarded native focus + blur events (composition convenience). */
  readonly focused = output<void>();
  readonly blurred = output<void>();

  /** Reveal state for password fields (VAL-DS-022). Always starts hidden. */
  private readonly _revealed = signal<boolean>(false);

  /** Resolved id for the input + label for/id wiring. */
  readonly resolvedId = computed<string>(() => {
    const explicit = this.id();
    return explicit ? explicit : `zm-input-${nextZmInputId++}`;
  });

  /** Stable element ids for the helper + error nodes (aria-describedby targets). */
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

  /** True only for password fields (renders the reveal toggle). */
  readonly isPassword = computed<boolean>(() => this.type() === 'password');

  /** Native input type, flipped when revealed. Initial is always 'password'. */
  readonly resolvedType = computed<ZmInputType>(() =>
    this.isPassword() && this._revealed() ? 'text' : this.type(),
  );

  /** aria-pressed reflects the reveal state for AT (VAL-DS-022). */
  readonly revealPressed = computed<boolean>(() => this._revealed());

  /** aria-label changes with state so the action is unambiguous to AT. */
  readonly revealLabel = computed<string>(() =>
    this._revealed() ? 'Şifreyi gizle' : 'Şifreyi göster',
  );

  /** User clicked the reveal toggle. Flips type; focus stays on the toggle
   *  (it lives inside the field group), satisfying VAL-DS-022 safe-focus. */
  toggleReveal(): void {
    this._revealed.update(v => !v);
  }

  /** Native input event handler — emits the current value. */
  onInput(event: Event): void {
    const target = event.target as HTMLInputElement | null;
    this.valueChange.emit(target?.value ?? '');
  }
}
