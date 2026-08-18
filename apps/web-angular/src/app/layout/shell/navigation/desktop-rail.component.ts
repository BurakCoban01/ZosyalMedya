import { ChangeDetectionStrategy, Component, OnInit, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { ZmMotifComponent } from '../../../design-system/iconography/motif.component';
import { NAV_ENTRIES, NavEntry } from './nav-catalog';
import { ShellNavStateService } from './shell-nav-state.service';
import { ZmAccountMenuComponent } from './account-menu.component';

/**
 * ZmDesktopRail — the persistent editorial left navigation rail of the app
 * shell (Living Editorial Network direction).
 *
 * Fulfils the desktop-navigation slice of M2:
 *   - **VAL-WSH-001 — current route unmistakable.** The active item carries
 *     >=2 NON-color cues: a signal-arc indicator (a distinct shape in a
 *     reserved leading slot) + a raised surface tone + heavier font-weight +
 *     brighter ink + `aria-current="page"`. The indicator tracks navigation.
 *   - **VAL-WSH-002 — nav items carry names + roles.** Every item is a native
 *     `<a routerLink>` (keyboard-reachable via Tab in visual order), lives
 *     inside a `<nav aria-label>` landmark, and exposes its Turkish label as
 *     its accessible name. No nested interactive elements.
 *   - **VAL-WSH-003 — unread/pulse accessible.** Mesajlar + Bildirimler show a
 *     decorative `pulse-node` motif + a numeric count pill when there is real
 *     unread content. The motif is `aria-hidden`; the exact count flows to AT
 *     via the link's `aria-label` (`"Mesajlar, 3 okunmamis"`). The indicator is
 *     absent when the count is zero. Counts come from the REAL API
 *     (`listConversations.unreadCount`, `listNotifications.isRead`) and refresh
 *     on realtime push — no fabricated numbers.
 *   - **VAL-WSH-004 — compose entry reachable.** A primary compose button
 *     (`Oluştur`) is keyboard-reachable + keyboard-activatable and navigates to
 *     the feed composer route (`/akis`).
 *
 * Behavior preserved from the legacy shell (m2-shell-structure):
 *   - the same 10 navigation items in the same order with the same
 *     `routerLink` targets (`/akis`, `/kesfet`, `/mesajlar`, `/bildirimler`,
 *     `/profil`, `/baglantilar`, `/sorular`, `/kaydedilenler`, `/ayarlar`,
 *     `/yonetim`);
 *   - the same brand logo link to `/akis`;
 *   - the same `signOut()` flow: real `AuthService.logout()` (revokes the
 *     refresh token via the backend `logout` endpoint + clears the
 *     `TokenVault`) then navigates to `/giris`. The account menu that absorbs
 *     this button arrives in `m2-account-theme-status`.
 *
 * Routes, authGuard, permissions, and the protected `/yonetim` item are
 * untouched; `/yonetim` stays visible (its permission is enforced by the route
 * guard, not by hiding nav). Tablet compact-mode and mobile-web bottom-nav
 * variants are dedicated sibling components (`m2-tablet-mobile-navigation`).
 * This component is shown only at desktop widths (>=1050px) via shell-level
 * CSS; below that the shell hides it and shows the tablet or mobile-bottom
 * variant instead. Unread counts are owned by the shared
 * `ShellNavStateService` so the three variants do not each fire their own
 * `listConversations` + `listNotifications` round-trips.
 *
 * Engine: CSS transitions + the decorative `ZmMotif` pulse only. No
 * `@angular/animations` triggers. Reduced-motion collapses the pulse to a
 * static node; state is still conveyed by the solid center + count digit.
 */
@Component({
  selector: 'zm-desktop-rail',
  imports: [RouterLink, RouterLinkActive, ZmMotifComponent, ZmAccountMenuComponent],
  templateUrl: './desktop-rail.component.html',
  styleUrl: './desktop-rail.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ZmDesktopRailComponent implements OnInit {
  /** Static catalog of every navigation item in canonical order. Drives the
   *  template so additions surface as a focused edit, and the spec iterates it
   *  for exhaustive DOM assertions. `kind` marks the two items that carry live
   *  unread indicators. */
  protected readonly navEntries: ReadonlyArray<NavEntry> = NAV_ENTRIES;

  /** Live unread counts owned by the singleton ShellNavStateService (shared
   *  with the tablet + mobile-web variants so the API is hit exactly once per
   *  shell session, not three times). */
  constructor(
    private readonly router: Router,
    private readonly navState: ShellNavStateService,
  ) {}

  ngOnInit(): void {
    this.navState.init();
  }

  /** Fed by `routerLinkActive`'s `isActiveChange` output; keeps the indicator +
   *  `aria-current` in sync with the router without re-implementing URL matching. */
  private readonly activeLink = signal<string | null>(null);
  protected setActive(link: string, active: boolean): void {
    if (active) this.activeLink.set(link);
    else if (this.activeLink() === link) this.activeLink.set(null);
  }

  /** True when the given link is the current route (drives the signal-arc
   *  indicator + `aria-current="page"`). */
  protected isCurrent(link: string): boolean {
    return this.activeLink() === link;
  }

  /** Accessible name for a nav item. Items with live unread counts append the
   *  exact Turkish count so AT announces it (`"Mesajlar, 3 okunmamis"`); the
   *  decorative motif + visible digit are aria-hidden to avoid double-read. */
  protected ariaLabel(entry: NavEntry): string {
    if (entry.kind === 'messages' && this.navState.unreadMessages() > 0) {
      return `${entry.label}, ${this.navState.unreadMessages()} okunmamış`;
    }
    if (entry.kind === 'notifications' && this.navState.unreadNotifications() > 0) {
      return `${entry.label}, ${this.navState.unreadNotifications()} okunmamış`;
    }
    return entry.label;
  }

  /** Whether a nav item should render its unread indicator (real count > 0). */
  protected hasUnread(entry: NavEntry): boolean {
    if (entry.kind === 'messages') return this.navState.unreadMessages() > 0;
    if (entry.kind === 'notifications') return this.navState.unreadNotifications() > 0;
    return false;
  }

  /** Displayed badge text for a nav item (the literal count, capped at 99+). */
  protected badgeFor(entry: NavEntry): string {
    if (entry.kind === 'messages') return this.navState.messagesBadge();
    if (entry.kind === 'notifications') return this.navState.notificationsBadge();
    return '';
  }

  /** Compose entry — navigates to the feed composer route. Keyboard-activatable
   *  (real `<button>`); honest (does not fake-focus a composer that does not
   *  exist yet — the M3 feed slice owns the editor this lands on). */
  protected async compose(): Promise<void> {
    await this.router.navigateByUrl('/akis');
  }
}

/** Cap helper re-exported for the spec (mirrors the catalog constant). */
export { formatUnreadBadge } from './nav-catalog';
