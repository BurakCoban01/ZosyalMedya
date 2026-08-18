import { ChangeDetectionStrategy, Component, OnInit, signal, ViewChild } from '@angular/core';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NavigationEnd, Router, RouterLink, RouterLinkActive } from '@angular/router';
import { filter } from 'rxjs';
import { AuthService } from '../../../core/auth/auth.service';
import { ThemeService, THEME_OPTIONS, type ThemeMode } from '../../../core/preferences/theme.service';
import { NavEntry, NAV_PRIMARY, NAV_SECONDARY } from './nav-catalog';
import { ZmNavIconComponent } from './nav-icon.component';
import { ShellNavStateService } from './shell-nav-state.service';
import { ZmSheetComponent } from '../../../design-system/primitives/overlays/sheet.component';

/**
 * ZmMobileBottomNav — the fixed bottom navigation bar shown below 680px.
 *
 * Fulfils **VAL-WSH-008** — mobile-web uses bottom navigation:
 *   - **Bottom bar visible + operable.** Below 680px the rail disappears and
 *     primary navigation becomes this fixed bottom bar. Targets meet the WCAG
 *     2.2 minimum (44×44 CSS px).
 *   - **Safe-area aware.** The bar reserves `env(safe-area-inset-bottom)` so
 *     iOS Safari / Chrome on Android home indicators / gesture bars never
 *     obstruct targets. `viewport-fit=cover` is honored when present.
 *   - **Composer reachable.** A center compose FAB sits between the primary
 *     items; it is a real `<button>` (keyboard-reachable + activatable) that
 *     navigates to the feed composer (`/akis`).
 *   - **Primary + secondary split.** The 5 most-used destinations (Akış,
 *     Keşfet, Mesajlar, Bildirimler, Profil) are directly in the bar; the
 *     remaining 5 (Bağlantılar, Sorular, Kaydedilenler, Ayarlar, Yönetim) +
 *     Sign-out live behind a `Daha fazla` button that opens a bottom sheet.
 *   - **Active route unmistakable (>=2 NON-color cues).** The active primary
 *     item carries a brand top inset bar + filled icon background + brighter
 *     icon + `aria-current="page"`. (Brand top inset bar is a position cue —
 *     non-color — so the cue survives grayscale / forced-colors.)
 *   - **Unread indicators preserved.** Mesajlar + Bildirimler carry a count
 *     badge when the real-API count is > 0; the exact count flows to AT via
 *     the link's `aria-label`.
 *
 * All 10 nav items, all routerLink targets, the protected `/yonetim` admin
 * item, and the logout flow are preserved from the desktop rail. Unread
 * counts come from the shared `ShellNavStateService` (one API call per shell
 * session).
 *
 * Engine: CSS transitions only. No `@angular/animations`. Reduced-motion
 * collapses background/color transitions.
 */
