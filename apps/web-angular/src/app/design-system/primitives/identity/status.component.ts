import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/**
 * ZmStatus — inline status marker that ALWAYS carries text + color meaning.
 *
 * Contract (VAL-DS-032): a status never renders color-only. Every variant
 * (`brand | discovery | info | success | warning | danger | neutral`) couples
 * its accent color with a distinct leading SHAPE (filled circle, diamond,
 * hollow ring, check, triangle, cross, small dot) so the category survives
 * grayscale conversion (VAL-DS-029). The textual label is always present.
 *
 * Accessibility: the host carries `role="status"` (polite live region) so a
 * status rendered into the document is announced when the user is idle. When
 * the status is assertive (e.g. a hard error), set `politeness="assertive"`
 * to switch the host to `role="alert"`. The leading shape is `aria-hidden`
 * (decorative); the label carries the meaning to AT, so status is never
 * conveyed by shape/color alone either.
 *
 * Engine: CSS only (no `@angular/animations`). Consumes ONLY `--zm-status-*`
 * component-layer tokens (no hardcoded hex).
 *
 * @example
 * <zm-status label="Yayında" variant="success"></zm-status>
 * <zm-status label="Beklemede" variant="warning" politeness="assertive"></zm-status>
 */
export type ZmStatusVariant =
  | 'brand'
  | 'discovery'
  | 'info'
  | 'success'
  | 'warning'
  | 'danger'
  | 'neutral';

export type ZmStatusPoliteness = 'polite' | 'assertive';

@Component({
  selector: 'zm-status',
  standalone: true,
  styleUrl: './status.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'zm-status',
    '[attr.data-variant]': 'variant()',
    '[attr.role]': 'role()',
    '[attr.aria-live]': 'ariaLive()',
    '[attr.aria-label]': 'label()',
  },
  template: `
    @if (showShape()) {
      <span class="zm-status__shape" aria-hidden="true">
        @switch (variant()) {
          @case ('brand') {
            <!-- Filled circle -->
            <svg viewBox="0 0 10 10" focusable="false"><circle cx="5" cy="5" r="4" fill="currentColor" /></svg>
          }
          @case ('discovery') {
            <!-- Diamond -->
            <svg viewBox="0 0 10 10" focusable="false"><rect x="2" y="2" width="6" height="6" transform="rotate(45 5 5)" fill="currentColor" /></svg>
          }
          @case ('info') {
            <!-- Hollow ring -->
            <svg viewBox="0 0 10 10" focusable="false"><circle cx="5" cy="5" r="3.4" fill="none" stroke="currentColor" stroke-width="1.6" /></svg>
          }
          @case ('success') {
            <!-- Check -->
            <svg viewBox="0 0 10 10" focusable="false"><path d="M2 5.3l2 2L8 3" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" /></svg>
          }
          @case ('warning') {
            <!-- Triangle -->
            <svg viewBox="0 0 10 10" focusable="false"><path d="M5 1.5l3.5 6.5h-7z" fill="currentColor" /></svg>
          }
          @case ('danger') {
            <!-- Cross -->
            <svg viewBox="0 0 10 10" focusable="false"><path d="M2.5 2.5l5 5M7.5 2.5l-5 5" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" /></svg>
          }
          @case ('neutral') {
            <!-- Small dot -->
            <svg viewBox="0 0 10 10" focusable="false"><circle cx="5" cy="5" r="1.8" fill="currentColor" /></svg>
          }
        }
      </span>
    }

    <!-- The label is ALWAYS present (VAL-DS-032: never color-only). -->
    <span class="zm-status__label">{{ label() }}</span>
  `,
})
export class ZmStatusComponent {
  /** The textual label. Always rendered (never color-only). */
  readonly label = input<string>('');

  /** Color category. Each variant pairs with a distinct leading shape so the
   *  category reads in grayscale (VAL-DS-032 / VAL-DS-029). */
  readonly variant = input<ZmStatusVariant>('neutral');

  /** Whether to render the leading shape. Default `true`. Set `false` when
   *  the surrounding context already provides the non-color cue (rare). */
  readonly dot = input<boolean>(true);

  /** Live-region politeness. `polite` (default) → role=status (announced when
   *  the user is idle); `assertive` → role=alert (announced immediately, for
   *  hard errors that need attention). */
  readonly politeness = input<ZmStatusPoliteness>('polite');

  /** Computed ARIA role for the host. Assertive = alert, else status. */
  readonly role = computed<'status' | 'alert'>(() =>
    this.politeness() === 'assertive' ? 'alert' : 'status',
  );

  /** Computed aria-live politeness, mirroring the role semantics. */
  readonly ariaLive = computed<'polite' | 'assertive'>(() => this.politeness());

  /** Whether the leading shape should render. */
  readonly showShape = computed<boolean>(() => this.dot());
}
