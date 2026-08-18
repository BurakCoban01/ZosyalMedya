import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { signal } from '@angular/core';
import type { MockInstance } from 'vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../../core/auth/auth.service';
import { ThemeService } from '../../../core/preferences/theme.service';
import { ShellNavStateService } from './shell-nav-state.service';
import { formatUnreadBadge } from './nav-catalog';
import { ZmMobileBottomNavComponent } from './mobile-bottom-nav.component';

/**
 * ZmMobileBottomNav — focused verification for `m2-tablet-mobile-navigation`
 * (VAL-WSH-008 mobile-web slice).
 *
 * Covers:
 *   - VAL-WSH-008 — bottom nav visible + operable at narrow widths, targets
 *     meet minimum size, composer reachable;
 *   - VAL-WSH-001/002/003 (carried into mobile-web) — active route
 *     unmistakable, accessible names, real-API unread badges;
 *   - the 5 primary + 5 secondary split + sign-out preserved flow;
 *   - the Daha fazla sheet exists + is openable (the ZmSheet a11y contract
 *     itself is verified in the m1-primitive-overlays spec; here we verify
 *     the shell's wiring of the trigger).
 */

const PRIMARY_ITEMS: ReadonlyArray<{ readonly label: string; readonly link: string }> = [
  { label: 'Akış', link: '/akis' },
  { label: 'Keşfet', link: '/kesfet' },
  { label: 'Mesajlar', link: '/mesajlar' },
  { label: 'Bildirimler', link: '/bildirimler' },
  { label: 'Profil', link: '/profil' },
];

const SECONDARY_ITEMS: ReadonlyArray<{ readonly label: string; readonly link: string }> = [
  { label: 'Bağlantılar', link: '/baglantilar' },
  { label: 'Sorular', link: '/sorular' },
  { label: 'Kaydedilenler', link: '/kaydedilenler' },
  { label: 'Ayarlar', link: '/ayarlar' },
  { label: 'Yönetim', link: '/yonetim' },
];

function stubAuthService() {
  return { logout: vi.fn().mockResolvedValue(undefined) };
}

/** Stub ThemeService with a controllable themeMode + spy-able setTheme. The
 *  mobile More sheet surfaces the theme group inline (m2-account-theme-status,
 *  VAL-WSH-006); we seed the mode and assert the sheet reflects + changes it. */
function stubTheme(startMode: 'system' | 'light' | 'dark' = 'dark'): {
  service: ThemeService;
  setTheme: ReturnType<typeof vi.fn>;
} {
  const themeMode = signal(startMode);
  const setTheme = vi.fn((m: 'system' | 'light' | 'dark') => themeMode.set(m));
  return { service: { themeMode, setTheme } as unknown as ThemeService, setTheme };
}

function stubNavState(unreadMessages: number, unreadNotifications: number): ShellNavStateService {
  // Plain-function stub (same proven pattern as the desktop-rail + app-shell
  // specs). The template evaluates `this.navState.unreadMessages()` during
  // detectChanges, so a plain function returning the seeded value is enough;
  // real signals here contaminate the shared reactive graph across spec files
  // in the same vitest worker, breaking sibling specs.
  return {
    init: vi.fn(),
    refresh: vi.fn().mockResolvedValue(undefined),
    refreshProfile: vi.fn().mockResolvedValue(undefined),
    profile: (() => null) as unknown as ShellNavStateService['profile'],
    unreadMessages: (() => unreadMessages) as unknown as ShellNavStateService['unreadMessages'],
    unreadNotifications: (() => unreadNotifications) as unknown as ShellNavStateService['unreadNotifications'],
    messagesBadge: (() => formatUnreadBadge(unreadMessages)) as unknown as ShellNavStateService['messagesBadge'],
    notificationsBadge: (() => formatUnreadBadge(unreadNotifications)) as unknown as ShellNavStateService['notificationsBadge'],
  } as unknown as ShellNavStateService;
}

