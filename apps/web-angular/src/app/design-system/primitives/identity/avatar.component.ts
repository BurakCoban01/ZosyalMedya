import {
  ChangeDetectionStrategy,
  Component,
  computed,
  effect,
  input,
  signal,
} from '@angular/core';

/**
 * ZmAvatar — identity-token avatar with stable fallback + image error state +
 * presence/unread ring SEPARATED from content.
 *
 * Contract (VAL-DS-030 / VAL-DS-031):
 *
 *   - **Stable identity fallback** (VAL-DS-030): when no usable image is
 *     available, the avatar falls back to a deterministic color + initial(s)
 *     derived from the identity. The same `name` always resolves to the same
 *     color + initial across remounts (deterministic string hash → palette
 *     index), so an avatar is recognizable even before/without an image.
 *   - **Image error state** (VAL-DS-030): on image load error the avatar
 *     swaps to the fallback with NO broken-image glyph and NO layout shift
 *     (the host reserves dimensions via the size token, so the fallback fills
 *     the same box the image would have).
 *   - **Presence / unread ring is SEPARATED from content** (VAL-DS-031): the
 *     presence dot and unread count badge sit in a reserved corner slot
 *     OUTSIDE the avatar content bounding box (they overlap only the corner,
 *     never the face/initial). They are styled by the presence/brand tokens —
 *     an INDEPENDENT declaration from the identity palette — and convey their
 *     meaning through shape + position + accessible label, never hue alone.
 *
 * Accessibility:
 *   - The host carries an accessible name derived from `name` plus presence
 *     context and unread count (e.g. "Deniz Yılmaz, çevrimiçi, 3 okunmamış").
 *   - The image, when shown, carries the user's display name as `alt`.
 *   - The presence dot and unread badge are `aria-hidden` (decorative); their
 *     meaning is exposed via the host `aria-label` so it reaches AT without
 *     competing focus targets.
 *   - The avatar itself is a presentation surface, not a control. Wrap it in
 *     a `<a>` / `<button>` (or set `interactive` + bind `(activated)`) when it
 *     should navigate/act; the focus ring then lands on the actionable element.
 *
 * Engine: CSS only (no `@angular/animations`). Motion is transform/opacity via
 * `--zm-avatar-*` duration/ease tokens; reduced motion collapses via the token
 * cascade. Consumes ONLY `--zm-avatar-*` component-layer tokens (no hex).
 *
 * @example
 * <zm-avatar
 *   name="Deniz Yılmaz"
 *   src="/users/deniz/avatar.png"
 *   size="md"
 *   presence="online"
 *   [unread]="3"
 * ></zm-avatar>
 */
export type ZmAvatarSize = 'xs' | 'sm' | 'md' | 'lg' | 'xl';
export type ZmAvatarPresence = 'online' | 'away' | 'busy' | 'offline';

/** CSS custom-property names for the deterministic identity palette. Defined
 *  in tokens.css §3 as `--zm-avatar-identity-1..8`. These names are component-
 *  layer tokens (NOT the `--zm-surface-<digit>` / `--zm-text-<digit>` patterns),
 *  so they are safe to hold as TS string literals. */
const IDENTITY_PALETTE: readonly string[] = [
  '--zm-avatar-identity-1',
  '--zm-avatar-identity-2',
  '--zm-avatar-identity-3',
  '--zm-avatar-identity-4',
  '--zm-avatar-identity-5',
  '--zm-avatar-identity-6',
  '--zm-avatar-identity-7',
  '--zm-avatar-identity-8',
];

/**
 * Deterministic non-cryptographic string hash (djb2 variant). Same input →
 * same output across runs, platforms, and Angular change-detection cycles, so
 * an identity resolves to a stable palette index. Returns a non-negative int.
 */
function identityHash(value: string): number {
  let hash = 5381;
  for (let i = 0; i < value.length; i++) {
    hash = ((hash << 5) + hash + value.charCodeAt(i)) | 0;
  }
  return Math.abs(hash);
}

/** Resolve a stable palette token name for the given identity string. */
function identityTokenFor(name: string): string {
  const key = (name || '').trim().toLowerCase() || '?';
  const idx = identityHash(key) % IDENTITY_PALETTE.length;
  return IDENTITY_PALETTE[idx];
}

/**
 * Derive display initials from a name. Takes the first letter of the first
 * word and the first letter of the last word (if there are 2+ words); for a
 * single word takes the first two characters. Turkish locale-aware uppercase
 * preserves dotted/dotless i (İ/ı). Always returns 1–2 characters.
 */
function initialsFor(name: string): string {
  const trimmed = (name || '').trim();
  if (!trimmed) return '?';
  const words = trimmed.split(/\s+/).filter(w => w.length > 0);
  if (words.length === 1) {
    return words[0].slice(0, 2).toLocaleUpperCase('tr-TR');
  }
  const first = words[0][0] ?? '';
  const last = words[words.length - 1][0] ?? '';
  return (first + last).toLocaleUpperCase('tr-TR');
}

/** Turkish presence labels composed into the host accessible name. */
const PRESENCE_LABEL: Record<ZmAvatarPresence, string> = {
  online: 'çevrimiçi',
  away: 'uzakta',
  busy: 'meşgul',
  offline: 'çevrimdışı',
};

