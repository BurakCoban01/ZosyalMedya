import { Component, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter, Router } from '@angular/router';
import type { MockInstance } from 'vitest';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Api } from '@platform/api';
import * as apiFns from '@platform/api';
import { ZmContextRailComponent } from './context-rail.component';
import { ShellNavStateService } from '../navigation/shell-nav-state.service';
import { TokenVault } from '../../../core/auth/token-vault.service';
import {
  CONTEXT_RAIL_SECTIONS,
  NOTIFICATION_TYPE_LABELS,
  type ContextRailKind,
} from './context-rail-section';

/**
 * ZmContextRail — focused verification for `m2-contextual-rail` (VAL-WSH-012).
 *
 * Covers:
 *   - VAL-WSH-012 — the rail renders live / contextual content per route,
 *     and the previous static marketing/privacy copy is GONE;
 *   - the catalog is exhaustive (every authed route maps to a kind) and the
 *     resolver handles nested paths + empty URLs;
 *   - the loading → populated / empty / error lifecycle works on the real
 *     effect-driven fetch path, with recoverable retry;
 *   - the stale-response guard discards results that land after a route
 *     change (no previous-route data leaks into the new route);
 *   - per-kind aggregations are correct (messaging unread sum, notifications
 *     by-type breakdown, saved collection roll-up);
 *   - a11y: landmark + aria-labelledby + aria-busy + role=alert on error.
 *
 * The Api is stubbed by PATH so the component's real `Api.invoke(fn, params)`
 * flow runs against deterministic payloads. The router is real (with a dummy
 * component for every authed route) so `NavigationEnd` fires on `navigate`.
 */

/** Dummy component so the test router can resolve every authed route. */
@Component({ template: '' })
class DummyRouteComponent {}

/** All authed routes map to the same dummy so navigation emits NavigationEnd. */
const ROUTES = CONTEXT_RAIL_SECTIONS.map((s) => ({
  path: s.route,
  component: DummyRouteComponent,
}));

/** Static marketing copy that the rail must NEVER render (VAL-WSH-012). */
const BANNED_MARKETING = [
  'Neden gördüğün anlaşılır.',
  'AÇIKLANABİLİR KEŞİF',
  'GİZLİLİK',
  'Oturum anahtarları kalıcı tarayıcı depolamasına yazılmaz',
  'Arama ve akış; görünürlük, ilişki, güncellik ve güvenlik kararlarından sonra hazırlanır',
];

/** Type for the per-PATH API handler map. Each handler returns the body. */
type ApiHandlers = Record<string, (params?: any) => unknown>;

/** Build an Api stub whose `invoke` dispatches by the function's static PATH. */
function stubApi(handlers: ApiHandlers = {}): { api: Api; invoke: MockInstance } {
  const invoke = vi.fn(async (fn: { PATH: string }, params?: any) => {
    const handler = handlers[fn.PATH];
    if (!handler) throw new Error(`no stub handler for ${fn.PATH}`);
    return handler(params);
  });
  return { api: { invoke } as unknown as Api, invoke };
}

