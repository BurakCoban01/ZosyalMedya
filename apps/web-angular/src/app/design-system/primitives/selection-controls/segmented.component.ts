import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';

/**
 * ZmSegmented — ZosyalMedya design-system segmented control primitive.
 *
 * Contract (VAL-DS-025):
 *
 *   - **Selection model exposed to AT**. Single-select renders
 *     `role="radiogroup"` with each segment `role="radio"` + `aria-checked`.
 *     Multi-select renders `role="group"` + `aria-multiselectable="true"` with
 *     each segment `role="checkbox"` + `aria-checked`. The group carries an
 *     accessible name (required `label` input → `aria-label`).
 *
 *   - **Active segment marked**. Each segment exposes `aria-checked` (and the
 *     host row carries `aria-current="true"` as a redundant position cue).
 *
 *   - **Keyboard operable**. Roving-tabindex: the active (single) or first
 *     selected/first segment (multi) gets tabindex 0; the rest get -1. Arrow
 *     keys (Left/Right/Up/Down) move focus; Home/End jump to the ends. In
 *     single mode, Arrow also SELECTS the focused segment (WAI-ARIA
 *     radiogroup pattern). In multi mode, Arrow moves focus only and
 *     Space/Enter toggles the focused segment.
 *
 *   - **Visual indicator = position + color/icon, never color alone**. The
 *     active segment is elevated (raised surface + shadow) AND underlined by
 *     the brand indicator bar (a position cue), so the active segment reads
 *     in a static frame and under reduced motion.
 *
 *   - **State coverage**: rest, hover, focus-visible, active (selected),
 *     disabled (whole bar or per-segment), error, high-contrast.
 *
 * Consumes ONLY the `--zm-segmented-*` component layer (tokens.css §3).
 *
 * Engine: CSS transitions on `transform`/`opacity`/color only (`.zm-feedback`
 * vocabulary). No `@angular/animations` triggers. Reduced motion collapses
 * the indicator slide to near-instant; the active segment stays raised +
 * underlined.
 *
 * @example
 * // single-select
 * <zm-segmented
 *   label="Görünüm"
 *   variant="single"
 *   [segments]="visSegments"
 *   [value]="vis()"
 *   (valueChange)="vis.set($event)" />
 * // multi-select
 * <zm-segmented
 *   label="Süzgeçler"
 *   variant="multi"
 *   [segments]="filterSegments"
 *   [values]="filters()"
 *   (valuesChange)="filters.set($event)" />
 */
export type ZmSegmentedVariant = 'single' | 'multi';

/** A segment option. */
export interface ZmSegment {
  /** Form value (stable identity). */
  readonly value: string;
  /** Turkish label shown to the user. */
  readonly label: string;
  /** Optional short helper/description (used in aria-label when present). */
  readonly description?: string;
  /** Per-segment disabled. */
  readonly disabled?: boolean;
}

let nextZmSegmentedId = 0;

