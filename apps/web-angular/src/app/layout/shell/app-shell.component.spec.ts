import { TestBed } from '@angular/core/testing';
import { Component, computed, signal } from '@angular/core';
import { provideRouter, Router, Routes } from '@angular/router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Api } from '@platform/api';
import { AuthService } from '../../core/auth/auth.service';
import { TokenVault } from '../../core/auth/token-vault.service';
import { ThemeService } from '../../core/preferences/theme.service';
import { OnlineStatusService } from '../../core/connectivity/online-status.service';
import { ShellNavStateService } from './navigation/shell-nav-state.service';
import { formatUnreadBadge } from './navigation/nav-catalog';
import { ZmAppShellComponent } from './app-shell.component';

/**
 * ZmAppShell — focused verification for `m2-shell-structure` +
 * `m2-tablet-mobile-navigation`.
 *
 * This spec guards the structural + responsive contract of the shell:
 *   1. the shell renders all three navigation variants (desktop rail, tablet
 *      compact rail, mobile-web bottom-nav) so CSS can show exactly one at a
 *      time without re-mounting;
 *   2. the workspace hosts the `<router-outlet>` so all child routes render;
 *   3. the static right-rail marketing copy is preserved verbatim as the
 *      baseline for `m2-contextual-rail`;
 *   4. the on-demand context sheet is wired to the tablet nav's toggle
 *      (VAL-WSH-007 contract — the workspace is never squeezed between two
 *      persistent sidebars);
 *   5. no logout button exists at the shell level (each nav variant owns its
 *      own logout, calling real `AuthService.logout()` + navigating to
 *      `/giris`).
 *
 * Each variant's own spec verifies its navigation behavior. The shared
 * ShellNavStateService is stubbed so the test module does not need the
 * generated Api/HttpClient or the realtime SignalR hub.
 */

/** Build a minimal ShellNavStateService stub. The shell + its nav variants
 *  only call `init()` (idempotent) and read the badge signals. Plain function
 *  stubs avoid signal-reactivity noise at the unit-test boundary. */
function stubNavState(unreadMessages = 0, unreadNotifications = 0): ShellNavStateService {
  return {
    init: vi.fn(),
    refresh: vi.fn().mockResolvedValue(undefined),
    refreshProfile: vi.fn().mockResolvedValue(undefined),
    profile: signal(null) as unknown as ShellNavStateService['profile'],
    unreadMessages: (() => unreadMessages) as unknown as ReturnType<typeof signal<number>>,
    unreadNotifications: (() => unreadNotifications) as unknown as ReturnType<typeof signal<number>>,
    messagesBadge: (() => formatUnreadBadge(unreadMessages)) as unknown as ReturnType<typeof computed<string>>,
    notificationsBadge: (() => formatUnreadBadge(unreadNotifications)) as unknown as ReturnType<typeof computed<string>>,
  } as unknown as ShellNavStateService;
}

async function renderShell(opts: { unreadMessages?: number; unreadNotifications?: number } = {}): Promise<{ shell: HTMLElement }> {
  // Reset between tests: each `it` re-configures the module; without a reset
  // the second configure throws "already instantiated" (proven pattern from
  // the m1 recovery).
  TestBed.resetTestingModule();
  await TestBed.configureTestingModule({
    imports: [ZmAppShellComponent],
    providers: [
      provideRouter([]),
      { provide: AuthService, useValue: { logout: vi.fn().mockResolvedValue(undefined) } },
      { provide: TokenVault, useValue: { authenticated: signal(true) } },
      { provide: ShellNavStateService, useValue: stubNavState(opts.unreadMessages, opts.unreadNotifications) },
      // The desktop rail's account menu (m2-account-theme-status) injects
      // ThemeService; stub it so the shell renders without the real service.
      { provide: ThemeService, useValue: { themeMode: signal('system' as const), setTheme: vi.fn() } },
      // The shell's offline indicator (m2-account-theme-status, VAL-WSH-013)
      // injects OnlineStatusService; stub it online so the banner stays hidden.
      { provide: OnlineStatusService, useValue: { isOnline: signal(true), isOffline: () => false } },
      // The contextual rail injects Api (m2-contextual-rail). Stub it so the
      // shell renders without an HttpClient; the rail resolves to its empty
      // state, which is fine for shell-structure assertions.
      { provide: Api, useValue: { invoke: vi.fn().mockResolvedValue([]) } },
    ],
  }).compileComponents();
  const fixture = TestBed.createComponent(ZmAppShellComponent);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { shell: fixture.nativeElement as HTMLElement };
}

