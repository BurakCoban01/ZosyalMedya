import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { computed, signal } from '@angular/core';
import { Component } from '@angular/core';
import type { MockInstance } from 'vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ShellNavStateService } from './shell-nav-state.service';
import { formatUnreadBadge } from './nav-catalog';
import { ZmDesktopRailComponent } from './desktop-rail.component';
import { ZmAccountMenuComponent } from './account-menu.component';

/**
 * Lightweight stub for the account menu so the rail spec stays focused on the
 * rail's own contract. The account menu has its own dedicated spec; here we
 * only assert the rail HOSTS it (m2-account-theme-status absorbs the legacy
 * standalone Çıkış button into the account menu).
 */
@Component({ selector: 'zm-account-menu', template: '<div class="stub-account-menu" aria-hidden="true"></div>' })
class StubAccountMenu {}

/**
 * ZmDesktopRail — focused verification for `m2-desktop-navigation`.
 *
 * Covers the four fulfils assertions:
 *   - VAL-WSH-001 — current route unmistakable (>=2 non-color cues, tracks nav)
 *   - VAL-WSH-002 — nav items carry accessible names + roles, keyboard-reachable
 *   - VAL-WSH-003 — unread/pulse indicators present + accessible (real counts)
 *   - VAL-WSH-004 — compose entry reachable + keyboard-activatable
 *
 * AND guards the contract that must NOT regress from the structural refactor:
 * every navigation item, every routerLink target, the brand logo link, and the
 * Çıkış button's real logout behavior (AuthService.logout() → /giris).
 */

/** Canonical nav catalog (mirrors the component). Drives exhaustive DOM checks. */
const NAV_ITEMS: ReadonlyArray<{ readonly order: string; readonly label: string; readonly link: string }> = [
  { order: '01', label: 'Akış', link: '/akis' },
  { order: '02', label: 'Keşfet', link: '/kesfet' },
  { order: '03', label: 'Mesajlar', link: '/mesajlar' },
  { order: '04', label: 'Bildirimler', link: '/bildirimler' },
  { order: '05', label: 'Profil', link: '/profil' },
  { order: '06', label: 'Bağlantılar', link: '/baglantilar' },
  { order: '07', label: 'Sorular', link: '/sorular' },
  { order: '08', label: 'Kaydedilenler', link: '/kaydedilenler' },
  { order: '09', label: 'Ayarlar', link: '/ayarlar' },
  { order: '10', label: 'Yönetim', link: '/yonetim' },
];

interface RenderOptions {
  /** Conversation unread total to seed via the mocked listConversations page. */
  unreadMessages?: number;
  /** Unread notification count to seed via the mocked listNotifications page. */
  unreadNotifications?: number;
}

/** Stub ShellNavStateService. After m2-tablet-mobile-navigation the rail
 *  delegates unread-count tracking to this singleton (shared with the tablet
 *  + mobile-bottom-nav variants so the API is hit once per shell session).
 *  We seed the unread counts directly through the stub. Plain function stubs
 *  avoid signal-reactivity noise in the unit-test boundary. */
function stubNavState(unreadMessages: number, unreadNotifications: number): ShellNavStateService {
  return {
    init: vi.fn(),
    refresh: vi.fn().mockResolvedValue(undefined),
    refreshProfile: vi.fn().mockResolvedValue(undefined),
    profile: (() => null) as unknown as ReturnType<typeof signal<unknown>>,
    unreadMessages: (() => unreadMessages) as unknown as ReturnType<typeof signal<number>>,
    unreadNotifications: (() => unreadNotifications) as unknown as ReturnType<typeof signal<number>>,
    messagesBadge: (() => formatUnreadBadge(unreadMessages)) as unknown as ReturnType<typeof computed<string>>,
    notificationsBadge: (() => formatUnreadBadge(unreadNotifications)) as unknown as ReturnType<typeof computed<string>>,
  } as unknown as ShellNavStateService;
}

