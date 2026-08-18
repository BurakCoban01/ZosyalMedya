import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
} from '@angular/core';

/**
 * Feed mode header — page identity + Following/Discovery mode switch.
 *
 * Owns the editorial page header (kicker + display headline) and the
 * `role="tablist"` that switches the feed between **Following** and
 * **Discovery** (VAL-FEED-001: "feed shows the current mode"). The active
 * tab is unmistakable through >=3 NON-color cues so it survives grayscale
 * and forced-colors:
 *   1. a signal-arc underline (a curved motif, not a plain rule),
 *   2. heavier type weight (750 vs 500),
 *   3. brighter ink (the primary text tone vs the secondary text tone).
 *
 * The signal-arc motif is the Living Editorial Network signature and lives
 * ONLY in the tab's reserved underline slot — it never crosses the headline
 * or body copy (VAL-DS-034).
 *
 * Accessibility:
 *   - `role="tablist"` + per-tab `role="tab"` + `aria-selected`.
 *   - Each tab is a native button (keyboard-operable: Tab to the list, Arrow
 *     Left/Right to move between tabs, Enter/Space to activate).
 *   - The active tab is also marked `aria-current="location"` so AT users
 *     hear "current location" semantics in addition to `aria-selected`.
 *
 * Consumes ONLY `--zm-feed-header-*` / `--zm-feed-mode-*` component tokens
 * (which compose semantic roles). No hardcoded hex anywhere.
 */
@Component({
  selector: 'zm-feed-mode-header',
  standalone: true,
  styleUrl: './feed-mode-header.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'zm-feed-header' },
  template: `
    <div class="zm-feed-header__identity">
      <p class="zm-feed-header__kicker">{{ kicker() }}</p>
      <h1 class="zm-feed-header__title">{{ title() }}</h1>
      @if (lede()) {
        <p class="zm-feed-header__lede">{{ lede() }}</p>
      }
    </div>

    <div
      class="zm-feed-header__modes"
      role="tablist"
      [attr.aria-label]="tablistLabel()"
    >
      @for (mode of modes(); track mode.id) {
        <button
          type="button"
          class="zm-feed-mode"
          role="tab"
          [attr.id]="mode.id + '-tab'"
          [attr.aria-selected]="kind() === mode.id"
          [attr.aria-current]="kind() === mode.id ? 'location' : null"
          [class.is-active]="kind() === mode.id"
          [attr.tabindex]="kind() === mode.id ? 0 : -1"
          (click)="select(mode.id)"
          (keydown)="onKeydown($event, mode.id)"
        >
          <span class="zm-feed-mode__label">{{ mode.label }}</span>
          @if (mode.hint) {
            <span class="zm-feed-mode__hint">{{ mode.hint }}</span>
          }
          <!-- Signal-arc active indicator — a curved motif in the reserved
               underline slot. Distinct shape vs an inactive plain rule, so
               the active tab reads in grayscale (non-color cue #1). -->
          <span class="zm-feed-mode__arc" aria-hidden="true">
            <svg viewBox="0 0 48 12" focusable="false" preserveAspectRatio="none">
              <path
                d="M2 10 C 14 2, 34 2, 46 10"
                fill="none"
                stroke="currentColor"
                stroke-width="2.6"
                stroke-linecap="round"
              />
            </svg>
          </span>
        </button>
      }
    </div>
  `,
})
export class ZmFeedModeHeaderComponent {
  /** Currently active feed mode: `'Following'` or `'Discovery'`. */
  readonly kind = input<'Following' | 'Discovery'>('Following');

  /** Editorial kicker line above the title (e.g. "CANLI AKIŞ"). */
  readonly kicker = input<string>('CANLI AKIŞ');

  /** Page display headline. */
  readonly title = input<string>('Bugün ne anlatmak istersin?');

  /** Optional one-line lede beneath the title. */
  readonly lede = input<string>('');

  /** Accessible label for the tablist region. */
  readonly tablistLabel = input<string>('Akış türü');

  /** Emitted when the user selects a different mode. */
  readonly kindChange = output<'Following' | 'Discovery'>();

  /** Catalog of the two feed modes with their Turkish labels + hints. The
   *  hint is a quiet secondary descriptor shown under the label so the
   *  difference between the two modes is explicit (not just two names). */
  readonly modes = computed<readonly Readonly<FeedModeEntry>[]>(() => [
    {
      id: 'Following',
      label: 'Takip ettiklerim',
      hint: 'Senin seçtiğin sesler',
    },
    {
      id: 'Discovery',
      label: 'Keşfet',
      hint: 'Yeni bağlantılar',
    },
  ]);

  select(id: 'Following' | 'Discovery'): void {
    if (id === this.kind()) return;
    this.kindChange.emit(id);
  }

  /** Roving-tabindex keyboard nav: Arrow Left/Right move between tabs,
   *  Home/End jump to the first/last. The browser fires click on Enter/Space
   *  for native buttons, so we do not handle those here. */
  onKeydown(event: KeyboardEvent, currentId: 'Following' | 'Discovery'): void {
    const order: Array<'Following' | 'Discovery'> = ['Following', 'Discovery'];
    const idx = order.indexOf(currentId);
    let next: 'Following' | 'Discovery' | null = null;
    switch (event.key) {
      case 'ArrowRight':
      case 'ArrowDown':
        next = order[(idx + 1) % order.length];
        break;
      case 'ArrowLeft':
      case 'ArrowUp':
        next = order[(idx - 1 + order.length) % order.length];
        break;
      case 'Home':
        next = order[0];
        break;
      case 'End':
        next = order[order.length - 1];
        break;
    }
    if (next) {
      event.preventDefault();
      this.select(next);
      // Move focus to the newly-selected tab (roving tabindex). Deferred so
      // the [tabindex] binding recomputes before we focus.
      queueMicrotask(() => {
        document.getElementById(`${next}-tab`)?.focus();
      });
    }
  }
}

interface FeedModeEntry {
  readonly id: 'Following' | 'Discovery';
  readonly label: string;
  readonly hint: string;
}
