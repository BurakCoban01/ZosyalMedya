import { ChangeDetectionStrategy, Component, EffectRef, OnDestroy, OnInit, computed, effect, inject, signal, viewChild } from '@angular/core';
import { FormArray, FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  Api,
  createComment,
  createPoll,
  createPost,
  deletePost,
  deleteComment,
  ContentItem,
  CommentView,
  FeedItem,
  getContent,
  getFeed,
  getMyProfile,
  getPoll,
  getReactionSummary,
  listComments,
  listSavedContent,
  PollView,
  PostView,
  ProfileView,
  recordImpression,
  removeReaction,
  removeSavedContent,
  saveContent,
  setReaction,
  updatePost,
  updateComment,
  votePoll
} from '@platform/api';
import { OnlineStatusService } from '../../core/connectivity/online-status.service';
import { MediaAttachmentPickerComponent, MediaAttachmentTransfer } from '../../core/media/media-attachment-picker.component';
import { StoryRailComponent } from '../stories/story-rail.component';
import { TokenVault } from '../../core/auth/token-vault.service';
import {
  PostAuthorIdentity,
  ZmFeedEmptyStateComponent,
  FeedEmptyVariant,
  ZmFeedErrorStateComponent,
  ZmFeedModeHeaderComponent,
  ZmFeedSkeletonComponent,
  ZmPostCardComponent,
} from './components';

type FeedKind = 'Following' | 'Discovery';
type ReactionKind = 'Like' | 'Love' | 'Insightful' | 'Support' | 'Laugh';
type FeedState = 'loading' | 'populated' | 'empty' | 'filtered-empty' | 'error';

function formatCommentTime(iso: string): string {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const minutes = Math.round((then - Date.now()) / 60_000);
  const relative = new Intl.RelativeTimeFormat('tr-TR', { numeric: 'auto' });
  if (Math.abs(minutes) < 60) return relative.format(minutes, 'minute');
  const hours = Math.round(minutes / 60);
  if (Math.abs(hours) < 24) return relative.format(hours, 'hour');
  const days = Math.round(hours / 24);
  return relative.format(days, 'day');
}

