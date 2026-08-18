import { TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Component, input } from '@angular/core';
import type { MockInstance } from 'vitest';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ShellNavStateService } from './shell-nav-state.service';
import { formatUnreadBadge } from './nav-catalog';
import { ZmTabletNavComponent } from './tablet-nav.component';
import { ZmAccountMenuComponent } from './account-menu.component';

/**
 * Lightweight stub for the account menu so the tablet-nav spec stays focused
 * on the rail's own contract. The account menu has its own dedicated spec.
 * Accepts the `compact` input the rail template binds.
 */
@Component({ selector: 'zm-account-menu', template: '<div class="stub-account-menu" aria-hidden="true"></div>' })
class StubAccountMenu {
  readonly compact = input(false);
}

/**
 * ZmTabletNav — focused verification for `m2-tablet-mobile-navigation`
 * (VAL-WSH-007 tablet slice).
 *
 * Covers:
 *   - VAL-WSH-007 — no squeezed-between-sidebars: 10 nav items, all
 *     routerLinks preserved, single persistent nav surface contract;
 *   - VAL-WSH-001 (carried into tablet) — active route unmistakable with
 *     >=2 NON-color cues (brand left inset bar + raised tone + brighter
 *     icon + aria-current="page"); tracks navigation;
 *   - VAL-WSH-002 (carried into tablet) — every item has an accessible name,
 *     is a real anchor (keyboard Tab-reachable in DOM order), no nested
 *     interactive elements;
 *   - VAL-WSH-003 (carried into tablet) — Mesajlar + Bildirimler show a real
 *     count badge when count > 0, exact count in aria-label;
 *   - VAL-WSH-004 (carried into tablet) — compose entry reachable +
 *     keyboard-activatable (real <button>);
 *   - VAL-WSH-007 context-drawer-reachable — Bağlam toggle emits
 *     contextToggle so the shell can open the on-demand sheet.
 */

const NAV_ITEMS: ReadonlyArray<{ readonly label: string; readonly link: string }> = [
  { label: 'Akış', link: '/akis' },
  { label: 'Keşfet', link: '/kesfet' },
  { label: 'Mesajlar', link: '/mesajlar' },
  { label: 'Bildirimler', link: '/bildirimler' },
  { label: 'Profil', link: '/profil' },
  { label: 'Bağlantılar', link: '/baglantilar' },
  { label: 'Sorular', link: '/sorular' },
  { label: 'Kaydedilenler', link: '/kaydedilenler' },
  { label: 'Ayarlar', link: '/ayarlar' },
  { label: 'Yönetim', link: '/yonetim' },
];

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

async function renderTabletNav(opts: { unreadMessages?: number; unreadNotifications?: number } = {}): Promise<{
  fixture: ReturnType<typeof TestBed.createComponent<ZmTabletNavComponent>>;
  rail: HTMLElement;
  navigateByUrl: MockInstance;
}> {
  // Reset between tests: each `it` re-configures the module; without a reset
  // the second configure throws "already instantiated" and the real-signal
  // stub from the previous test leaks (proven pattern from the m1 recovery).
  TestBed.resetTestingModule();
  const navStateStub = stubNavState(opts.unreadMessages ?? 0, opts.unreadNotifications ?? 0);
  await TestBed.configureTestingModule({
    imports: [ZmTabletNavComponent],
    providers: [
      provideRouter([]),
      { provide: ShellNavStateService, useValue: navStateStub },
    ],
  })
    // Replace the real account menu with a stub so this rail-focused spec does
    // not pull in AuthService / ThemeService / the CDK overlay.
    .overrideComponent(ZmTabletNavComponent, {
      remove: { imports: [ZmAccountMenuComponent] },
      add: { imports: [StubAccountMenu] },
    })
    .compileComponents();
  const router = TestBed.inject(Router);
  const navigateByUrl = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
  const fixture = TestBed.createComponent(ZmTabletNavComponent);
  fixture.detectChanges();
  await fixture.whenStable();
  const rail = fixture.nativeElement as HTMLElement;
  return { fixture, rail, navigateByUrl };
}

function activate(
  fixture: { componentInstance: ZmTabletNavComponent; detectChanges(): void },
  link: string,
): void {
  (fixture.componentInstance as unknown as { setActive(link: string, active: boolean): void }).setActive(link, true);
  fixture.detectChanges();
}

/** Teardown after each test: destroys the Angular app + clears router/zone
 *  state so sibling spec files in the same vitest worker start clean (the
 *  experimental unit-test builder does not auto-reset between tests). */
afterEach(() => {
  TestBed.resetTestingModule();
});

