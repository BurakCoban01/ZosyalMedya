import { ChangeDetectionStrategy, Component, EventEmitter, OnInit, Output, signal } from '@angular/core';
import { Router, RouterLink, RouterLinkActive } from '@angular/router';
import { NavEntry, NAV_ENTRIES } from './nav-catalog';
import { ZmNavIconComponent } from './nav-icon.component';
import { ShellNavStateService } from './shell-nav-state.service';
import { ZmAccountMenuComponent } from './account-menu.component';

/**
 * ZmTabletNav — the compact icon-only navigation rail shown at tablet widths
 * (768-1049px) of the app shell.
 *
 * Fulfils **VAL-WSH-007** — tablet navigation recomposes:
 *   - **No squeezed-between-sidebars.** Below 1050px the shell drops the
 *     persistent contextual right rail (it becomes an on-demand drawer; see
 *     `contextToggle` output + the shell's `ZmSheet`). This compact rail is
 *     the SINGLE persistent nav surface at tablet widths; the workspace gets
 *     the freed space and stays at a comfortable reading measure.
 *   - **Compact icons.** The rail collapses to icon-only (no labels, no
 *     editorial numerals). Every item is a real `<a routerLink>` carrying an
 *     accessible name (`aria-label`) equal to its Turkish label, so screen
 *     readers + toolties still name every destination; the visible glyph is
 *     `<zm-nav-icon>` (aria-hidden, no double-read).
 *   - **On-demand context drawer.** A `Bağlam` toggle button emits
 *     `contextToggle` so the shell can open the contextual rail as a
 *     slide-in sheet (the persistent sidebar is gone at tablet).
 *   - **Active route unmistakable (>=2 NON-color cues).** The active item
 *     carries a brand left inset bar + raised background tone + brighter icon
 *     `aria-current="page"` (mirrors the desktop rail's contract; only the
 *     affordances that fit a 4rem rail are kept).
 *   - **Unread indicators preserved.** Mesajlar + Bildirimler show a count
 *     badge when the real-API count is > 0; the exact count flows to AT via
 *     the link's `aria-label` (decorative badge is aria-hidden).
 *   - **Compose + signout reachable.** Compose icon at the top (navigates to
 *     `/akis`); signout icon at the bottom (real `AuthService.logout()` →
 *     `/giris`, preserved flow).
 *
 * All 10 nav items, all routerLink targets, the protected `/yonetim` admin
 * item, and the logout flow are preserved from the desktop rail. Targets meet
 * the WCAG 2.2 minimum (44×44 CSS px). Unread counts come from the shared
 * `ShellNavStateService` (one API call per shell session).
 *
 * Engine: CSS transitions only. No `@angular/animations`. Reduced-motion
 * collapses background/color transitions (the active cue is non-motion:
 * position + tone + weight).
 */
@Component({
  selector: 'zm-tablet-nav',
  imports: [RouterLink, RouterLinkActive, ZmNavIconComponent, ZmAccountMenuComponent],
  templateUrl: './tablet-nav.component.html',
  styleUrl: './tablet-nav.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ZmTabletNavComponent implements OnInit {
  protected readonly navEntries: ReadonlyArray<NavEntry> = NAV_ENTRIES;

  /**
   * Emitted when the user activates the on-demand context drawer toggle.
   * The shell owns the contextual sheet (preserved static marketing copy for
   * now; `m2-contextual-rail` replaces it with live content).
   */
  @Output() readonly contextToggle = new EventEmitter<void>();

  private readonly activeLink = signal<string | null>(null);

  constructor(
    private readonly router: Router,
    private readonly navState: ShellNavStateService,
  ) {}

  ngOnInit(): void {
    this.navState.init();
  }

  protected setActive(link: string, active: boolean): void {
    if (active) this.activeLink.set(link);
    else if (this.activeLink() === link) this.activeLink.set(null);
  }

  protected isCurrent(link: string): boolean {
    return this.activeLink() === link;
  }

  /** Accessible name for a nav item — appends the exact unread count for
   *  Mesajlar/Bildirimler so AT announces it (`"Mesajlar, 3 okunmamış"`). */
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

  protected onContextToggle(): void {
    this.contextToggle.emit();
  }
}
