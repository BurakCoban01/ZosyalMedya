/**
 * Shared navigation catalog for the ZosyalMedya app shell.
 *
 * Single source of truth for the canonical 10-item navigation set, the
 * editorial ordinal/label/link triples, and the icon vocabulary that every
 * navigation variant (desktop rail, tablet compact rail, mobile-web bottom
 * bar) consumes. Extracted by `m2-tablet-mobile-navigation` so the three
 * variants render identical routes/labels/icons and a route addition surfaces
 * as a single focused edit (instead of three parallel edits).
 *
 * Contract preserved from the legacy shell + `m2-desktop-navigation`:
 *   - same 10 items, same canonical order, same Turkish labels;
 *   - same `routerLink` targets (`/akis`, `/kesfet`, `/mesajlar`,
 *     `/bildirimler`, `/profil`, `/baglantilar`, `/sorular`, `/kaydedilenler`,
 *     `/ayarlar`, `/yonetim`);
 *   - the protected `/yonetim` admin item stays visible (its permission is
 *     enforced by the route guard, not by hiding nav).
 *
 * `kind` annotates the two items that carry live unread indicators so the
 * ShellNavStateService can attach the right real-API count to the right item.
 *
 * `icon` is the key into the shared `<zm-nav-icon>` vocabulary (single
 * normalized stroke family; no emoji, no icon library — VAL-DS-033).
 */

/** Whether a nav item carries a live unread indicator (real-API-backed). */
export type NavEntryKind = 'default' | 'messages' | 'notifications';

/** Icon key into the shared `ZmNavIconComponent` vocabulary. */
export type NavIconName =
  | 'akis'
  | 'kesfet'
  | 'mesajlar'
  | 'bildirimler'
  | 'profil'
  | 'baglantilar'
  | 'sorular'
  | 'kaydedilenler'
  | 'ayarlar'
  | 'yonetim'
  | 'compose'
  | 'signout'
  | 'more'
  | 'context';

/** A single navigation entry in the app shell. */
export interface NavEntry {
  /** Editorial ordinal rendered in the desktop rail leading slot (decorative). */
  readonly order: string;
  /** Turkish accessible label (also the on-screen label where shown). */
  readonly label: string;
  /** `routerLink` target (preserved from the legacy shell). */
  readonly link: string;
  /** Whether this item carries a live unread indicator. */
  readonly kind: NavEntryKind;
  /** Icon vocabulary key consumed by `<zm-nav-icon>`. */
  readonly icon: NavIconName;
  /** Which navigation surfaces show this item. `primary` items appear in the
   *  mobile bottom bar directly; `secondary` items live behind the More sheet. */
  readonly tier: 'primary' | 'secondary';
}

/** Canonical nav catalog. Order, labels, links, and admin item are preserved
 *  from the legacy shell; `kind`, `icon`, and `tier` annotate for the three
 *  responsive variants. */
export const NAV_ENTRIES: ReadonlyArray<NavEntry> = [
  { order: '01', label: 'Akış',         link: '/akis',         kind: 'default',       icon: 'akis',         tier: 'primary'   },
  { order: '02', label: 'Keşfet',       link: '/kesfet',       kind: 'default',       icon: 'kesfet',       tier: 'primary'   },
  { order: '03', label: 'Mesajlar',     link: '/mesajlar',     kind: 'messages',      icon: 'mesajlar',     tier: 'primary'   },
  { order: '04', label: 'Bildirimler',  link: '/bildirimler',  kind: 'notifications', icon: 'bildirimler',  tier: 'primary'   },
  { order: '05', label: 'Profil',       link: '/profil',       kind: 'default',       icon: 'profil',       tier: 'primary'   },
  { order: '06', label: 'Bağlantılar',  link: '/baglantilar',  kind: 'default',       icon: 'baglantilar',  tier: 'secondary' },
  { order: '07', label: 'Sorular',      link: '/sorular',      kind: 'default',       icon: 'sorular',      tier: 'secondary' },
  { order: '08', label: 'Kaydedilenler',link: '/kaydedilenler',kind: 'default',       icon: 'kaydedilenler',tier: 'secondary' },
  { order: '09', label: 'Ayarlar',      link: '/ayarlar',      kind: 'default',       icon: 'ayarlar',      tier: 'secondary' },
  { order: '10', label: 'Yönetim',      link: '/yonetim',      kind: 'default',       icon: 'yonetim',      tier: 'secondary' },
];

/** Primary-tier items (rendered directly in the mobile bottom bar). */
export const NAV_PRIMARY: ReadonlyArray<NavEntry> = NAV_ENTRIES.filter((e) => e.tier === 'primary');
/** Secondary-tier items (rendered behind the mobile More sheet). */
export const NAV_SECONDARY: ReadonlyArray<NavEntry> = NAV_ENTRIES.filter((e) => e.tier === 'secondary');

/** Cap the displayed unread count at 99+ (matches the avatar unread idiom). */
export function formatUnreadBadge(count: number): string {
  return count > 99 ? '99+' : String(count);
}
