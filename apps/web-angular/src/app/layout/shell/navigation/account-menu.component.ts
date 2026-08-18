import { ChangeDetectionStrategy, Component, computed, ElementRef, inject, input, signal, viewChild } from '@angular/core';
import { Router } from '@angular/router';
import { AuthService } from '../../../core/auth/auth.service';
import { ThemeService, THEME_OPTIONS, type ThemeMode } from '../../../core/preferences/theme.service';
import { ZmAvatarComponent } from '../../../design-system/primitives/identity/avatar.component';
import { ZmMenuComponent } from '../../../design-system/primitives/overlays/menu.component';
import { ShellNavStateService } from './shell-nav-state.service';

/**
 * ZmAccountMenu — the signed-in user's account control + popover menu.
 *
 * Fulfils **VAL-WSH-005** (account control opens a keyboard-navigable menu
 * with profile + theme toggle + logout that hits the real API) and
 * **VAL-WSH-006** (the theme control applies the choice immediately with no
 * flash on reload — persistence + pre-paint are owned by `ThemeService` +
 * the inline `index.html` script from m1).
 *
 * Surface:
 *   - A trigger button carrying the user's avatar (+ display name in the
 *     full desktop variant; avatar-only in the compact tablet variant). The
 *     trigger owns `aria-haspopup="menu"` + `aria-expanded`.
 *   - A `ZmMenu` popover (CDK overlay; focus trap + arrow nav + Escape +
 *     outside-click + return focus — owned by the primitive) with:
 *       * a profile header (avatar + display name + handle) — informational;
 *       * a "Profil"e git action → `/profil`;
 *       * a Görünüm (theme) group: Sistem / Açık / Koyu, each a
 *         `role="menuitem"` with a checkmark + `aria-checked` reflecting the
 *         current {@link ThemeService.themeMode}; selecting one calls
 *         `theme.setTheme(mode)` which applies `data-theme` synchronously and
 *         persists the choice;
 *       * a "Çıkış yap" action → real `AuthService.logout()` (revokes the
 *         refresh token via the backend `logout` endpoint + clears the
 *         `TokenVault`) then navigates to `/giris`.
 *
 * Identity data comes from the shared {@link ShellNavStateService.profile}
 * signal (fetched once per shell session; honest generic identity when the
 * fetch has not resolved or failed — no fabricated name). Theme state comes
 * from the shared {@link ThemeService} (singleton; applied app-wide from
 * app boot by `AppComponent`).
 *
 * Engine: CSS transitions + the ZmMenu overlay's own motion. No
 * `@angular/animations`. Consumes ONLY `--zm-account-menu-*` component
 * tokens (no hardcoded hex). Reduced-motion collapses the trigger's
 * background transition; the ZmMenu primitive already collapses its own.
 */
@Component({
  selector: 'zm-account-menu',
  imports: [ZmAvatarComponent, ZmMenuComponent],
  templateUrl: './account-menu.component.html',
  styleUrl: './account-menu.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ZmAccountMenuComponent {
  /** Whether the trigger renders the avatar-only compact form (tablet) or the
   *  full avatar + name form (desktop). Defaults to full. */
  readonly compact = input<boolean>(false);

  private readonly auth = inject(AuthService);
  private readonly router = inject(Router);
  private readonly theme = inject(ThemeService);
  private readonly navState = inject(ShellNavStateService);
  private readonly hostRef = inject<ElementRef<HTMLElement>>(ElementRef);

  /** The popover menu primitive (overlay + a11y contract). */
  protected readonly menu = viewChild(ZmMenuComponent);

  /** Canonical theme-option catalog (Sistem / Açık / Koyu). */
  protected readonly themeOptions = THEME_OPTIONS;

  /** The signed-in user's profile (null until resolved; honest fallback). */
  protected readonly profile = this.navState.profile;

  /** The user's current theme mode (drives the checkmark + aria-checked). */
  protected readonly themeMode = this.theme.themeMode;

  /** Pending flag for the logout action so the Çıkış item can show a busy
   *  affordance and block a double-submit while the real API call is in
   *  flight (no duplicate token-revoke round-trips). */
  protected readonly loggingOut = signal(false);

  /** Display name for the trigger / header. Falls back to an honest generic
   *  label until the profile resolves or when it failed — never fabricated. */
  protected readonly displayName = computed<string>(() => this.profile()?.displayName?.trim() || 'Hesabın');

  /** Handle for the header (without the leading @; the template adds it). */
  protected readonly handle = computed<string>(() => this.profile()?.handle?.trim() || '');

  /** Accessible name for the trigger button. Includes the resolved name so AT
   *  announces whose account the control opens. */
  protected readonly triggerLabel = computed<string>(() => {
    const name = this.displayName();
    return this.compact() ? `${name} — hesap menüsü` : `${name} — hesap menüsü`;
  });

  /** Open the popover anchored to the trigger button; or close it if open. */
  protected toggle(): void {
    const menu = this.menu();
    if (!menu) return;
    if (menu.isOpen()) {
      menu.close('programmatic');
    } else {
      menu.open(this.triggerEl());
    }
  }

  /** Navigate to the profile route, then close the menu. */
  protected async goProfile(): Promise<void> {
    this.closeMenu();
    await this.router.navigateByUrl('/profil');
  }

  /** Apply a theme choice immediately (ThemeService persists + applies to
   *  `<html data-theme>` synchronously) and close the menu. */
  protected chooseTheme(mode: ThemeMode): void {
    this.theme.setTheme(mode);
    this.closeMenu();
  }

  /** Whether a theme option is the current selection (drives checkmark). */
  protected isTheme(mode: ThemeMode): boolean {
    return this.themeMode() === mode;
  }

  /** Log out via the REAL endpoint (refresh-token revoke + TokenVault clear),
   *  then navigate to the login surface. Preserves the exact flow the legacy
   *  sign-out buttons used. */
  protected async logout(): Promise<void> {
    if (this.loggingOut()) return;
    this.loggingOut.set(true);
    try {
      await this.auth.logout();
    } finally {
      this.loggingOut.set(false);
      this.closeMenu();
      await this.router.navigateByUrl('/giris');
    }
  }

  /** Close the popover. Safe when already closed / not yet rendered. */
  private closeMenu(): void {
    this.menu()?.close('programmatic');
  }

  /** Resolve the trigger element for anchoring. Falls back to the host so
   *  anchoring never throws before the view settles. */
  private triggerEl(): HTMLElement | null {
    return this.hostRef.nativeElement.querySelector('.account-menu__trigger') ?? this.hostRef.nativeElement;
  }
}
