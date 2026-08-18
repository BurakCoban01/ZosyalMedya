import { ChangeDetectionStrategy, Component, ElementRef, inject, signal, viewChild } from '@angular/core';
import { NavigationEnd, Router, RouterOutlet } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { filter } from 'rxjs';
import { ZmDesktopRailComponent } from './navigation/desktop-rail.component';
import { ZmTabletNavComponent } from './navigation/tablet-nav.component';
import { ZmMobileBottomNavComponent } from './navigation/mobile-bottom-nav.component';
import { ZmSheetComponent } from '../../design-system/primitives/overlays/sheet.component';
import { ZmContextRailComponent } from './context-rail/context-rail.component';
import { ZmOfflineIndicatorComponent } from './offline-indicator.component';
import { NAV_ENTRIES } from './navigation/nav-catalog';

/**
 * ZmAppShell — the authenticated application shell.
 *
 * Structural refactor of the legacy inline `app-shell` template. The shell
 * orchestrates focused regions:
 *
 *   `<zm-desktop-rail />`         — persistent left navigation rail (desktop)
 *   `<zm-tablet-nav />`           — compact icon rail (tablet 768-1049px)
 *   `<zm-mobile-bottom-nav />`    — fixed bottom bar (mobile-web <680px)
 *   `<main class="workspace">`    — route outlet (page families render here)
 *   `<aside class="context">`     — right contextual rail (desktop only)
 *
 * Responsive composition (m2-tablet-mobile-navigation; VAL-WSH-007/008):
 *   - **>=1050px (desktop)**: full rail + workspace + context aside (3-column
 *     grid). All three nav variants render in the DOM; CSS hides the tablet +
 *     mobile-bottom-nav variants.
 *   - **768-1049px (tablet)**: compact icon rail (`<zm-tablet-nav>`) +
 *     workspace (2-column grid). The context aside is hidden; the tablet nav's
 *     `contextToggle` output opens the same content as an on-demand `ZmSheet`
 *     so the workspace is never squeezed between two persistent sidebars
 *     (VAL-WSH-007). The desktop rail + mobile-bottom-nav variants are hidden.
 *   - **<680px (mobile-web)**: full-width workspace + fixed bottom bar
 *     (`<zm-mobile-bottom-nav>`). The desktop + tablet variants are hidden;
 *     the bottom bar reserves `env(safe-area-inset-bottom)` so the OS chrome
 *     never obstructs targets (VAL-WSH-008).
 *
 * Behavior preserved:
 *  - the same workspace padding (`clamp(2rem,5vw,5rem)` desktop; `1.5rem`
 *    mobile);
 *  - the same static right-rail marketing copy (preserved as the baseline
 *    for `m2-contextual-rail`; at tablet it slides in via the on-demand
 *    sheet rather than being a persistent sidebar);
 *  - the same `authGuard` on the parent route (untouched in `app.routes.ts`)
 *    and the same logout flow (owned by each nav variant, calling the real
 *    `AuthService.logout()` + navigating to `/giris`).
 *
 * All three nav variants share the singleton `ShellNavStateService` so the
 * unread-counts API is hit exactly once per shell session, not three times.
 *
 * Subsequent M2 features evolve this shell in focused, testable slices:
 *  - `m2-contextual-rail` — replaces the static aside + tablet sheet content
 *    with live, route-aware content (VAL-WSH-012);
 *  - `m2-account-theme-status` — account menu, theme toggle, offline badge;
 *  - `m2-shell-skip-focus-announce` — skip-link + route-change announce.
 *
 * No routes, auth, permissions, navigation items, or `routerLink` targets are
 * changed.
 */
