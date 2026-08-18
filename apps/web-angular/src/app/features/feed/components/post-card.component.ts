import {
  ChangeDetectionStrategy,
  Component,
  computed,
  input,
  output,
  signal,
  viewChild,
  type ElementRef,
} from '@angular/core';
import type { ContentItem, FeedItem, PollView } from '@platform/api';
import { RouterLink } from '@angular/router';
import { ZmPostFrameComponent, ZmPostIdentityComponent } from '../../../design-system/patterns';
import { AuthorizedMediaGalleryComponent } from '../../../core/media/authorized-media-gallery.component';
import { RichTextComponent } from '../../../core/social/rich-text.component';
import { ReportActionComponent } from '../../../core/moderation/report-action.component';

/**
 * Resolved author identity for a feed post.
 *
 * Identity is derived from REAL data whenever possible (VAL-FEED-009): the
 * viewer's own posts resolve to their real handle + display name via
 * `getMyProfile`. When the author cannot be resolved from available feed data
 * (the backend feed payload carries only `authorId` — a UUID — with no
 * handle/display-name/avatar), the identity falls back to an honest,
 * NON-identifying label so no internal UUID is ever surfaced to the reader.
 *
 * The profile link is supplied only when a real destination route exists.
 */
export interface PostAuthorIdentity {
  /** Stable internal key (authorId). NEVER shown to the reader. */
  readonly authorId: string;
  /** Real display name when resolved; honest fallback label otherwise. */
  readonly displayName: string;
  /** Real handle (without @) when resolved; empty otherwise. */
  readonly handle: string;
  /** Avatar image URL when available; empty → ZmAvatar stable fallback. */
  readonly avatarUrl: string;
  /** Authorized profile image ID when the feed summary exposes one. */
  readonly avatarMediaId: string | null;
  /** Real profile route when reachable; null when no destination exists. */
  readonly profileHref: string | null;
  /** True when this is the current viewer. */
  readonly isViewer: boolean;
  /** True when the identity was resolved from real profile data. */
  readonly resolved: boolean;
}

/** Turkish visibility labels + distinct glyphs (audience is shown with a
 *  non-color cue so it is never communicated by tone alone). */
const VISIBILITY_META: Record<string, { label: string; glyph: string }> = {
  Public: { label: 'Herkese açık', glyph: 'globe' },
  Followers: { label: 'Takipçiler', glyph: 'people' },
  CloseFriends: { label: 'Yakın çevre', glyph: 'star' },
  Private: { label: 'Özel', glyph: 'lock' }
};

/** Character threshold beyond which post text is treated as "long" and offered
 *  a focus/scroll-preserving expand (VAL-FEED-019). Tuned to exceed the CSS
 *  6-line clamp at the 70ch reading measure, so the expand control appears
 *  only when text would actually be clipped. */
const LONG_TEXT_THRESHOLD = 340;

/** Format an ISO timestamp as a Turkish relative label ("2 saat önce"). */
function formatRelativeTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diffMs = then - Date.now();
  const rtf = new Intl.RelativeTimeFormat('tr-TR', { numeric: 'auto' });
  const minutes = Math.round(diffMs / 60_000);
  if (Math.abs(minutes) < 60) return rtf.format(minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return rtf.format(hours, 'hour');
  const days = Math.round(hours / 24);
  if (Math.abs(days) < 7) return rtf.format(days, 'day');
  const weeks = Math.round(days / 7);
  if (Math.abs(weeks) < 5) return rtf.format(weeks, 'week');
  const months = Math.round(days / 30);
  if (Math.abs(months) < 12) return rtf.format(months, 'month');
  return rtf.format(Math.round(days / 365), 'year');
}

/** Format an ISO timestamp as a Turkish absolute label (title/tooltip). */
function formatAbsoluteTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return new Intl.DateTimeFormat('tr-TR', {
    day: '2-digit', month: 'short', year: 'numeric', hour: '2-digit', minute: '2-digit'
  }).format(d);
}

/** Extract a readable host from a URL; falls back to the raw string. */
function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return url;
  }
}

/** Turn the ranker's machine-oriented explanations into useful product copy.
 *  The current API exposes `signal:number` diagnostics; numeric scores are
 *  intentionally not shown to readers. Prefer the most personal non-zero
 *  signal, then engagement, then recency. Already-readable future reasons are
 *  preserved, while unknown diagnostic codes stay hidden. */
