import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';

/**
 * ZmChip — compact label token that ALWAYS carries text + color meaning.
 *
 * Contract (VAL-DS-032): a chip never renders color-only. Every variant
 * (`brand | discovery | info | success | warning | danger | neutral`) couples
 * its accent color with a distinct leading glyph (filled dot, diamond, ring,
 * check, triangle, cross, none) so the category survives grayscale conversion.
 * The textual label is always present. Removable chips expose their remove
 * action with an accessible name.
 *
 * Status never color-only (VAL-DS-029): color + shape + text together.
 *
 * Engine: CSS only (no `@angular/animations`). Consumes ONLY `--zm-chip-*`
 * component-layer tokens (no hardcoded hex).
 *
 * @example
 * <zm-chip label="Yeni" variant="brand"></zm-chip>
 * <zm-chip label="Moda" variant="discovery" [removable]="true" (removed)="onRemove()"></zm-chip>
 */
export type ZmChipVariant =
  | 'brand'
  | 'discovery'
  | 'info'
  | 'success'
  | 'warning'
  | 'danger'
  | 'neutral';

export type ZmChipSize = 'sm' | 'md';

@Component({
  selector: 'zm-chip',
  standalone: true,
  styleUrl: './chip.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'zm-chip',
    '[attr.data-variant]': 'variant()',
    '[attr.data-size]': 'size()',
    '[attr.aria-selected]': 'selected() ? "true" : null',
  },
  template: `
    <!-- Leading glyph — distinct shape per variant (non-color cue). Decorative:
         the label carries the meaning to AT. -->
    @if (variant() !== 'neutral') {
      <span class="zm-chip__glyph" aria-hidden="true">
        @switch (variant()) {
          @case ('brand') {
            <!-- Filled dot -->
            <svg viewBox="0 0 8 8" focusable="false"><circle cx="4" cy="4" r="3" fill="currentColor" /></svg>
          }
          @case ('discovery') {
            <!-- Diamond (rotated square) -->
            <svg viewBox="0 0 8 8" focusable="false"><rect x="1.5" y="1.5" width="5" height="5" transform="rotate(45 4 4)" fill="currentColor" /></svg>
          }
          @case ('info') {
            <!-- Hollow ring -->
            <svg viewBox="0 0 8 8" focusable="false"><circle cx="4" cy="4" r="2.6" fill="none" stroke="currentColor" stroke-width="1.2" /></svg>
          }
          @case ('success') {
            <!-- Checkmark -->
            <svg viewBox="0 0 8 8" focusable="false"><path d="M1.6 4.2l1.7 1.7L6.6 2.4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" /></svg>
          }
          @case ('warning') {
            <!-- Triangle -->
            <svg viewBox="0 0 8 8" focusable="false"><path d="M4 1.4l2.8 5H1.2z" fill="currentColor" /></svg>
          }
          @case ('danger') {
            <!-- Cross -->
            <svg viewBox="0 0 8 8" focusable="false"><path d="M2 2l4 4M6 2l-4 4" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" /></svg>
          }
        }
      </span>
    }

    <!-- Optional projected leading content (e.g. a category icon). Decorative
         by default; the label still carries the accessible meaning. -->
    <ng-content select="[zmChipLeading]"></ng-content>

    <!-- The label is ALWAYS present (VAL-DS-032: never color-only). -->
    <span class="zm-chip__label">{{ label() }}</span>

    <!-- Optional projected trailing content (e.g. a count). -->
    <ng-content select="[zmChipTrailing]"></ng-content>

    @if (removable()) {
      <button
        type="button"
        class="zm-chip__remove zm-feedback"
        [attr.aria-label]="resolvedRemoveLabel()"
        (click)="onRemove()"
      >
        <svg viewBox="0 0 10 10" aria-hidden="true" focusable="false">
          <path d="M2.5 2.5l5 5M7.5 2.5l-5 5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
        </svg>
      </button>
    }
  `,
})
export class ZmChipComponent {
  /** The textual label. Always rendered (never color-only). */
  readonly label = input<string>('');

  /** Color category. Each variant pairs with a distinct leading glyph so the
   *  category reads in grayscale (VAL-DS-032 / VAL-DS-029). */
  readonly variant = input<ZmChipVariant>('neutral');

  /** Size — `sm` for inline mentions / dense rows, `md` for default. */
  readonly size = input<ZmChipSize>('md');

  /** Whether the chip is in a selected/active state (position + weight cue). */
  readonly selected = input<boolean>(false);

  /** Whether to render a remove affordance. When true, a close button with an
   *  accessible name is shown; activating it emits `removed`. */
  readonly removable = input<boolean>(false);

  /** Accessible name for the remove button. Defaults to a Turkish
   *  "Kaldır: <label>" so AT announces what is being removed. */
  readonly removeLabel = input<string>('');

  /** Emitted when the remove button is activated. */
  readonly removed = output<void>();

  /** Resolved remove-button accessible name. Falls back to "Kaldır: <label>". */
  readonly resolvedRemoveLabel = computed<string>(() => {
    const explicit = this.removeLabel().trim();
    if (explicit) return explicit;
    const label = this.label().trim();
    return label ? `Kaldır: ${label}` : 'Kaldır';
  });

  onRemove(): void {
    this.removed.emit();
  }
}