@Component({
  selector: 'zm-segmented',
  templateUrl: './segmented.component.html',
  styleUrl: './segmented.component.css',
  host: { class: 'zm-segmented' },
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ZmSegmentedComponent {
  /** Accessible group label. REQUIRED — exposes the group's purpose to AT. */
  readonly label = input.required<string>();

  /** Selection model. `single` = radiogroup (one chosen); `multi` = group of
   *  checkboxes (zero or more chosen). */
  readonly variant = input<ZmSegmentedVariant>('single');

  /** Segment options. Stable identity is the `value` field; track by it. */
  readonly segments = input<readonly ZmSegment[]>([]);

  /** Current value (single-select). */
  readonly value = input<string>('');

  /** Current values (multi-select). */
  readonly values = input<readonly string[]>([]);

  /** Hard-disable the whole bar. */
  readonly disabled = input<boolean>(false);

  /** Error text. When non-empty: aria-invalid on the group + danger ring. */
  readonly error = input<string>('');

  /** Optional helper text. */
  readonly helper = input<string>('');

  /** Author-side high-contrast reinforcement. */
  readonly highContrast = input<boolean>(false);

  /** Optional explicit id. When omitted, a stable generated id is used. */
  readonly id = input<string>('');

  /** Emitted with the new value whenever the single selection changes. */
  readonly valueChange = output<string>();

  /** Emitted with the new values array whenever the multi selection changes. */
  readonly valuesChange = output<readonly string[]>();

  /** Forwarded native blur event (for parent forms). */
  readonly blurred = output<void>();

  /** Resolved id for the group + aria wiring. */
  readonly resolvedId = computed<string>(() => {
    const explicit = this.id();
    return explicit ? explicit : `zm-segmented-${nextZmSegmentedId++}`;
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

  /** The roving-tabindex focus target — the active segment in single mode, or
   *  the first selected (or first enabled) segment in multi mode. */
  readonly focusIndex = signal<number>(0);

  /** True when a segment value is the current single selection. */
  isSegmentActive(value: string): boolean {
    if (this.variant() === 'single') {
      return this.value() === value;
    }
    return this.values().includes(value);
  }

  /** tabindex for a segment: 0 for the roving focus target, -1 otherwise. */
  segmentTabindex(index: number): number {
    // Compute the roving target deterministically (the active one, else 0).
    const target = this.computeFocusTarget();
    return index === target ? 0 : -1;
  }

  /** Compute the deterministic roving target (used to seed tabindex). */
  private computeFocusTarget(): number {
    const segs = this.segments();
    if (segs.length === 0) return 0;
    // Active single value first
    if (this.variant() === 'single') {
      const v = this.value();
      const idx = segs.findIndex(s => s.value === v);
      if (idx >= 0) return idx;
    } else {
      const vals = this.values();
      for (const v of vals) {
        const idx = segs.findIndex(s => s.value === v);
        if (idx >= 0) return idx;
      }
    }
    // Else first enabled segment
    const firstEnabled = segs.findIndex(s => !s.disabled);
    return firstEnabled >= 0 ? firstEnabled : 0;
  }

  /** Accessible label per segment (label + optional description). */
  segmentAriaLabel(seg: ZmSegment): string {
    return seg.description ? `${seg.label}: ${seg.description}` : seg.label;
  }

  /** Whole-bar disabled (explicit OR no segments). */
  readonly isDisabled = computed<boolean>(() => this.disabled() || this.segments().length === 0);

  /** Click / Enter / Space on a segment. */
  selectSegment(index: number): void {
    const segs = this.segments();
    if (index < 0 || index >= segs.length) return;
    const seg = segs[index];
    if (this.isDisabled() || seg.disabled) return;
    this.focusIndex.set(index);
    if (this.variant() === 'single') {
      if (this.value() !== seg.value) {
        this.valueChange.emit(seg.value);
      }
    } else {
      const current = this.values();
      const next = current.includes(seg.value)
        ? current.filter(v => v !== seg.value)
        : [...current, seg.value];
      this.valuesChange.emit(next);
    }
  }

  /** Keyboard handler on a segment (WAI-ARIA radiogroup / grid pattern). */
  onSegmentKeydown(event: KeyboardEvent, index: number): void {
    const segs = this.segments();
    if (segs.length === 0) return;
    const horizontal = true; // segmented is a horizontal bar; we still honor Up/Down as aliases.
    let next = index;
    let handled = false;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        next = this.nextEnabled(index, 1);
        handled = true;
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        next = this.nextEnabled(index, -1);
        handled = true;
        break;
      case 'Home':
        next = this.nextEnabled(-1, 1);
        handled = true;
        break;
      case 'End':
        next = this.nextEnabled(segs.length, -1);
        handled = true;
        break;
      case ' ':
      case 'Enter':
        this.selectSegment(index);
        handled = true;
        break;
      default:
        // typing a letter jumps to the next segment whose label starts with it
        if (event.key.length === 1 && /[a-zçğışöüA-ZÇĞİŞÖÜ]/.test(event.key)) {
          const target = this.findByLabelPrefix(event.key, index);
          if (target >= 0) {
            next = target;
            handled = true;
          }
        }
        break;
    }
    if (handled) {
      event.preventDefault();
      if (next !== index && next >= 0) {
        this.focusIndex.set(next);
        // In single mode, arrow navigation also SELECTS the focused segment
        // (WAI-ARIA radiogroup pattern). In multi mode arrows only move focus;
        // selection is via Space/Enter (handled above).
        if (this.variant() === 'single' && (event.key.startsWith('Arrow') || event.key === 'Home' || event.key === 'End')) {
          this.selectSegment(next);
        }
      }
    }
    // intentional no-op for unhandled keys (let the browser do its thing)
    void horizontal;
  }

  /** Find the next enabled segment in `dir` direction (wraps). */
  private nextEnabled(from: number, dir: 1 | -1): number {
    const segs = this.segments();
    const n = segs.length;
    if (n === 0) return -1;
    for (let step = 1; step <= n; step++) {
      const idx = ((from + dir * step) % n + n) % n;
      if (!segs[idx].disabled) return idx;
    }
    return from;
  }

  /** Find the next segment whose label starts with `ch` (case-insensitive,
   *  Turkish-aware), starting after `from`. */
  private findByLabelPrefix(ch: string, from: number): number {
    const segs = this.segments();
    const n = segs.length;
    if (n === 0) return -1;
    const needle = ch.toLocaleLowerCase('tr');
    for (let step = 1; step <= n; step++) {
      const idx = (from + step) % n;
      const label = segs[idx].label.toLocaleLowerCase('tr');
      if (label.startsWith(needle) && !segs[idx].disabled) {
        return idx;
      }
    }
    return -1;
  }
}