function readableRankingReason(reasons: readonly string[]): string | null {
  const score = (name: string): number => {
    const raw = reasons.find(reason => reason.startsWith(`${name}:`))?.split(':', 2)[1];
    const value = Number(raw);
    return Number.isFinite(value) ? value : 0;
  };
  if (score('relationship') > 0) return 'Bağlantılarına yakın bir paylaşım';
  if (score('engagement') > 0) return 'Toplulukta ilgi gören bir paylaşım';
  if (score('recency') > 0) return 'Yeni paylaşımlardan';
  return reasons.find(reason => reason.trim().length > 0 && !reason.includes(':'))?.trim() ?? null;
}

/**
 * ZmPostCard — domain-rich presentation of a single feed post.
 *
 * Owns the PRESENTATION layer (m3-post-card-core): real identity + profile
 * link, readable timestamp / audience / content-warning, text + link-preview +
 * media + poll rendering with reserved dimensions (no CLS), discovery reason
 * where available, and long-text expansion that preserves focus + scroll.
 *
 * The action bar (reactions / comments / save) is projected by the consumer
 * via `<ng-content>` so interaction wiring + the later reaction-bar upgrade
 * (m3-post-interactions) stay in the feature page; this component renders only
 * the post presentation above the projected actions. Poll voting is the one
 * interaction rendered here (it is part of the poll content) and is emitted.
 *
 * Fulfils VAL-FEED-009 / 010 / 011 / 017 / 019.
 *
 * Engine: CSS + signals only (no `@angular/animations`). Consumes
 * `--zm-post-frame-*` / `--zm-post-identity-*` tokens (no hardcoded hex).
 */