@Component({
  selector: 'app-feed-page',
  imports: [
    ReactiveFormsModule,
    RouterLink,
    ZmFeedModeHeaderComponent,
    ZmFeedSkeletonComponent,
    ZmFeedEmptyStateComponent,
    ZmFeedErrorStateComponent,
    ZmPostCardComponent,
    MediaAttachmentPickerComponent,
    StoryRailComponent
  ],
  template: `
    <zm-feed-mode-header
      [kind]="kind()"
      kicker="CANLI AKIŞ"
      title="Bugün ne anlatmak istersin?"
      [lede]="kind() === 'Discovery' ? 'Topluluğun şu an gündemindeki gönderiler.' : 'Takip ettiğin seslerden yeni düşünceler.'"
      (kindChange)="switchKind($event)"
    />

    <zm-story-rail [allowCreate]="true" />

    <form class="composer" [formGroup]="composer" (ngSubmit)="publish()">
      <textarea formControlName="text" rows="3" maxlength="5000" placeholder="Bir fikir, bir not, bir soru…" aria-label="Gönderi metni"></textarea>
      @if (pollEnabled()) {
        <fieldset class="poll-composer">
          <legend>Anket</legend>
          <input class="poll-question" formControlName="pollQuestion" maxlength="240" placeholder="Anket sorusu" aria-label="Anket sorusu">
          <div class="poll-options" aria-label="Anket seçenekleri">
            @for(option of pollOptions.controls; track $index){
              <div class="poll-option-row">
                <input [formControl]="option" maxlength="120" [placeholder]="($index + 1) + '. seçenek'" [attr.aria-label]="($index + 1) + '. anket seçeneği'">
                <button type="button" [disabled]="pollOptions.length <= 2" (click)="removePollOption($index)" [attr.aria-label]="($index + 1) + '. seçeneği kaldır'">Kaldır</button>
              </div>
            }
            <button class="poll-option-add" type="button" [disabled]="pollOptions.length >= 6" (click)="addPollOption()">Seçenek ekle · {{pollOptions.length}}/6</button>
          </div>
          <div class="poll-settings">
            <label><input type="checkbox" formControlName="pollAllowMultiple"> Birden fazla seçenek seçilebilir</label>
            <label>Kapanış
              <select formControlName="pollDurationDays" aria-label="Anket süresi">
                <option [ngValue]="1">1 gün</option><option [ngValue]="3">3 gün</option><option [ngValue]="7">7 gün</option><option [ngValue]="30">30 gün</option>
              </select>
            </label>
          </div>
        </fieldset>
      }
      <details class="composer-advanced">
        <summary>İçerik notu ve hassasiyet</summary>
        <div class="composer-advanced__fields">
          <label>İçerik notu
            <input formControlName="contentWarning" maxlength="160" placeholder="Örn. yoğun kaygı anlatımı">
            <small>Okur içeriği açmadan önce bu notu görür.</small>
          </label>
          <label class="composer-sensitive"><input type="checkbox" formControlName="isSensitive"><span><strong>Hassas içerik</strong><small>Metin, not yazılmasa da açık bir uyarının arkasında gösterilir.</small></span></label>
        </div>
      </details>
      <zm-media-attachment-picker
        #composerMediaPicker
        label="Gönderi medyası"
        [visibility]="mediaVisibility(composer.controls.visibility.value)"
        [disabled]="publishing() || composer.controls.visibility.value === 'CloseFriends'"
        (mediaIdsChange)="setComposerMediaIds($event)"
        (uploadingChange)="setComposerMediaBusy($event)"
      />
      @if (composer.controls.visibility.value === 'CloseFriends') {
        <p class="composer-visibility-note">Yakın çevre medyası henüz desteklenmiyor. Bu görünürlükte metin veya anket paylaşabilirsin.</p>
      }
      <div class="composer-actions">
        <select formControlName="visibility" aria-label="Gönderi görünürlüğü">
          <option value="Public">Herkese açık</option>
          <option value="Followers">Takipçiler</option>
          <option value="CloseFriends">Yakın çevre</option>
          <option value="Private">Yalnızca ben</option>
        </select>
        @if (composerMediaIds().length) { <small class="composer-visibility-note">Görünürlüğü değiştirmek için medyaları kaldır.</small> }
        <button class="poll-toggle" type="button" (click)="togglePoll()">{{ pollEnabled() ? 'Anketi kaldır' : 'Anket ekle' }}</button>
        <span>{{ composer.controls.text.value.length }}/5000</span>
        <button type="submit" [disabled]="!canPublish() || publishing()">{{ publishing() ? 'Yayınlanıyor…' : 'Yayınla' }}</button>
      </div>
    </form>

    @if (message()) { <p class="message" role="status">{{ message() }}</p> }

    <!-- Client-side filter bar — drives the filtered-empty state
         (VAL-FEED-002). Honest: filters the already-loaded stream. -->
    <div class="feed-filter">
      <label class="feed-filter__field">
        <span class="feed-filter__label">Akışta ara</span>
        <input
          class="feed-filter__input"
          type="search"
          [value]="query()"
          (input)="setQuery($event)"
          placeholder="Yazı, etiket veya yazar ara"
          aria-describedby="feed-filter-hint"
        >
      </label>
      @if (hasFilters()) {
        <button type="button" class="feed-filter__clear" (click)="clearFilters()">
          Filtreyi temizle
        </button>
      }
      <span id="feed-filter-hint" class="feed-filter__hint">
        {{ filteredCount() }} / {{ items().length }} gönderi
      </span>
    </div>

    @if (degraded()) {
      <p class="degraded" role="status">
        Çevrimdışı okuma — gördüğün gönderiler son yüklemeden. Yeniden bağlanınca akış tazelenir.
      </p>
    }

    <section class="stream" [attr.aria-busy]="state() === 'loading'">
      @switch (state()) {
        @case ('loading') {
          <zm-feed-skeleton [count]="3" />
        }
        @case ('error') {
          <zm-feed-error-state
            [offline]="isOffline()"
            (retry)="retry()"
          />
        }
        @case ('filtered-empty') {
          <zm-feed-empty-state
            variant="filtered"
            [query]="query()"
            (resetFilters)="clearFilters()"
          />
        }
        @case ('empty') {
          <zm-feed-empty-state
            [variant]="emptyVariant()"
            (primaryAction)="onEmptyPrimaryAction()"
          />
        }
        @default {
          @for (item of visibleItems(); track item.content.id) {
            <zm-post-card
              [item]="item"
              [author]="authorOf(item)"
              [poll]="polls()[item.content.id]"
              [selectedPollOptionIds]="pollSelection(item.content.id)"
              [original]="originals()[item.content.id]"
              [raised]="isRaised(item)"
              [kind]="kind()"
              (vote)="vote(item.content.id, $event)"
              (submitVote)="submitPollVote(item.content.id)"
            >
              <!-- Projected action bar (reactions / comments / save) — owned by
                   the page; m3-post-interactions owns the reaction-bar upgrade. -->
              <footer class="post-actions">
                <button
                  class="reaction-primary"
                  type="button"
                  [class.selected]="item.reactions.viewerReaction"
                  [disabled]="reactionPendingIds().has(item.content.id)"
                  [attr.aria-pressed]="item.reactions.viewerReaction ? 'true' : 'false'"
                  [attr.aria-label]="reactionPrimaryLabel(item)"
                  (click)="react(item, currentReaction(item) ?? 'Like')"
                ><span aria-hidden="true">{{reactionGlyph(currentReaction(item) ?? 'Like')}}</span> {{reactionLabel(currentReaction(item) ?? 'Like')}} <span>{{ reactionCount(item) }}</span></button>
                <details class="reaction-picker">
                  <summary [attr.aria-label]="'Tepki seç, mevcut tepki: ' + (currentReaction(item) ? reactionLabel(currentReaction(item)!) : 'yok')">Tepki seç</summary>
                  <div class="reaction-picker__menu" role="group" aria-label="Tepki türleri">
                    @for(kind of reactionKinds; track kind){
                      <button
                        type="button"
                        [class.selected]="item.reactions.viewerReaction === kind"
                        [disabled]="reactionPendingIds().has(item.content.id)"
                        [attr.aria-pressed]="item.reactions.viewerReaction === kind"
                        [title]="reactionDescription(kind)"
                        (click)="selectReaction($event, item, kind)"
                      ><span aria-hidden="true">{{reactionGlyph(kind)}}</span> {{reactionLabel(kind)}}</button>
                    }
                  </div>
                </details>
                <button
                  type="button"
                  [attr.aria-expanded]="commentOpenIds().has(item.content.id)"
                  [attr.aria-controls]="'comments-' + item.content.id"
                  (click)="toggleComments(item.content.id)"
                >Yorum <span>{{ item.commentCount }}</span></button>
                <button type="button" [class.selected]="savedIds().has(item.content.id)" (click)="toggleSaved(item.content.id)">{{savedIds().has(item.content.id)?'Kaydedildi':'Kaydet'}}</button>
                <button
                  type="button"
                  [disabled]="!canShare(item) || isSharing(item.content.id)"
                  [title]="shareTitle(item)"
                  (click)="repost(item)"
                >{{ isSharing(item.content.id) ? 'Paylaşılıyor…' : 'Yeniden paylaş' }}</button>
                <button
                  type="button"
                  [class.selected]="quoteTargetId() === item.content.id"
                  [disabled]="!canShare(item) || isSharing(item.content.id)"
                  [title]="shareTitle(item)"
                  (click)="openQuote(item)"
                >Alıntıla</button>
                @if (canManage(item)) {
                  <details class="owner-actions">
                    <summary>Gönderi seçenekleri</summary>
                    <div class="owner-actions__menu">
                      @if (item.content.shareKind !== 'Repost') { <button type="button" (click)="startEdit(item)">Düzenle</button> }
                      <button type="button" class="danger" (click)="requestDelete(item)">Sil</button>
                    </div>
                  </details>
                }
              </footer>

              @if (editingId() === item.content.id) {
                <form class="owner-edit" [formGroup]="editForm" (ngSubmit)="saveEdit(item)">
                  <label>Gönderi metni<textarea formControlName="text" rows="4" maxlength="5000"></textarea></label>
                  <label>Görünürlük<select formControlName="visibility" [attr.aria-describedby]="item.content.mediaIds.length ? 'media-edit-visibility-note-' + item.content.id : null"><option value="Public">Herkese açık</option><option value="Followers">Takipçiler</option><option value="CloseFriends">Yakın çevre</option><option value="Private">Yalnızca ben</option></select></label>
                  @if(item.content.mediaIds.length){<small [id]="'media-edit-visibility-note-' + item.content.id">Medya ekli gönderinin görünürlüğü değiştirilemez; metin ve içerik notunu düzenleyebilirsin.</small>}
                  <label>İçerik notu<input formControlName="contentWarning" maxlength="160"></label>
                  <label class="owner-edit__check"><input type="checkbox" formControlName="isSensitive"> Hassas içerik</label>
                  <div><button type="button" (click)="cancelEdit()">Vazgeç</button><button type="submit" [disabled]="editForm.invalid || ownerPendingIds().has(item.content.id)">{{ownerPendingIds().has(item.content.id)?'Kaydediliyor…':'Değişiklikleri kaydet'}}</button></div>
                </form>
              }

              @if (deleteConfirmId() === item.content.id) {
                <section class="owner-confirm" role="alertdialog" aria-labelledby="delete-title" aria-describedby="delete-copy">
                  <strong id="delete-title">Bu gönderi silinsin mi?</strong><p id="delete-copy">Gönderi akıştan kaldırılır; bu işlem geri alınamaz.</p>
                  <div><button type="button" (click)="cancelDelete()">Vazgeç</button><button type="button" class="danger" [disabled]="ownerPendingIds().has(item.content.id)" (click)="confirmDelete(item)">{{ownerPendingIds().has(item.content.id)?'Siliniyor…':'Gönderiyi sil'}}</button></div>
                </section>
              }

              @if (quoteTargetId() === item.content.id) {
                <form class="quote-composer" (submit)="onQuoteSubmit($event, item)">
                  <label [for]="'quote-' + item.content.id">Alıntına bir not ekle</label>
                  <textarea
                    [id]="'quote-' + item.content.id"
                    [formControl]="quoteText"
                    rows="3"
                    maxlength="5000"
                    placeholder="Bu gönderi hakkında ne düşünüyorsun?"
                  ></textarea>
                  <zm-media-attachment-picker
                    #quoteMediaPicker
                    label="Alıntı medyası"
                    visibility="Public"
                    [disabled]="isSharing(item.content.id)"
                    (mediaIdsChange)="quoteMediaIds.set($event)"
                    (uploadingChange)="quoteMediaBusy.set($event)"
                  />
                  <div>
                    <span>{{ quoteText.value.length }}/5000</span>
                    <button type="button" [disabled]="isSharing(item.content.id)" (click)="cancelQuote()">Vazgeç</button>
                    <button type="submit" [disabled]="!canPublishQuote() || isSharing(item.content.id)">
                      {{ isSharing(item.content.id) ? 'Yayınlanıyor…' : 'Alıntıyı yayınla' }}
                    </button>
                  </div>
                </form>
              }

              @if (commentOpenIds().has(item.content.id)) {
                <section class="comment-thread" [id]="'comments-' + item.content.id" aria-label="Yorumlar">
                  @if (commentLoadingIds().has(item.content.id)) {
                    <p class="comment-thread__state" role="status">Yorumlar yükleniyor…</p>
                  } @else if (commentErrors()[item.content.id]) {
                    <p class="comment-thread__state comment-thread__state--error" role="alert">
                      Yorumlar yüklenemedi.
                      <button type="button" (click)="loadComments(item.content.id, true)">Tekrar dene</button>
                    </p>
                  } @else if (commentsFor(item.content.id).length) {
                    <div class="comment-thread__list">
                      @for (comment of commentsFor(item.content.id); track comment.id) {
                        <article class="comment-thread__item" [style.--comment-depth]="commentIndent(comment)">
                          <header>
                            @if(comment.author;as author){<a [routerLink]="['/profil',author.handle]"><strong>{{author.displayName}}</strong><span>&#64;{{author.handle}}</span></a>}@else{<strong>{{comment.status==='Deleted'?'Silinmiş yorum':'Gizli profil'}}</strong>}
                            <time [attr.datetime]="comment.createdAtUtc">{{ commentTime(comment.createdAtUtc) }}</time>
                          </header>
                          @if(comment.status==='Deleted'){<p class="comment-thread__deleted">Yorum silindi.</p>}@else if(commentEditId()===comment.id){<form class="comment-thread__edit" (submit)="saveCommentEdit($event,item,comment,editInput.value)"><input #editInput [value]="comment.text" maxlength="2000" aria-label="Yorumu düzenle"><button type="button" (click)="commentEditId.set(null)">Vazgeç</button><button type="submit" [disabled]="commentSubmittingIds().has(comment.id)">Kaydet</button></form>}@else{<p>{{ comment.text }}</p><div class="comment-thread__actions">@if(comment.depth<5){<button type="button" (click)="setReplyTarget(item.content.id,comment)">Yanıtla</button>}@if(comment.canManage){<button type="button" (click)="commentEditId.set(comment.id)">Düzenle</button><button type="button" class="danger" (click)="deleteOwnComment(item,comment)">Sil</button>}</div>}
                        </article>
                      }
                    </div>
                  } @else {
                    <p class="comment-thread__state">Henüz yorum yok. İlk düşünceyi sen ekleyebilirsin.</p>
                  }

                  @if(replyTarget(item.content.id);as target){<p class="comment-thread__replying"><strong>{{target.author?.displayName ?? 'Yoruma'}}</strong> yanıtlanıyor. <button type="button" (click)="setReplyTarget(item.content.id,null)">Vazgeç</button></p>}
                  <form class="comment" (submit)="onCommentSubmit($event, item)">
                    <input #commentInput [id]="'comment-' + item.content.id" maxlength="2000" placeholder="Düşünceni ekle" aria-label="Yorum yaz" [disabled]="commentSubmittingIds().has(item.content.id)">
                    <button type="submit" [disabled]="commentSubmittingIds().has(item.content.id)">
                      {{ commentSubmittingIds().has(item.content.id) ? 'Gönderiliyor…' : 'Gönder' }}
                    </button>
                  </form>
                  @if(commentNextCursors()[item.content.id]){<button type="button" class="comment-thread__more" [disabled]="commentLoadingIds().has(item.content.id)" (click)="loadMoreComments(item.content.id)">Daha fazla yorum</button>}
                </section>
              }
            </zm-post-card>

            <!-- Stream rhythm: a quiet editorial-cut separator between every
                 few posts so the stream reads as a sequence of moments, not a
                 uniform grid of heavy floating cards (VAL-FEED-021). -->
            @if (shouldSeparate($index, visibleItems().length)) {
              <div class="stream__cut" aria-hidden="true">
                <svg viewBox="0 0 120 8" preserveAspectRatio="none" focusable="false">
                  <path d="M2 4 H 50 M58 4 H 118" fill="none" stroke="currentColor" stroke-width="1.4" stroke-linecap="round" />
                  <circle cx="54" cy="4" r="1.6" fill="currentColor" />
                </svg>
              </div>
            }
          }
        }
      }
    </section>

    @if (nextCursor() && state() !== 'loading' && state() !== 'error') {
      <button class="more" type="button" [disabled]="loading()" (click)="loadMore()">
        {{ loading() ? 'Yükleniyor…' : 'Daha fazla göster' }}
      </button>
    }
  `,
  styleUrls: ['./feed.page.css', './feed-poll.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class FeedPage implements OnInit, OnDestroy {
  private readonly connectivity = inject(OnlineStatusService);

  readonly items = signal<FeedItem[]>([]);
  readonly kind = signal<FeedKind>('Following');
  readonly nextCursor = signal<string | null>(null);
  readonly loading = signal(false);
  readonly publishing = signal(false);
  readonly message = signal('');
  readonly savedIds = signal(new Set<string>());
  readonly pollEnabled = signal(false);
  readonly polls = signal<Record<string, PollView>>({});
  readonly pollSelections = signal<Record<string, string[]>>({});
  readonly pollOptions = new FormArray<FormControl<string>>([this.pollOption(), this.pollOption()]);
  readonly reactionPendingIds = signal(new Set<string>());
  readonly reactionKinds: readonly ReactionKind[] = ['Like', 'Love', 'Insightful', 'Support', 'Laugh'];
  private loadRevision = 0;
  private publishRevision = 0;
  private accountRevision = 0;
  private currentSubject = '';
  private readonly sessionSync: EffectRef;
  readonly originals = signal<Record<string, ContentItem | null>>({});
  readonly sharingIds = signal(new Set<string>());
  readonly quoteTargetId = signal<string | null>(null);
  readonly comments = signal<Record<string, CommentView[]>>({});
  readonly commentOpenIds = signal(new Set<string>());
  readonly commentLoadingIds = signal(new Set<string>());
  readonly commentSubmittingIds = signal(new Set<string>());
  readonly commentErrors = signal<Record<string, boolean>>({});
  readonly commentNextCursors = signal<Record<string, string | null>>({});
  readonly commentReplyTargets = signal<Record<string, CommentView | null>>({});
  readonly commentEditId = signal<string | null>(null);
  readonly quoteText = new FormControl('', {
    nonNullable: true,
    validators: [Validators.maxLength(5000)]
  });
  /** True when the most recent feed load failed. Cleared on a successful load
   *  or when the user activates retry. Distinct from the transient `message`
   *  status line (which carries publish/comment feedback). */
  readonly loadError = signal(false);
  /** Client-side filter text (drives the filtered-empty state, VAL-FEED-002). */
  readonly query = signal('');
  readonly composer = new FormGroup({
    text: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(5000)] }),
    visibility: new FormControl<'Public' | 'Followers' | 'CloseFriends' | 'Private'>('Public', { nonNullable: true }),
    pollQuestion: new FormControl('', { nonNullable: true }),
    contentWarning: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(160)] }),
    isSensitive: new FormControl(false, { nonNullable: true }),
    pollAllowMultiple: new FormControl(false, { nonNullable: true }),
    pollDurationDays: new FormControl<1 | 3 | 7 | 30>(1, { nonNullable: true })
  });
  readonly composerMediaIds = signal<string[]>([]);
  readonly quoteMediaIds = signal<string[]>([]);
  readonly composerMediaBusy = signal(false);
  readonly quoteMediaBusy = signal(false);
  private readonly composerMediaPicker = viewChild<MediaAttachmentPickerComponent>('composerMediaPicker');
  private readonly quoteMediaPicker = viewChild<MediaAttachmentPickerComponent>('quoteMediaPicker');
  readonly editingId = signal<string | null>(null);
  readonly deleteConfirmId = signal<string | null>(null);
  readonly ownerPendingIds = signal(new Set<string>());
  readonly editForm = new FormGroup({
    text: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.maxLength(5000)] }),
    visibility: new FormControl<'Public' | 'Followers' | 'CloseFriends' | 'Private'>('Public', { nonNullable: true }),
    contentWarning: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(160)] }),
    isSensitive: new FormControl(false, { nonNullable: true })
  });

  /** Resolved viewer profile. Used to present REAL identity (handle + display
   *  name) on the viewer's own posts rather than a raw author UUID. Null until
   *  `getMyProfile` resolves (or fails). Feed load is not blocked on this. */
  readonly myProfile = signal<ProfileView | null>(null);

  constructor(private readonly api: Api, private readonly vault: TokenVault) {
    this.currentSubject = this.sessionSubject();
    this.sessionSync = effect(() => {
      const subject = this.sessionSubject();
      if (subject === this.currentSubject) return;
      this.currentSubject = subject; ++this.publishRevision; ++this.loadRevision; ++this.accountRevision;
      this.publishing.set(false); this.sharingIds.set(new Set()); this.composer.reset();
      this.composerMediaIds.set([]); this.cancelQuote(); this.message.set(''); this.items.set([]);
      this.originals.set({}); this.polls.set({}); this.savedIds.set(new Set()); this.myProfile.set(null); this.nextCursor.set(null);
      if (!subject) return;
      void this.loadProfile(); void this.loadSavedState(); void this.load(false);
    });
  }

  /** Exposed for the template so the error surface can name the cause. */
  readonly isOffline = this.connectivity.isOffline;

  /** True when we are offline AND still showing cached content (degraded
   *  read state, VAL-FEED-001 "offline/degraded read state"). */
  readonly degraded = computed<boolean>(() => this.isOffline() && this.items().length > 0);

  /** Whether a client filter is currently active. */
  readonly hasFilters = computed<boolean>(() => this.query().trim().length > 0);

  /** Items after applying the client filter. Honest: only filters already-
   *  loaded real items; never fabricates content. */
  readonly filteredItems = computed<FeedItem[]>(() => {
    const q = this.query().trim().toLowerCase();
    const all = this.items();
    if (!q) return all;
    return all.filter(item =>
      item.content.text.toLowerCase().includes(q) ||
      item.content.hashtags.some(tag => tag.toLowerCase().includes(q)) ||
      this.authorSearchText(item).includes(q)
    );
  });

  /** Count of items surviving the filter, for the filter-bar hint. */
  readonly filteredCount = computed<number>(() => this.filteredItems().length);

  /** Items rendered in the populated stream. When a filter is active this is
   *  the filtered subset; otherwise the full loaded set. */
  readonly visibleItems = computed<FeedItem[]>(() => this.hasFilters() ? this.filteredItems() : this.items());

  /** The single source-of-truth view state. Order matters: loading beats
   *  error beats filtered-empty beats empty beats populated. A failed load
   *  with cached items degrades to populated-with-banner rather than a blank
   *  error so the user keeps reading what they have. */
  readonly state = computed<FeedState>(() => {
    const hasItems = this.items().length > 0;
    if (this.loading() && !hasItems && !this.loadError()) return 'loading';
    if (this.loadError() && !hasItems) return 'error';
    if (this.hasFilters() && this.filteredItems().length === 0 && hasItems) return 'filtered-empty';
    if (!hasItems && !this.loading()) return 'empty';
    return 'populated';
  });

  /** Which true-empty copy to show (kind-aware). */
  readonly emptyVariant = computed<FeedEmptyVariant>(() => this.kind() === 'Discovery' ? 'discovery' : 'following');

  ngOnInit(): void {
    void this.loadProfile();
    void this.loadSavedState();
    void this.load(false);
  }

  ngOnDestroy(): void { ++this.publishRevision; ++this.loadRevision; this.sessionSync.destroy(); }

  private async loadSavedState(): Promise<void> {
    const revision=this.accountRevision;
    try {
      const page = await this.api.invoke(listSavedContent, { collection: 'Genel', limit: 50 });
      if(revision!==this.accountRevision)return;
      this.savedIds.set(new Set(page.items.map(item => item.content.id)));
    } catch {
      /* Feed reading remains available; a later save mutation still reconciles locally. */
    }
  }

  /** Resolve the viewer's own profile for real identity on their posts. Fails
   *  silently (posts fall back to an honest non-identifying label). */
  private async loadProfile(): Promise<void> {
    const revision=this.accountRevision;
    try {
      const profile = await this.api.invoke(getMyProfile, {});
      // Defensive: a truthy-but-empty object (test stub) must not masquerade
      // as a resolved profile. Require a non-empty ownerId + handle.
      if (revision===this.accountRevision && profile && profile.ownerId && profile.handle) {
        this.myProfile.set(profile);
      }
    } catch {
      /* Leave null — unresolved authors present an honest fallback identity. */
    }
  }

  /** Resolve author identity from the bounded summary embedded by the feed.
   *  Profiles intentionally withheld by the server present an honest,
   *  non-identifying label — never the raw UUID (VAL-FEED-009). */
  authorOf(item: FeedItem): PostAuthorIdentity {
    const profile = this.myProfile();
    const author = item.author;
    if (author) {
      const isViewer = profile?.ownerId === author.ownerId;
      return {
        authorId: item.content.authorId,
        displayName: author.displayName,
        handle: author.handle,
        avatarUrl: '',
        avatarMediaId: author.profileMediaId ?? null,
        profileHref: isViewer ? '/profil' : `/profil/${encodeURIComponent(author.handle)}`,
        isViewer,
        resolved: true
      };
    }
    return {
      authorId: item.content.authorId,
      displayName: 'Topluluk üyesi',
      handle: '',
      avatarUrl: '',
      avatarMediaId: null,
      profileHref: null,
      isViewer: false,
      resolved: false
    };
  }

  async switchKind(kind: FeedKind): Promise<void> {
    if (kind === this.kind()) return;
    this.kind.set(kind);
    this.clearFilters();
    this.items.set([]);
    this.nextCursor.set(null);
    this.loadError.set(false);
    await this.load(false);
  }

  canPublish(): boolean {
    return !this.composer.invalid && !this.publishing() && !this.composerMediaBusy() &&
      (this.composer.controls.text.value.trim().length > 0 || this.composerMediaIds().length > 0);
  }

  canPublishQuote(): boolean {
    return !this.quoteText.invalid && !this.quoteMediaBusy() &&
      (this.quoteText.value.trim().length > 0 || this.quoteMediaIds().length > 0);
  }

  mediaVisibility(visibility: 'Public' | 'Followers' | 'CloseFriends' | 'Private'): 'Public' | 'Followers' | 'Private' {
    return visibility === 'Public' || visibility === 'Followers' ? visibility : 'Private';
  }

  setComposerMediaIds(ids: string[]): void {
    this.composerMediaIds.set(ids);
    this.syncComposerVisibilityLock();
  }

  setComposerMediaBusy(busy: boolean): void {
    this.composerMediaBusy.set(busy);
    this.syncComposerVisibilityLock();
  }

  private syncComposerVisibilityLock(): void {
    const visibility = this.composer.controls.visibility;
    const locked = this.composerMediaBusy() || this.composerMediaIds().length > 0;
    if (locked && visibility.enabled) visibility.disable({ emitEvent: false });
    if (!locked && visibility.disabled) visibility.enable({ emitEvent: false });
  }

  async publish(): Promise<void> {
    if (!this.canPublish()) return;
    const operation = ++this.publishRevision;
    const ownerAccessToken = this.vault.accessToken();
    const ownerSubject = this.sessionSubject(ownerAccessToken);
    this.publishing.set(true);
    this.message.set('');
    let mediaTransfer: MediaAttachmentTransfer | undefined;
    try {
      const value = this.composer.getRawValue();
      if (this.pollEnabled() && !this.validPoll(value)) {
        this.message.set('Anket sorusu ile 2–6 benzersiz ve boş olmayan seçenek gerekli.');
        return;
      }
      const selectedMediaIds = [...this.composerMediaIds()];
      mediaTransfer = this.composerMediaPicker()?.transfer();
      const mediaIds = mediaTransfer?.ids.length ? mediaTransfer.ids : selectedMediaIds;
      const post = await this.api.invoke(createPost, { body: {
        text: value.text.trim() || null, visibility: value.visibility, mediaIds, shareKind: 'Original',
        originalPostId: null, linkUrl: null, contentWarning: value.contentWarning.trim() || null, isSensitive: value.isSensitive,
        isDraft: false, publishAtUtc: null
      }});
      if (!this.publishOperationCurrent(operation, ownerSubject)) return;
      let createdPoll: PollView | null = null;
      if (this.pollEnabled()) {
        const options = this.cleanedPollOptions();
        try {
          createdPoll = await this.api.invoke(createPoll, { contentId: post.id, body: {
            question: value.pollQuestion.trim(), options,
            allowMultiple: value.pollAllowMultiple, closesAtUtc: new Date(Date.now() + value.pollDurationDays * 24 * 60 * 60 * 1000).toISOString()
          }});
        } catch {
          if (!this.publishOperationCurrent(operation, ownerSubject)) return;
          try {
            await this.api.invoke(deletePost, { contentId: post.id });
            const mediaRemoved = await mediaTransfer?.discard() ?? true;
            this.message.set(mediaRemoved
              ? 'Anket eklenemedi; yarım gönderi ve medyaları kaldırıldı, metnin korunuyor. Yeniden deneyebilirsin.'
              : 'Anket eklenemedi; yarım gönderi kaldırıldı ancak bazı medyalar temizlenemedi. Ekler görünür durumda; kaldırmayı yeniden deneyebilirsin.');
          } catch {
            this.prependCreatedPost(post, null);
            this.resetComposerAfterPublish();
            this.message.set('Gönderi yayımlandı ancak anket eklenemedi. Aynı metni yeniden yayınlamak yerine gönderiyi düzenleyebilirsin.');
          }
          return;
        }
      }
      this.resetComposerAfterPublish();
      this.kind.set('Following');
      await this.load(false);
      this.prependCreatedPost(post, createdPoll);
      this.message.set('Gönderin yayında.');
    } catch (error) {
      if (!this.publishOperationCurrent(operation, ownerSubject)) {
        if (this.confirmedRejected(error)) await mediaTransfer?.discardWithAccessToken(ownerAccessToken);
        return;
      }
      await mediaTransfer?.rollback();
      this.message.set('Gönderi yayınlanamadı. Metnin ve medyaların korundu; yeniden deneyebilirsin.');
    } finally {
      if (operation === this.publishRevision) this.publishing.set(false);
    }
  }

  async loadMore(): Promise<void> { await this.load(true); }

  canManage(item: FeedItem): boolean { return this.myProfile()?.ownerId === item.content.authorId; }

  startEdit(item: FeedItem): void {
    if (!this.canManage(item) || item.content.shareKind === 'Repost') return;
    this.deleteConfirmId.set(null);
    this.editingId.set(item.content.id);
    this.editForm.setValue({
      text: item.content.text,
      visibility: item.content.visibility as 'Public' | 'Followers' | 'CloseFriends' | 'Private',
      contentWarning: item.content.contentWarning ?? '',
      isSensitive: item.content.isSensitive
    });
    if (item.content.mediaIds.length) this.editForm.controls.visibility.disable({emitEvent:false});
    else this.editForm.controls.visibility.enable({emitEvent:false});
  }

  cancelEdit(): void { this.editingId.set(null); }

  async saveEdit(item: FeedItem): Promise<void> {
    if (!this.canManage(item) || this.editingId() !== item.content.id || this.editForm.invalid || this.ownerPendingIds().has(item.content.id)) return;
    this.setOwnerPending(item.content.id, true);
    this.message.set('');
    try {
      const value = this.editForm.getRawValue();
      const visibility = item.content.mediaIds.length
        ? item.content.visibility as 'Public' | 'Followers' | 'CloseFriends' | 'Private'
        : value.visibility;
      const updated = await this.api.invoke(updatePost, { contentId: item.content.id, body: {
        text: value.text.trim(), mediaIds: item.content.mediaIds, visibility,
        linkUrl: item.content.linkUrl, contentWarning: value.contentWarning.trim() || null,
        isSensitive: value.isSensitive, expectedVersion: item.content.version
      }});
      this.patchItem(item.content.id, current => ({ ...current, content: {
        ...current.content,
        text: updated.text, mediaIds: updated.mediaIds, mentions: updated.mentions, hashtags: updated.hashtags,
        visibility: updated.visibility, linkUrl: updated.linkUrl, contentWarning: updated.contentWarning,
        isSensitive: updated.isSensitive, version: updated.version
      }}));
      this.editingId.set(null);
      this.message.set('Gönderi güncellendi.');
    } catch {
      this.message.set('Gönderi düzenlenemedi. Metnin korunuyor; akışı yenileyip yeniden deneyebilirsin.');
    } finally {
      this.setOwnerPending(item.content.id, false);
    }
  }

  requestDelete(item: FeedItem): void { if (this.canManage(item)) { this.editingId.set(null); this.deleteConfirmId.set(item.content.id); } }
  cancelDelete(): void { this.deleteConfirmId.set(null); }
  async confirmDelete(item: FeedItem): Promise<void> {
    if (!this.canManage(item) || this.deleteConfirmId() !== item.content.id || this.ownerPendingIds().has(item.content.id)) return;
    this.setOwnerPending(item.content.id, true);
    this.message.set('');
    try {
      await this.api.invoke(deletePost, { contentId: item.content.id });
      this.items.update(items => items.filter(current => current.content.id !== item.content.id));
      this.deleteConfirmId.set(null);
      this.message.set('Gönderi silindi.');
    } catch {
      this.message.set('Gönderi silinemedi; akışta tutuldu. Yeniden deneyebilirsin.');
    } finally {
      this.setOwnerPending(item.content.id, false);
    }
  }

  /** Retry a failed initial load. Clears the error flag and re-runs the same
   *  operation that failed — never a fake success. */
  async retry(): Promise<void> {
    this.loadError.set(false);
    this.message.set('');
    await this.load(false);
  }

  async react(item: FeedItem, reaction: ReactionKind): Promise<void> {
    const contentId = item.content.id;
    if (this.reactionPendingIds().has(contentId)) return;
    const currentItem = this.items().find(entry => entry.content.id === contentId) ?? item;
    const previous = structuredClone(currentItem.reactions);
    const previousKind = previous.viewerReaction as ReactionKind | null | undefined;
    const removing = previousKind === reaction;
    const counts = { ...previous.counts };
    if (previousKind) counts[previousKind] = Math.max(0, (counts[previousKind] ?? 0) - 1);
    if (!removing) counts[reaction] = Math.max(0, counts[reaction] ?? 0) + 1;
    this.setReactionPending(contentId, true);
    this.patchItem(contentId, current => ({ ...current, reactions: { ...current.reactions, counts, viewerReaction: removing ? null : reaction } }));
    try {
      if (removing) await this.api.invoke(removeReaction, { contentId });
      else await this.api.invoke(setReaction, { contentId, body: { kind: reaction } });
    } catch {
      this.patchItem(contentId, current => ({ ...current, reactions: previous }));
      this.message.set('Tepki kaydedilemedi; değişiklik geri alındı.');
      this.setReactionPending(contentId, false);
      return;
    }
    try {
      const summary = await this.api.invoke(getReactionSummary, { contentId });
      this.patchItem(contentId, current => ({ ...current, reactions: summary }));
    } catch {
      this.message.set('Tepki kaydedildi; güncel sayaç bir sonraki yenilemede eşitlenecek.');
    } finally {
      this.setReactionPending(contentId, false);
    }
  }

  selectReaction(event: Event, item: FeedItem, reaction: ReactionKind): void {
    (event.currentTarget as HTMLElement | null)?.closest('details')?.removeAttribute('open');
    void this.react(item, reaction);
  }

  currentReaction(item: FeedItem): ReactionKind | null {
    return this.reactionKinds.includes(item.reactions.viewerReaction as ReactionKind)
      ? item.reactions.viewerReaction as ReactionKind
      : null;
  }

  reactionLabel(kind: ReactionKind): string {
    return ({ Like:'Beğen', Love:'Sevdim', Insightful:'Düşündürücü', Support:'Destek', Laugh:'Güldüm' } as const)[kind];
  }

  reactionGlyph(kind: ReactionKind): string {
    return ({ Like:'♡', Love:'♥', Insightful:'◇', Support:'✦', Laugh:'☺' } as const)[kind];
  }

  reactionDescription(kind: ReactionKind): string {
    return ({ Like:'Beğendiğini belirt', Love:'Çok sevdiğini belirt', Insightful:'Seni düşündüren bir paylaşım olduğunu belirt', Support:'Desteğini göster', Laugh:'Seni güldürdüğünü belirt' } as const)[kind];
  }

  reactionPrimaryLabel(item: FeedItem): string {
    const selected = this.currentReaction(item);
    return selected
      ? `${this.reactionLabel(selected)} tepkisini kaldır, toplam ${this.reactionCount(item)} tepki`
      : `Beğen, toplam ${this.reactionCount(item)} tepki`;
  }

  async comment(event: Event, item: FeedItem, text: string): Promise<boolean> {
    event.preventDefault();
    const body = text.trim();
    if (!body || this.commentSubmittingIds().has(item.content.id)) return false;
    this.setCommentPending(item.content.id, true);
    this.patchItem(item.content.id, current => ({ ...current, commentCount: current.commentCount + 1 }));
    try {
      const parentId=this.replyTarget(item.content.id)?.id??null;
      const created = await this.api.invoke(createComment, { contentId: item.content.id, body: { text: body, parentId } });
      if (created?.id) {
        this.comments.update(current => ({
          ...current,
          [item.content.id]: this.sortComments([...(current[item.content.id] ?? []), created])
        }));
      } else {
        await this.loadComments(item.content.id, true);
      }
      this.message.set('Yorumun eklendi.');
      this.setReplyTarget(item.content.id,null);
      return true;
    } catch {
      this.patchItem(item.content.id, current => ({ ...current, commentCount: Math.max(0, current.commentCount - 1) }));
      this.message.set('Yorum kaydedilemedi; sayaç geri alındı.');
      return false;
    } finally {
      this.setCommentPending(item.content.id, false);
    }
  }

  /** Comment form submit handler — prevents default, reads the input, clears
   *  it, and delegates to `comment` (preserves the optimistic + rollback path). */
  async onCommentSubmit(event: Event, item: FeedItem): Promise<void> {
    const form = event.target as HTMLFormElement | null;
    const input = form?.querySelector<HTMLInputElement>('input');
    const text = input?.value ?? '';
    const saved = await this.comment(event, item, text);
    if (saved && input) input.value = '';
  }

  async toggleSaved(contentId:string):Promise<void>{const collection='Genel';const previous=this.savedIds();const next=new Set(previous);const removing=next.delete(contentId);if(!removing)next.add(contentId);this.savedIds.set(next);try{if(removing)await this.api.invoke(removeSavedContent,{contentId,collection});else await this.api.invoke(saveContent,{contentId,body:{collection}});this.message.set(removing?'Kayıt kaldırıldı.':'Gönderi kaydedildi.');}catch{this.savedIds.set(previous);this.message.set('Kaydetme işlemi uygulanamadı; değişiklik geri alındı.');}}

  canShare(item: FeedItem): boolean {
    return item.content.visibility === 'Public';
  }

  isSharing(contentId: string): boolean {
    return this.sharingIds().has(contentId);
  }

  shareTitle(item: FeedItem): string {
    return this.canShare(item)
      ? 'Bu herkese açık gönderiyi paylaş'
      : 'Sınırlı görünürlüklü gönderiler yeniden paylaşılamaz';
  }

  openQuote(item: FeedItem): void {
    if (!this.canShare(item)) return;
    if (this.quoteTargetId() === item.content.id) {
      this.cancelQuote();
      return;
    }
    this.quoteTargetId.set(item.content.id);
    this.quoteText.reset();
    this.quoteMediaIds.set([]);
    this.quoteMediaBusy.set(false);
    requestAnimationFrame(() => document.getElementById(`quote-${item.content.id}`)?.focus());
  }

  cancelQuote(): void {
    this.quoteTargetId.set(null);
    this.quoteText.reset();
    this.quoteMediaIds.set([]);
    this.quoteMediaBusy.set(false);
  }

  async repost(item: FeedItem): Promise<void> {
    if (!this.canShare(item) || this.isSharing(item.content.id)) return;
    this.setSharing(item.content.id, true);
    this.message.set('');
    try {
      await this.api.invoke(createPost, { body: {
        text: null,
        mediaIds: [],
        visibility: 'Public',
        shareKind: 'Repost',
        originalPostId: item.content.id,
        linkUrl: null,
        contentWarning: null,
        isSensitive: false,
        isDraft: false,
        publishAtUtc: null
      }});
      await this.load(false);
      this.message.set('Gönderi yeniden paylaşıldı.');
    } catch {
      this.message.set('Yeniden paylaşım oluşturulamadı. Kaynak görünürlüğünü kontrol et.');
    } finally {
      this.setSharing(item.content.id, false);
    }
  }

  async publishQuote(item: FeedItem): Promise<void> {
    if (!this.canShare(item) || this.quoteTargetId() !== item.content.id || !this.canPublishQuote() || this.isSharing(item.content.id)) return;
    this.setSharing(item.content.id, true);
    const operation = ++this.publishRevision;
    const ownerAccessToken = this.vault.accessToken();
    const ownerSubject = this.sessionSubject(ownerAccessToken);
    this.message.set('');
    const selectedMediaIds = [...this.quoteMediaIds()];
    const mediaTransfer = this.quoteMediaPicker()?.transfer();
    try {
      await this.api.invoke(createPost, { body: {
        text: this.quoteText.value.trim() || null,
        mediaIds: mediaTransfer?.ids.length ? mediaTransfer.ids : selectedMediaIds,
        visibility: 'Public',
        shareKind: 'Quote',
        originalPostId: item.content.id,
        linkUrl: null,
        contentWarning: null,
        isSensitive: false,
        isDraft: false,
        publishAtUtc: null
      }});
      if (!this.publishOperationCurrent(operation, ownerSubject)) return;
      this.cancelQuote();
      await this.load(false);
      this.message.set('Alıntı gönderin yayınlandı.');
    } catch (error) {
      if (!this.publishOperationCurrent(operation, ownerSubject)) {
        if (this.confirmedRejected(error)) await mediaTransfer?.discardWithAccessToken(ownerAccessToken);
        return;
      }
      await mediaTransfer?.rollback();
      this.message.set('Alıntı yayınlanamadı. Metnin ve medyaların korundu; kaynak görünürlüğünü kontrol edip yeniden deneyebilirsin.');
    } finally {
      if (operation === this.publishRevision) this.setSharing(item.content.id, false);
    }
  }

  async onQuoteSubmit(event: Event, item: FeedItem): Promise<void> {
    event.preventDefault();
    await this.publishQuote(item);
  }

  togglePoll(): void {
    if (this.pollEnabled()) { this.pollEnabled.set(false); this.resetPoll(); }
    else this.pollEnabled.set(true);
  }

  addPollOption(): void { if (this.pollOptions.length < 6) this.pollOptions.push(this.pollOption()); }
  removePollOption(index: number): void { if (this.pollOptions.length > 2) this.pollOptions.removeAt(index); }

  async vote(contentId: string, optionId: string): Promise<void> {
    const poll = this.polls()[contentId];
    if (poll?.allowMultiple) {
      this.pollSelections.update(current => {
        const selected = new Set(current[contentId] ?? []);
        if (!selected.delete(optionId)) selected.add(optionId);
        return { ...current, [contentId]: [...selected] };
      });
      return;
    }
    await this.sendPollVote(contentId, [optionId]);
  }

  async submitPollVote(contentId: string): Promise<void> {
    const selected = this.pollSelections()[contentId] ?? [];
    if (!selected.length) return;
    await this.sendPollVote(contentId, selected);
  }
  pollSelection(contentId: string): string[] { return this.pollSelections()[contentId] ?? []; }

  private async sendPollVote(contentId: string, optionIds: string[]): Promise<void> {
    try {
      const poll = await this.api.invoke(votePoll, { contentId, body: { optionIds } });
      this.polls.update(current => ({ ...current, [contentId]: poll }));
      this.pollSelections.update(current => ({ ...current, [contentId]: [] }));
    } catch {
      this.message.set('Oy kaydedilemedi. Anket kapanmış veya daha önce oy verilmiş olabilir.');
    }
  }

  reactionCount(item: FeedItem): number { return Object.values(item.reactions.counts).reduce((sum, value) => sum + value, 0); }

  /** Lowercased author identity text used by the client filter. Matches the
   *  resolved display name + handle so the user can filter by author. */
  private authorSearchText(item: FeedItem): string {
    const a = this.authorOf(item);
    return `${a.displayName} ${a.handle}`.toLowerCase();
  }

  async toggleComments(contentId: string): Promise<void> {
    const opening = !this.commentOpenIds().has(contentId);
    this.commentOpenIds.update(current => {
      const next = new Set(current);
      if (opening) next.add(contentId);
      else next.delete(contentId);
      return next;
    });
    if (!opening) return;
    if (!Object.prototype.hasOwnProperty.call(this.comments(), contentId)) {
      await this.loadComments(contentId);
    }
    requestAnimationFrame(() => document.getElementById(`comment-${contentId}`)?.focus());
  }

  async loadComments(contentId: string, force = false): Promise<void> {
    if (this.commentLoadingIds().has(contentId)) return;
    if (!force && Object.prototype.hasOwnProperty.call(this.comments(), contentId)) return;
    this.setCommentLoading(contentId, true);
    this.commentErrors.update(current => ({ ...current, [contentId]: false }));
    try {
      const result = await this.api.invoke(listComments, { contentId, limit: 20, cursor:undefined });
      this.comments.update(current => ({ ...current, [contentId]: this.sortComments(result.items) }));
      this.commentNextCursors.update(current=>({...current,[contentId]:result.nextCursor??null}));
    } catch {
      this.commentErrors.update(current => ({ ...current, [contentId]: true }));
    } finally {
      this.setCommentLoading(contentId, false);
    }
  }

  commentsFor(contentId: string): CommentView[] { return this.comments()[contentId] ?? []; }

  replyTarget(contentId:string):CommentView|null{return this.commentReplyTargets()[contentId]??null;}
  setReplyTarget(contentId:string,comment:CommentView|null):void{this.commentReplyTargets.update(current=>({...current,[contentId]:comment}));}
  async loadMoreComments(contentId:string):Promise<void>{const cursor=this.commentNextCursors()[contentId];if(!cursor||this.commentLoadingIds().has(contentId))return;this.setCommentLoading(contentId,true);try{const page=await this.api.invoke(listComments,{contentId,limit:20,cursor});this.comments.update(current=>({...current,[contentId]:this.sortComments([...(current[contentId]??[]),...page.items.filter(item=>!(current[contentId]??[]).some(existing=>existing.id===item.id))])}));this.commentNextCursors.update(current=>({...current,[contentId]:page.nextCursor??null}));}catch{this.message.set('Daha fazla yorum yüklenemedi.');}finally{this.setCommentLoading(contentId,false);}}
  async saveCommentEdit(event:Event,item:FeedItem,comment:CommentView,text:string):Promise<void>{event.preventDefault();const clean=text.trim();if(!clean||this.commentSubmittingIds().has(comment.id))return;this.setCommentPending(comment.id,true);try{const updated=await this.api.invoke(updateComment,{contentId:item.content.id,commentId:comment.id,body:{text:clean}});this.replaceComment(item.content.id,updated);this.commentEditId.set(null);this.message.set('Yorum güncellendi.');}catch{this.message.set('Yorum güncellenemedi.');}finally{this.setCommentPending(comment.id,false);}}
  async deleteOwnComment(item:FeedItem,comment:CommentView):Promise<void>{if(!comment.canManage||this.commentSubmittingIds().has(comment.id)||!window.confirm('Bu yorum silinsin mi?'))return;this.setCommentPending(comment.id,true);try{const deleted=await this.api.invoke(deleteComment,{contentId:item.content.id,commentId:comment.id});this.replaceComment(item.content.id,deleted);this.patchItem(item.content.id,current=>({...current,commentCount:Math.max(0,current.commentCount-1)}));this.message.set('Yorum silindi.');}catch{this.message.set('Yorum silinemedi.');}finally{this.setCommentPending(comment.id,false);}}
  private replaceComment(contentId:string,comment:CommentView):void{this.comments.update(current=>({...current,[contentId]:(current[contentId]??[]).map(item=>item.id===comment.id?comment:item)}));}

  commentTime(iso: string): string { return formatCommentTime(iso); }

  commentIndent(comment: CommentView): string {
    return `${Math.min(3, Math.max(0, comment.depth)) * 1.25}rem`;
  }

  /** Stream-rhythm helper (VAL-FEED-021): the editorial-cut separator renders
   *  between every 3rd post so the stream reads as grouped moments rather
   *  than a uniform card stack. Never after the last item. */
  shouldSeparate(index: number, total: number): boolean {
    return index < total - 1 && (index + 1) % 3 === 0;
  }

  /** Raised-surface heuristic (VAL-FEED-021): posts carrying a poll get a
   *  subtle raised surface so strategic content lifts off the stream while
   *  ordinary posts stay on the calm reading surface with separators. */
  isRaised(item: FeedItem): boolean { return Boolean(this.polls()[item.content.id]); }

  setQuery(event: Event): void {
    const value = (event.target as HTMLInputElement | null)?.value ?? '';
    this.query.set(value);
  }

  clearFilters(): void { this.query.set(''); }

  /** Primary action on a true-empty surface. Following → switch to Discovery;
   *  Discovery → focus the composer textarea. */
  onEmptyPrimaryAction(): void {
    if (this.kind() === 'Following') {
      void this.switchKind('Discovery');
    } else {
      document.querySelector<HTMLTextAreaElement>('.composer textarea')?.focus();
    }
  }

  private async load(append: boolean): Promise<void> {
    if (append && this.loading()) return;
    const revision = ++this.loadRevision;
    const requestedKind = this.kind();
    this.loading.set(true);
    this.message.set('');
    try {
      // Discovery stays on its verified-safe bounded page. Following can
      // carry enough real social context, including media, on the first page.
      // Both modes preserve cursor pagination.
      const PAGE_SIZE = requestedKind === 'Following' ? 10 : 5;
      const page = await this.api.invoke(getFeed, { kind: requestedKind, limit: PAGE_SIZE, cursor: append ? this.nextCursor() ?? undefined : undefined });
      if (revision !== this.loadRevision) return;
      this.items.update(current => this.mergeFeedItems(append ? current : [], page.items));
      this.nextCursor.set(page.nextCursor ?? null);
      this.loadError.set(false);
      await Promise.all([this.loadPolls(page.items), this.loadOriginals(page.items)]);
      const viewSession=this.viewSession();
      await Promise.allSettled(page.items.map(item=>this.api.invoke(recordImpression,{contentId:item.content.id,'X-View-Session':viewSession})));
    } catch {
      if (revision !== this.loadRevision) return;
      this.loadError.set(true);
      this.message.set('Akış yüklenemedi. Bağlantını kontrol edip yeniden dene.');
    } finally {
      if (revision === this.loadRevision) this.loading.set(false);
    }
  }

  private patchItem(id: string, transform: (item: FeedItem) => FeedItem): void {
    this.items.update(items => items.map(item => item.content.id === id ? transform(item) : item));
  }
  private prependCreatedPost(post: PostView, poll: PollView | null): void {
    const item: FeedItem = {
      content: {
        authorId: post.authorId,
        contentWarning: post.contentWarning,
        hashtags: post.hashtags,
        id: post.id,
        isPinned: post.isPinned,
        isSensitive: post.isSensitive,
        linkUrl: post.linkUrl,
        mediaIds: post.mediaIds,
        mentions: post.mentions,
        originalPostId: post.originalPostId,
        publishedAtUtc: post.publishedAtUtc ?? post.createdAtUtc,
        shareKind: post.shareKind,
        status: post.status,
        text: post.text,
        version: post.version,
        viewCount: post.viewCount,
        visibility: post.visibility,
      },
      reactions: { contentId: post.id, counts: {}, viewerReaction: null },
      commentCount: 0,
      hasPoll: poll !== null,
      rankingReasons: [],
      score: 0,
    };
    this.items.update(current => [item, ...current.filter(existing => existing.content.id !== post.id)]);
    if (poll) this.polls.update(current => ({ ...current, [post.id]: poll }));
  }
  private mergeFeedItems(current: FeedItem[], incoming: FeedItem[]): FeedItem[] {
    const byId = new Map(current.map(item => [item.content.id, item]));
    for (const item of incoming) byId.set(item.content.id, item);
    return [...byId.values()];
  }
  private setSharing(contentId: string, pending: boolean): void {
    this.sharingIds.update(current => {
      const next = new Set(current);
      if (pending) next.add(contentId);
      else next.delete(contentId);
      return next;
    });
  }
  private setReactionPending(contentId: string, pending: boolean): void {
    this.reactionPendingIds.update(current => this.withPending(current, contentId, pending));
  }
  private setCommentLoading(contentId: string, pending: boolean): void {
    this.commentLoadingIds.update(current => this.withPending(current, contentId, pending));
  }
  private setCommentPending(contentId: string, pending: boolean): void {
    this.commentSubmittingIds.update(current => this.withPending(current, contentId, pending));
  }
  private setOwnerPending(contentId: string, pending: boolean): void {
    this.ownerPendingIds.update(current => this.withPending(current, contentId, pending));
  }
  private withPending(current: Set<string>, id: string, pending: boolean): Set<string> {
    const next = new Set(current);
    if (pending) next.add(id);
    else next.delete(id);
    return next;
  }
  private sortComments(comments: CommentView[]): CommentView[] {
    return [...comments].sort((a, b) => new Date(a.createdAtUtc).getTime() - new Date(b.createdAtUtc).getTime());
  }
  private validPoll(value: ReturnType<typeof this.composer.getRawValue>): boolean {
    const question = value.pollQuestion.trim();
    const options = this.cleanedPollOptions();
    const normalized = options.map(option => option.toLocaleLowerCase('tr-TR'));
    return question.length > 0 && question.length <= 240 && options.length === this.pollOptions.length &&
      options.length >= 2 && options.length <= 6 && options.every(option => option.length <= 120) &&
      new Set(normalized).size === normalized.length;
  }
  private pollOption(): FormControl<string> { return new FormControl('', { nonNullable: true }); }
  private cleanedPollOptions(): string[] { return this.pollOptions.controls.map(control => control.value.trim()).filter(Boolean); }
  private resetPoll(): void {
    this.composer.controls.pollQuestion.reset();
    this.composer.controls.pollAllowMultiple.reset(false);
    this.composer.controls.pollDurationDays.reset(1);
    this.pollOptions.clear(); this.pollOptions.push(this.pollOption()); this.pollOptions.push(this.pollOption());
  }
  private resetComposerAfterPublish(): void {
    this.composer.controls.text.reset();
    this.composer.controls.contentWarning.reset();
    this.composer.controls.isSensitive.reset(false);
    this.resetPoll();
    this.pollEnabled.set(false);
    this.composerMediaIds.set([]);
  }
  private async loadPolls(items: FeedItem[]): Promise<void> {
    const accountRevision=this.accountRevision,loadRevision=this.loadRevision;
    await Promise.all(items.filter(item => item.hasPoll).map(async item => {
      try {
        const poll = await this.api.invoke(getPoll, { contentId: item.content.id });
        if(accountRevision===this.accountRevision&&loadRevision===this.loadRevision&&this.items().some(current=>current.content.id===item.content.id))this.polls.update(current => ({ ...current, [item.content.id]: poll }));
      } catch { /* Anket ayrıntısı hatası ana akış yüklemesini engellemez. */ }
    }));
  }
  private async loadOriginals(items: FeedItem[]): Promise<void> {
    const accountRevision=this.accountRevision,loadRevision=this.loadRevision;
    const shared = items.filter(item =>
      item.content.shareKind !== 'Original' && Boolean(item.content.originalPostId)
    );
    const entries = await Promise.all(shared.map(async item => {
      try {
        const source = await this.api.invoke(getContent, { contentId: item.content.originalPostId! });
        return [item.content.id, source] as const;
      } catch {
        return [item.content.id, null] as const;
      }
    }));
    if (accountRevision===this.accountRevision&&loadRevision===this.loadRevision&&entries.length) {
      const currentIds=new Set(this.items().map(item=>item.content.id));
      this.originals.update(current => ({ ...current, ...Object.fromEntries(entries.filter(([id])=>currentIds.has(id))) }));
    }
  }
  private publishOperationCurrent(operation:number,ownerSubject:string):boolean{return operation===this.publishRevision&&ownerSubject===this.sessionSubject();}
  private confirmedRejected(error:unknown):boolean{const status=(error as {status?:unknown})?.status;return typeof status==='number'&&status>=400&&status<500;}
  private sessionSubject(token=this.vault.accessToken()):string{if(!token)return '';try{const encoded=token.split('.')[1];if(!encoded)return '';const normalized=encoded.replace(/-/g,'+').replace(/_/g,'/');return JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length/4)*4,'='))).sub??'';}catch{return '';}}
  private viewSession():string{const key='escp-view-session';const current=sessionStorage.getItem(key);if(current)return current;const created=crypto.randomUUID();sessionStorage.setItem(key,created);return created;}
}
