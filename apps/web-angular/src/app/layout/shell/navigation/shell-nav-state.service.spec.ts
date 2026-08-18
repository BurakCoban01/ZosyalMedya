import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Api, getMyProfile, listConversations, listNotifications, type ProfileView } from '@platform/api';
import { describe, expect, it, vi } from 'vitest';
import { TokenVault } from '../../../core/auth/token-vault.service';
import { MessagingRealtimeService } from '../../../core/realtime/messaging-realtime.service';
import { ShellNavStateService } from './shell-nav-state.service';

/**
 * ShellNavStateService — focused verification for `m2-tablet-mobile-navigation`.
 *
 * The service is the singleton owner of unread counts so the three nav
 * variants (desktop rail, tablet compact rail, mobile-web bottom bar) do NOT
 * each fire their own listConversations + listNotifications round-trips.
 *
 * Contract:
 *   - `init()` is idempotent — only the first call triggers refresh +
 *     realtime wiring;
 *   - `refresh()` aggregates real-API counts (sum conversation unreadCount,
 *     count !isRead notifications) and updates the signals;
 *   - failure on one endpoint does not discard the other (Promise.allSettled);
 *   - the displayed badge caps at 99+ but the exact count stays available to
 *     AT via the link aria-label (consumed by each nav variant).
 */

function stubRealtime() {
  return {
    onMessage: vi.fn(() => () => undefined),
    onNotification: vi.fn(() => () => undefined),
    connect: vi.fn().mockResolvedValue(undefined),
    disconnect: vi.fn().mockResolvedValue(undefined),
  };
}

function stubApi(opts: {
  conversationUnread?: number[];
  notificationUnread?: number;
  conversationsReject?: boolean;
  notificationsReject?: boolean;
  profile?: ProfileView;
  profilePromise?: Promise<ProfileView>;
} = {}) {
  return {
    invoke: vi.fn(async (operation: unknown) => {
      if (operation === listConversations) {
        if (opts.conversationsReject) throw new Error('network');
        const items = (opts.conversationUnread ?? [0]).map((u) => ({ unreadCount: u }));
        return { items, nextCursor: null };
      }
      if (operation === listNotifications) {
        if (opts.notificationsReject) throw new Error('network');
        const unread = opts.notificationUnread ?? 0;
        return {
          items: Array.from({ length: unread }, () => ({ isRead: false })),
          nextCursor: null,
        };
      }
      if (operation === getMyProfile) {
        if (opts.profilePromise) return opts.profilePromise;
        if (opts.profile) return opts.profile;
        throw new Error('profile unavailable');
      }
      return { items: [] };
    }),
  };
}

async function makeService(opts: Parameters<typeof stubApi>[0] = {}): Promise<{
  service: ShellNavStateService;
  apiInvoke: ReturnType<typeof vi.fn>;
  realtimeConnect: ReturnType<typeof vi.fn>;
  realtimeDisconnect: ReturnType<typeof vi.fn>;
  accessToken: ReturnType<typeof signal<string | null>>;
}> {
  const api = stubApi(opts);
  const realtime = stubRealtime();
  const accessToken = signal<string | null>('validator-token');
  await TestBed.configureTestingModule({
    providers: [
      { provide: Api, useValue: api },
      { provide: MessagingRealtimeService, useValue: realtime },
      { provide: TokenVault, useValue: { authenticated: () => accessToken() !== null } },
    ],
  }).compileComponents();
  const service = TestBed.inject(ShellNavStateService);
  return {
    service,
    apiInvoke: api.invoke,
    realtimeConnect: realtime.connect,
    realtimeDisconnect: realtime.disconnect,
    accessToken,
  };
}

