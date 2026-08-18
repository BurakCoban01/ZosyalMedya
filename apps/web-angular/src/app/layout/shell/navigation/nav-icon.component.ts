import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { NavIconName } from './nav-catalog';

/**
 * ZmNavIcon — single normalized icon vocabulary for app-shell navigation.
 *
 * Contract (binding — VAL-DS-033 / VAL-DS-035):
 *   - **One normalized family.** Every icon is authored inline SVG with the
 *     same stroke language (rounded caps + joins, ~1.75px strokes on a 24×24
 *     viewBox, `currentColor`). Reads as one family across desktop rail,
 *     tablet compact rail, and mobile-web bottom bar.
 *   - **No icon library / no emoji.** Pure vector marks authored for this
 *     product. No Material/Heroicons/FontAwesome imports, no emoji unicode.
 *   - **Meaningful (NOT a signature motif).** Unlike `ZmMotif`, a nav icon
 *     CARRIES meaning (it names a destination). It is therefore NOT
 *     `aria-hidden` by default — its host exposes the icon as a decorative
 *     glyph inside an interactive parent that owns the accessible name (e.g.
 *     `<a aria-label="Akış"><zm-nav-icon icon="akis" /></a>`). The host
 *     carries `aria-hidden="true"` + `focusable="false"` so AT + iOS VoiceOver
 *     skip the SVG and read only the parent's accessible name (no double-read).
 *
 * Engine: pure presentational SVG. No animations (the icon never moves); the
 * active-state affordance is owned by the surrounding nav item (background
 * tone, border, weight — never the icon alone).
 */
@Component({
  selector: 'zm-nav-icon',
  standalone: true,
  changeDetection: ChangeDetectionStrategy.OnPush,
  styleUrl: './nav-icon.component.css',
  host: {
    class: 'zm-nav-icon',
    'aria-hidden': 'true',
    '[attr.data-icon]': 'icon()',
    '[style.--zm-nav-icon-size]': 'sizeCss()',
  },
  template: `
    <svg viewBox="0 0 24 24" focusable="false" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
      @switch (icon()) {
        @case ('akis') {
          <!-- Akis (feed) — a timeline of stacked editorial rows -->
          <path d="M4 6h16M4 12h16M4 18h10" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
        }
        @case ('kesfet') {
          <!-- Kesfet (discover) — compass rose -->
          <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="1.75"/>
          <path d="M15.5 8.5l-2 5-5 2 2-5 5-2z" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"/>
        }
        @case ('mesajlar') {
          <!-- Mesajlar — speech bubble -->
          <path d="M20 11.5a8 8 0 0 1-11.6 7.1L4 20l1.4-4.4A8 8 0 1 1 20 11.5z" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>
        }
        @case ('bildirimler') {
          <!-- Bildirimler — bell -->
          <path d="M6 16V11a6 6 0 0 1 12 0v5l1.5 2.5h-15L6 16z" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"/>
          <path d="M10 19a2 2 0 0 0 4 0" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
        }
        @case ('profil') {
          <!-- Profil — person -->
          <circle cx="12" cy="8" r="4" fill="none" stroke="currentColor" stroke-width="1.75"/>
          <path d="M4 20a8 8 0 0 1 16 0" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
        }
        @case ('baglantilar') {
          <!-- Baglantilar — two people -->
          <circle cx="8" cy="8" r="3.2" fill="none" stroke="currentColor" stroke-width="1.75"/>
          <path d="M2.5 19a5.5 5.5 0 0 1 11 0" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
          <path d="M16 5.2a3 3 0 0 1 0 5.6M17 19a5.5 5.5 0 0 0-3-4.9" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
        }
        @case ('sorular') {
          <!-- Sorular — speech bubble with question mark -->
          <path d="M20 11.5a8 8 0 0 1-11.6 7.1L4 20l1.4-4.4A8 8 0 1 1 20 11.5z" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"/>
          <path d="M9.5 10.2a2.5 2.2 0 0 1 5 .0c0 1.5-2.5 1.7-2.5 3.3" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/>
          <circle cx="12" cy="16" r="0.9" fill="currentColor"/>
        }
        @case ('kaydedilenler') {
          <!-- Kaydedilenler — bookmark -->
          <path d="M6 4h12v16l-6-4-6 4V4z" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"/>
        }
        @case ('ayarlar') {
          <!-- Ayarlar — gear -->
          <circle cx="12" cy="12" r="3" fill="none" stroke="currentColor" stroke-width="1.75"/>
          <path d="M12 3v2.2M12 18.8V21M3 12h2.2M18.8 12H21M5.6 5.6l1.6 1.6M16.8 16.8l1.6 1.6M18.4 5.6l-1.6 1.6M7.2 16.8l-1.6 1.6" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
        }
        @case ('yonetim') {
          <!-- Yonetim — shield -->
          <path d="M12 3l7 2.5v5.5c0 4.5-3 8-7 10-4-2-7-5.5-7-10V5.5L12 3z" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linejoin="round"/>
          <path d="M9 12l2 2 4-4" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>
        }
        @case ('compose') {
          <!-- Compose — pencil on square -->
          <path d="M5 19l1.1-3.4a7 7 0 1 1 2.3 2.3L5 19z" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M9.5 11.5h5M12 9v5" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round"/>
        }
        @case ('signout') {
          <!-- Signout — door with arrow -->
          <path d="M14 7V5a2 2 0 0 0-2-2H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h6a2 2 0 0 0 2-2v-2" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>
          <path d="M10 12h10M17 9l3 3-3 3" fill="none" stroke="currentColor" stroke-width="1.75" stroke-linecap="round" stroke-linejoin="round"/>
        }
        @case ('more') {
          <!-- More — three dots -->
          <circle cx="5" cy="12" r="1.6" fill="currentColor"/>
          <circle cx="12" cy="12" r="1.6" fill="currentColor"/>
          <circle cx="19" cy="12" r="1.6" fill="currentColor"/>
        }
        @case ('context') {
          <!-- Context — panel-right (on-demand context drawer toggle) -->
          <rect x="3" y="4" width="18" height="16" rx="2" fill="none" stroke="currentColor" stroke-width="1.75"/>
          <path d="M14 4v16" fill="none" stroke="currentColor" stroke-width="1.75"/>
        }
      }
    </svg>
  `,
})
export class ZmNavIconComponent {
  /** Which nav icon to render. Required. */
  readonly icon = input.required<NavIconName>();

  /** CSS length for the icon's inline size. Defaults to a compact nav size. */
  readonly size = input<string>('1.5rem');

  /** Resolve the size input into a CSS custom property value for the host. */
  readonly sizeCss = computed(() => this.size());
}