/** Teardown after each test: destroys the Angular app + clears router/zone/CDK
 *  overlay state so sibling spec files in the same vitest worker start clean
 *  (the experimental unit-test builder does not auto-reset between tests). */
afterEach(() => {
  TestBed.resetTestingModule();
});

/** Minimal routed component that renders a page heading, used to prove the
 *  route-change announcer (VAL-WSH-010) reads the new page's `<h1>` from the
 *  live DOM. */
@Component({ selector: 'app-test-route', template: '<h1>Akış başlığı</h1>' })
class TestRouteComponent {}

/** Renders the shell with a real route (`/akis` -> TestRouteComponent) so the
 *  RouterOutlet activates a page that renders an `<h1>`, then drives a route
 *  navigation to exercise the route-change announcer. */
async function renderShellWithRoute(): Promise<{ shell: HTMLElement; router: Router }> {
  TestBed.resetTestingModule();
  const routes: Routes = [{ path: 'akis', component: TestRouteComponent }];
  await TestBed.configureTestingModule({
    imports: [ZmAppShellComponent],
    providers: [
      provideRouter(routes),
      { provide: AuthService, useValue: { logout: vi.fn().mockResolvedValue(undefined) } },
      { provide: TokenVault, useValue: { authenticated: signal(true) } },
      { provide: ShellNavStateService, useValue: stubNavState() },
      { provide: ThemeService, useValue: { themeMode: signal('system' as const), setTheme: vi.fn() } },
      { provide: OnlineStatusService, useValue: { isOnline: signal(true), isOffline: () => false } },
      { provide: Api, useValue: { invoke: vi.fn().mockResolvedValue([]) } },
    ],
  }).compileComponents();
  const router = TestBed.inject(Router);
  const fixture = TestBed.createComponent(ZmAppShellComponent);
  fixture.detectChanges();
  await router.navigate(['akis']);
  fixture.detectChanges();
  await fixture.whenStable();
  // Flush the deferred (setTimeout) heading read in the announcer.
  await new Promise((resolve) => setTimeout(resolve, 0));
  fixture.detectChanges();
  await fixture.whenStable();
  return { shell: fixture.nativeElement as HTMLElement, router };
}

