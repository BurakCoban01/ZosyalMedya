import { ChangeDetectionStrategy, Component, ElementRef, OnDestroy, computed, effect, input, signal, untracked, viewChild } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import {
  Api,
  StoryView,
  createStory,
  deleteStory,
  getMyProfile,
  getStory,
  listActiveStories,
  listProfileStories,
} from '@platform/api';
import { AuthorizedAvatarComponent } from '../../core/media/authorized-avatar.component';
import { MediaAttachmentPickerComponent, MediaAttachmentTransfer } from '../../core/media/media-attachment-picker.component';
import { MediaResolver, ResolvedMedia } from '../../core/media/media-resolver.service';
import { TokenVault } from '../../core/auth/token-vault.service';

type StoryAudience = 'Public' | 'Followers' | 'CloseFriends';
type ViewerState = 'idle' | 'loading' | 'ready' | 'unavailable';

let nextStoryRailId = 0;

@Component({
  selector: 'zm-story-rail',
  imports: [ReactiveFormsModule, RouterLink, AuthorizedAvatarComponent, MediaAttachmentPickerComponent],
  template: `
    <section class="stories" [attr.aria-labelledby]="headingId" [attr.aria-busy]="loading()">
      <header class="stories__heading">
        <div>
          <p>Anlar</p>
          <h2 #railHeading [id]="headingId" tabindex="-1">Hikâyeler</h2>
        </div>
        <div class="stories__heading-actions">
          @if (error()) { <button type="button" (click)="load(false)">Yeniden dene</button> }
          @if (allowCreate()) { <button type="button" class="primary" (click)="openComposer($event)">Hikâye ekle</button> }
        </div>
      </header>

      @if (loading() && !items().length) {
        <div class="stories__skeleton" aria-label="Hikâyeler yükleniyor">
          @for (_ of [1, 2, 3, 4]; track $index) { <span></span> }
        </div>
      } @else if (error() && !items().length) {
        <p class="stories__state" role="alert">Hikâyeler şu anda yüklenemedi. Akışını okumaya devam edebilir veya yeniden deneyebilirsin.</p>
      } @else if (items().length) {
        <div class="stories__rail" role="list" aria-label="Etkin Hikâyeler">
          @for (group of authorGroups(); track group.ownerId) {
            <div class="story-tile-shell" role="listitem">
              <button
                type="button"
                class="story-tile"
                [class.story-tile--viewed]="groupViewed(group.stories)"
                (click)="openAuthor(group.stories, $event)"
                [attr.aria-label]="group.author.displayName + ' · ' + group.stories.length + ' Hikâye · ' + groupStatus(group.stories)"
              >
                <span class="story-tile__portrait">
                  <zm-authorized-avatar [name]="group.author.displayName" [mediaId]="group.author.profileMediaId ?? null" size="lg" />
                  @if (group.stories.length > 1) { <span class="story-tile__count" aria-hidden="true">{{ group.stories.length }}</span> }
                </span>
                <strong>{{ group.author.displayName }}</strong>
                <small>{{ groupStatus(group.stories) }}</small>
              </button>
            </div>
          }
          @if (nextCursor()) {
            <button type="button" class="stories__more" [disabled]="loading()" (click)="load(true)">
              {{ loading() ? 'Yükleniyor…' : 'Daha fazla' }}
            </button>
          }
        </div>
      } @else {
        <p class="stories__state">{{ allowCreate() ? 'Bugünün ilk Hikâyesini paylaşabilirsin.' : 'Bu profil için görünür etkin Hikâye yok.' }}</p>
      }
    </section>

    <dialog #composerDialog class="story-compose" aria-labelledby="story-compose-title" (cancel)="closeComposer($event)" (click)="closeComposerFromBackdrop($event)">
      @if (composerMounted()) {
      <form method="dialog" (submit)="publish($event)">
        <header>
          <div><p>Anını paylaş</p><h2 id="story-compose-title">Yeni Hikâye</h2></div>
          <button type="button" [disabled]="publishing() || closingComposer()" (click)="closeComposer()" aria-label="Hikâye oluşturmayı kapat">Kapat</button>
        </header>
        <p class="story-compose__intro">Bir görsel veya video seç. Hikâye 24 saat sonra sunucuda kendiliğinden görünmez olur.</p>
        <zm-media-attachment-picker
          #storyPicker
          label="Hikâye medyası"
          visibility="Private"
          [maxFiles]="1"
          [disabled]="publishing() || closingComposer()"
          (mediaIdsChange)="storyMediaIds.set($event)"
          (uploadingChange)="storyMediaBusy.set($event)"
        />
        <label>Açıklama
          <textarea [formControl]="caption" rows="3" maxlength="500" placeholder="Bu anda ne var?"></textarea>
          <small>{{ caption.value.length }}/500</small>
        </label>
        <label>Kimler görebilir?
          <select [formControl]="audience">
            <option value="Public">Herkes</option>
            <option value="Followers">Takipçiler</option>
            <option value="CloseFriends">Yakın çevre</option>
          </select>
        </label>
        @if (composerMessage()) { <p class="story-compose__message" [class.error]="composerFailed()" [attr.role]="composerFailed() ? 'alert' : 'status'">{{ composerMessage() }}</p> }
        <footer>
          <button type="button" [disabled]="publishing() || closingComposer()" (click)="closeComposer()">Vazgeç</button>
          <button type="submit" class="primary" [disabled]="!canPublish()">{{ publishing() ? 'Yayınlanıyor…' : 'Hikâyeyi yayınla' }}</button>
        </footer>
      </form>
      }
    </dialog>

    <dialog #viewerDialog class="story-viewer" aria-labelledby="story-viewer-title" (cancel)="closeViewer($event)" (click)="closeViewerFromBackdrop($event)" (keydown)="viewerKeydown($event)">
      <article class="story-viewer__panel">
        <header>
          @if (selectedStory(); as story) {
            <a [routerLink]="['/profil', story.author.handle]" (click)="closeViewer()">
              <zm-authorized-avatar [name]="story.author.displayName" [mediaId]="story.author.profileMediaId ?? null" size="sm" />
              <span><strong id="story-viewer-title">{{ story.author.displayName }}</strong><small>&#64;{{ story.author.handle }} · {{ expiryLabel(story) }}</small></span>
            </a>
          } @else { <strong id="story-viewer-title">Hikâye</strong> }
          <button #viewerClose type="button" (click)="closeViewer()" aria-label="Hikâye görüntüleyiciyi kapat">Kapat</button>
        </header>

        <div class="story-viewer__stage" [attr.aria-busy]="viewerState() === 'loading'">
          @if (selectedAuthorStories().length > 1) {
            <div class="story-viewer__segments" [attr.aria-label]="selectedAuthorPosition() + 1 + ' / ' + selectedAuthorStories().length + ' Hikâye'">
              @for (candidate of selectedAuthorStories(); track candidate.id) {
                <span
                  [class.story-viewer__segment--active]="candidate.id === selectedStory()?.id"
                  [class.story-viewer__segment--viewed]="viewedIds().has(candidate.id)"
                  aria-hidden="true"
                ></span>
              }
            </div>
          }
          @if (viewerState() === 'loading') {
            <div class="story-viewer__loading" role="status"><span aria-hidden="true"></span>Hikâye hazırlanıyor…</div>
          } @else if (viewerState() === 'unavailable') {
            <div class="story-viewer__unavailable" role="alert">
              <strong>Bu Hikâye artık görüntülenemiyor.</strong>
              <p>Süresi dolmuş, silinmiş veya görünürlüğü değişmiş olabilir.</p>
              <button type="button" (click)="retrySelected()">Yeniden dene</button>
            </div>
          } @else if (resolvedMedia(); as media) {
            @if (media.contentType.startsWith('image/')) {
              <img [src]="media.url" [alt]="selectedStory()?.author?.displayName + ' tarafından paylaşılan Hikâye görseli'">
            } @else {
              <video controls preload="metadata" aria-label="Hikâye videosu"><source [src]="media.url" [type]="media.contentType"></video>
            }
          }
        </div>

        @if (selectedStory(); as story) {
          <footer>
            <div class="story-viewer__copy">
              @if (story.caption) { <p>{{ story.caption }}</p> }
              <small>{{ audienceLabel(story.audience) }}</small>
            </div>
            <nav aria-label="Hikâye gezinmesi">
              <button type="button" [disabled]="selectedAuthorStories().length < 2 || viewerState() === 'loading'" (click)="move(-1)" aria-label="Bu kişinin önceki Hikâyesi">Önceki</button>
              <span>{{ selectedAuthorPosition() + 1 }} / {{ selectedAuthorStories().length }}</span>
              <button type="button" [disabled]="selectedAuthorStories().length < 2 || viewerState() === 'loading'" (click)="move(1)" aria-label="Bu kişinin sonraki Hikâyesi">Sonraki</button>
            </nav>
            @if (canDeleteSelected()) {
              @if (deleteConfirm()) {
                <div class="story-viewer__confirm" role="alertdialog" aria-label="Hikâyeyi silme onayı">
                  <span>Bu Hikâye kalıcı olarak silinsin mi?</span>
                  <button type="button" [disabled]="deleting()" (click)="deleteConfirm.set(false)">Vazgeç</button>
                  <button type="button" class="danger" [disabled]="deleting()" (click)="confirmDelete()">{{ deleting() ? 'Siliniyor…' : 'Sil' }}</button>
                </div>
              } @else {
                <button type="button" class="story-viewer__delete" (click)="deleteConfirm.set(true)">Hikâyeyi sil</button>
              }
            }
          </footer>
        }
      </article>
    </dialog>
  `,
  styleUrl: './story-rail.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class StoryRailComponent implements OnDestroy {
  readonly ownerId = input<string | null>(null);
  readonly allowCreate = input(false);
  readonly items = signal<StoryView[]>([]);
  readonly nextCursor = signal<string | null>(null);
  readonly loading = signal(false);
  readonly error = signal(false);
  readonly viewedIds = signal(new Set<string>());
  readonly authorGroups = computed(() => {
    const groups = new Map<string, { ownerId: string; author: StoryView['author']; stories: StoryView[] }>();
    for (const story of this.items()) {
      const current = groups.get(story.ownerId);
      if (current) current.stories.push(story);
      else groups.set(story.ownerId, { ownerId: story.ownerId, author: story.author, stories: [story] });
    }
    return [...groups.values()];
  });
  readonly storyMediaIds = signal<string[]>([]);
  readonly storyMediaBusy = signal(false);
  readonly publishing = signal(false);
  readonly closingComposer = signal(false);
  readonly composerMessage = signal('');
  readonly composerFailed = signal(false);
  readonly composerMounted = signal(false);
  readonly viewerState = signal<ViewerState>('idle');
  readonly selectedIndex = signal<number | null>(null);
  readonly selectedStory = computed(() => {
    const index = this.selectedIndex();
    return index === null ? null : this.items()[index] ?? null;
  });
  readonly selectedAuthorStories = computed(() => {
    const selected = this.selectedStory();
    return selected ? this.items().filter(story => story.ownerId === selected.ownerId) : [];
  });
  readonly selectedAuthorPosition = computed(() => {
    const selected = this.selectedStory();
    return selected ? Math.max(0, this.selectedAuthorStories().findIndex(story => story.id === selected.id)) : 0;
  });
  readonly resolvedMedia = signal<ResolvedMedia | null>(null);
  readonly viewerOwnerId = signal<string | null>(null);
  readonly deleteConfirm = signal(false);
  readonly deleting = signal(false);
  readonly caption = new FormControl('', { nonNullable: true, validators: [Validators.maxLength(500)] });
  readonly audience = new FormControl<StoryAudience>('Public', { nonNullable: true });
  readonly headingId = `story-rail-${++nextStoryRailId}`;

  private readonly composerDialog = viewChild<ElementRef<HTMLDialogElement>>('composerDialog');
  private readonly viewerDialog = viewChild<ElementRef<HTMLDialogElement>>('viewerDialog');
  private readonly viewerClose = viewChild<ElementRef<HTMLButtonElement>>('viewerClose');
  private readonly railHeading = viewChild<ElementRef<HTMLElement>>('railHeading');
  private readonly storyPicker = viewChild<MediaAttachmentPickerComponent>('storyPicker');
  private loadRevision = 0;
  private viewerRevision = 0;
  private viewerProfileRevision = 0;
  private sessionRevision = 0;
  private publishRevision = 0;
  private destroyed = false;
  private currentSessionSubject: string | null = null;
  private currentListScope: string | null = null;
  private observedMediaSessionRevision: number | null = null;
  private viewerController: AbortController | null = null;
  private returnFocus: HTMLElement | null = null;
  private composerReturnFocus: HTMLElement | null = null;
  private readonly sync = effect(() => {
    const ownerId = this.ownerId();
    const token = this.vault.accessToken();
    const mediaSessionRevision = this.resolver.sessionRevision();
    untracked(() => {
      const subject = this.sessionSubject(token);
      const listScope = `${ownerId ?? 'active'}:${subject || 'anonymous'}`;
      if (this.currentListScope !== null && this.currentListScope !== listScope) {
        this.loadRevision++;
        this.items.set([]);
        this.nextCursor.set(null);
        this.error.set(false);
        this.loading.set(false);
      }
      this.currentListScope = listScope;
      if (this.observedMediaSessionRevision !== null && this.observedMediaSessionRevision !== mediaSessionRevision && this.selectedStory())
        this.closeViewer();
      this.observedMediaSessionRevision = mediaSessionRevision;
      if (this.currentSessionSubject !== null && this.currentSessionSubject !== subject) {
        this.sessionRevision++;
        this.publishRevision++;
        this.publishing.set(false);
        this.closeViewer();
        this.composerMounted.set(false);
        this.closeDialog(this.composerDialog()?.nativeElement);
        this.storyMediaIds.set([]);
        this.storyMediaBusy.set(false);
        this.caption.reset();
        this.audience.reset('Public');
      }
      this.currentSessionSubject = subject;
      this.readViewed(subject);
      void this.load(false, ownerId);
      void this.loadViewerProfile(subject);
    });
  });

  constructor(private readonly api: Api, private readonly resolver: MediaResolver, private readonly vault: TokenVault) {}

  canPublish(): boolean {
    return this.storyMediaIds().length === 1 && !this.storyMediaBusy() && !this.caption.invalid &&
      !this.publishing() && !this.closingComposer();
  }

  async load(append: boolean, expectedOwnerId = this.ownerId()): Promise<void> {
    if (append && this.loading()) return;
    const revision = ++this.loadRevision;
    this.loading.set(true);
    if (!append) this.error.set(false);
    try {
      const page = expectedOwnerId
        ? await this.api.invoke(listProfileStories, { ownerId: expectedOwnerId, limit: 20, cursor: append ? this.nextCursor() ?? undefined : undefined })
        : await this.api.invoke(listActiveStories, { limit: 20, cursor: append ? this.nextCursor() ?? undefined : undefined });
      if (this.destroyed || revision !== this.loadRevision || expectedOwnerId !== this.ownerId()) return;
      this.items.update(current => this.merge(append ? current : [], page.items));
      this.nextCursor.set(page.nextCursor ?? null);
      this.error.set(false);
    } catch {
      if (!this.destroyed && revision === this.loadRevision) this.error.set(true);
    } finally {
      if (!this.destroyed && revision === this.loadRevision) this.loading.set(false);
    }
  }

  openComposer(event: Event): void {
    if (!this.allowCreate()) return;
    this.composerReturnFocus = event.currentTarget as HTMLElement;
    this.composerMessage.set(''); this.composerFailed.set(false);
    this.composerMounted.set(true);
    requestAnimationFrame(() => { if (this.composerMounted()) this.openDialog(this.composerDialog()?.nativeElement); });
  }

  async closeComposer(event?: Event): Promise<void> {
    event?.preventDefault();
    if (this.publishing() || this.closingComposer()) return;
    this.closingComposer.set(true);
    try {
      await this.storyPicker()?.discard();
      this.storyMediaIds.set([]); this.storyMediaBusy.set(false); this.caption.reset(); this.audience.reset('Public');
      this.closeDialog(this.composerDialog()?.nativeElement);
      this.composerMounted.set(false);
      const target = this.composerReturnFocus; this.composerReturnFocus = null;
      if (target?.isConnected) requestAnimationFrame(() => target.focus());
    } finally { this.closingComposer.set(false); }
  }

  closeComposerFromBackdrop(event: MouseEvent): void {
    if (event.target === this.composerDialog()?.nativeElement) void this.closeComposer();
  }

  async publish(event: Event): Promise<void> {
    event.preventDefault();
    if (!this.canPublish()) return;
    const sessionRevision = this.sessionRevision;
    const publishRevision = ++this.publishRevision;
    const ownerAccessToken = this.vault.accessToken();
    this.publishing.set(true); this.composerMessage.set(''); this.composerFailed.set(false);
    let transfer: MediaAttachmentTransfer | undefined;
    try {
      const selected = [...this.storyMediaIds()];
      transfer = this.storyPicker()?.transfer();
      const mediaId = transfer?.ids[0] ?? selected[0];
      const story = await this.api.invoke(createStory, { body: {
        mediaId, caption: this.caption.value.trim() || null, audience: this.audience.value,
      }});
      if (this.destroyed || sessionRevision !== this.sessionRevision || publishRevision !== this.publishRevision) return;
      this.items.update(items => this.merge([story], items));
      this.storyMediaIds.set([]); this.caption.reset(); this.audience.reset('Public');
      this.closeDialog(this.composerDialog()?.nativeElement);
      this.composerMounted.set(false);
      const target = this.composerReturnFocus; this.composerReturnFocus = null;
      if (target?.isConnected) requestAnimationFrame(() => target.focus());
    } catch {
      if (this.destroyed || sessionRevision !== this.sessionRevision || publishRevision !== this.publishRevision) {
        await transfer?.discardWithAccessToken(ownerAccessToken);
        return;
      }
      await transfer?.rollback();
      this.composerMessage.set('Hikâye yayınlanamadı. Medyan korundu; bağlantını kontrol edip yeniden deneyebilirsin.');
      this.composerFailed.set(true);
    } finally {
      if (publishRevision === this.publishRevision) this.publishing.set(false);
    }
  }

  openStory(index: number, event?: Event): void {
    if (!this.items()[index]) return;
    if (event?.currentTarget) this.returnFocus = event.currentTarget as HTMLElement;
    this.selectedIndex.set(index); this.deleteConfirm.set(false);
    this.openDialog(this.viewerDialog()?.nativeElement);
    void this.resolveSelected();
    const revision = this.viewerRevision;
    requestAnimationFrame(() => {
      if (revision === this.viewerRevision && this.viewerDialog()?.nativeElement.open)
        this.viewerClose()?.nativeElement.focus();
    });
  }

  openAuthor(stories: StoryView[], event?: Event): void {
    const selected = stories.find(story => !this.viewedIds().has(story.id)) ?? stories[0];
    const index = selected ? this.items().findIndex(story => story.id === selected.id) : -1;
    if (index >= 0) this.openStory(index, event);
  }

  groupViewed(stories: StoryView[]): boolean { return stories.every(story => this.viewedIds().has(story.id)); }

  groupStatus(stories: StoryView[]): string {
    const unseen = stories.filter(story => !this.viewedIds().has(story.id)).length;
    return unseen ? `${unseen} yeni` : 'Görüldü';
  }

  retrySelected(): void { void this.resolveSelected(); }

  move(delta: number): void {
    const stories = this.selectedAuthorStories();
    if (stories.length < 2) return;
    const target = stories[(this.selectedAuthorPosition() + delta + stories.length) % stories.length];
    const index = this.items().findIndex(story => story.id === target.id);
    if (index < 0) return;
    this.selectedIndex.set(index); this.deleteConfirm.set(false); void this.resolveSelected();
  }

  viewerKeydown(event: KeyboardEvent): void {
    if ((event.target as Element | null)?.closest('video, button, a, input, select, textarea, [contenteditable="true"]')) return;
    if (event.key === 'ArrowLeft') { event.preventDefault(); this.move(-1); }
    if (event.key === 'ArrowRight') { event.preventDefault(); this.move(1); }
  }

  closeViewer(event?: Event): void {
    event?.preventDefault();
    this.viewerRevision++; this.cancelViewerMedia(); this.viewerState.set('idle'); this.selectedIndex.set(null);
    this.deleteConfirm.set(false); this.closeDialog(this.viewerDialog()?.nativeElement);
    const target = this.returnFocus; this.returnFocus = null;
    requestAnimationFrame(() => (target?.isConnected ? target : this.railHeading()?.nativeElement)?.focus());
  }

  closeViewerFromBackdrop(event: MouseEvent): void {
    if (event.target === this.viewerDialog()?.nativeElement) this.closeViewer();
  }

  canDeleteSelected(): boolean { return this.selectedStory()?.ownerId === this.viewerOwnerId(); }

  async confirmDelete(): Promise<void> {
    const story = this.selectedStory();
    if (!story || !this.canDeleteSelected() || this.deleting()) return;
    const sessionRevision = this.sessionRevision;
    this.deleting.set(true);
    try {
      await this.api.invoke(deleteStory, { id: story.id });
      if (this.destroyed || sessionRevision !== this.sessionRevision) return;
      this.items.update(items => items.filter(item => item.id !== story.id));
      this.closeViewer();
    } catch {
      if (!this.destroyed && sessionRevision === this.sessionRevision) this.viewerState.set('unavailable');
    } finally { this.deleting.set(false); }
  }

  expiryLabel(story: StoryView): string {
    const minutes = Math.max(0, Math.ceil((new Date(story.expiresAtUtc).getTime() - Date.now()) / 60_000));
    if (minutes < 60) return `${minutes} dk kaldı`;
    return `${Math.ceil(minutes / 60)} sa kaldı`;
  }

  audienceLabel(audience: StoryAudience): string {
    return audience === 'Public' ? 'Herkese açık' : audience === 'Followers' ? 'Takipçilere açık' : 'Yakın çevre';
  }

  ngOnDestroy(): void {
    this.destroyed = true; this.loadRevision++; this.viewerRevision++;
    this.viewerProfileRevision++;
    this.composerMounted.set(false);
    this.cancelViewerMedia(); this.sync.destroy();
  }

  private async resolveSelected(): Promise<void> {
    const selected = this.selectedStory();
    if (!selected) return;
    const revision = ++this.viewerRevision;
    this.cancelViewerMedia(); this.viewerState.set('loading');
    const controller = new AbortController(); this.viewerController = controller;
    try {
      const current = await this.api.invoke(getStory, { id: selected.id });
      if (this.destroyed || revision !== this.viewerRevision) return;
      const media = await this.resolver.resolve(current.mediaId, null, controller.signal);
      if (this.destroyed || revision !== this.viewerRevision) { media.release(); return; }
      this.resolvedMedia.set(media); this.viewerState.set('ready'); this.markViewed(current.id);
      this.items.update(items => items.map(item => item.id === current.id ? current : item));
    } catch (error) {
      if ((error as Error).name !== 'AbortError' && !this.destroyed && revision === this.viewerRevision)
        this.viewerState.set('unavailable');
    } finally { if (this.viewerController === controller) this.viewerController = null; }
  }

  private cancelViewerMedia(): void {
    this.viewerController?.abort(); this.viewerController = null;
    this.resolvedMedia()?.release(); this.resolvedMedia.set(null);
  }

  private async loadViewerProfile(expectedSubject: string): Promise<void> {
    const revision = ++this.viewerProfileRevision;
    if (!expectedSubject) { this.viewerOwnerId.set(null); return; }
    try {
      const profile = await this.api.invoke(getMyProfile, {});
      if (!this.destroyed && revision === this.viewerProfileRevision && expectedSubject === this.currentSessionSubject)
        this.viewerOwnerId.set(profile.ownerId);
    } catch {
      if (!this.destroyed && revision === this.viewerProfileRevision && expectedSubject === this.currentSessionSubject)
        this.viewerOwnerId.set(null);
    }
  }

  private merge(left: StoryView[], right: StoryView[]): StoryView[] {
    const byId = new Map(left.map(item => [item.id, item]));
    for (const item of right) byId.set(item.id, item);
    return [...byId.values()].sort((a, b) => Date.parse(b.createdAtUtc) - Date.parse(a.createdAtUtc));
  }

  private markViewed(id: string): void {
    this.viewedIds.update(current => new Set(current).add(id));
    try { sessionStorage.setItem(this.viewedStorageKey(), JSON.stringify([...this.viewedIds()])); } catch { /* Session memory remains sufficient. */ }
  }

  private readViewed(subject: string): void {
    try {
      const values = JSON.parse(sessionStorage.getItem(this.viewedStorageKey(subject)) ?? '[]') as unknown;
      this.viewedIds.set(new Set(Array.isArray(values) ? values.filter((value): value is string => typeof value === 'string') : []));
    } catch { this.viewedIds.set(new Set()); }
  }

  private viewedStorageKey(subject = this.sessionSubject(this.vault.accessToken())): string {
    return `escp-story-viewed:${subject || 'anonymous'}`;
  }

  private sessionSubject(token: string | null): string {
    if (!token) return '';
    try {
      const encoded = token.split('.')[1];
      if (!encoded) return '';
      const normalized = encoded.replace(/-/g, '+').replace(/_/g, '/');
      const value = JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='))) as { sub?: unknown };
      return typeof value.sub === 'string' ? value.sub : '';
    } catch { return ''; }
  }

  private openDialog(dialog?: HTMLDialogElement): void {
    if (!dialog || dialog.open) return;
    try { dialog.showModal(); } catch { dialog.setAttribute('open', ''); }
  }

  private closeDialog(dialog?: HTMLDialogElement): void {
    if (!dialog) return;
    if (dialog.open && typeof dialog.close === 'function') dialog.close(); else dialog.removeAttribute('open');
  }
}
