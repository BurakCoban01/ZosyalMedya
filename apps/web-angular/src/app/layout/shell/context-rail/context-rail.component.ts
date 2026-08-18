import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, effect, inject, signal } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { Router, NavigationEnd, RouterLink } from '@angular/router';
import { filter, map } from 'rxjs';
import { TokenVault } from '../../../core/auth/token-vault.service';
import { ZmMotifComponent } from '../../../design-system/iconography/motif.component';
import {
  Api,
  getQuestionInbox,
  listCommunities,
  listConversations,
  listNotifications,
  listSavedContent,
  trending,
  type CommunityView,
  type ConversationView,
  type NotificationView,
  type ProfileView,
  type QuestionView,
  type SavedContentView,
  type TrendingTagView,
} from '@platform/api';
import {
  CONTEXT_RAIL_SECTIONS,
  NOTIFICATION_TYPE_LABELS,
  UNKNOWN_SECTION,
  type CommunityItem,
  type ContextRailData,
  type ContextRailSection,
  type MessagingSummary,
  type NotificationsSummary,
  type NotificationType,
  type ProfileSummary,
  type QuestionsSummary,
  type SavedSummary,
  type TrendItem,
  sectionForUrl,
} from './context-rail-section';
import { ShellNavStateService } from '../navigation/shell-nav-state.service';

/**
 * ZmContextRail — the right contextual rail of the app shell.
 *
 * Replaces the static marketing / privacy copy that lived here from
 * `m2-shell-structure`. Fulfils **VAL-WSH-012**: the rail shows LIVE /
 * contextual content relevant to the current route (trends on the feed,
 * conversation summary on messaging, profile summary on profile, account
 * context on settings, safety context on admin, ...), and reflects real API
 * data or an honest empty state. No static marketing copy remains.
 *
 * Route awareness: the rail listens to `router.events` (NavigationEnd) and
 * resolves the first path segment to a {@link ContextRailKind}. The shell
 * stays mounted across child-route navigations (only `<router-outlet>`
 * swaps), so this component is the single owner of the contextual state and
 * re-fetches on every route change.
 *
 * State contract (binding; every data surface implements where applicable):
 *   - **loading**: skeleton placeholders (`aria-busy="true"` on the body);
 *   - **populated**: live API data rendered with Turkish labels;
 *   - **empty**: honest empty state — specific cause + useful next action,
 *     never a dead end, never fake content;
 *   - **error**: recoverable error with a "Tekrar dene" retry that re-runs
 *     the current kind's fetch;
 *   - **static**: the admin route's operational safety context (explicitly
 *     allowed by VAL-WSH-012; not API-backed, never marketing).
 *
 * Stale-response guard: every fetch increments a monotonically-increasing
 * `requestId`. When an in-flight request resolves, its result is applied
 * only if its id still matches the current one — a slow response that lands
 * after a route change is discarded, so the rail never shows data from the
 * previous route.
 *
 * Engine: CSS transitions + a decorative signal-arc motif only. No
 * `@angular/animations`. Reduced-motion collapses the entrance transition;
 * the state is still conveyed by the live region + content swap.
 *
 * All API access goes through the real generated client (`Api.invoke`).
 * No fabricated data, no hardcoded hex/oklch (the CSS consumes only
 * `--zm-context-rail-*` component tokens that compose semantic roles).
 */
