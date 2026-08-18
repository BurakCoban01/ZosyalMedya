import { Injectable, computed, effect, signal } from '@angular/core';
import { Api, getMyProfile, listConversations, listNotifications, type ProfileView } from '@platform/api';
import { TokenVault } from '../../../core/auth/token-vault.service';
import { MessagingRealtimeService } from '../../../core/realtime/messaging-realtime.service';
import { formatUnreadBadge } from './nav-catalog';

/**
 * ShellNavStateService — singleton shell-navigation state owner.
 *
 * Owns the live unread counts for the navigation surfaces (Mesajlar +
 * Bildirimler) so the three navigation variants (desktop rail, tablet compact
 * rail, mobile-web bottom bar) do NOT each fire their own `listConversations`
 * + `listNotifications` round-trips. The shell renders all three variants and
 * uses CSS to show only one at a time; without this service each variant's
 * `ngOnInit` would refetch the same counts on every mount.
 *
 * Counts come from the REAL API (`listConversations` summing `unreadCount`,
 * `listNotifications` counting `!isRead`) and refresh on SignalR realtime
 * push (`onMessage`, `onNotification`). On any failure the counts stay at
 * their previous value — no fabricated indicator, honest degraded state.
 *
 * Contract preserved from `m2-desktop-navigation`:
 *   - same real-API endpoints + same aggregation logic;
 *   - same realtime refresh wiring (shared hub, idempotent `connect()`);
 *   - same "no fabricated indicator" failure mode.
 *
 * Token hygiene: the service is `providedIn: 'root'` (singleton). Each nav
 * component injects it and calls `init()` on mount; the service de-dupes
 * (only the first `init()` triggers the initial refresh + realtime wiring).
 */
@Injectable({ providedIn: 'root' })
export class ShellNavStateService {
  /** Current unread message total (sum of conversation `unreadCount`). */
  readonly unreadMessages = signal(0);
  /** Current unread notification total (count of `!isRead`). */
  readonly unreadNotifications = signal(0);

  /**
   * The signed-in user's own profile, fetched once per shell session and
   * shared with the account menu (avatar + display name + handle) across the
   * three navigation variants. `null` until the first successful fetch lands;
   * on failure it stays `null` and the account menu renders an honest generic
   * identity (no fabricated name). Refreshed lazily by callers that need the
   * freshest value (e.g. after a profile save).
   */
  readonly profile = signal<ProfileView | null>(null);

  /** Displayed badge text for messages (literal count, capped at 99+). */
  readonly messagesBadge = computed(() => formatUnreadBadge(this.unreadMessages()));
  /** Displayed badge text for notifications (literal count, capped at 99+). */
  readonly notificationsBadge = computed(() => formatUnreadBadge(this.unreadNotifications()));

  private loaded = false;
  private profileRequest: Promise<ProfileView> | null = null;
  private sessionGeneration = 0;
  private unsubscribe: (() => void)[] = [];

  constructor(
    private readonly api: Api,
    private readonly realtime: MessagingRealtimeService,
    private readonly vault: TokenVault,
  ) {
    effect(() => {
      if (!this.vault.authenticated()) this.resetSessionState();
    });
  }

  /**
   * Idempotent loader. The first call triggers the initial unread refresh +
   * subscribes to realtime push (a new message / notification refreshes the
   * counts regardless of which route is currently shown). Subsequent calls
   * (from the other nav variants) are no-ops so the API is hit exactly once
   * per shell session.
   */
  init(): void {
    if (this.loaded) return;
    this.loaded = true;
    void this.refresh();
    void this.refreshProfile();
    this.unsubscribe.push(this.realtime.onMessage(() => void this.refresh()));
    this.unsubscribe.push(this.realtime.onNotification(() => void this.refresh()));
    // connect() is idempotent and shared with feature pages that already own
    // the hub. Swallow errors — a hub failure must not break the shell.
    void this.realtime.connect().catch(() => undefined);
  }

  /**
   * Fetch the real unread counts. `Promise.allSettled` so a 5xx on one
   * endpoint does not discard the other. On any failure the corresponding
   * signal keeps its previous value — the indicator simply will not update
   * until the next realtime push or route mount. No fake data.
   */
  async refresh(): Promise<void> {
    try {
      const [conversations, notifications] = await Promise.allSettled([
        this.api.invoke(listConversations, { limit: 50 }),
        this.api.invoke(listNotifications, { limit: 40 }),
      ]);
      if (conversations.status === 'fulfilled') {
        const total = conversations.value.items.reduce(
          (sum, c) => sum + (c.unreadCount ?? 0),
          0,
        );
        this.unreadMessages.set(total);
      }
      if (notifications.status === 'fulfilled') {
        const total = notifications.value.items.filter((n) => !n.isRead).length;
        this.unreadNotifications.set(total);
      }
    } catch {
      // Network/parse failure: leave counts unchanged. Honest degraded.
    }
  }

  /**
   * Fetch the signed-in user's own profile for the account menu (display name
   * + handle + verified flag). Swallows any failure — the account menu then
   * renders an honest generic identity instead of fabricated data. Called once
   * from {@link init} and re-callable after a profile update.
   */
  async refreshProfile(): Promise<void> {
    try {
      await this.loadProfile();
    } catch {
      // Leave the previous value (null on first load). Account menu shows a
      // generic identity; no fake name.
    }
  }

  /**
   * Return the accepted profile for this shell session. Concurrent consumers
   * (navigation, context rail and profile/settings pages) share one request
   * instead of racing identical `/profiles/me` calls during route startup.
   * A completed session can never publish a late response into the next one.
   */
  loadProfile(): Promise<ProfileView> {
    const current = this.profile();
    if (current) return Promise.resolve(current);
    if (this.profileRequest) return this.profileRequest;

    const generation = this.sessionGeneration;
    let request!: Promise<ProfileView>;
    request = this.api.invoke(getMyProfile, {}).then(profile => {
      if (generation !== this.sessionGeneration || !this.vault.authenticated()) {
        throw new Error('Profile response belongs to a completed session.');
      }
      this.syncProfile(profile);
      return profile;
    }).finally(() => {
      if (this.profileRequest === request) this.profileRequest = null;
    });
    this.profileRequest = request;
    return request;
  }

  /**
   * Publish a profile already returned by a successful profile API write or
   * read. This keeps shell consumers current without issuing a duplicate GET.
   */
  syncProfile(profile: ProfileView): void {
    this.profile.set(profile);
  }

  /**
   * Clear every user-scoped shell value when authentication ends. The service
   * is root-scoped, so route teardown alone is not a session boundary.
   */
  private resetSessionState(): void {
    this.sessionGeneration++;
    this.unreadMessages.set(0);
    this.unreadNotifications.set(0);
    this.profile.set(null);
    this.profileRequest = null;
    this.loaded = false;
    for (const unsubscribe of this.unsubscribe.splice(0)) unsubscribe();
    void this.realtime.disconnect().catch(() => undefined);
  }
}