describe('ShellNavStateService — m2-tablet-mobile-navigation shared state', () => {
  it('starts at zero unread counts (no fabricated indicator)', async () => {
    const { service } = await makeService();
    expect(service.unreadMessages()).toBe(0);
    expect(service.unreadNotifications()).toBe(0);
    expect(service.messagesBadge()).toBe('0');
    expect(service.notificationsBadge()).toBe('0');
  });

  it('init() is idempotent — only the first call triggers refresh + realtime', async () => {
    const { service, apiInvoke, realtimeConnect } = await makeService({ conversationUnread: [3], notificationUnread: 1 });
    service.init();
    service.init();
    service.init();
    // Let the async refresh settle.
    await Promise.resolve();
    await Promise.resolve();
    // The realtime listeners are registered exactly once.
    expect(realtimeConnect).toHaveBeenCalledTimes(1);
    // The API is hit at most once per refresh call (init triggers exactly one).
    const invokeCount = apiInvoke.mock.calls.length;
    expect(invokeCount).toBeGreaterThanOrEqual(2); // listConversations + listNotifications
    expect(invokeCount).toBeLessThanOrEqual(3);
  });

  it('refresh() aggregates conversation unreadCount sum into unreadMessages', async () => {
    const { service } = await makeService({ conversationUnread: [0, 5, 3, 0, 2] });
    await service.refresh();
    expect(service.unreadMessages()).toBe(10);
  });

  it('refresh() counts !isRead notifications into unreadNotifications', async () => {
    const { service } = await makeService({ notificationUnread: 4 });
    await service.refresh();
    expect(service.unreadNotifications()).toBe(4);
  });

  it('Promise.allSettled — a conversations failure does not discard notifications', async () => {
    const { service } = await makeService({
      conversationsReject: true,
      notificationUnread: 6,
    });
    await service.refresh();
    // Conversations failure leaves the previous value (0) intact.
    expect(service.unreadMessages()).toBe(0);
    // Notifications still resolved.
    expect(service.unreadNotifications()).toBe(6);
  });

  it('Promise.allSettled — a notifications failure does not discard conversations', async () => {
    const { service } = await makeService({
      conversationUnread: [7, 1],
      notificationsReject: true,
    });
    await service.refresh();
    expect(service.unreadMessages()).toBe(8);
    expect(service.unreadNotifications()).toBe(0);
  });

  it('messagesBadge caps at 99+ for the visible digit (aria-label keeps the exact count via the variant)', async () => {
    const { service } = await makeService({ conversationUnread: [120] });
    await service.refresh();
    expect(service.messagesBadge()).toBe('99+');
    // The exact count stays available to the variant's aria-label.
    expect(service.unreadMessages()).toBe(120);
  });

  it('notificationsBadge caps at 99+ for the visible digit', async () => {
    const { service } = await makeService({ notificationUnread: 250 });
    await service.refresh();
    expect(service.notificationsBadge()).toBe('99+');
    expect(service.unreadNotifications()).toBe(250);
  });

  it('publishes a trusted profile response to shell consumers immediately', async () => {
    const { service } = await makeService();
    const profile = {
      id: 'profile-id',
      ownerId: 'owner-id',
      displayName: 'Hazırbulunuşluk Doğrulayıcı',
      handle: 'zmval_final',
      completenessPercentage: 62,
      version: 1,
      isVerified: false,
      isPrivate: false,
      language: 'Turkish',
      theme: 'System',
      reduceMotion: false,
    } satisfies ProfileView;

    service.syncProfile(profile);

    expect(service.profile()).toBe(profile);
  });

  it('coalesces concurrent profile consumers into one API request', async () => {
    const profile = {
      id: 'profile-id', ownerId: 'owner-id', displayName: 'Demo Kullanıcı',
      handle: 'demo_user', completenessPercentage: 88, version: 1,
      isVerified: true, isPrivate: false, language: 'Turkish', theme: 'Light',
      reduceMotion: false,
    } satisfies ProfileView;
    let resolveProfile!: (value: ProfileView) => void;
    const profilePromise = new Promise<ProfileView>(resolve => { resolveProfile = resolve; });
    const { service, apiInvoke } = await makeService({ profilePromise });

    const first = service.loadProfile();
    const second = service.loadProfile();
    const third = service.loadProfile();
    resolveProfile(profile);

    await expect(Promise.all([first, second, third])).resolves.toEqual([profile, profile, profile]);
    expect(apiInvoke.mock.calls.filter(([operation]) => operation === getMyProfile)).toHaveLength(1);
    expect(service.profile()).toBe(profile);
  });

  it('clears user-scoped shell state and realtime transport when authentication ends', async () => {
    const {
      service,
      accessToken,
      realtimeDisconnect,
    } = await makeService({ conversationUnread: [4], notificationUnread: 3 });
    const profile = {
      id: 'profile-id',
      ownerId: 'owner-id',
      displayName: 'Birinci Hesap',
      handle: 'first_account',
      completenessPercentage: 62,
      version: 1,
      isVerified: false,
      isPrivate: false,
      language: 'Turkish',
      theme: 'System',
      reduceMotion: false,
    } satisfies ProfileView;
    service.syncProfile(profile);
    await service.refresh();

    accessToken.set(null);
    TestBed.flushEffects();
    await Promise.resolve();

    expect(service.profile()).toBeNull();
    expect(service.unreadMessages()).toBe(0);
    expect(service.unreadNotifications()).toBe(0);
    expect(realtimeDisconnect).toHaveBeenCalledTimes(1);
  });
});