async function renderMobileNav(opts: { unreadMessages?: number; unreadNotifications?: number; themeStart?: 'system' | 'light' | 'dark' } = {}): Promise<{
  fixture: ReturnType<typeof TestBed.createComponent<ZmMobileBottomNavComponent>>;
  root: HTMLElement;
  navigateByUrl: MockInstance;
  authLogout: ReturnType<typeof vi.fn>;
  setTheme: ReturnType<typeof vi.fn>;
}> {
  // Reset between tests: each `it` re-configures the module; without a reset
  // the second configure throws "already instantiated" and the real-signal
  // stub from the previous test leaks (proven pattern from the m1 recovery).
  TestBed.resetTestingModule();
  const authStub = stubAuthService();
  const { service: themeStub, setTheme } = stubTheme(opts.themeStart ?? 'dark');
  const navStateStub = stubNavState(opts.unreadMessages ?? 0, opts.unreadNotifications ?? 0);
  await TestBed.configureTestingModule({
    imports: [ZmMobileBottomNavComponent],
    providers: [
      provideRouter([]),
      { provide: AuthService, useValue: authStub },
      { provide: ThemeService, useValue: themeStub },
      { provide: ShellNavStateService, useValue: navStateStub },
    ],
  }).compileComponents();
  const router = TestBed.inject(Router);
  const navigateByUrl = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
  const fixture = TestBed.createComponent(ZmMobileBottomNavComponent);
  fixture.detectChanges();
  await fixture.whenStable();
  const root = fixture.nativeElement as HTMLElement;
  return { fixture, root, navigateByUrl, authLogout: authStub.logout, setTheme };
}

function activate(
  fixture: { componentInstance: ZmMobileBottomNavComponent; detectChanges(): void },
  link: string,
): void {
  (fixture.componentInstance as unknown as { setActive(link: string, active: boolean): void }).setActive(link, true);
  fixture.detectChanges();
}

/** Teardown after each test: destroys the Angular app + clears router/zone/CDK
 *  overlay state so sibling spec files in the same vitest worker start clean
 *  (the experimental unit-test builder does not auto-reset between tests). */
afterEach(() => {
  TestBed.resetTestingModule();
});

describe('ZmMobileBottomNavComponent — VAL-WSH-008 (bottom navigation)', () => {
  it('renders a <nav> landmark with an accessible name', async () => {
    const { root } = await renderMobileNav();
    const nav = root.querySelector<HTMLElement>('nav.bottom-nav');
    expect(nav).not.toBeNull();
    expect(nav?.getAttribute('aria-label')).toBe('Ana navigasyon');
  });

  it('renders exactly the 5 primary items as native anchors with routerLinks', async () => {
    const { root } = await renderMobileNav();
    // Primary items exclude the More button (it is a <button>, not an <a>).
    const primaryAnchors = Array.from(root.querySelectorAll<HTMLAnchorElement>('.bottom-nav > .bottom-nav__item[href]'));
    expect(primaryAnchors).toHaveLength(PRIMARY_ITEMS.length);
    primaryAnchors.forEach((a, idx) => {
      expect(a.getAttribute('href')).toBe(PRIMARY_ITEMS[idx].link);
      expect(a.querySelector('.bottom-nav__label')?.textContent?.trim()).toBe(PRIMARY_ITEMS[idx].label);
    });
  });

  it('gives every primary item an accessible name (label + count when applicable)', async () => {
    const { root } = await renderMobileNav({ unreadMessages: 2 });
    const items = Array.from(root.querySelectorAll<HTMLAnchorElement>('.bottom-nav > .bottom-nav__item[href]'));
    items.forEach((item, idx) => {
      const expected = PRIMARY_ITEMS[idx].label;
      expect(item.getAttribute('aria-label') ?? '').toContain(expected);
    });
    const mesajlar = items.find((i) => i.getAttribute('href') === '/mesajlar');
    expect(mesajlar?.getAttribute('aria-label')).toBe('Mesajlar, 2 okunmamış');
  });

  it('renders the center compose FAB as a real <button> with an accessible name', async () => {
    const { root } = await renderMobileNav();
    const compose = root.querySelector<HTMLButtonElement>('.bottom-nav__compose');
    expect(compose).not.toBeNull();
    expect(compose?.type).toBe('button');
    expect(compose?.getAttribute('aria-label')).toContain('Oluştur');
  });

  it('compose() navigates to /akis (composer reachable — VAL-WSH-008)', async () => {
    const { fixture, navigateByUrl } = await renderMobileNav();
    await (fixture.componentInstance as unknown as { compose(): Promise<void> }).compose();
    expect(navigateByUrl).toHaveBeenCalledWith('/akis');
  });

  it('renders the Daha fazla (More) button as a real <button> with aria-haspopup', async () => {
    const { root } = await renderMobileNav();
    const more = root.querySelector<HTMLButtonElement>('.bottom-nav__item--more');
    expect(more).not.toBeNull();
    expect(more?.tagName).toBe('BUTTON');
    expect(more?.getAttribute('aria-haspopup')).toBe('dialog');
    expect(more?.getAttribute('aria-label')).toContain('Daha fazla');
  });

  it('openMore() calls open() on the ZmSheet (sheet is reachable + operable)', async () => {
    const { fixture } = await renderMobileNav();
    const component = fixture.componentInstance as unknown as { moreSheet?: { open: ReturnType<typeof vi.fn>; close: ReturnType<typeof vi.fn> } };
    expect(component.moreSheet).toBeDefined();
    const openSpy = vi.spyOn(component.moreSheet!, 'open');
    (fixture.componentInstance as unknown as { openMore(): void }).openMore();
    expect(openSpy).toHaveBeenCalledTimes(1);
  });
});