@Component({
  selector: 'zm-post-card',
  standalone: true,
  imports: [RouterLink, ZmPostFrameComponent, ZmPostIdentityComponent, AuthorizedMediaGalleryComponent, RichTextComponent, ReportActionComponent],
  styleUrl: './post-card.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'zm-post-card' },
  template: `
    <zm-post-frame [raised]="raised()" [discoveryReason]="discoveryReason()">
      @if (shareLabel(); as label) {
        <p class="zm-post-card__share-kind">
          <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
            <path d="M3 5.5 H 10.5 M8.2 3.2 l 2.5 2.3 -2.5 2.3 M13 10.5 H 5.5 M7.8 8.2 l -2.5 2.3 2.5 2.3"
              fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
          <span>{{ label }}</span>
        </p>
      }

      <!-- Identity + metadata header (VAL-FEED-009 / 010) -->
      <header class="zm-post-card__header">
        <zm-post-identity
          [displayName]="author().displayName"
          [handle]="author().handle"
          [avatarUrl]="author().avatarUrl"
          [avatarMediaId]="author().avatarMediaId"
          [profileHref]="author().profileHref"
          [resolved]="author().resolved"
        />

        <div class="zm-post-card__meta">
          <a class="zm-post-card__time-link" [routerLink]="['/icerik', item().content.id]" aria-label="Gönderiyi aç">
            <time
              class="zm-post-card__time"
              [attr.datetime]="item().content.publishedAtUtc"
              [title]="absoluteTime()"
            >{{ relativeTime() }}</time>
          </a>

          <span class="zm-post-card__views" [attr.aria-label]="viewCountLabel()">
            <svg viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
              <path d="M1.5 8 s 2.3 -4 6.5 -4 6.5 4 6.5 4 -2.3 4 -6.5 4 -6.5 -4 -6.5 -4 Z"
                fill="none" stroke="currentColor" stroke-width="1.3" />
              <circle cx="8" cy="8" r="1.8" fill="none" stroke="currentColor" stroke-width="1.3" />
            </svg>
            <span>{{ item().content.viewCount }}</span>
          </span>

          @if (visibility(); as vis) {
            <span class="zm-post-card__audience" [attr.data-vis]="vis.glyph">
              <svg
                class="zm-post-card__audience-glyph"
                viewBox="0 0 16 16"
                width="14"
                height="14"
                aria-hidden="true"
                focusable="false"
              >
                @switch (vis.glyph) {
                  @case ('globe') {
                    <circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" stroke-width="1.3" />
                    <path d="M1.8 8 H 14.2 M8 1.8 c 2 2 2 10.4 0 12.4 M8 1.8 c -2 2 -2 10.4 0 12.4"
                      fill="none" stroke="currentColor" stroke-width="1.3" />
                  }
                  @case ('people') {
                    <circle cx="5.5" cy="6" r="2.4" fill="none" stroke="currentColor" stroke-width="1.3" />
                    <circle cx="10.5" cy="6" r="2.4" fill="none" stroke="currentColor" stroke-width="1.3" />
                    <path d="M2 13.5 c 0 -2.2 1.6 -3.6 3.5 -3.6 s 3.5 1.4 3.5 3.6 M7 13.5 c 0 -2.2 1.6 -3.6 3.5 -3.6 s 3.5 1.4 3.5 3.6"
                      fill="none" stroke="currentColor" stroke-width="1.3" />
                  }
                  @case ('star') {
                    <path d="M8 2.2 l 1.7 3.6 3.9 .5 -2.9 2.7 .8 3.9 L8 11.9 4.5 13.4 l .8 -3.9 -2.9 -2.7 3.9 -.5 Z"
                      fill="none" stroke="currentColor" stroke-width="1.3" stroke-linejoin="round" />
                  }
                  @case ('lock') {
                    <rect x="3.5" y="7.5" width="9" height="6" rx="1.2" fill="none" stroke="currentColor" stroke-width="1.3" />
                    <path d="M5.5 7.5 V 5.5 a 2.5 2.5 0 0 1 5 0 V 7.5" fill="none" stroke="currentColor" stroke-width="1.3" />
                  }
                }
              </svg>
              <span class="zm-post-card__audience-label">{{ vis.label }}</span>
            </span>
          }
        </div>
      </header>

      <!-- Content-warning / sensitive gate (VAL-FEED-010): honest label +
           consequence, content hidden behind an explicit reveal. -->
      @if (gated()) {
        <div class="zm-post-card__warning" role="note">
          <svg class="zm-post-card__warning-glyph" viewBox="0 0 20 20" width="16" height="16" aria-hidden="true" focusable="false">
            <path d="M10 2.5 L 18.5 17.5 H 1.5 Z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" />
            <path d="M10 8.5 V 12.5" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linecap="round" />
            <circle cx="10" cy="14.8" r="0.9" fill="currentColor" />
          </svg>
          <span class="zm-post-card__warning-text">
            {{ warningLabel() }}
          </span>
          @if (!revealed()) {
            <button
              type="button"
              class="zm-post-card__reveal"
              (click)="reveal()"
            >İçeriği göster</button>
          }
        </div>
      }

      @if (contentVisible()) {
        <!-- Body text with long-form measure (68-72ch) + focus/scroll-safe
             expand/collapse (VAL-FEED-011 / VAL-FEED-019). -->
        @if (hasBody()) {
          <div class="zm-post-card__body">
            <p
              class="zm-post-card__text"
              [class.is-clamped]="isLong() && !expanded()"
            ><zm-rich-text [text]="item().content.text" /></p>

            @if (isLong()) {
              <button
                #expandToggle
                type="button"
                class="zm-post-card__expand"
                [attr.aria-expanded]="expanded()"
                (click)="toggleExpand()"
              >{{ expanded() ? 'Daha az göster' : '… Devamını oku' }}</button>
            }
          </div>
        }

        @if (isShare()) {
          @if (original(); as source) {
            <aside class="zm-post-card__source" aria-label="Paylaşılan kaynak gönderi">
              <span class="zm-post-card__source-label">Kaynak gönderi</span>
              <p class="zm-post-card__source-text"><zm-rich-text [text]="source.text || 'Metinsiz medya paylaşımı'" /></p>
              <small class="zm-post-card__source-meta">
                {{ source.viewCount }} görüntülenme · {{ source.visibility === 'Public' ? 'Herkese açık' : 'Sınırlı görünürlük' }}
              </small>
              @if (source.mediaIds.length) {
                <zm-authorized-media-gallery [mediaIds]="source.mediaIds" label="Kaynak gönderinin medyası" />
              }
            </aside>
          } @else if (original() === null) {
            <p class="zm-post-card__source-unavailable" role="note">
              Kaynak gönderi silinmiş, görünürlüğü değişmiş veya artık erişilemiyor.
            </p>
          } @else {
            <p class="zm-post-card__source-loading" role="status">Kaynak gönderi yükleniyor…</p>
          }
        }

        <!-- Link preview card (VAL-FEED-011): honest host + safe external link.
             No fabricated title (the feed carries only the URL). -->
        @if (linkUrl(); as url) {
          <a
            class="zm-post-card__link"
            [href]="url"
            target="_blank"
            rel="noopener noreferrer nofollow"
          >
            <svg class="zm-post-card__link-glyph" viewBox="0 0 16 16" width="14" height="14" aria-hidden="true" focusable="false">
              <path d="M6.5 9.5 a 2.5 2.5 0 0 0 3.5 0 l 2 -2 a 2.5 2.5 0 0 0 -3.5 -3.5 l -1 1"
                fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
              <path d="M9.5 6.5 a 2.5 2.5 0 0 0 -3.5 0 l -2 2 a 2.5 2.5 0 0 0 3.5 3.5 l 1 -1"
                fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
            </svg>
            <span class="zm-post-card__link-host">{{ linkHost() }}</span>
            <span class="zm-post-card__link-action">Bağlantıyı aç ↗</span>
          </a>
        }

        <!-- Authorized media blobs keep bearer credentials out of DOM URLs. -->
        @if (mediaCount() > 0) {
          <zm-authorized-media-gallery [mediaIds]="item().content.mediaIds" />
        }

        @if (hashtags().length) {
          <p class="zm-post-card__tags">
            @for (tag of hashtags(); track tag) {
              <a class="zm-post-card__tag" routerLink="/kesfet" [queryParams]="{q:'#'+tag}">#{{ tag }}</a>
            }
          </p>
        }

        <!-- Poll (VAL-FEED-011): question + options + vote state. -->
        @if (poll(); as poll) {
          <section class="zm-post-card__poll" [attr.aria-label]="poll.question">
            <strong class="zm-post-card__poll-question">{{ poll.question }}</strong>
            <div class="zm-post-card__poll-options">
              @for (option of poll.options; track option.id) {
                <button
                  type="button"
                  class="zm-post-card__poll-option"
                  [class.is-selected]="selectedPollOptionIds().includes(option.id)"
                  [disabled]="!poll.isOpen || !pollInteractive()"
                  [attr.aria-pressed]="poll.allowMultiple ? selectedPollOptionIds().includes(option.id) : null"
                  (click)="vote.emit(option.id)"
                >
                  <span class="zm-post-card__poll-option-text">{{ option.text }}</span>
                  <span class="zm-post-card__poll-option-count">{{ option.voteCount }}</span>
                </button>
              }
            </div>
            <small class="zm-post-card__poll-meta">
              {{ poll.totalVotes }} oy · {{ poll.isOpen ? 'Oylama açık' : 'Oylama kapandı' }}{{poll.allowMultiple?' · Birden fazla seçenek işaretlenebilir':''}}
            </small>
            @if(poll.allowMultiple && poll.isOpen && pollInteractive()){<button class="zm-post-card__poll-submit" type="button" [disabled]="selectedPollOptionIds().length===0" (click)="submitVote.emit()">Seçili seçenekleri gönder</button>}
          </section>
        }
      }

      <!-- Discovery reason (VAL-FEED-017): shown ONLY when the feed provides
           one; never fabricated. -->
      @if (discoveryReason(); as reason) {
        <p class="zm-post-card__reason" role="note">
          <svg class="zm-post-card__reason-glyph" viewBox="0 0 16 16" width="13" height="13" aria-hidden="true" focusable="false">
            <circle cx="8" cy="8" r="6.2" fill="none" stroke="currentColor" stroke-width="1.3" />
            <path d="M8 4.5 V 8.5 M8 11 v .2" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
          </svg>
          <span>{{ reason }}</span>
        </p>
      }

      <zm-report-action subjectType="Content" [subjectId]="item().content.id" label="Gönderiyi bildir" />

      <!-- Projected action bar + comment form (owned by the feature page;
           m3-post-interactions owns the reaction-bar upgrade). -->
      <ng-content />
    </zm-post-frame>
  `,
})
export class ZmPostCardComponent {
  /** The feed item (content + reactions + comment count). */
  readonly item = input.required<FeedItem>();

