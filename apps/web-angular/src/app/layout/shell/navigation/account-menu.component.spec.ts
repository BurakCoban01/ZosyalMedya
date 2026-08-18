import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { Router } from '@angular/router';
import { provideRouter } from '@angular/router';
import type { ProfileView } from '@platform/api';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../../core/auth/auth.service';
import { ThemeService, THEME_OPTIONS } from '../../../core/preferences/theme.service';
import { ShellNavStateService } from './shell-nav-state.service';
import { ZmAccountMenuComponent } from './account-menu.component';

/**
 * ZmAccountMenu — focused verification for m2-account-theme-status
 * (VAL-WSH-005 account control + real logout; VAL-WSH-006 theme toggle).
 *
 * Guards:
 *   - the trigger is a real button with aria-haspopup=menu + an accessible
 *     name carrying the user's identity;
 *   - the popover exposes profile / theme / logout actions;
 *   - choosing a theme calls ThemeService.setTheme (applies + persists);
 *   - logout calls the REAL AuthService.logout() then navigates to /giris;
 *   - profile navigation goes to /profil;
 *   - honest generic identity when the profile has not resolved.
 *
 * The overlay's own a11y contract (focus trap, arrow nav, Escape, return
 * focus, outside-click) is proven by the ZmMenu primitive spec; here we open
 * the real menu (CDK overlay) and assert the projected account actions.
 */

const flush = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise((r) => setTimeout(r, 0));
};

/** A minimal but realistic ProfileView for the avatar/name header. */
function fakeProfile(overrides: Partial<ProfileView> = {}): ProfileView {
  return {
    id: 'u-1',
    ownerId: 'u-1',
    displayName: 'Deniz Yılmaz',
    handle: 'deniz',
    completenessPercentage: 80,
    version: 1,
    isVerified: false,
    isPrivate: false,
    language: 'Turkish',
    theme: 'System',
    reduceMotion: false,
    ...overrides,
  } as ProfileView;
}

function stubAuthService(): { logout: ReturnType<typeof vi.fn> } {
  return { logout: vi.fn().mockResolvedValue(undefined) };
}

function stubTheme(startMode: 'system' | 'light' | 'dark' = 'dark'): {
  service: ThemeService;
  setTheme: ReturnType<typeof vi.fn>;
} {
  const themeMode = signal(startMode);
  const setTheme = vi.fn((m: 'system' | 'light' | 'dark') => {
    themeMode.set(m);
  });
  const service = { themeMode, setTheme } as unknown as ThemeService;
  return { service, setTheme };
}

function stubNavState(profile: ProfileView | null): ShellNavStateService {
  return { profile: signal(profile) } as unknown as ShellNavStateService;
}

interface RenderResult {
  host: HTMLElement;
  comp: ZmAccountMenuComponent;
  authLogout: ReturnType<typeof vi.fn>;
  setTheme: ReturnType<typeof vi.fn>;
  router: Router;
}