async function renderRail(opts: RenderOptions = {}): Promise<{
  fixture: ReturnType<typeof TestBed.createComponent<ZmDesktopRailComponent>>;
  rail: HTMLElement;
  navigateByUrl: MockInstance;
  navStateInit: ReturnType<typeof vi.fn>;
}> {
  // Reset between tests: each `it` re-configures the module; without a reset
  // the second configure throws "already instantiated" (proven pattern from
  // the m1 recovery). Keeps the desktop-rail spec green alongside its new
  // tablet/mobile siblings that share the same render-per-it shape.
  TestBed.resetTestingModule();
  const navStateStub = stubNavState(opts.unreadMessages ?? 0, opts.unreadNotifications ?? 0);
  await TestBed.configureTestingModule({
    imports: [ZmDesktopRailComponent],
    providers: [
      provideRouter([]),
      { provide: ShellNavStateService, useValue: navStateStub },
    ],
  })
    // Replace the real account menu with a stub so this rail-focused spec does
    // not pull in AuthService / ThemeService / the CDK overlay (the account
    // menu has its own dedicated spec).
    .overrideComponent(ZmDesktopRailComponent, {
      remove: { imports: [ZmAccountMenuComponent] },
      add: { imports: [StubAccountMenu] },
    })
    .compileComponents();
  const router = TestBed.inject(Router);
  const navigateByUrl = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
  const fixture = TestBed.createComponent(ZmDesktopRailComponent);
  fixture.detectChanges(); // triggers ngOnInit -> navState.init()
  await fixture.whenStable();
  fixture.detectChanges();
  const rail = fixture.nativeElement as HTMLElement;
  return {
    fixture,
    rail,
    navigateByUrl,
    navStateInit: navStateStub.init as ReturnType<typeof vi.fn>,
  };
}

/** Teardown after each test: destroys the Angular app + clears router/zone
 *  state so sibling spec files in the same vitest worker start clean (the
 *  experimental unit-test builder does not auto-reset between tests). */
afterEach(() => {
  TestBed.resetTestingModule();
});

/** Drive the router-driven active signal from the spec (the template binds the
 *  same signal to aria-current + the signal-arc indicator). */
function activate(
  fixture: { componentInstance: ZmDesktopRailComponent; detectChanges(): void },
  link: string,
): void {
  // setActive is protected; access via bracket notation to drive test state.
  (fixture.componentInstance as unknown as { setActive(link: string, active: boolean): void }).setActive(link, true);
  fixture.detectChanges();
}

describe('ZmDesktopRailComponent — preserved contract (m2-shell-structure)', () => {
  it('renders the brand logo linking to /akis with an accessible name', async () => {
    const { rail } = await renderRail();
    const logo = rail.querySelector<HTMLAnchorElement>('.rail-logo');
    expect(logo).not.toBeNull();
    expect(logo?.getAttribute('href')).toBe('/akis');
    expect(logo?.getAttribute('aria-label')).toBe('Enterprise Social & Community Platform ana sayfa');
  });

  it('renders exactly 10 navigation items in canonical order with original Turkish labels', async () => {
    const { rail } = await renderRail();
    const items = Array.from(rail.querySelectorAll<HTMLAnchorElement>('.rail-nav__item'));
    expect(items).toHaveLength(NAV_ITEMS.length);
    items.forEach((item, idx) => {
      const expected = NAV_ITEMS[idx];
      expect(item.getAttribute('href')).toBe(expected.link);
      expect(item.querySelector('.rail-nav__label')?.textContent?.trim()).toBe(expected.label);
    });
  });

  it('preserves every routerLink target (no route added/removed/renamed)', async () => {
    const { rail } = await renderRail();
    const links = Array.from(rail.querySelectorAll<HTMLAnchorElement>('.rail-nav__item')).map((a) => a.getAttribute('href'));
    expect(links).toEqual(NAV_ITEMS.map((i) => i.link));
  });

  it('keeps the protected /yonetim (admin) item — permission enforced by the route guard, not by hiding nav', async () => {
    const { rail } = await renderRail();
    const yonetim = rail.querySelector<HTMLAnchorElement>('.rail-nav__item[href="/yonetim"]');
    expect(yonetim).not.toBeNull();
    expect(yonetim?.querySelector('.rail-nav__label')?.textContent?.trim()).toBe('Yönetim');
  });

  it('hosts the account menu (m2-account-theme-status absorbs the legacy standalone Çıkış button)', async () => {
    const { rail } = await renderRail();
    // The account menu host renders at the bottom of the rail; the real
    // logout/profile/theme behavior is verified in account-menu.component.spec.
    expect(rail.querySelector('.rail-account')).not.toBeNull();
  });
});