describe('ZmTabletNavComponent — VAL-WSH-007 (tablet compact rail)', () => {
  it('renders exactly 10 navigation items as native anchors with routerLinks preserved', async () => {
    const { rail } = await renderTabletNav();
    const items = Array.from(rail.querySelectorAll<HTMLAnchorElement>('.tablet-rail__item'));
    expect(items).toHaveLength(NAV_ITEMS.length);
    items.forEach((item, idx) => {
      expect(item.getAttribute('href')).toBe(NAV_ITEMS[idx].link);
    });
  });

  it('keeps the protected /yonetim (admin) item — permission enforced by the route guard', async () => {
    const { rail } = await renderTabletNav();
    const yonetim = rail.querySelector<HTMLAnchorElement>('.tablet-rail__item[href="/yonetim"]');
    expect(yonetim).not.toBeNull();
  });

  it('shows icon-only labels (no visible Turkish labels in the rail itself)', async () => {
    const { rail } = await renderTabletNav();
    // No <span class="tablet-rail__label"> exists in the template; labels
    // flow only through aria-label so the rail stays compact.
    expect(rail.querySelectorAll('.tablet-rail__label')).toHaveLength(0);
  });

  it('renders every nav icon from the shared ZmNavIcon family (no emoji / no library)', async () => {
    const { rail } = await renderTabletNav();
    const icons = rail.querySelectorAll('zm-nav-icon');
    expect(icons.length).toBeGreaterThanOrEqual(10); // 10 nav items + compose + context
    // Each icon exposes an authored SVG path (no <img>, no <use>, no emoji).
    icons.forEach((icon) => {
      const svg = icon.querySelector('svg');
      expect(svg).not.toBeNull();
      const shapeCount = svg?.querySelectorAll('path, circle, rect, line').length ?? 0;
      expect(shapeCount).toBeGreaterThan(0);
    });
  });
});

describe('ZmTabletNavComponent — VAL-WSH-002 (accessible names + roles)', () => {
  it('exposes a <nav> landmark with an accessible name', async () => {
    const { rail } = await renderTabletNav();
    const nav = rail.querySelector<HTMLElement>('nav.tablet-rail__nav');
    expect(nav).not.toBeNull();
    expect(nav?.getAttribute('aria-label')).toBe('Ana navigasyon');
  });

  it('gives every nav item an accessible name equal to its Turkish label', async () => {
    const { rail } = await renderTabletNav();
    const items = Array.from(rail.querySelectorAll<HTMLAnchorElement>('.tablet-rail__item'));
    items.forEach((item, idx) => {
      expect(item.getAttribute('aria-label') ?? '').toBe(NAV_ITEMS[idx].label);
    });
  });

  it('renders items as native anchors (keyboard Tab-reachable in DOM order)', async () => {
    const { rail } = await renderTabletNav();
    const items = Array.from(rail.querySelectorAll<HTMLElement>('.tablet-rail__item'));
    items.forEach((item) => expect(item.tagName).toBe('A'));
  });

  it('never nests an interactive element inside a nav link', async () => {
    const { rail } = await renderTabletNav();
    rail.querySelectorAll('.tablet-rail__item').forEach((item) => {
      expect(item.querySelectorAll('a, button')).toHaveLength(0);
    });
  });

  it('renders icons as aria-hidden (no double-read; the parent link owns the name)', async () => {
    const { rail } = await renderTabletNav();
    const icons = rail.querySelectorAll<HTMLElement>('zm-nav-icon');
    expect(icons.length).toBeGreaterThan(0);
    icons.forEach((icon) => {
      expect(icon.getAttribute('aria-hidden')).toBe('true');
    });
  });
});

describe('ZmTabletNavComponent — VAL-WSH-001 (active route unmistakable, >=2 NON-color cues)', () => {
  it('marks the active item with aria-current="page" + raised tone + brand left inset bar', async () => {
    const { fixture, rail } = await renderTabletNav();
    activate(fixture, '/akis');
    const akis = rail.querySelector<HTMLAnchorElement>('.tablet-rail__item[href="/akis"]');
    expect(akis?.getAttribute('aria-current')).toBe('page');
    expect(akis?.classList.contains('is-current')).toBe(true);
    expect(akis?.classList.contains('is-active') || akis?.classList.contains('is-current')).toBe(true);
  });

  it('tracks navigation — the active class + aria-current move when the route changes', async () => {
    const { fixture, rail } = await renderTabletNav();
    activate(fixture, '/akis');
    activate(fixture, '/mesajlar');
    const akis = rail.querySelector<HTMLAnchorElement>('.tablet-rail__item[href="/akis"]');
    const mesajlar = rail.querySelector<HTMLAnchorElement>('.tablet-rail__item[href="/mesajlar"]');
    expect(akis?.getAttribute('aria-current')).toBeNull();
    expect(akis?.classList.contains('is-current')).toBe(false);
    expect(mesajlar?.getAttribute('aria-current')).toBe('page');
    expect(mesajlar?.classList.contains('is-current')).toBe(true);
  });
});