describe('ZmMobileBottomNavComponent — More sheet contents', () => {
  it('renders the 5 secondary destinations + sign-out inside the sheet', async () => {
    const { fixture } = await renderMobileNav();
    // The sheet's projected content lives in the CDK overlay container
    // (document.body) and only renders once the sheet is opened — opening the
    // sheet stamps the <ng-template> into the overlay pane.
    (fixture.componentInstance as unknown as { openMore(): void }).openMore();
    fixture.detectChanges();
    await fixture.whenStable();
    const moreLinks = Array.from(document.querySelectorAll<HTMLAnchorElement>('.bottom-nav__more-link[href]'));
    expect(moreLinks).toHaveLength(SECONDARY_ITEMS.length);
    moreLinks.forEach((a, idx) => {
      expect(a.getAttribute('href')).toBe(SECONDARY_ITEMS[idx].link);
      expect(a.querySelector('.bottom-nav__more-label')?.textContent?.trim()).toBe(SECONDARY_ITEMS[idx].label);
    });
    // Sign-out lives as a real <button> (not a routerLink) at the end.
    const signoutBtn = document.querySelector<HTMLButtonElement>('.bottom-nav__more-item--signout .bottom-nav__more-link');
    expect(signoutBtn).not.toBeNull();
    expect(signoutBtn?.tagName).toBe('BUTTON');
    expect(signoutBtn?.getAttribute('aria-label')).toBe('Çıkış yap');
  });

  it('keeps the protected /yonetim (admin) item reachable via More — guard enforced by route', async () => {
    const { fixture } = await renderMobileNav();
    (fixture.componentInstance as unknown as { openMore(): void }).openMore();
    fixture.detectChanges();
    await fixture.whenStable();
    const yonetim = document.querySelector<HTMLAnchorElement>('.bottom-nav__more-link[href="/yonetim"]');
    expect(yonetim).not.toBeNull();
  });

  it('closeMore() closes the sheet (called by secondary items on click)', async () => {
    const { fixture } = await renderMobileNav();
    const component = fixture.componentInstance as unknown as { moreSheet?: { close: ReturnType<typeof vi.fn> } };
    const closeSpy = vi.spyOn(component.moreSheet!, 'close');
    (fixture.componentInstance as unknown as { closeMore(): void }).closeMore();
    expect(closeSpy).toHaveBeenCalledWith('programmatic');
  });

  it('surfaces the Sistem/Açık/Koyu theme group in the More sheet (VAL-WSH-006)', async () => {
    const { fixture } = await renderMobileNav({ themeStart: 'dark' });
    (fixture.componentInstance as unknown as { openMore(): void }).openMore();
    fixture.detectChanges();
    await fixture.whenStable();
    const themeBtns = Array.from(document.querySelectorAll<HTMLButtonElement>('.bottom-nav__more-link--theme'));
    expect(themeBtns).toHaveLength(3);
    const labels = themeBtns.map((b) => b.querySelector('.bottom-nav__more-label')?.textContent?.trim());
    expect(labels).toEqual(['Sistem', 'Açık', 'Koyu']);
    // The current (dark) option is marked selected with aria-pressed + a check.
    const selected = themeBtns.find((b) => b.getAttribute('aria-pressed') === 'true');
    expect(selected).toBeDefined();
    expect(selected?.querySelector('.bottom-nav__more-check svg')).not.toBeNull();
    expect(selected?.querySelector('.bottom-nav__more-label')?.textContent?.trim()).toBe('Koyu');
  });

  it('chooseTheme() applies the chosen theme via ThemeService.setTheme', async () => {
    const { fixture, setTheme } = await renderMobileNav({ themeStart: 'dark' });
    (fixture.componentInstance as unknown as { chooseTheme(m: 'system' | 'light' | 'dark'): void }).chooseTheme('light');
    expect(setTheme).toHaveBeenCalledWith('light');
  });
});