  /** Resolved author identity (real when available; honest fallback otherwise). */
  readonly author = input.required<PostAuthorIdentity>();

  /** Attached poll, or null when the post has none. */
  readonly poll = input<PollView | null>(null);
  readonly selectedPollOptionIds = input<readonly string[]>([]);
  readonly pollInteractive = input(true);

  /** Visible source post for a repost/quote. Undefined means loading; null
   *  means the real lookup completed but the source is no longer visible. */
  readonly original = input<ContentItem | null | undefined>(undefined);

  /** Strategic raised surface (media/poll). */
  readonly raised = input<boolean>(false);

  /** Feed kind — discovery reasons surface only on the Discovery feed. */
  readonly kind = input<'Following' | 'Discovery'>('Following');

  /** Emitted when the viewer votes on a poll option (optionId). */
  readonly vote = output<string>();
  readonly submitVote = output<void>();

  /** Expand toggle element ref, used to preserve focus + scroll anchor. */
  private readonly expandToggle = viewChild<ElementRef<HTMLButtonElement>>('expandToggle');

  /** Long-text expansion state (VAL-FEED-019). */
  readonly expanded = signal(false);

  /** Content-warning reveal state (VAL-FEED-010). */
  readonly revealed = signal(false);

  /** Whether the post is gated behind a content warning / sensitive flag. */
  readonly gated = computed<boolean>(() =>
    Boolean(this.item().content.contentWarning) || this.item().content.isSensitive
  );