async function render(opts: {
  compact?: boolean;
  profile?: ProfileView | null;
  themeStart?: 'system' | 'light' | 'dark';
} = {}): Promise<RenderResult> {
  TestBed.resetTestingModule();
  const authStub = stubAuthService();
  const { service: themeStub, setTheme } = stubTheme(opts.themeStart ?? 'dark');
  const navStateStub = stubNavState(opts.profile === undefined ? fakeProfile() : opts.profile);
  await TestBed.configureTestingModule({
    imports: [ZmAccountMenuComponent],
    providers: [
      provideRouter([]),
      { provide: AuthService, useValue: authStub },
      { provide: ThemeService, useValue: themeStub },
      { provide: ShellNavStateService, useValue: navStateStub },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(ZmAccountMenuComponent);
  if (opts.compact) fixture.componentRef.setInput('compact', true);
  fixture.detectChanges();
  const router = TestBed.inject(Router);
  return {
    host: fixture.nativeElement as HTMLElement,
    comp: fixture.componentInstance,
    authLogout: authStub.logout,
    setTheme,
    router,
  };
}

async function openMenu(comp: ZmAccountMenuComponent): Promise<HTMLElement> {
  (comp as unknown as { toggle: () => void }).toggle();
  await flush();
  return document.querySelector<HTMLElement>('.zm-menu__panel')!;
}

describe('ZmAccountMenuComponent', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  afterEach(() => {
    document.querySelectorAll('.cdk-overlay-container').forEach((el) => el.remove());
  });

  // ---- Trigger (always in the DOM) -------------------------------------

  it('renders a trigger button with aria-haspopup=menu', async () => {
    const { host } = await render();
    const trigger = host.querySelector<HTMLButtonElement>('.account-menu__trigger');
    expect(trigger).not.toBeNull();
    expect(trigger?.tagName).toBe('BUTTON');
    expect(trigger?.getAttribute('aria-haspopup')).toBe('menu');
  });

  it('the trigger accessible name carries the user identity + "hesap menüsü"', async () => {
    const { host } = await render({ profile: fakeProfile({ displayName: 'Ela Polat', handle: 'ela' }) });
    const trigger = host.querySelector<HTMLButtonElement>('.account-menu__trigger');
    expect(trigger?.getAttribute('aria-label')).toContain('Ela Polat');
    expect(trigger?.getAttribute('aria-label')).toContain('hesap menüsü');
  });

  it('falls back to an honest generic identity when the profile is null (no fabricated name)', async () => {
    const { host } = await render({ profile: null });
    const trigger = host.querySelector<HTMLButtonElement>('.account-menu__trigger');
    expect(trigger?.getAttribute('aria-label')).toContain('Hesabın');
  });

  it('compact variant hides the name (avatar-only trigger) + applies the compact class', async () => {
    const { host } = await render({ compact: true });
    // The name block is removed from the DOM (@if (!compact())); the caret is
    // CSS-hidden via the compact modifier class.
    expect(host.querySelector('.account-menu__name')).toBeNull();
    const trigger = host.querySelector<HTMLElement>('.account-menu__trigger');
    expect(trigger?.classList.contains('account-menu__trigger--compact')).toBe(true);
    const avatar = host.querySelector('.account-menu__avatar');
    expect(avatar).not.toBeNull();
  });

  // ---- Menu contents ---------------------------------------------------

  it('opens a role=menu panel with profile + theme + logout actions', async () => {
    const { comp } = await render();
    const panel = await openMenu(comp);
    expect(panel).not.toBeNull();
    expect(panel.getAttribute('role')).toBe('menu');
    expect(panel.textContent).toContain('Profil');
    expect(panel.textContent).toContain('Sistem');
    expect(panel.textContent).toContain('Açık');
    expect(panel.textContent).toContain('Koyu');
    expect(panel.textContent).toContain('Çıkış yap');
  });

  it('renders the profile header with display name + handle', async () => {
    const { comp } = await render({ profile: fakeProfile({ displayName: 'Ada Kaya', handle: 'ada' }) });
    const panel = await openMenu(comp);
    expect(panel.textContent).toContain('Ada Kaya');
    expect(panel.textContent).toContain('@ada');
  });

  it('exposes exactly the canonical three theme options', async () => {
    const { comp } = await render();
    expect(comp['themeOptions']).toBe(THEME_OPTIONS);
    expect(THEME_OPTIONS.map((o) => o.value)).toEqual(['system', 'light', 'dark']);
  });

  it('marks the current theme option selected (checkmark + aria-checked)', async () => {
    const { comp } = await render({ themeStart: 'dark' });
    const panel = await openMenu(comp);
    const themeItems = Array.from(panel.querySelectorAll<HTMLElement>('.account-menu__item--theme'));
    expect(themeItems.length).toBe(3);
    const selected = themeItems.find((el) => el.getAttribute('aria-checked') === 'true');
    expect(selected).toBeDefined();
    expect(selected?.textContent).toContain('Koyu');
    expect(selected?.querySelector('.account-menu__check svg')).not.toBeNull();
  });

  // ---- Theme action (VAL-WSH-006) -------------------------------------

  it('chooseTheme() calls ThemeService.setTheme with the chosen mode', async () => {
    const { comp, setTheme } = await render({ themeStart: 'dark' });
    (comp as unknown as { chooseTheme: (m: 'system' | 'light' | 'dark') => void }).chooseTheme('light');
    expect(setTheme).toHaveBeenCalledWith('light');
  });

  // ---- Logout action (VAL-WSH-005: real API) --------------------------

  it('logout() calls AuthService.logout() then navigates to /giris', async () => {
    const { comp, authLogout, router } = await render();
    const navSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);

    await (comp as unknown as { logout: () => Promise<void> }).logout();

    expect(authLogout).toHaveBeenCalledTimes(1);
    expect(navSpy).toHaveBeenCalledWith('/giris');
  });

  it('logout() blocks a double submit while the real call is in flight', async () => {
    const { comp, authLogout, router } = await render();
    vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    authLogout.mockImplementation(() => new Promise((r) => setTimeout(() => r(undefined), 10)));

    const p1 = (comp as unknown as { logout: () => Promise<void> }).logout();
    await (comp as unknown as { logout: () => Promise<void> }).logout();
    await p1;

    expect(authLogout).toHaveBeenCalledTimes(1);
  });

  // ---- Profile navigation ---------------------------------------------

  it('goProfile() navigates to /profil', async () => {
    const { comp, router } = await render();
    const navSpy = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    await (comp as unknown as { goProfile: () => Promise<void> }).goProfile();
    expect(navSpy).toHaveBeenCalledWith('/profil');
  });
});