@Component({
  selector: 'zm-app-shell',
  imports: [
    RouterOutlet,
    ZmDesktopRailComponent,
    ZmTabletNavComponent,
    ZmMobileBottomNavComponent,
    ZmSheetComponent,
    ZmContextRailComponent,
    ZmOfflineIndicatorComponent,
  ],
  templateUrl: './app-shell.component.html',
  styleUrl: './app-shell.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ZmAppShellComponent {
  /** Whether the on-demand tablet context sheet is open. Toggled by
   *  `<zm-tablet-nav (contextToggle)>`. The sheet's content is the preserved
   *  static marketing copy (the live route-aware contextual rail lands in
   *  m2-contextual-rail). */
  protected readonly contextOpen = signal(false);

  /** Reference to the on-demand context sheet (opened from the tablet nav's
   *  Bağlam toggle). */
  protected readonly contextSheet = viewChild(ZmSheetComponent);

  /** The shell host element (for querying the rendered route heading). */
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);

  /** The Angular Router — drives the route-change announcement (VAL-WSH-010). */
  private readonly router = inject(Router);

  /** Screen-reader announcement of the new page's main heading on each
   *  client-side route change (VAL-WSH-010). Bound to a visually-hidden
   *  `aria-live` region in the template; empty when there is nothing to
   *  announce so AT stays silent. */
  protected readonly routeAnnouncement = signal('');

  /** DOM id of the main content region. This is the skip-link target
   *  (VAL-WSH-009) and the region the live-region heading is read from
   *  (VAL-WSH-010). "ana-icerik" = Turkish for "main content". */
  protected readonly mainId = 'ana-icerik';

  /** Skip-link `href` (bound in the template). */
  protected readonly skipHref = '#ana-icerik';

  constructor() {
    // Announce the new page's main heading to AT on every client-side route
    // navigation (VAL-WSH-010). `NavigationEnd` fires after the router
    // resolves the new route; the activated component's view renders during
    // the same change-detection pass, so we defer the heading read to the
    // next macrotask to guarantee the page's `<h1>` is present in the DOM.
    this.router.events.pipe(
      filter((event): event is NavigationEnd => event instanceof NavigationEnd),
      takeUntilDestroyed(),
    ).subscribe(() => {
      setTimeout(() => this.announceRouteHeading());
    });
  }

  /** Read the new route's first heading from the live DOM and announce it.
   *  Falls back to the route's canonical Turkish nav label (`NAV_ENTRIES`)
   *  when a page has not yet rendered its heading, so the route change is
   *  always announced to AT. */
  private announceRouteHeading(): void {
    const host = this.host.nativeElement;
    // Guard against firing after the shell is torn down (test reset / logout).
    if (!host.isConnected) return;
    const main = host.querySelector<HTMLElement>(`#${this.mainId}`);
    const heading = main?.querySelector<HTMLElement>('h1, h2, h3, [role="heading"]');
    const headingText = heading?.textContent?.replace(/\s+/g, ' ').trim();
    this.routeAnnouncement.set(headingText ?? this.routeLabel(this.router.url) ?? '');
  }

  /** Map the current URL to its canonical Turkish nav label — the fallback
   *  announcement when a page has no rendered heading yet. */
  private routeLabel(url: string): string | undefined {
    const path = url.split('?')[0].split('#')[0];
    const firstSegment = '/' + (path.split('/').filter(Boolean)[0] ?? '');
    return NAV_ENTRIES.find((entry) => entry.link === firstSegment)?.label;
  }

  /** Skip-link activation (VAL-WSH-009): move keyboard focus + scroll to the
   *  main content region. The activation is handled in JS (preventing the
   *  default anchor behaviour) so the focus move works inside the SPA WITHOUT
   *  a hashchange that would re-trigger the Angular router / auth guard (a
   *  plain `<a href="#ana-icerik">` intermittently re-navigates and loses the
   *  session in this in-memory-token SPA). The `href="#ana-icerik"` is kept on
   *  the anchor as a progressive-enhancement fallback (no-JS still scrolls to
   *  the target) and for right-click / "open" semantics. `(click)` fires for
   *  both mouse activation and Enter on the focused link. */
  protected onSkipLink(event: Event): void {
    event.preventDefault();
    const main = this.host.nativeElement.querySelector<HTMLElement>(`#${this.mainId}`);
    if (!main) return;
    main.focus();
    // `scrollIntoView` respects `scroll-padding` (styles.css, VAL-WSH-011) so
    // the focused region is not hidden under the sticky offline banner.
    // Optional chaining keeps this safe in non-visual test runtimes (jsdom).
    main.scrollIntoView?.({ block: 'start' });
  }

  /** Tablet nav's on-demand context-drawer toggle (VAL-WSH-007). Opens the
   *  sheet that holds the contextual content; closing is owned by the sheet's
   *  own scrim/Escape contract. */
  protected onContextToggle(): void {
    const sheet = this.contextSheet();
    if (!sheet) return;
    if (this.contextOpen()) {
      sheet.close('programmatic');
    } else {
      sheet.open();
    }
  }

  /** Keep the open signal in sync if the user closes via scrim/Escape. */
  protected onContextClosed(): void {
    this.contextOpen.set(false);
  }

  /** Mark the sheet open after `open()` resolves (the open is synchronous from
   *  the user's perspective; this keeps the signal truthful for re-toggles). */
  protected onContextOpened(): void {
    this.contextOpen.set(true);
  }
}