@Component({
  selector: 'zm-mobile-bottom-nav',
  imports: [RouterLink, RouterLinkActive, ZmNavIconComponent, ZmSheetComponent],
  templateUrl: './mobile-bottom-nav.component.html',
  styleUrl: './mobile-bottom-nav.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ZmMobileBottomNavComponent implements OnInit {
  protected readonly primaryEntries: ReadonlyArray<NavEntry> = NAV_PRIMARY;
  protected readonly secondaryEntries: ReadonlyArray<NavEntry> = NAV_SECONDARY;

  @ViewChild('moreSheet') moreSheet?: ZmSheetComponent;

  /** The current top-level route segment (`/akis`, `/ayarlar`, ...), driven by
   *  the router `NavigationEnd` subscription in the constructor so it is correct
   *  for primary AND secondary (More-sheet) routes on both SPA navigation and
   *  direct URL loads. */
  private readonly activeLink = signal<string | null>(null);

  constructor(
    private readonly auth: AuthService,
    private readonly router: Router,
    private readonly navState: ShellNavStateService,
    private readonly theme: ThemeService,
  ) {
    // Router URL is the single source of truth for the active route. The
    // secondary (More-sheet) destinations live inside the CDK overlay, which is
    // NOT in the DOM until the sheet opens, so their `routerLinkActive`
    // `isActiveChange` never fires on navigation to a secondary route (and
    // never fires on a direct URL load of any route). Subscribing to
    // NavigationEnd keeps `activeLink` correct for primary AND secondary routes
    // in both cases, driving the OnPush re-render that `isCurrent`/`isMoreActive`
    // rely on. `takeUntilDestroyed` cleans up (constructor = injection context).
    this.activeLink.set(this.normalizeRoute(router.url));
    router.events
      .pipe(
        filter((e): e is NavigationEnd => e instanceof NavigationEnd),
        takeUntilDestroyed(),
      )
      .subscribe((e) => this.activeLink.set(this.normalizeRoute(e.urlAfterRedirects)));
  }

  ngOnInit(): void {
    this.navState.init();
  }

  /** Top-level route segment of a URL (`/akis`, `/ayarlar`, ...) or null for
   *  the bare root. Strips query/hash so `/akis?x=1` still matches `/akis`. */
  private normalizeRoute(url: string): string | null {
    const path = url.split('?')[0].split('#')[0];
    const first = path.split('/').filter(Boolean)[0];
    return first ? `/${first}` : null;
  }

  protected setActive(link: string, active: boolean): void {
    // The router subscription above is the authority. We honour `active=true`
    // (kept for the primary items' `isActiveChange` binding + the spec), but
    // we intentionally do NOT null on `active=false`: when navigating from a
    // primary to a secondary route, the primary's "I became inactive"
    // isActiveChange(false) can fire AFTER the NavigationEnd that already set
    // the secondary route, and nulling here would clobber it.
    if (active) this.activeLink.set(link);
  }

  protected isCurrent(link: string): boolean {
    return this.activeLink() === link;
  }

  /** Whether the active route is one of the secondary (More-sheet) items —
   *  drives the active state of the Daha fazla button. Derived from the
   *  router-driven `activeLink` (not the primary `isActiveChange`) because the
   *  secondary links live in the CDK overlay and only exist while the sheet is
   *  open. */
  protected isMoreActive(): boolean {
    const current = this.activeLink();
    return current !== null && NAV_SECONDARY.some((e) => e.link === current);
  }

  protected ariaLabel(entry: NavEntry): string {
    if (entry.kind === 'messages' && this.navState.unreadMessages() > 0) {
      return `${entry.label}, ${this.navState.unreadMessages()} okunmamış`;
    }
    if (entry.kind === 'notifications' && this.navState.unreadNotifications() > 0) {
      return `${entry.label}, ${this.navState.unreadNotifications()} okunmamış`;
    }
    return entry.label;
  }

  protected hasUnread(entry: NavEntry): boolean {
    if (entry.kind === 'messages') return this.navState.unreadMessages() > 0;
    if (entry.kind === 'notifications') return this.navState.unreadNotifications() > 0;
    return false;
  }

  protected badgeFor(entry: NavEntry): string {
    if (entry.kind === 'messages') return this.navState.messagesBadge();
    if (entry.kind === 'notifications') return this.navState.notificationsBadge();
    return '';
  }

  protected async compose(): Promise<void> {
    await this.router.navigateByUrl('/akis');
  }

  /** Canonical theme-option catalog (Sistem / Açık / Koyu) for the mobile
   *  More-sheet theme group (m2-account-theme-status; VAL-WSH-006). Mobile
   *  surfaces theme inline in the sheet rather than via the account popover,
   *  to avoid a nested overlay inside the More sheet. */
  protected readonly themeOptions = THEME_OPTIONS;

  /** Apply a theme choice immediately (ThemeService persists + applies to
   *  `<html data-theme>` synchronously; the index.html pre-paint script
   *  reapplies it on reload with no flash). Closes the More sheet afterward
   *  so the user sees the new theme take effect across the app. */
  protected chooseTheme(mode: ThemeMode): void {
    this.theme.setTheme(mode);
    this.closeMore();
  }

  /** Whether a theme option is the current selection (reads the ThemeService
   *  signal live so the checkmark + aria-pressed track the choice). */
  protected isTheme(mode: ThemeMode): boolean {
    return this.theme.themeMode() === mode;
  }

  /** Open the More sheet (secondary destinations + theme group + sign-out). */
  protected openMore(): void {
    this.moreSheet?.open();
  }

  /** Close the More sheet after a secondary destination is chosen. Called by
   *  each secondary routerLink's (click) so navigation + close both happen. */
  protected closeMore(): void {
    this.moreSheet?.close('programmatic');
  }

  async signOut(): Promise<void> {
    this.moreSheet?.close('programmatic');
    await this.auth.logout();
    await this.router.navigateByUrl('/giris');
  }
}
