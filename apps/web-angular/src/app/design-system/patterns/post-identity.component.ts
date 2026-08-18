import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
} from '@angular/core';
import { ZmAvatarSize } from '../primitives/identity';
import { RouterLink } from '@angular/router';
import { AuthorizedAvatarComponent } from '../../core/media/authorized-avatar.component';

/**
 * ZmPostIdentity — the identity cluster for a post author: avatar + display
 * name + handle, with an optional profile link.
 *
 * Contract (VAL-FEED-009): the author identity is rendered from REAL data
 * (display name + handle), never a raw UUID. When the feed resolves identity,
 * the real handle and display name are shown and the cluster links to the profile. When the
 * identity cannot be resolved from available data, the cluster falls back to
 * an honest, non-identifying label ("Topluluk üyesi") so no internal ID is
 * ever leaked — paired with the ZmAvatar stable identity-token fallback.
 *
 * The handle is the network identity signal; the avatar's stable fallback
 * color + initials (from ZmAvatar) make the author recognizable even without
 * an image. The profile link, when present, is a real router/navigation link
 * (the consumer supplies the href) — it is never a fake or dead anchor.
 *
 * Engine: CSS only. Consumes `--zm-post-identity-*` + `--zm-avatar-*` tokens.
 *
 * @example
 * <zm-post-identity
 *   displayName="Deniz Yılmaz"
 *   handle="deniz"
 *   profileHref="/profil"
 *   [resolved]="true"
 * ></zm-post-identity>
 */
@Component({
  selector: 'zm-post-identity',
  standalone: true,
  imports: [RouterLink, AuthorizedAvatarComponent],
  styleUrl: './post-identity.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'zm-post-identity' },
  template: `
    <zm-authorized-avatar
      [name]="avatarName()"
      [mediaId]="avatarMediaId()"
      [fallbackSrc]="avatarUrl()"
      [size]="size()"
    />

    <span class="zm-post-identity__text">
      @if (profileHref()) {
        <a
          class="zm-post-identity__name zm-post-identity__link"
          [routerLink]="profileHref()"
          [attr.data-resolved]="resolved()"
        >{{ displayName() }}</a>
      } @else {
        <span
          class="zm-post-identity__name"
          [attr.data-resolved]="resolved()"
        >{{ displayName() }}</span>
      }

      @if (handleLabel()) {
        <span class="zm-post-identity__handle">{{ handleLabel() }}</span>
      }
    </span>
  `,
})
export class ZmPostIdentityComponent {
  /** Display name. When `resolved` is false this should be an honest
   *  non-identifying label (e.g. "Topluluk üyesi"), never a raw ID. */
  readonly displayName = input<string>('');

  /** Real handle (without leading @). Empty when unresolved. */
  readonly handle = input<string>('');

  /** Avatar image URL. Empty → ZmAvatar stable identity-token fallback
   *  (deterministic color + initials derived from `displayName`). */
  readonly avatarUrl = input<string>('');

  /** Authorized media identity. The resolver keeps bearer credentials out of DOM URLs. */
  readonly avatarMediaId = input<string | null>(null);

  /** Profile navigation href. When empty, the name renders as plain text
   *  (no fake/dead link). The consumer supplies a real route. */
  readonly profileHref = input<string | null>(null);

  /** Whether the identity was resolved from real profile data. Drives the
   *  `data-resolved` attribute (used for honest styling + assertions). */
  readonly resolved = input<boolean>(false);

  /** Avatar size token. */
  readonly size = input<ZmAvatarSize>('md');

  /** The name passed to ZmAvatar. Uses the display name so the avatar's
   *  stable color + initials match the shown identity. */
  readonly avatarName = computed<string>(() => this.displayName() || 'Bilinmeyen');

  /** Composed handle label with a leading @, or empty when unresolved. */
  readonly handleLabel = computed<string>(() => {
    const h = this.handle().trim();
    return h ? `@${h}` : '';
  });
}
