/**
 * Context-rail section catalog — single source of truth for the route →
 * contextual-panel mapping (VAL-WSH-012).
 *
 * The right contextual rail must show LIVE / contextual content relevant to
 * the current route (trends, conversation details, profile summary, safety
 * context, ...), never the static marketing/privacy copy it replaced. This
 * module owns:
 *
 *   1. the canonical set of route kinds the rail recognises;
 *   2. the editorial labels (kicker + Turkish title) per kind;
 *   3. the URL → kind resolver (first path segment of the authed shell);
 *   4. the per-kind view-model types the component loads from the real API.
 *
 * Contract preserved from the legacy shell:
 *   - the same 10 authed routes (`/akis`, `/kesfet`, `/mesajlar`,
 *     `/bildirimler`, `/profil`, `/baglantilar`, `/sorular`,
 *     `/kaydedilenler`, `/ayarlar`, `/yonetim`) — no routes added or removed;
 *   - the rail never adds a route; it only reacts to the current one.
 *
 * No hardcoded API shapes here — the view-model types mirror the generated
 * `@platform/api` models so the component stays typed end-to-end.
 */

/** Notification type union (mirrors `NotificationView.type`). */
export type NotificationType =
  | 'NewFollower'
  | 'Reaction'
  | 'Comment'
  | 'Message'
  | 'Moderation'
  | 'Community'
  | 'System';

/**
 * Every contextual kind the rail can render. One per authed route, plus the
 * `unknown` fallback for any future route (honest, non-marketing fallback).
 */
export type ContextRailKind =
  | 'feed'
  | 'discovery'
  | 'messaging'
  | 'notifications'
  | 'profile'
  | 'connections'
  | 'questions'
  | 'saved'
  | 'settings'
  | 'admin'
  | 'unknown';

/** Editorial metadata for a contextual section. The rail renders the kicker
 *  as a small-caps label and the title as the panel heading. */
export interface ContextRailSection {
  readonly kind: ContextRailKind;
  /** Small-caps editorial label above the title (e.g. "CANLI"). */
  readonly kicker: string;
  /** Turkish panel heading (e.g. "Gündem"). */
  readonly title: string;
  /** First path segment that maps to this kind (empty for `unknown`). */
  readonly route: string;
}

/**
 * Canonical section catalog. Order is intentional (matches the nav order so
 * the rail's mental model mirrors the left navigation). Every entry has
 * Turkish copy and a non-marketing, route-relevant purpose.
 */
export const CONTEXT_RAIL_SECTIONS: ReadonlyArray<ContextRailSection> = [
  { kind: 'feed',         kicker: 'CANLI',    title: 'Gündem',           route: 'akis'         },
  { kind: 'discovery',    kicker: 'KEŞFET',   title: 'Bu akış nereden gelir', route: 'kesfet'   },
  { kind: 'messaging',    kicker: 'SOHBET',   title: 'Sohbet özeti',     route: 'mesajlar'     },
  { kind: 'notifications',kicker: 'BİLDİRİM', title: 'Bildirim dökümü',  route: 'bildirimler'  },
  { kind: 'profile',      kicker: 'PROFİL',   title: 'Profil özeti',     route: 'profil'       },
  { kind: 'connections',  kicker: 'AĞ',       title: 'Toplulukların',    route: 'baglantilar'  },
  { kind: 'questions',    kicker: 'SORULAR',  title: 'Soru kutusu',      route: 'sorular'      },
  { kind: 'saved',        kicker: 'KÜTÜPHANE',title: 'Kaydedilenler',    route: 'kaydedilenler'},
  { kind: 'settings',     kicker: 'HESAP',    title: 'Hesap bağlamı',    route: 'ayarlar'      },
  { kind: 'admin',        kicker: 'OPERASYON',title: 'Güvenlik bağlamı', route: 'yonetim'      },
];

/** Lookup map: route segment → section. */
const SECTION_BY_ROUTE: ReadonlyMap<string, ContextRailSection> = new Map(
  CONTEXT_RAIL_SECTIONS.map((s) => [s.route, s]),
);

/** The fallback section for any route the rail does not model yet. Honest,
 *  non-marketing: it explains the rail has nothing contextual to add rather
 *  than fabricating content. */
export const UNKNOWN_SECTION: ContextRailSection = {
  kind: 'unknown',
  kicker: 'BAĞLAM',
  title: 'Bu sayfa için bağlam',
  route: '',
};