@Component({
  selector: 'zm-context-rail',
  imports: [RouterLink, DatePipe, ZmMotifComponent],
  templateUrl: './context-rail.component.html',
  styleUrl: './context-rail.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ZmContextRailComponent {
  private readonly router = inject(Router);
  private readonly api = inject(Api);
  private readonly shellNavState = inject(ShellNavStateService);
  private readonly vault = inject(TokenVault);

  /** Catalog of all modelled sections (template iterates for the aria-label
   *  of the landmark + tests assert exhaustive coverage). */
  protected readonly sections: ReadonlyArray<ContextRailSection> = CONTEXT_RAIL_SECTIONS;
  protected readonly notificationTypeLabels = NOTIFICATION_TYPE_LABELS;

  /** Current URL, kept in sync with the router via `toSignal`. Initial value
   *  is the URL at construction so the first render is correct before any
   *  NavigationEnd fires. */
  private readonly url = toSignal(
    this.router.events.pipe(
      filter((e): e is NavigationEnd => e instanceof NavigationEnd),
      map(() => this.router.url),
    ),
    { initialValue: this.router.url },
  );

  /** The contextual section derived from the current URL. Drives everything:
   *  the panel heading, which fetcher runs, which template branch renders. */
  protected readonly section = computed<ContextRailSection>(() => sectionForUrl(this.url()));

  /** Convenience alias for the template. */
  protected readonly kind = computed(() => this.section().kind);

  /** Loading / populated / empty / error / static. The body region binds
   *  `aria-busy` and the live region announcements to this. */
  protected readonly status = signal<ContextRailStatus>('loading');

  /** Loaded view model for the current section (null until the first
   *  successful fetch lands, or for the static admin section which builds
   *  its payload synchronously). */
  protected readonly data = signal<ContextRailData | null>(null);

  /** Turkish error message for the recoverable error state. Empty unless
   *  `status() === 'error'`. */
  protected readonly errorMessage = signal<string>('');

  /** Monotonic stale-response guard. Incremented on every fetch start. */
  private requestId = 0;

  constructor() {
    // Re-fetch whenever the route kind changes. Runs in the injection
    // context (constructor) so Angular owns its lifecycle. The static admin
    // section short-circuits to its synchronous payload (no API round-trip).
    effect(() => {
      const section = this.section();
      if (!this.vault.authenticated()) {
        this.requestId++;
        this.data.set(null);
        this.errorMessage.set('');
        this.status.set('empty');
        return;
      }
      if (section.kind === 'profile' || section.kind === 'settings') {
        const sharedProfile = this.shellNavState.profile();
        if (sharedProfile) {
          this.applySharedProfile(section.kind, sharedProfile);
          return;
        }
      }
      void this.load(section);
    });
  }

  /**
   * Apply the real profile response already accepted by the profile page or
   * shell navigation. Incrementing requestId prevents an older failed GET
   * from replacing this newer successful state.
   */
  private applySharedProfile(
    kind: 'profile' | 'settings',
    profile: ProfileView
  ): void {
    this.requestId++;
    this.data.set({ kind, summary: this.profileSummary(profile) });
    this.status.set('populated');
    this.errorMessage.set('');
  }

  /**
   * Load the current section's data. The static admin section resolves
   * synchronously to its safety-context payload; every other kind fires the
   * real API round-trip with a stale-response guard. On failure the section
   * flips to the recoverable error state; the previous section's data is
   * cleared so a slow success from the prior route can never leak through.
   */
  private async load(section: ContextRailSection): Promise<void> {
    if (section.kind === 'admin') {
      this.data.set({ kind: 'admin' });
      this.status.set('static');
      this.errorMessage.set('');
      return;
    }
    if (section.kind === 'unknown') {
      // Honest fallback: no contextual data to show. Not an error, not
      // marketing — a candid "nothing contextual here" state.
      this.data.set(null);
      this.status.set('empty');
      this.errorMessage.set('');
      return;
    }

    const myRequest = ++this.requestId;
    this.status.set('loading');
    this.errorMessage.set('');
    // Clear the previous kind's data immediately so the loading skeleton is
    // honest (no stale previous-route content visible during the swap).
    this.data.set(null);

    try {
      const payload = await this.fetch(section.kind);
      // Stale guard: a newer request has started — discard this result.
      if (myRequest !== this.requestId) return;
      this.data.set(payload);
      this.status.set(this.isEmpty(payload) ? 'empty' : 'populated');
    } catch {
      if (myRequest !== this.requestId) return;
      this.data.set(null);
      this.errorMessage.set(this.errorCopy(section));
      this.status.set('error');
    }
  }

  /** Dispatch to the per-kind fetcher. Each returns the typed view model or
   *  rejects on any API failure (caught by `load`). `Promise.allSettled` is
   *  used by kinds that fan out so a 5xx on one endpoint does not discard
   *  the other. */
  private async fetch(kind: ContextRailSection['kind']): Promise<ContextRailData> {
    switch (kind) {
      case 'feed':
        return { kind: 'feed', trends: await this.fetchTrends(6) };
      case 'discovery': {
        const [trends, communities] = await Promise.all([
          this.fetchTrends(4).catch(() => [] as TrendItem[]),
          this.fetchCommunities(3).catch(() => [] as CommunityItem[]),
        ]);
        return { kind: 'discovery', trends, communities };
      }
      case 'messaging':
        return { kind: 'messaging', summary: await this.fetchMessaging() };
      case 'notifications':
        return { kind: 'notifications', summary: await this.fetchNotifications() };
      case 'profile':
        return { kind: 'profile', summary: await this.fetchProfile() };
      case 'connections':
        return { kind: 'connections', communities: await this.fetchCommunities(5) };
      case 'questions':
        return { kind: 'questions', summary: await this.fetchQuestions() };
      case 'saved':
        return { kind: 'saved', summary: await this.fetchSaved() };
      case 'settings':
        return { kind: 'settings', summary: await this.fetchProfile() };
      default:
        // Unreachable: admin + unknown are handled by `load`. Defensive.
        throw new Error('unsupported context kind');
    }
  }

  /** Top trending tags from the real `trending` endpoint. */
  private async fetchTrends(limit: number): Promise<ReadonlyArray<TrendItem>> {
    const result = await this.api.invoke(trending, { limit });
    return (result ?? []).map((t: TrendingTagView) => ({ tag: t.tag, score: t.score }));
  }

  /** Communities from the real `listCommunities` endpoint. */
  private async fetchCommunities(limit: number): Promise<ReadonlyArray<CommunityItem>> {
    const result = await this.api.invoke(listCommunities, { limit });
    return (result ?? []).map((c: CommunityView) => ({
      id: c.id,
      name: c.name,
      slug: c.slug,
      memberCount: c.activeMemberCount ?? 0,
      visibility: c.visibility,
    }));
  }

  /** Conversation summary from the real `listConversations` endpoint. */
  private async fetchMessaging(): Promise<MessagingSummary> {
    const page = await this.api.invoke(listConversations, { limit: 50 });
    const items: ReadonlyArray<ConversationView> = page.items ?? [];
    const unread = items.reduce((sum, c) => sum + (c.unreadCount ?? 0), 0);
    const direct = items.filter((c) => c.kind === 'Direct').length;
    const group = items.filter((c) => c.kind === 'Group').length;
    // Most recent by updatedAtUtc (lexicographic ISO-8601 = chronological).
    const sorted = [...items].sort((a, b) => (b.updatedAtUtc ?? '').localeCompare(a.updatedAtUtc ?? ''));
    const mostRecent = sorted[0];
    return {
      total: items.length,
      unread,
      direct,
      group,
      mostRecentTitle: mostRecent?.title ?? null,
      mostRecentUpdatedAt: mostRecent?.updatedAtUtc ?? null,
    };
  }

  /** Notification breakdown from the real `listNotifications` endpoint. */
  private async fetchNotifications(): Promise<NotificationsSummary> {
    const page = await this.api.invoke(listNotifications, { limit: 40 });
    const items: ReadonlyArray<NotificationView> = page.items ?? [];
    const counts = new Map<NotificationType, number>();
    for (const n of items) {
      counts.set(n.type, (counts.get(n.type) ?? 0) + 1);
    }
    const byType = [...counts.entries()]
      .map(([type, count]) => ({ type, count }))
      .sort((a, b) => b.count - a.count);
    return {
      total: items.length,
      unread: items.filter((n) => !n.isRead).length,
      byType,
    };
  }

  /** Own profile from the real `getMyProfile` endpoint (profil + ayarlar). */
  private async fetchProfile(): Promise<ProfileSummary> {
    const p = await this.shellNavState.loadProfile();
    return this.profileSummary(p);
  }

  private profileSummary(p: ProfileView): ProfileSummary {
    return {
      displayName: p.displayName,
      handle: p.handle,
      completenessPercentage: p.completenessPercentage,
      isVerified: p.isVerified,
      isPrivate: p.isPrivate,
      language: p.language,
      theme: p.theme,
      reduceMotion: p.reduceMotion,
      location: p.location ?? null,
      organization: p.organization ?? null,
    };
  }

  /** Question inbox summary from the real `getQuestionInbox` endpoint. */
  private async fetchQuestions(): Promise<QuestionsSummary> {
    const items: ReadonlyArray<QuestionView> = await this.api.invoke(getQuestionInbox, { limit: 10 });
    const pending = items.filter((q) => q.status === 'Published' || q.status === 'Scheduled').length;
    const answered = items.filter((q) => q.status === 'Answered').length;
    const mostRecent = items[0];
    return {
      total: items.length,
      pending,
      answered,
      mostRecentBody: mostRecent?.body ?? null,
    };
  }

  /** Saved-content summary from the real `listSavedContent` endpoint. */
  private async fetchSaved(): Promise<SavedSummary> {
    const page = await this.api.invoke(listSavedContent, { limit: 50 });
    const items: ReadonlyArray<SavedContentView> = page.items ?? [];
    const counts = new Map<string, number>();
    for (const s of items) {
      const key = s.collection?.trim() || 'Genel';
      counts.set(key, (counts.get(key) ?? 0) + 1);
    }
    const collections = [...counts.entries()]
      .map(([name, count]) => ({ name, count }))
      .sort((a, b) => b.count - a.count);
    return { total: items.length, collections };
  }

  /** Whether a populated payload should display as the honest empty state
   *  (zero meaningful items). Per-kind so "the API succeeded but there is
   *  nothing to show" is honest, not fake-populated. */
  private isEmpty(payload: ContextRailData): boolean {
    switch (payload.kind) {
      case 'feed':
        return payload.trends.length === 0;
      case 'discovery':
        return payload.trends.length === 0 && payload.communities.length === 0;
      case 'messaging':
        return payload.summary.total === 0;
      case 'notifications':
        return payload.summary.total === 0;
      case 'connections':
        return payload.communities.length === 0;
      case 'questions':
        return payload.summary.total === 0;
      case 'saved':
        return payload.summary.total === 0;
      // profile + settings always render the profile card (a profile always
      // exists for the authed user); admin is static; unknown handled above.
      case 'profile':
      case 'settings':
      case 'admin':
        return false;
    }
  }

  /** Turkish cause/consequence copy for the recoverable error state. Names
   *  the section so the user knows what failed without leaking internals. */
  private errorCopy(section: ContextRailSection): string {
    return `${section.title} şu an yüklenemedi. Bağlantını kontrol edip tekrar deneyebilirsin.`;
  }

  /** User-facing retry. Re-runs the current section's fetch. Wired to the
   *  error state's "Tekrar dene" button. */
  protected retry(): void {
    void this.load(this.section());
  }

  /* ------------------------------------------------------------------------
   * Narrow template helpers. Each returns the payload typed for its kind, or
   * null when the current data is not of that kind. Keeps the template's
   * `@switch` branches type-safe without ad-hoc casts in the markup.
   * ---------------------------------------------------------------------- */

  protected asFeed(d: ContextRailData | null): { trends: ReadonlyArray<TrendItem> } | null {
    return d && d.kind === 'feed' ? d : null;
  }
  protected asDiscovery(d: ContextRailData | null): { trends: ReadonlyArray<TrendItem>; communities: ReadonlyArray<CommunityItem> } | null {
    return d && d.kind === 'discovery' ? d : null;
  }
  protected asMessaging(d: ContextRailData | null): MessagingSummary | null {
    return d && d.kind === 'messaging' ? d.summary : null;
  }
  protected asNotifications(d: ContextRailData | null): NotificationsSummary | null {
    return d && d.kind === 'notifications' ? d.summary : null;
  }
  protected asProfile(d: ContextRailData | null): ProfileSummary | null {
    return d && d.kind === 'profile' ? d.summary : null;
  }
  protected asConnections(d: ContextRailData | null): ReadonlyArray<CommunityItem> | null {
    return d && d.kind === 'connections' ? d.communities : null;
  }
  protected asQuestions(d: ContextRailData | null): QuestionsSummary | null {
    return d && d.kind === 'questions' ? d.summary : null;
  }
  protected asSaved(d: ContextRailData | null): SavedSummary | null {
    return d && d.kind === 'saved' ? d.summary : null;
  }
  protected asSettings(d: ContextRailData | null): ProfileSummary | null {
    return d && d.kind === 'settings' ? d.summary : null;
  }

  /** Normalize a trend score to a 0..1 ratio of the strongest trend, so the
   *  bar length encodes relative weight regardless of the raw score scale. */
  protected trendRatio(score: number, strongest: number): number {
    if (strongest <= 0) return 0;
    return Math.max(0.08, Math.min(1, score / strongest));
  }

  /** Max score across a trend list (denominator for the ratio bars). */
  protected strongestScore(trends: ReadonlyArray<TrendItem>): number {
    return trends.reduce((max, t) => Math.max(max, t.score), 0);
  }

  /* ------------------------------------------------------------------------
   * Per-kind copy helpers. Centralised so the template stays declarative and
   * the spec can assert the copy without scraping markup. All Turkish,
   * route-relevant, never marketing.
   * ---------------------------------------------------------------------- */

  /** One-line lede under the title — what this section shows right now. */
  protected lede(): string {
    switch (this.kind()) {
      case 'feed': return 'Toplulukta şu an en çok konuşulanlar.';
      case 'discovery': return 'Keşif akışını neyin şekillendirdiği.';
      case 'messaging': return 'Sohbetlerinin özeti ve okunmamış sayısı.';
      case 'notifications': return 'Bildirimlerin türe göre dağılımı.';
      case 'profile': return 'Profilinin bu anlık durumu.';
      case 'connections': return 'Üye olduğun topluluklar.';
      case 'questions': return 'Sana gelen soruların özeti.';
      case 'saved': return 'Kütüphanendeki koleksiyonlar.';
      case 'settings': return 'Hesap ve görüntü ayarların.';
      case 'admin': return 'Denetim yaparken aklında tutman gerekenler.';
      default: return 'Bu sayfa için bağlam paneli.';
    }
  }

  /** Honest empty-state copy per kind. Specific to the situation; never
   *  generic "İçerik yok". */
  protected emptyText(): string {
    switch (this.kind()) {
      case 'feed': return 'Şu an öne çıkan bir etiket yok. Yeni içerik girdikçe gündem burada belirecek.';
      case 'discovery': return 'Henüz bir trend veya topluluk sinyali yok. Keşfet’i yenileyebilirsin.';
      case 'messaging': return 'Henüz bir sohbet yok. Biriyle konuşma başlattığında özet burada görünecek.';
      case 'notifications': return 'Hiç bildirimin yok. Etkileşim aldıkça döküm burada toplanacak.';
      case 'connections': return 'Henüz bir topluluğa üye değilsin. Keşfet’ten başlayabilirsin.';
      case 'questions': return 'Soru kutun boş. Sana bir soru geldiğinde burada göreceksin.';
      case 'saved': return 'Henüz bir şey kaydetmedin. Akışta beğendiğin içeriği kaydedebilirsin.';
      default: return 'Bu sayfa için canlı bir bağlam henüz yok.';
    }
  }

  /** Primary next-action label for the empty state (empty string = no
   *  action; the template hides the link). */
  protected emptyActionLabel(): string {
    switch (this.kind()) {
      case 'feed': return 'Keşfet’e git';
      case 'discovery': return 'Keşfet’i yenile';
      case 'messaging': return 'Sohbetlere bak';
      case 'notifications': return 'Akışa göz at';
      case 'connections': return 'Topluluk keşfet';
      case 'questions': return 'Soru kutunu aç';
      case 'saved': return 'Akışa göz at';
      default: return '';
    }
  }

  /** routerLink target for the empty-state action. */
  protected emptyActionLink(): string {
    switch (this.kind()) {
      case 'feed':
      case 'discovery':
      case 'connections':
        return '/kesfet';
      case 'messaging':
        return '/mesajlar';
      case 'notifications':
      case 'saved':
        return '/akis';
      case 'questions':
        return '/sorular';
      default:
        return '/akis';
    }
  }

  /** Human Turkish label for the profile theme preference (settings card). */
  protected themeLabel(theme: 'System' | 'Light' | 'Dark'): string {
    switch (theme) {
      case 'System': return 'Sistem';
      case 'Light': return 'Açık';
      case 'Dark': return 'Koyu';
    }
  }
}

/** The rail's lifecycle states. `static` is the admin safety-context (no API);
 *  every other kind cycles through loading → populated | empty | error. */
export type ContextRailStatus = 'loading' | 'populated' | 'empty' | 'error' | 'static';