describe('ZmTabletNavComponent — VAL-WSH-003 (unread indicators)', () => {
  it('shows NO badge when unread counts are zero', async () => {
    const { rail } = await renderTabletNav({ unreadMessages: 0, unreadNotifications: 0 });
    expect(rail.querySelectorAll('.tablet-rail__badge')).toHaveLength(0);
    const mesajlar = rail.querySelector<HTMLAnchorElement>('.tablet-rail__item[href="/mesajlar"]');
    expect(mesajlar?.getAttribute('aria-label')).toBe('Mesajlar');
  });

  it('renders a count badge on Mesajlar + announces the exact count in aria-label', async () => {
    const { rail } = await renderTabletNav({ unreadMessages: 3, unreadNotifications: 0 });
    const mesajlar = rail.querySelector<HTMLAnchorElement>('.tablet-rail__item[href="/mesajlar"]');
    expect(mesajlar?.querySelector('.tablet-rail__badge')?.textContent?.trim()).toBe('3');
    expect(mesajlar?.getAttribute('aria-label')).toBe('Mesajlar, 3 okunmamış');
    const bildirimler = rail.querySelector<HTMLAnchorElement>('.tablet-rail__item[href="/bildirimler"]');
    expect(bildirimler?.querySelectorAll('.tablet-rail__badge')).toHaveLength(0);
  });

  it('renders a count badge on Bildirimler for unread notifications', async () => {
    const { rail } = await renderTabletNav({ unreadMessages: 0, unreadNotifications: 5 });
    const bildirimler = rail.querySelector<HTMLAnchorElement>('.tablet-rail__item[href="/bildirimler"]');
    expect(bildirimler?.querySelector('.tablet-rail__badge')?.textContent?.trim()).toBe('5');
    expect(bildirimler?.getAttribute('aria-label')).toBe('Bildirimler, 5 okunmamış');
  });

  it('caps the displayed count at 99+', async () => {
    const { rail } = await renderTabletNav({ unreadMessages: 120, unreadNotifications: 0 });
    const mesajlar = rail.querySelector<HTMLAnchorElement>('.tablet-rail__item[href="/mesajlar"]');
    expect(mesajlar?.querySelector('.tablet-rail__badge')?.textContent?.trim()).toBe('99+');
  });

  it('keeps the badge aria-hidden (count flows through aria-label)', async () => {
    const { rail } = await renderTabletNav({ unreadMessages: 2, unreadNotifications: 4 });
    const badges = rail.querySelectorAll<HTMLElement>('.tablet-rail__badge');
    expect(badges.length).toBe(2);
    badges.forEach((b) => expect(b.getAttribute('aria-hidden')).toBe('true'));
  });
});

describe('ZmTabletNavComponent — VAL-WSH-004 (compose entry reachable)', () => {
  it('renders a real <button> compose entry with an accessible name', async () => {
    const { rail } = await renderTabletNav();
    const btn = rail.querySelector<HTMLButtonElement>('.tablet-rail__compose');
    expect(btn).not.toBeNull();
    expect(btn?.type).toBe('button');
    expect(btn?.getAttribute('aria-label')).toContain('Oluştur');
  });

  it('compose() navigates to /akis', async () => {
    const { fixture, navigateByUrl } = await renderTabletNav();
    await (fixture.componentInstance as unknown as { compose(): Promise<void> }).compose();
    expect(navigateByUrl).toHaveBeenCalledWith('/akis');
  });
});

describe('ZmTabletNavComponent — VAL-WSH-007 context drawer on-demand', () => {
  it('renders a context-toggle button that emits contextToggle', async () => {
    const { fixture, rail } = await renderTabletNav();
    const btn = rail.querySelector<HTMLButtonElement>('.tablet-rail__context');
    expect(btn).not.toBeNull();
    expect(btn?.getAttribute('aria-label')).toContain('Bağlam');
    const emitted: VoidFunction[] = [];
    fixture.componentInstance.contextToggle.subscribe(() => emitted.push(undefined as unknown as VoidFunction));
    btn?.click();
    expect(emitted.length).toBe(1);
  });
});

describe('ZmTabletNavComponent — preserved contract', () => {
  it('hosts the account menu (m2-account-theme-status absorbs the legacy signout icon)', async () => {
    const { rail } = await renderTabletNav();
    // The compact account menu renders at the bottom of the rail; real logout
    // behavior is verified in account-menu.component.spec.
    expect(rail.querySelector('.tablet-rail__account')).not.toBeNull();
  });
});