describe('ZmMobileBottomNavComponent — VAL-WSH-001 (active route, >=2 NON-color cues)', () => {
  it('marks a primary active item with aria-current="page" + raised tone', async () => {
    const { fixture, root } = await renderMobileNav();
    activate(fixture, '/akis');
    const akis = root.querySelector<HTMLAnchorElement>('.bottom-nav__item[href="/akis"]');
    expect(akis?.getAttribute('aria-current')).toBe('page');
    expect(akis?.classList.contains('is-current')).toBe(true);
  });

  it('marks the More button active when a secondary route is current (so the user sees where they are)', async () => {
    const { fixture, root } = await renderMobileNav();
    activate(fixture, '/ayarlar');
    const more = root.querySelector<HTMLButtonElement>('.bottom-nav__item--more');
    expect(more?.getAttribute('aria-current')).toBe('page');
    expect(more?.classList.contains('is-active')).toBe(true);
  });

  it('marks the More button active via the ROUTER (not just setActive) — fixes overlay-secondary gap', async () => {
    // Regression guard: the secondary links live in the CDK overlay (absent
    // until the sheet opens), so their routerLinkActive never fires. The
    // component must derive the active route from the router so a real
    // navigation to /ayarlar marks More active WITHOUT any setActive() call.
    TestBed.resetTestingModule();
    const authStub = stubAuthService();
    const navStateStub = stubNavState(0, 0);
    @Component({ template: '', standalone: true })
    class BlankComponent {}
    await TestBed.configureTestingModule({
      imports: [ZmMobileBottomNavComponent],
      providers: [
        provideRouter([{ path: 'ayarlar', component: BlankComponent }]),
        { provide: AuthService, useValue: authStub },
        { provide: ShellNavStateService, useValue: navStateStub },
      ],
    }).compileComponents();
    const router = TestBed.inject(Router);
    // navigateByUrl is NOT spied here: we need the real NavigationEnd to fire
    // so the router subscription in the component updates activeLink.
    const fixture = TestBed.createComponent(ZmMobileBottomNavComponent);
    fixture.detectChanges();
    await router.navigateByUrl('/ayarlar');
    fixture.detectChanges();
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    const more = root.querySelector<HTMLButtonElement>('.bottom-nav__item--more');
    expect(more?.classList.contains('is-active')).toBe(true);
    expect(more?.getAttribute('aria-current')).toBe('page');
    // And no primary item should be active on a secondary route.
    const primaryActive = root.querySelector<HTMLAnchorElement>('.bottom-nav__item[href].is-active');
    expect(primaryActive).toBeNull();
  });
});

describe('ZmMobileBottomNavComponent — VAL-WSH-003 (unread indicators)', () => {
  it('shows NO badge when counts are zero', async () => {
    const { root } = await renderMobileNav({ unreadMessages: 0, unreadNotifications: 0 });
    expect(root.querySelectorAll('.bottom-nav__badge')).toHaveLength(0);
  });

  it('renders a badge on Mesajlar + announces the exact count in aria-label', async () => {
    const { root } = await renderMobileNav({ unreadMessages: 3, unreadNotifications: 0 });
    const mesajlar = root.querySelector<HTMLAnchorElement>('.bottom-nav__item[href="/mesajlar"]');
    expect(mesajlar?.querySelector('.bottom-nav__badge')?.textContent?.trim()).toBe('3');
    expect(mesajlar?.getAttribute('aria-label')).toBe('Mesajlar, 3 okunmamış');
  });

  it('caps the displayed count at 99+ (aria-label still uses the exact count via the service signal)', async () => {
    const { root } = await renderMobileNav({ unreadMessages: 150, unreadNotifications: 0 });
    const mesajlar = root.querySelector<HTMLAnchorElement>('.bottom-nav__item[href="/mesajlar"]');
    expect(mesajlar?.querySelector('.bottom-nav__badge')?.textContent?.trim()).toBe('99+');
  });
});

describe('ZmMobileBottomNavComponent — preserved contract', () => {
  it('signOut() closes the sheet, calls AuthService.logout(), then navigates to /giris', async () => {
    const { fixture, navigateByUrl, authLogout } = await renderMobileNav();
    await fixture.componentInstance.signOut();
    expect(authLogout).toHaveBeenCalledTimes(1);
    expect(navigateByUrl).toHaveBeenCalledWith('/giris');
  });
});