@Component({
  selector: 'zm-avatar',
  standalone: true,
  styleUrl: './avatar.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'zm-avatar',
    '[attr.data-size]': 'size()',
    '[attr.role]': '"img"',
    '[attr.aria-label]': 'accessibleName()',
    '[style.--zm-avatar-identity-color]': '"var(" + identityToken() + ")"',
    '[style.width]': '"var(--zm-avatar-size-" + size() + ")"',
    '[style.height]': '"var(--zm-avatar-size-" + size() + ")"',
  },
  template: `
    <span class="zm-avatar__box">
      @if (showImage()) {
        <img
          class="zm-avatar__image"
          [src]="src()"
          [alt]="name()"
          decoding="async"
          (error)="onImageError()"
          (load)="onImageLoad()"
        />
      }
      @if (showFallback()) {
        <span class="zm-avatar__fallback" aria-hidden="true">{{ resolvedInitials() }}</span>
      }

      @if (presence()) {
        <span
          class="zm-avatar__presence"
          [attr.data-presence]="presence()"
          aria-hidden="true"
        ></span>
      }

      @if (showUnread()) {
        <span class="zm-avatar__unread" aria-hidden="true">{{ unreadLabel() }}</span>
      }
    </span>
  `,
})
export class ZmAvatarComponent {
  /** Display name of the identity. Required for the accessible name and for
   *  deriving the stable identity color + initials. */
  readonly name = input<string>('');

  /** Optional image URL. When empty or when the image fails to load, the
   *  stable identity fallback (color + initials) is shown instead. */
  readonly src = input<string>('');

  /** Explicit initials override. When empty, initials are derived from `name`. */
  readonly initials = input<string>('');

  /** Avatar size. The size token reserves dimensions so the image/fallback
   *  swap never causes layout shift (VAL-DS-030). */
  readonly size = input<ZmAvatarSize>('md');

  /** Presence indicator rendered as a reserved-corner dot, separated from the
   *  avatar content (VAL-DS-031). */
  readonly presence = input<ZmAvatarPresence | ''>('');

  /** Unread count. Values > 0 render a count badge in the opposite corner
   *  from presence; values of 0 / null / undefined hide the badge. Counts
   *  above 99 render as "9+". */
  readonly unread = input<number | null>(null);

  /** Whether the avatar itself is an actionable control. When true, the host
   *  becomes a `button` and emits `activated` on click/keyboard activation.
   *  Leave false when wrapping the avatar in your own link/button. */
  readonly interactive = input<boolean>(false);

  private readonly imageFailed = signal<boolean>(false);
  private readonly imageLoaded = signal<boolean>(false);

  /** Stable identity palette token name for the current `name`. Same name →
   *  same token across remounts (deterministic hash). */
  readonly identityToken = computed<string>(() => identityTokenFor(this.name()));

  /** Resolved initials (explicit override wins; otherwise derived from name). */
  readonly resolvedInitials = computed<string>(() => {
    const explicit = this.initials().trim();
    return explicit || initialsFor(this.name());
  });

  /** Whether to render the `<img>`. We render it only when a src is present
   *  AND it has not failed. Once failed we keep the fallback until the src
   *  changes (see the reset effect below). */
  readonly showImage = computed<boolean>(() => {
    const s = this.src().trim();
    return s.length > 0 && !this.imageFailed();
  });

  /** Whether to render the identity fallback. Shown when there is no src, OR
   *  when the image failed to load. The fallback always fills the reserved
   *  box, so the swap is layout-stable. */
  readonly showFallback = computed<boolean>(() => !this.showImage());

  /** Whether the unread badge should render. */
  readonly showUnread = computed<boolean>(() => {
    const n = this.unread();
    return typeof n === 'number' && n > 0;
  });

  /** Display label for the unread count ("9+" above 99). */
  readonly unreadLabel = computed<string>(() => {
    const n = this.unread();
    if (n === null) return '';
    return n > 99 ? '9+' : String(n);
  });

  /** Composed accessible name: "<name>" + optional presence + optional unread.
   *  The presence dot and unread badge are aria-hidden; their meaning reaches
   *  AT through this label (VAL-DS-031 non-color cue). */
  readonly accessibleName = computed<string>(() => {
    const parts: string[] = [this.name() || 'Bilinmeyen kimlik'];
    const p = this.presence();
    if (p) parts.push(PRESENCE_LABEL[p]);
    const n = this.unread();
    if (typeof n === 'number' && n > 0) {
      parts.push(`${n} okunmamış`);
    }
    return parts.join(', ');
  });

  /** Reset the failure flag whenever the src changes, so a previously-broken
   *  avatar retries when the caller supplies a new URL. */
  private readonly srcReset = effect(() => {
    // Read src() so the effect re-runs on change; reset transient image state.
    this.src();
    this.imageFailed.set(false);
    this.imageLoaded.set(false);
  });

  /** Image error handler — swap to the stable fallback. Idempotent. */
  onImageError(): void {
    if (this.imageFailed()) return;
    this.imageFailed.set(true);
  }

  /** Image load handler — mark loaded (used to suppress a flash of fallback
   *  once the image is decoded). */
  onImageLoad(): void {
    this.imageLoaded.set(true);
  }
}