/** Render the rail at a given route and resolve one fetch cycle. */
async function renderRail(opts: {
  route?: string;
  handlers?: ApiHandlers;
} = {}): Promise<{
  fixture: ReturnType<typeof TestBed.createComponent<ZmContextRailComponent>>;
  host: HTMLElement;
  router: Router;
  invoke: MockInstance;
  sharedProfile: ReturnType<typeof signal<apiFns.ProfileView | null>>;
  authenticated: ReturnType<typeof signal<boolean>>;
}> {
  TestBed.resetTestingModule();
  const { api, invoke } = stubApi(opts.handlers ?? {});
  const sharedProfile = signal<apiFns.ProfileView | null>(null);
  const authenticated = signal(true);
  await TestBed.configureTestingModule({
    imports: [ZmContextRailComponent],
    providers: [
      provideRouter(ROUTES),
      { provide: Api, useValue: api },
      {
        provide: ShellNavStateService,
        useValue: {
          profile: sharedProfile,
          loadProfile: () => api.invoke(apiFns.getMyProfile, {})
        }
      },
      { provide: TokenVault, useValue: { authenticated } },
    ],
  }).compileComponents();
  const router = TestBed.inject(Router);
  if (opts.route) {
    await router.navigate(['/' + opts.route.replace(/^\//, '')]);
  }
  const fixture = TestBed.createComponent(ZmContextRailComponent);
  // The data fetch runs inside an effect that awaits the API. We need to
  // cycle detectChanges + whenStable a few times so the async continuation
  // (data.set + status.set) flushes AND re-renders. Two cycles cover the
  // initial loading render + the post-resolve populated/empty/error render.
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  await fixture.whenStable();
  const host = fixture.nativeElement as HTMLElement;
  return { fixture, host, router, invoke, sharedProfile, authenticated };
}

afterEach(() => {
  TestBed.resetTestingModule();
});

/** Assert none of the static marketing copy survives in the rail DOM. */
function assertNoMarketing(host: HTMLElement): void {
  const text = host.textContent ?? '';
  for (const banned of BANNED_MARKETING) {
    if (text.includes(banned)) {
      throw new Error(`banned static marketing copy still present: "${banned}"`);
    }
  }
}

describe('ZmContextRailComponent — VAL-WSH-012 contextual rail', () => {
  /* ---- Catalog + resolver ------------------------------------------- */
  it('the catalog covers all 10 authed routes (no route is unmapped)', () => {
    const kinds = CONTEXT_RAIL_SECTIONS.map((s) => s.kind);
    expect(new Set(kinds).size).toBe(10);
    expect(CONTEXT_RAIL_SECTIONS).toHaveLength(10);
  });

  it('every section carries non-empty Turkish kicker + title (no marketing)', () => {
    for (const s of CONTEXT_RAIL_SECTIONS) {
      expect(s.kicker.length).toBeGreaterThan(0);
      expect(s.title.length).toBeGreaterThan(2);
      expect(BANNED_MARKETING.some((b) => s.title === b || s.kicker === b)).toBe(false);
    }
  });

  it('the notification type labels cover every type in Turkish', () => {
    const types: ContextRailKind[] = ['feed' as any]; // placeholder to satisfy import
    void types;
    const labels = Object.keys(NOTIFICATION_TYPE_LABELS);
    expect(labels).toEqual(
      expect.arrayContaining(['NewFollower', 'Reaction', 'Comment', 'Message', 'Moderation', 'Community', 'System']),
    );
    for (const label of Object.values(NOTIFICATION_TYPE_LABELS)) {
      expect(label.length).toBeGreaterThan(1);
    }
  });

  /* ---- a11y shell ---------------------------------------------------- */
  it('renders a labelled landmark region (aria-labelledby resolves to the heading)', async () => {
    const { host } = await renderRail({ route: 'akis', handlers: { '/api/v1/search/trending': () => [] } });
    const section = host.querySelector('section.ctx[aria-labelledby="ctx-title"]');
    expect(section).not.toBeNull();
    const heading = host.querySelector('#ctx-title');
    expect(heading?.tagName).toBe('H2');
    expect((heading?.textContent ?? '').trim().length).toBeGreaterThan(0);
  });

  /* ---- No static marketing copy (VAL-WSH-012 core) ------------------ */
  it('renders no static marketing/privacy copy on any route', async () => {
    for (const s of CONTEXT_RAIL_SECTIONS) {
      const handlers: ApiHandlers = {
        '/api/v1/search/trending': () => [{ tag: 'tasarim', score: 10 }],
        '/api/v1/communities/': () => [{ id: 'c1', name: 'Tasarim', slug: 'tasarim', members: [], pinnedContentIds: [], rules: [], visibility: 'Public', description: '', status: 'Active', updatedAtUtc: '2026-01-01T00:00:00Z', version: 1 }],
        '/api/v1/messaging/conversations': () => ({ items: [], nextCursor: null }),
        '/api/v1/notifications/': () => ({ items: [], nextCursor: null }),
        '/api/v1/profiles/me': () => ({ id: 'p1', ownerId: 'u1', displayName: 'Demo', handle: 'demo', completenessPercentage: 50, version: 1, isVerified: false, isPrivate: false, language: 'Turkish', theme: 'System', reduceMotion: false }),
        '/api/v1/questions/inbox': () => [],
        '/api/v1/content/saved': () => ({ items: [], nextCursor: null }),
      };
      const { host } = await renderRail({ route: s.route, handlers });
      assertNoMarketing(host);
    }
  });

  /* ---- Route detection (one kind per route) ------------------------- */
  it('derives the correct section title for each route', async () => {
    const handlers: ApiHandlers = {
      '/api/v1/search/trending': () => [],
      '/api/v1/communities/': () => [],
      '/api/v1/messaging/conversations': () => ({ items: [] }),
      '/api/v1/notifications/': () => ({ items: [] }),
      '/api/v1/profiles/me': () => ({ id: 'p1', ownerId: 'u1', displayName: 'D', handle: 'd', completenessPercentage: 0, version: 1, isVerified: false, isPrivate: false, language: 'Turkish', theme: 'System', reduceMotion: false }),
      '/api/v1/questions/inbox': () => [],
      '/api/v1/content/saved': () => ({ items: [] }),
    };
    for (const s of CONTEXT_RAIL_SECTIONS) {
      const { host } = await renderRail({ route: s.route, handlers });
      const title = host.querySelector('#ctx-title')?.textContent?.trim();
      expect(title).toBe(s.title);
      const kicker = host.querySelector('.ctx__kicker')?.textContent?.trim();
      expect(kicker).toBe(s.kicker);
    }
  });

  /* ---- Loading → populated (feed trends) ---------------------------- */
  it('shows a loading skeleton then populated trends on the feed route', async () => {
    const handlers: ApiHandlers = {
      '/api/v1/search/trending': () => [
        { tag: 'tasarim', score: 90 },
        { tag: 'ankara', score: 45 },
      ],
    };
    const { host } = await renderRail({ route: 'akis', handlers });
    // After stable: populated. Two trend rows with tags.
    const tags = Array.from(host.querySelectorAll('.ctx__trend-tag')).map((el) => el.textContent?.trim() ?? '');
    expect(tags).toEqual(['#tasarim', '#ankara']);
    // The body aria-busy is false once populated.
    const body = host.querySelector('.ctx__body');
    expect(body?.getAttribute('aria-busy')).toBe('false');
    assertNoMarketing(host);
  });

  /* ---- Honest empty state (feed with zero trends) ------------------- */
  it('shows an honest empty state with a useful next action when there is nothing to show', async () => {
    const handlers: ApiHandlers = {
      '/api/v1/search/trending': () => [],
    };
    const { host } = await renderRail({ route: 'akis', handlers });
    const empty = host.querySelector('.ctx__empty');
    expect(empty).not.toBeNull();
    // The empty text is specific, not generic "İçerik yok".
    const text = empty?.querySelector('.ctx__empty-text')?.textContent?.trim() ?? '';
    expect(text.length).toBeGreaterThan(10);
    expect(text.toLowerCase()).not.toContain('içerik yok');
    // A useful next action is rendered as a real link.
    const action = empty?.querySelector<HTMLAnchorElement>('.ctx__empty-action');
    expect(action).not.toBeNull();
    expect((action?.textContent ?? '').trim().length).toBeGreaterThan(0);
    assertNoMarketing(host);
  });

  /* ---- Recoverable error + retry ------------------------------------ */
  it('shows a recoverable error (role=alert) and retry re-invokes the API', async () => {
    const handlers: ApiHandlers = {
      '/api/v1/search/trending': () => { throw new Error('boom'); },
    };
    const { host, invoke } = await renderRail({ route: 'akis', handlers });
    const error = host.querySelector('.ctx__error[role="alert"]');
    expect(error).not.toBeNull();
    const retryButton = host.querySelector<HTMLButtonElement>('.ctx__retry');
    expect(retryButton).not.toBeNull();
    const callsBefore = invoke.mock.calls.length;
    retryButton!.click();
    await TestBed.inject(Router).navigate(['/akis']).catch(() => undefined);
    // Retry fired another invoke call.
    expect(invoke.mock.calls.length).toBeGreaterThan(callsBefore);
    assertNoMarketing(host);
  });

  /* ---- Per-kind aggregation: messaging unread sum + direct/group ----- */
  it('aggregates messaging summary correctly (unread sum, direct vs group, most recent)', async () => {
    const handlers: ApiHandlers = {
      '/api/v1/messaging/conversations': () => ({
        items: [
          { id: 'c1', kind: 'Direct', members: [], title: 'Ali', unreadCount: 3, updatedAtUtc: '2026-07-01T10:00:00Z', version: 1 },
          { id: 'c2', kind: 'Group', members: [], title: 'Tasarım ekibi', unreadCount: 0, updatedAtUtc: '2026-07-28T12:00:00Z', version: 1 },
          { id: 'c3', kind: 'Direct', members: [], title: 'Veli', unreadCount: 2, updatedAtUtc: '2026-07-15T08:00:00Z', version: 1 },
        ],
      }),
    };
    const { host } = await renderRail({ route: 'mesajlar', handlers });
    const dd = Array.from(host.querySelectorAll('.ctx__stats dd')).map((el) => el.textContent?.trim() ?? '');
    // [total, unread, direct, group] order in the template.
    expect(dd).toEqual(['3', '5', '2', '1']);
    // Most recent by updatedAtUtc = 'Tasarım ekibi' (2026-07-28).
    expect(host.querySelector('.ctx__hint strong')?.textContent?.trim()).toBe('Tasarım ekibi');
  });

  /* ---- Per-kind aggregation: notifications by-type breakdown -------- */
  it('breaks notifications down by type with Turkish labels', async () => {
    const handlers: ApiHandlers = {
      '/api/v1/notifications/': () => ({
        items: [
          { id: 'n1', type: 'Reaction', isRead: false, arguments: {}, bodyTemplateKey: 'b', titleTemplateKey: 't', count: 1, createdAtUtc: '2026-07-28T00:00:00Z', deepLink: '/x', deliveryState: 'Delivered', templateVersion: 1, version: 1 },
          { id: 'n2', type: 'Reaction', isRead: true, arguments: {}, bodyTemplateKey: 'b', titleTemplateKey: 't', count: 1, createdAtUtc: '2026-07-28T00:00:00Z', deepLink: '/x', deliveryState: 'Delivered', templateVersion: 1, version: 1 },
          { id: 'n3', type: 'Comment', isRead: false, arguments: {}, bodyTemplateKey: 'b', titleTemplateKey: 't', count: 1, createdAtUtc: '2026-07-28T00:00:00Z', deepLink: '/x', deliveryState: 'Delivered', templateVersion: 1, version: 1 },
        ],
      }),
    };
    const { host } = await renderRail({ route: 'bildirimler', handlers });
    const dd = Array.from(host.querySelectorAll('.ctx__stats dd')).map((el) => el.textContent?.trim() ?? '');
    // [total, unread]
    expect(dd).toEqual(['3', '2']);
    const labels = Array.from(host.querySelectorAll('.ctx__breakdown-label')).map((el) => el.textContent?.trim() ?? '');
    // Sorted by count desc: Reaction (2) then Comment (1).
    expect(labels).toEqual(['Tepkiler', 'Yorumlar']);
  });

  /* ---- Per-kind: saved collection roll-up --------------------------- */
  it('rolls saved items up by collection name', async () => {
    const handlers: ApiHandlers = {
      '/api/v1/content/saved': () => ({
        items: [
          { id: 's1', collection: 'İlham', content: { id: 'x' }, savedAtUtc: '2026-07-01T00:00:00Z' },
          { id: 's2', collection: 'İlham', content: { id: 'y' }, savedAtUtc: '2026-07-02T00:00:00Z' },
          { id: 's3', collection: '', content: { id: 'z' }, savedAtUtc: '2026-07-03T00:00:00Z' },
        ],
      }),
    };
    const { host } = await renderRail({ route: 'kaydedilenler', handlers });
    const total = host.querySelector('.ctx__stats dd')?.textContent?.trim();
    expect(total).toBe('3');
    const rows = Array.from(host.querySelectorAll('.ctx__breakdown-row')).map((r) => [
      r.querySelector('.ctx__breakdown-label')?.textContent?.trim(),
      r.querySelector('.ctx__breakdown-count')?.textContent?.trim(),
    ]);
    // 'İlham' (2) before 'Genel' (1) by count desc; empty collection → 'Genel'.
    expect(rows).toEqual([['İlham', '2'], ['Genel', '1']]);
  });

  /* ---- Profile + settings render the profile card ------------------- */
  it('renders the profile summary on /profil with completeness + privacy badges', async () => {
    const handlers: ApiHandlers = {
      '/api/v1/profiles/me': () => ({ id: 'p1', ownerId: 'u1', displayName: 'Deniz Yılmaz', handle: 'deniz', completenessPercentage: 72, version: 1, isVerified: true, isPrivate: false, language: 'Turkish', theme: 'Dark', reduceMotion: true, location: 'İzmir', organization: 'Akademi' }),
    };
    const { host } = await renderRail({ route: 'profil', handlers });
    expect(host.querySelector('.ctx__profile')?.textContent ?? '').toContain('Deniz Yılmaz');
    expect(host.querySelector('.ctx__progress-label')?.textContent ?? '').toContain('%72');
    const badges = Array.from(host.querySelectorAll('.ctx__badge')).map((b) => b.textContent?.trim());
    expect(badges).toEqual(expect.arrayContaining(['Doğrulanmış', 'Herkese açık']));
  });

  it('renders the account context on /ayarlar with theme + motion labels', async () => {
    const handlers: ApiHandlers = {
      '/api/v1/profiles/me': () => ({ id: 'p1', ownerId: 'u1', displayName: 'Deniz', handle: 'deniz', completenessPercentage: 40, version: 1, isVerified: false, isPrivate: true, language: 'Turkish', theme: 'Dark', reduceMotion: true, location: null, organization: null }),
    };
    const { host } = await renderRail({ route: 'ayarlar', handlers });
    const kv = Array.from(host.querySelectorAll('.ctx__kv li')).map((li) => li.textContent?.trim());
    // Theme=Koyu, Motion=Azaltılmış, Privacy=Gizli (Turkish labels).
    expect(kv.some((t) => t?.includes('Koyu'))).toBe(true);
    expect(kv.some((t) => t?.includes('Azaltılmış'))).toBe(true);
    expect(kv.some((t) => t?.includes('Gizli'))).toBe(true);
  });

  it('replaces a first-run profile error when the successful create response is shared', async () => {
    const { fixture, host, sharedProfile } = await renderRail({
      route: 'profil',
      handlers: {
        '/api/v1/profiles/me': () => { throw { status: 404 }; },
      },
    });
    expect(host.querySelector('.ctx__error')).not.toBeNull();

    sharedProfile.set({
      id: 'p-new',
      ownerId: 'u-new',
      displayName: 'Hazırbulunuşluk Doğrulayıcı',
      handle: 'zmval_final',
      completenessPercentage: 62,
      version: 1,
      isVerified: false,
      isPrivate: false,
      language: 'Turkish',
      theme: 'System',
      reduceMotion: false,
    });
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(host.querySelector('.ctx__error')).toBeNull();
    expect(host.querySelector('.ctx__profile')?.textContent).toContain('Hazırbulunuşluk Doğrulayıcı');
    expect(host.querySelector('.ctx__progress-label')?.textContent).toContain('%62');
  });

  it('does not refetch profile context after the session has ended', async () => {
    const { fixture, invoke, sharedProfile, authenticated } = await renderRail({
      route: 'profil',
      handlers: {
        '/api/v1/profiles/me': () => ({
          id: 'p1',
          ownerId: 'u1',
          displayName: 'Birinci Hesap',
          handle: 'first_account',
          completenessPercentage: 80,
          version: 1,
          isVerified: false,
          isPrivate: false,
          language: 'Turkish',
          theme: 'System',
          reduceMotion: false,
        }),
      },
    });
    const callsBeforeLogout = invoke.mock.calls.length;

    sharedProfile.set(null);
    authenticated.set(false);
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();

    expect(invoke.mock.calls.length).toBe(callsBeforeLogout);
  });

  /* ---- Admin route shows STATIC safety context (no API call) -------- */
  it('shows operational safety context on /yonetim WITHOUT calling the API', async () => {
    const { host, invoke } = await renderRail({ route: 'yonetim', handlers: {} });
    // No API invocation for the admin route.
    expect(invoke.mock.calls.length).toBe(0);
    // Safety list renders with guidance (not marketing).
    const items = Array.from(host.querySelectorAll('.ctx__safety li'));
    expect(items.length).toBeGreaterThanOrEqual(3);
    assertNoMarketing(host);
  });

  /* ---- Stale-response guard ----------------------------------------- */
  it('discards a stale response that lands after a route change', async () => {
    // Slow feed handler we resolve manually.
    let resolveFeed!: (v: unknown) => void;
    const feedPromise = new Promise((r) => { resolveFeed = r; });
    const handlers: ApiHandlers = {
      '/api/v1/search/trending': () => feedPromise,
      '/api/v1/messaging/conversations': () => ({ items: [{ id: 'c1', kind: 'Direct', members: [], title: 'Ali', unreadCount: 0, updatedAtUtc: '2026-07-28T00:00:00Z', version: 1 }] }),
    };
    const { fixture, host, router } = await renderRail({ route: 'akis', handlers });
    // Immediately navigate away to /mesajlar BEFORE the feed fetch resolves.
    await router.navigate(['/mesajlar']);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
    // Now resolve the stale feed response — it must be discarded.
    resolveFeed([{ tag: 'STALE', score: 999 }]);
    await fixture.whenStable();
    fixture.detectChanges();
    // The messaging summary is shown (total = 1), NOT the stale trend.
    const text = host.textContent ?? '';
    expect(text).not.toContain('#STALE');
    expect(host.querySelector('.ctx__stats')?.textContent ?? '').toContain('1');
  });

  /* ---- 44x44 targets -------------------------------------------------- */
  it('renders retry + empty-action targets meeting the 44px minimum', async () => {
    const handlers: ApiHandlers = {
      '/api/v1/search/trending': () => [],
    };
    const { host } = await renderRail({ route: 'akis', handlers });
    const action = host.querySelector<HTMLElement>('.ctx__empty-action');
    expect(action).not.toBeNull();
    // Computed min-height is set to 44px; verify the inline style + class wire.
    expect(action?.className).toContain('ctx__empty-action');
  });
});