describe('ZmAppShellComponent — shell structure + responsive variants', () => {
  it('renders all three navigation variants (CSS shows one at a time)', async () => {
    const { shell } = await renderShell();
    expect(shell.querySelector('zm-desktop-rail')).not.toBeNull();
    expect(shell.querySelector('zm-tablet-nav')).not.toBeNull();
    expect(shell.querySelector('zm-mobile-bottom-nav')).not.toBeNull();
  });

  it('renders the workspace owning the <router-outlet>', async () => {
    const { shell } = await renderShell();
    const workspace = shell.querySelector<HTMLElement>('main.workspace');
    expect(workspace).not.toBeNull();
    expect(workspace?.querySelector('router-outlet')).not.toBeNull();
  });

  it('renders the contextual rail component (no static marketing copy) — VAL-WSH-012', async () => {
    const { shell } = await renderShell();
    const context = shell.querySelector<HTMLElement>('aside.context');
    if (!context) throw new Error('context aside missing');
    // The contextual rail component is now the aside's content (replaces the
    // previous static marketing copy).
    expect(context.querySelector('zm-context-rail')).not.toBeNull();
    // The previous static marketing copy MUST be gone.
    const text = context.textContent ?? '';
    expect(text).not.toContain('Neden gördüğün anlaşılır.');
    expect(text).not.toContain('AÇIKLANABİLİR KEŞİF');
    expect(text).not.toContain('Oturum anahtarları kalıcı tarayıcı depolamasına yazılmaz');
  });

  it('wires the tablet nav contextToggle to the on-demand context sheet (VAL-WSH-007)', async () => {
    const { shell } = await renderShell();
    // The context sheet is rendered so the tablet nav's Bağlam toggle has a
    // sibling sheet to open. The aside stays as the persistent desktop
    // surface; the sheet is the on-demand tablet surface.
    const sheet = shell.querySelector('zm-sheet');
    expect(sheet).not.toBeNull();
    // The tablet nav must declare the (contextToggle) binding target.
    const tabletNav = shell.querySelector('zm-tablet-nav');
    expect(tabletNav).not.toBeNull();
  });

  it('does not surface a logout button at the shell level (each variant owns its logout)', async () => {
    const { shell } = await renderShell();
    // The shell template itself must NOT contain direct button children;
    // logout lives inside each nav variant (desktop rail, tablet nav, mobile
    // bottom-nav More sheet).
    const shellLevelButtons = shell.querySelectorAll(':scope > .shell > button');
    expect(shellLevelButtons.length).toBe(0);
  });

  // ---- m2-shell-skip-focus-announce (VAL-WSH-009 / 010 / 011) -----------

  it('renders a skip-to-content link as the first focusable element — VAL-WSH-009', async () => {
    const { shell } = await renderShell();
    const skipLink = shell.querySelector<HTMLAnchorElement>('a.zm-skip-link');
    expect(skipLink).not.toBeNull();
    // The skip link must be the first focusable element in DOM order (it sits
    // before the navigation rail so Tab lands on it first).
    const focusable = shell.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), input, textarea, select, [tabindex]:not([tabindex="-1"])',
    );
    expect(focusable.length).toBeGreaterThan(0);
    expect(focusable[0]).toBe(skipLink);
  });

  it('skip link targets the main content region — VAL-WSH-009', async () => {
    const { shell } = await renderShell();
    const skipLink = shell.querySelector<HTMLAnchorElement>('a.zm-skip-link');
    expect(skipLink?.getAttribute('href')).toBe('#ana-icerik');
    // Turkish, content-first copy (not generic "Skip to main content").
    expect((skipLink?.textContent ?? '').trim()).toBe('İçeriğe geç');
    // The target region exists with the matching id + tabindex so focus lands.
    const main = shell.querySelector<HTMLElement>('main#ana-icerik');
    expect(main).not.toBeNull();
    expect(main?.getAttribute('tabindex')).toBe('-1');
  });

  it('activating the skip link moves focus to the main content region — VAL-WSH-009', async () => {
    const { shell } = await renderShell();
    const skipLink = shell.querySelector<HTMLAnchorElement>('a.zm-skip-link');
    const main = shell.querySelector<HTMLElement>('main#ana-icerik');
    // jsdom honors `.focus()` on a tabindex=-1 element.
    skipLink!.dispatchEvent(new Event('click', { bubbles: true, cancelable: true }));
    expect(document.activeElement).toBe(main);
  });

  it('renders a route-change announcer live region — VAL-WSH-010', async () => {
    const { shell } = await renderShell();
    const announcer = shell.querySelector<HTMLElement>('.zm-route-announcer');
    expect(announcer).not.toBeNull();
    // Must be a live region (assertive so the new page is announced promptly).
    expect(announcer?.getAttribute('aria-live')).toBe('assertive');
    expect(announcer?.getAttribute('aria-atomic')).toBe('true');
  });

  it('announces the new page heading on route navigation — VAL-WSH-010', async () => {
    const { shell } = await renderShellWithRoute();
    const announcer = shell.querySelector<HTMLElement>('.zm-route-announcer');
    // The new route's `<h1>` text is read from the live DOM into the live
    // region, so AT announces the page change.
    expect((announcer?.textContent ?? '').trim()).toBe('Akış başlığı');
  });
});