  /** Whether the gated content is currently visible (revealed or not gated). */
  readonly contentVisible = computed<boolean>(() => !this.gated() || this.revealed());

  /** Whether the body text is long enough to offer expand/collapse. */
  readonly isLong = computed<boolean>(() => this.item().content.text.length > LONG_TEXT_THRESHOLD);

  readonly hasBody = computed<boolean>(() => this.item().content.text.trim().length > 0);

  readonly isShare = computed<boolean>(() =>
    this.item().content.shareKind === 'Repost' || this.item().content.shareKind === 'Quote'
  );

  readonly shareLabel = computed<string | null>(() => {
    const kind = this.item().content.shareKind;
    if (kind === 'Repost') return 'Yeniden paylaşıldı';
    if (kind === 'Quote') return 'Alıntı gönderi';
    return null;
  });

  readonly viewCountLabel = computed<string>(() =>
    `${this.item().content.viewCount} görüntülenme`
  );

  /** Composed content-warning / sensitive label. */
  readonly warningLabel = computed<string>(() => {
    const c = this.item().content;
    if (c.contentWarning) return `İçerik notu · ${c.contentWarning}`;
    return 'Bu gönderi hassas içerik barındırabilir.';
  });

  /** Visibility metadata (label + glyph) for the audience chip. */
  readonly visibility = computed<{ label: string; glyph: string }>(() => {
    const key = this.item().content.visibility;
    return key in VISIBILITY_META
      ? VISIBILITY_META[key as keyof typeof VISIBILITY_META]
      : { label: key, glyph: 'globe' };
  });

  readonly relativeTime = computed<string>(() => formatRelativeTime(this.item().content.publishedAtUtc));
  readonly absoluteTime = computed<string>(() => formatAbsoluteTime(this.item().content.publishedAtUtc));

  readonly linkUrl = computed<string | null>(() => this.item().content.linkUrl ?? null);
  readonly linkHost = computed<string>(() => hostOf(this.linkUrl() ?? ''));

  readonly hashtags = computed<string[]>(() => this.item().content.hashtags);

  /** Count of attached media (IDs). Reserved dimensions prevent CLS regardless
   *  of whether the bytes are resolvable. */
  readonly mediaCount = computed<number>(() => this.item().content.mediaIds.length);

  /** Discovery ranking reason, shown only on the Discovery feed AND only when
   *  the API actually provides one (VAL-FEED-017 — never fabricated). */
  readonly discoveryReason = computed<string | null>(() => {
    if (this.kind() !== 'Discovery') return null;
    return readableRankingReason(this.item().rankingReasons);
  });

  /** Reveal gated content (user action — never auto-revealed). */
  reveal(): void {
    this.revealed.set(true);
  }

  /** Toggle long-text expansion, preserving the toggle's viewport position so
   *  expanding content does not scroll the reader away (VAL-FEED-019). */
  toggleExpand(): void {
    const el = this.expandToggle()?.nativeElement;
    const beforeTop = el ? el.getBoundingClientRect().top : null;
    this.expanded.update(v => !v);
    if (el && beforeTop !== null) {
      // Restore the toggle's viewport anchor after the DOM settles so the
      // newly revealed (or collapsed) text does not move the reading position.
      requestAnimationFrame(() => {
        const afterTop = el.getBoundingClientRect().top;
        const delta = afterTop - beforeTop;
        if (Math.abs(delta) > 1) {
          window.scrollBy({ top: delta });
        }
        el.focus({ preventScroll: true });
      });
    } else {
      el?.focus({ preventScroll: true });
    }
  }
}