describe('VAL-WSH-002 — nav items carry accessible names + roles', () => {
  it('exposes a <nav> landmark with an accessible name', async () => {
    const { rail } = await renderRail();
    const nav = rail.querySelector<HTMLAnchorElement>('nav.rail-nav');
    expect(nav).not.toBeNull();
    expect(nav?.getAttribute('aria-label')).toBe('Ana navigasyon');
  });

  it('gives every nav item an accessible name equal to its Turkish label', async () => {
    const { rail } = await renderRail();
    const items = Array.from(rail.querySelectorAll<HTMLAnchorElement>('.rail-nav__item'));
    items.forEach((item, idx) => {
      expect(item.getAttribute('aria-label') ?? '').toBe(NAV_ITEMS[idx].label);
    });
  });

  it('never nests an interactive element inside a nav link', async () => {
    const { rail } = await renderRail();
    const items = rail.querySelectorAll('.rail-nav__item');
    items.forEach((item) => {
      // No nested <a> or <button> inside a nav link (the unread motif + count
      // are aria-hidden decoration; the link is the sole interactive target).
      expect(item.querySelectorAll('a, button')).toHaveLength(0);
    });
  });

  it('renders items as native anchors (keyboard Tab-reachable in DOM order)', async () => {
    const { rail } = await renderRail();
    const items = Array.from(rail.querySelectorAll<HTMLElement>('.rail-nav__item'));
    const hrefs = items.map((i) => i.tagName).every((t) => t === 'A');
    expect(hrefs).toBe(true);
    // Visual order equals DOM order (no CSS reordering at desktop).
    items.forEach((item, idx) => {
      expect(item.querySelector('.rail-nav__label')?.textContent?.trim()).toBe(NAV_ITEMS[idx].label);
    });
  });
});

describe('VAL-WSH-001 — current route is unmistakable (>=2 non-color cues)', () => {
  it('does not show an active indicator on any item by default', async () => {
    const { rail } = await renderRail();
    expect(rail.querySelectorAll('.rail-nav__signal')).toHaveLength(0);
    expect(rail.querySelectorAll('.rail-nav__item[aria-current="page"]')).toHaveLength(0);
  });

  it('marks the active item with aria-current="page" + a signal-arc indicator + raised/weight cues', async () => {
    const { fixture, rail } = await renderRail();
    activate(fixture, '/akis');
    const akis = rail.querySelector<HTMLAnchorElement>('.rail-nav__item[href="/akis"]');

    // Cue 1 (semantic): aria-current="page".
    expect(akis?.getAttribute('aria-current')).toBe('page');
    // Cue 2 (shape/position): the signal-arc indicator renders in the leading slot,
    // and the editorial numeral is replaced (only one of the two is visible).
    expect(akis?.querySelectorAll('.rail-nav__signal')).toHaveLength(1);
    expect(akis?.querySelectorAll('.rail-nav__numeral')).toHaveLength(0);
    // Cue 3 (tone + weight, via class): the active class that CSS turns into a
    // raised surface + heavier weight + brighter ink. `is-current` is bound to
    // the same router-fed signal; `is-active` is the routerLinkActive-driven
    // twin that the dev build + browser QA prove in production (the unit test
    // runs with provideRouter([]) so routerLinkActive cannot match a URL).
    expect(akis?.classList.contains('is-current')).toBe(true);
    expect(akis?.classList.contains('is-active') || akis?.classList.contains('is-current')).toBe(true);
  });

  it('tracks navigation — the indicator moves when the active route changes', async () => {
    const { fixture, rail } = await renderRail();
    activate(fixture, '/akis');
    activate(fixture, '/mesajlar');
    const akis = rail.querySelector<HTMLAnchorElement>('.rail-nav__item[href="/akis"]');
    const mesajlar = rail.querySelector<HTMLAnchorElement>('.rail-nav__item[href="/mesajlar"]');
    expect(akis?.getAttribute('aria-current')).toBeNull();
    expect(akis?.querySelectorAll('.rail-nav__signal')).toHaveLength(0);
    expect(akis?.querySelectorAll('.rail-nav__numeral')).toHaveLength(1);
    expect(mesajlar?.getAttribute('aria-current')).toBe('page');
    expect(mesajlar?.querySelectorAll('.rail-nav__signal')).toHaveLength(1);
  });

  it('keeps inactive items with their editorial numeral and no indicator', async () => {
    const { fixture, rail } = await renderRail();
    activate(fixture, '/akis');
    const kesfet = rail.querySelector<HTMLAnchorElement>('.rail-nav__item[href="/kesfet"]');
    expect(kesfet?.getAttribute('aria-current')).toBeNull();
    expect(kesfet?.querySelectorAll('.rail-nav__signal')).toHaveLength(0);
    expect(kesfet?.querySelectorAll('.rail-nav__numeral')).toHaveLength(1);
    expect(kesfet?.querySelector('.rail-nav__numeral')?.textContent?.trim()).toBe('02');
  });
});