/**
 * Resolve a contextual section from the current URL. Reads only the FIRST
 * path segment of the authed shell (e.g. `/akis/123` → `akis`). Query params,
 * fragments, and deeper segments are ignored so nested routes keep the same
 * context as their parent.
 */
export function sectionForUrl(url: string): ContextRailSection {
  // Strip query/fragment, then take the first non-empty segment.
  const path = url.split(/[?#]/)[0] ?? '';
  const segments = path.split('/').filter((s) => s.length > 0);
  const first = segments[0];
  if (!first) {
    // Empty shell redirect target — behave as the feed (the default route).
    return SECTION_BY_ROUTE.get('akis') ?? UNKNOWN_SECTION;
  }
  return SECTION_BY_ROUTE.get(first) ?? UNKNOWN_SECTION;
}

/* ----------------------------------------------------------------------------
 * Per-kind view models (loaded from the real API; no fabrication)
 *
 * Each kind's data is a plain object so the template can read it via narrow
 * helper getters without reactive plumbing per field. The component owns a
 * single `data` signal of type `ContextRailData | null`.
 * -------------------------------------------------------------------------- */

/** Trends (feed / discovery). `score` is the raw API score; the rail renders
 *  a normalized bar so the relative ordering is readable at a glance. */
export interface TrendItem {
  readonly tag: string;
  readonly score: number;
}

/** A community card (connections / discovery). */
export interface CommunityItem {
  readonly id: string;
  readonly name: string;
  readonly slug: string;
  readonly memberCount: number;
  readonly visibility: string;
}

/** Messaging summary (mesajlar). */
export interface MessagingSummary {
  readonly total: number;
  readonly unread: number;
  readonly direct: number;
  readonly group: number;
  readonly mostRecentTitle: string | null;
  readonly mostRecentUpdatedAt: string | null;
}

/** Notifications summary (bildirimler). */
export interface NotificationsSummary {
  readonly total: number;
  readonly unread: number;
  readonly byType: ReadonlyArray<{ readonly type: NotificationType; readonly count: number }>;
}

/** Profile summary (profil / ayarlar). */
export interface ProfileSummary {
  readonly displayName: string;
  readonly handle: string;
  readonly completenessPercentage: number;
  readonly isVerified: boolean;
  readonly isPrivate: boolean;
  readonly language: 'Turkish' | 'English';
  readonly theme: 'System' | 'Light' | 'Dark';
  readonly reduceMotion: boolean;
  readonly location: string | null;
  readonly organization: string | null;
}

/** Questions summary (sorular). */
export interface QuestionsSummary {
  readonly total: number;
  readonly pending: number;
  readonly answered: number;
  readonly mostRecentBody: string | null;
}

/** Saved-content summary (kaydedilenler). */
export interface SavedSummary {
  readonly total: number;
  readonly collections: ReadonlyArray<{ readonly name: string; readonly count: number }>;
}

/** Discriminated union of all per-kind view models. The `kind` tag lets the
 *  template `@switch` narrow safely. `admin` carries no API payload (its
 *  content is operational safety context, not live data — explicitly allowed
 *  by VAL-WSH-012's "safety context"). */
export type ContextRailData =
  | { readonly kind: 'feed'; readonly trends: ReadonlyArray<TrendItem> }
  | { readonly kind: 'discovery'; readonly trends: ReadonlyArray<TrendItem>; readonly communities: ReadonlyArray<CommunityItem> }
  | { readonly kind: 'messaging'; readonly summary: MessagingSummary }
  | { readonly kind: 'notifications'; readonly summary: NotificationsSummary }
  | { readonly kind: 'profile'; readonly summary: ProfileSummary }
  | { readonly kind: 'connections'; readonly communities: ReadonlyArray<CommunityItem> }
  | { readonly kind: 'questions'; readonly summary: QuestionsSummary }
  | { readonly kind: 'saved'; readonly summary: SavedSummary }
  | { readonly kind: 'settings'; readonly summary: ProfileSummary }
  | { readonly kind: 'admin' };

/** Human Turkish label for a notification type. Used by the notifications
 *  breakdown so the rail never shows a raw enum. */
export const NOTIFICATION_TYPE_LABELS: Readonly<Record<NotificationType, string>> = {
  NewFollower: 'Yeni takipçi',
  Reaction: 'Tepkiler',
  Comment: 'Yorumlar',
  Message: 'Mesajlar',
  Moderation: 'Moderasyon',
  Community: 'Topluluk',
  System: 'Sistem',
};