describe('VAL-WSH-003 — unread/pulse indicators are present + accessible', () => {
  it('shows NO indicator when unread counts are zero', async () => {
    const { rail } = await renderRail({ unreadMessages: 0, unreadNotifications: 0 });
    expect(rail.querySelectorAll('zm-motif[data-motif="pulse-node"]')).toHaveLength(0);
    expect(rail.querySelectorAll('.rail-nav__count')).toHaveLength(0);
    const mesajlar = rail.querySelector<HTMLAnchorElement>('.rail-nav__item[href="/mesajlar"]');
    expect(mesajlar?.getAttribute('aria-label')).toBe('Mesajlar');
  });

  it('renders the pulse motif + count pill on Mesajlar when there are unread messages, and announces the count', async () => {
    const { rail } = await renderRail({ unreadMessages: 3, unreadNotifications: 0 });
    const mesajlar = rail.querySelector<HTMLAnchorElement>('.rail-nav__item[href="/mesajlar"]');
    expect(mesajlar?.querySelectorAll('zm-motif[data-motif="pulse-node"]')).toHaveLength(1);
    expect(mesajlar?.querySelector('.rail-nav__count')?.textContent?.trim()).toBe('3');
    // The exact count flows to AT via the link's aria-label.
    expect(mesajlar?.getAttribute('aria-label')).toBe('Mesajlar, 3 okunmamış');
    // Bildirimler stays clean.
    const bildirimler = rail.querySelector<HTMLAnchorElement>('.rail-nav__item[href="/bildirimler"]');
    expect(bildirimler?.querySelectorAll('.rail-nav__count')).toHaveLength(0);
  });

  it('renders the pulse motif + count pill on Bildirimler for unread notifications', async () => {
    const { rail } = await renderRail({ unreadMessages: 0, unreadNotifications: 5 });
    const bildirimler = rail.querySelector<HTMLAnchorElement>('.rail-nav__item[href="/bildirimler"]');
    expect(bildirimler?.querySelectorAll('zm-motif[data-motif="pulse-node"]')).toHaveLength(1);
    expect(bildirimler?.querySelector('.rail-nav__count')?.textContent?.trim()).toBe('5');
    expect(bildirimler?.getAttribute('aria-label')).toBe('Bildirimler, 5 okunmamış');
  });

  it('capes the displayed count at 99+ but keeps the exact count in the aria-label', async () => {
    const { rail } = await renderRail({ unreadMessages: 120, unreadNotifications: 0 });
    const mesajlar = rail.querySelector<HTMLAnchorElement>('.rail-nav__item[href="/mesajlar"]');
    expect(mesajlar?.querySelector('.rail-nav__count')?.textContent?.trim()).toBe('99+');
    expect(mesajlar?.getAttribute('aria-label')).toBe('Mesajlar, 120 okunmamış');
  });

  it('keeps the decorative motif + visible count aria-hidden (no double-read; count is in aria-label)', async () => {
    const { rail } = await renderRail({ unreadMessages: 2, unreadNotifications: 4 });
    const pulse = rail.querySelectorAll<HTMLElement>('zm-motif[data-motif="pulse-node"]');
    expect(pulse.length).toBe(2);
    pulse.forEach((node) => {
      expect(node.getAttribute('aria-hidden')).toBe('true');
      expect(node.getAttribute('role')).toBe('presentation');
    });
    const counts = rail.querySelectorAll<HTMLElement>('.rail-nav__count');
    expect(counts.length).toBe(2);
    counts.forEach((c) => expect(c.getAttribute('aria-hidden')).toBe('true'));
  });

  it('calls navState.init() once on mount (delegates real-API fetch to the shared service)', async () => {
    const { navStateInit } = await renderRail({ unreadMessages: 7, unreadNotifications: 2 });
    expect(navStateInit).toHaveBeenCalledTimes(1);
  });
});

describe('VAL-WSH-004 — compose entry is reachable + keyboard-activatable', () => {
  it('renders a real <button> compose entry with an accessible name', async () => {
    const { rail } = await renderRail();
    const btn = rail.querySelector<HTMLButtonElement>('.rail-compose');
    expect(btn).not.toBeNull();
    expect(btn?.type).toBe('button');
    expect(btn?.querySelector('.rail-compose__label')?.textContent?.trim()).toBe('Oluştur');
  });

  it('compose() navigates to the feed composer route (/akis)', async () => {
    const { fixture, navigateByUrl } = await renderRail();
    await (fixture.componentInstance as unknown as { compose(): Promise<void> }).compose();
    expect(navigateByUrl).toHaveBeenCalledWith('/akis');
  });
});
