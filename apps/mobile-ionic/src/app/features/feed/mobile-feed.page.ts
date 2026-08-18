import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, EffectRef, OnDestroy, OnInit, effect, signal, viewChild } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Api, ContentItem, createComment, createPoll, createPost, deletePost, FeedItem, getContent, getFeed, getMyProfile, getPoll, PollView, ProfileView, recordImpression, removeReaction, removeSavedContent, saveContent, setReaction, votePoll } from '@platform/api';
import {
  IonButton, IonContent, IonHeader, IonIcon, IonInput, IonItem, IonLabel, IonList,
  IonNote, IonRefresher, IonRefresherContent, IonSegment, IonSegmentButton,
  IonTextarea, IonTitle, IonToolbar, RefresherCustomEvent
} from '@ionic/angular/standalone';
import { addIcons } from 'ionicons';
import { chatbubbleOutline, heart, heartOutline, sendOutline } from 'ionicons/icons';
import { MobileMediaAttachmentPickerComponent, MobileMediaAttachmentTransfer } from '../../core/media/mobile-media-attachment-picker.component';
import { MobileAuthorizedMediaGalleryComponent } from '../../core/media/mobile-authorized-media-gallery.component';
import { MobileStoryRailComponent } from '../stories/mobile-story-rail.component';
import { MobileSession } from '../../core/auth/secure-token-storage';

type FeedKind = 'Following' | 'Discovery';
const FEED_PAGE_SIZE = 5;

@Component({
  selector: 'app-mobile-feed',
  imports: [
    ReactiveFormsModule, RouterLink, DatePipe, IonButton, IonContent, IonHeader, IonIcon, IonInput,
    IonItem, IonLabel, IonList, IonNote, IonRefresher, IonRefresherContent, IonSegment,
    IonSegmentButton, IonTextarea, IonTitle, IonToolbar, MobileMediaAttachmentPickerComponent, MobileAuthorizedMediaGalleryComponent,
    MobileStoryRailComponent
  ],
  template: `
    <ion-header translucent="true"><ion-toolbar><ion-title>Akış</ion-title></ion-toolbar></ion-header>
    <ion-content [fullscreen]="true">
      <ion-refresher slot="fixed" (ionRefresh)="refresh($event)"><ion-refresher-content pullingText="Yenilemek için çek"></ion-refresher-content></ion-refresher>
      <div class="feed-intro"><p>BUGÜN</p><h1>Sözü paylaş.</h1></div>
      <zm-mobile-story-rail />

      <form class="mobile-composer" [formGroup]="composer" (ngSubmit)="publish()">
        <ion-textarea formControlName="text" [autoGrow]="true" maxlength="5000" placeholder="Aklından ne geçiyor?"></ion-textarea>
        <div><ion-note>{{composer.controls.text.value.length}}/5000</ion-note><ion-button type="submit" size="small" [disabled]="!canPublish() || publishing()">Yayınla</ion-button></div>
        <ion-button type="button" fill="clear" size="small" (click)="togglePoll()">{{pollEnabled()?'Anketi kaldır':'Anket ekle'}}</ion-button>
        @if (pollEnabled()) {
          <div class="mobile-poll-composer">
            <ion-input formControlName="pollQuestion" maxlength="200" label="Anket sorusu" labelPlacement="stacked"></ion-input>
            <ion-input formControlName="pollOption1" maxlength="100" label="Birinci seçenek" labelPlacement="stacked"></ion-input>
            <ion-input formControlName="pollOption2" maxlength="100" label="İkinci seçenek" labelPlacement="stacked"></ion-input>
          </div>
        }
        <zm-mobile-media-picker
          #composerMediaPicker
          label="Gönderi medyası"
          [disabled]="publishing()"
          (mediaIdsChange)="composerMediaIds.set($event)"
          (uploadingChange)="composerMediaBusy.set($event)"
        />
      </form>

      <ion-segment [value]="kind()" (ionChange)="switchKind($any($event.detail.value))" aria-label="Akış türü">
        <ion-segment-button value="Following"><ion-label>Takip</ion-label></ion-segment-button>
        <ion-segment-button value="Discovery"><ion-label>Keşfet</ion-label></ion-segment-button>
      </ion-segment>

      @if (message()) { <ion-note class="feed-status">{{message()}}</ion-note> }
      <ion-list class="feed-list" lines="full">
        @for (item of items(); track item.content.id) {
          <ion-item class="feed-item">
            <ion-label class="ion-text-wrap">
              <div class="post-meta"><strong>{{authorLabel(item)}}</strong><time>{{item.content.publishedAtUtc | date:'dd MMM · HH:mm'}}</time></div>
              @if (item.content.shareKind !== 'Original') { <ion-note class="share-kind">{{shareKindLabel(item.content.shareKind)}}</ion-note> }
              @if (item.content.contentWarning) { <ion-note color="warning">İçerik notu · {{item.content.contentWarning}}</ion-note> }
              <p class="post-copy">{{item.content.text}}</p>
              @if(item.content.mediaIds.length){<zm-mobile-authorized-media-gallery [mediaIds]="item.content.mediaIds" />}
              @if (item.content.shareKind !== 'Original') {
                @if (originals()[item.content.id]; as source) {
                  <aside class="shared-source" aria-label="Paylaşılan kaynak gönderi">
                    <strong>Kaynak gönderi</strong>
                    <p>{{source.text || 'Metinsiz medya paylaşımı'}}</p>
                    <ion-note>{{viewLabel(source.viewCount)}} · {{source.visibility==='Public'?'Herkese açık':'Sınırlı görünürlük'}}</ion-note>
                  </aside>
                } @else if (originals()[item.content.id] === null) {
                  <ion-note class="source-unavailable" role="note">Kaynak gönderi silinmiş, görünürlüğü değişmiş veya artık erişilemiyor.</ion-note>
                } @else {
                  <ion-note class="source-unavailable" role="status">Kaynak gönderi yükleniyor…</ion-note>
                }
              }
              @if (item.content.hashtags.length) { <p class="post-tags">@for(tag of item.content.hashtags; track tag){<span>#{{tag}} </span>}</p> }
              @if (polls()[item.content.id]; as poll) {
                <section class="mobile-poll" [attr.aria-label]="poll.question">
                  <strong>{{poll.question}}</strong>
                  @for (option of poll.options; track option.id) {
                    <ion-button expand="block" fill="outline" size="small" [disabled]="!poll.isOpen" (click)="vote(item.content.id, option.id)">{{option.text}} · {{option.voteCount}}</ion-button>
                  }
                  <ion-note>{{poll.totalVotes}} oy · {{poll.isOpen?'Oylama açık':'Oylama kapandı'}}</ion-note>
                </section>
              }
              <div class="mobile-actions">
                <ion-button fill="clear" size="small" [routerLink]="['/icerik',item.content.id]">Aç</ion-button>
                <ion-button fill="clear" size="small" (click)="react(item)">
                  <ion-icon slot="start" [name]="item.reactions.viewerReaction === 'Like' ? 'heart' : 'heart-outline'"></ion-icon>{{reactionCount(item)}}
                </ion-button>
                <ion-button fill="clear" size="small" (click)="focusComment(item.content.id)"><ion-icon slot="start" name="chatbubble-outline"></ion-icon>{{item.commentCount}}</ion-button>
                <ion-button fill="clear" size="small" (click)="toggleSaved(item.content.id)">{{savedIds().has(item.content.id)?'Kaydedildi':'Kaydet'}}</ion-button>
              </div>
              <ion-note class="view-count">{{viewLabel(item.content.viewCount)}}</ion-note>
              @if (canShare(item)) {
                <div class="share-actions">
                  <ion-button fill="outline" size="small" [disabled]="isSharing(item.content.id)" (click)="repost(item)">
                    {{isSharing(item.content.id)?'Paylaşılıyor…':'Yeniden paylaş'}}
                  </ion-button>
                  <ion-button fill="clear" size="small" [disabled]="isSharing(item.content.id)" (click)="openQuote(item)">Alıntıla</ion-button>
                </div>
              }
              @if (quoteTargetId() === item.content.id) {
                <form class="quote-composer" (submit)="onQuoteSubmit($event, item)">
                  <ion-textarea
                    [id]="'mobile-quote-' + item.content.id"
                    [formControl]="quoteText"
                    [autoGrow]="true"
                    maxlength="5000"
                    label="Alıntına bir not ekle"
                    labelPlacement="stacked"
                    placeholder="Bu gönderi hakkında ne düşünüyorsun?"
                  ></ion-textarea>
                  <zm-mobile-media-picker
                    #quoteMediaPicker
                    label="Alıntı medyası"
                    [disabled]="isSharing(item.content.id)"
                    (mediaIdsChange)="quoteMediaIds.set($event)"
                    (uploadingChange)="quoteMediaBusy.set($event)"
                  />
                  <div>
                    <ion-note>{{quoteText.value.length}}/5000</ion-note>
                    <ion-button type="button" fill="clear" size="small" [disabled]="isSharing(item.content.id)" (click)="cancelQuote()">Vazgeç</ion-button>
                    <ion-button type="submit" size="small" [disabled]="!canPublishQuote()||isSharing(item.content.id)">Alıntıyı yayınla</ion-button>
                  </div>
                </form>
              }
              <form class="mobile-comment" (submit)="comment($event, item, commentInput.value?.toString() ?? ''); commentInput.value = ''">
                <ion-input #commentInput [id]="'mobile-comment-' + item.content.id" placeholder="Yorum yaz" maxlength="2000"></ion-input>
                <ion-button fill="clear" type="submit" aria-label="Yorumu gönder"><ion-icon name="send-outline"></ion-icon></ion-button>
              </form>
            </ion-label>
          </ion-item>
        } @empty {
          @if (!loading()) { <ion-item><ion-label class="ion-text-wrap"><h2>Akış şimdilik sessiz.</h2><p>İlk gönderiyi sen yayınlayabilirsin.</p></ion-label></ion-item> }
        }
      </ion-list>
      @if (nextCursor()) { <ion-button class="load-more" fill="outline" expand="block" [disabled]="loading()" (click)="load(true)">Daha fazla göster</ion-button> }
    </ion-content>
  `,
  styles: [`
    .feed-intro{padding:5rem 1.25rem 1rem}.feed-intro p{color:var(--ion-color-primary);font-size:.68rem;font-weight:850;letter-spacing:.18em;margin:0}.feed-intro h1{font:700 clamp(2.6rem,12vw,4rem)/.95 Georgia,serif;letter-spacing:-.055em;margin:.5rem 0}.mobile-composer{margin:0 1.25rem 1rem;border-top:1px solid var(--ion-text-color);border-bottom:1px solid var(--ion-border-color);padding:.5rem 0}.mobile-composer ion-textarea{font-family:Georgia,serif;font-size:1.2rem}.mobile-composer ion-textarea:focus-within,.quote-composer ion-textarea:focus-within{outline:3px solid var(--ion-color-primary);outline-offset:2px;border-radius:.35rem}.mobile-composer>div{display:flex;align-items:center;justify-content:flex-end;gap:.6rem}.feed-status{display:block;margin:1rem 1.5rem}.feed-list{margin-top:.75rem;background:transparent}.feed-item{--background:transparent;--padding-top:.8rem;--padding-bottom:.8rem}.post-meta{display:flex;justify-content:space-between;gap:1rem;font-size:.8rem}.post-meta time,.view-count{color:var(--ion-color-medium)}.share-kind,.view-count{display:block;margin-top:.4rem}.share-kind{font-weight:750}.post-copy{font:1.18rem/1.48 Georgia,serif!important;color:var(--ion-text-color)!important;white-space:pre-wrap;margin:1rem 0!important}.shared-source{display:grid;gap:.35rem;margin:.6rem 0;padding:.75rem;border:1px solid var(--ion-border-color);border-radius:1rem;background:var(--ion-item-background)}.shared-source p{margin:0!important;color:var(--ion-text-color)!important;white-space:pre-wrap}.source-unavailable{display:block;margin:.6rem 0}.post-tags{color:var(--ion-color-primary)!important}.mobile-actions,.share-actions{display:flex;flex-wrap:wrap;align-items:center;margin-left:-.75rem}.share-actions{margin-top:.35rem}.share-actions ion-button{min-height:40px}.quote-composer{display:grid;gap:.45rem;margin:.5rem 0;padding:.7rem;border:1px solid var(--ion-border-color);border-radius:1rem;background:var(--ion-item-background)}.quote-composer>div{display:flex;align-items:center;justify-content:flex-end;gap:.35rem}.mobile-comment{display:flex;align-items:center;border-top:1px solid var(--ion-border-color)}.load-more{margin:1.2rem}.feed-item{animation:mobile-post-in .28s ease both}@keyframes mobile-post-in{from{opacity:0;transform:translateY(8px)}}@media(prefers-reduced-motion:reduce){.feed-item{animation:none}}
  `],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MobileFeedPage implements OnInit, OnDestroy {
  readonly items = signal<FeedItem[]>([]);
  readonly kind = signal<FeedKind>('Following');
  readonly nextCursor = signal<string | null>(null);
  readonly loading = signal(false);
  readonly publishing = signal(false);
  readonly message = signal('');
  readonly savedIds = signal(new Set<string>());
  readonly pollEnabled = signal(false);
  readonly polls = signal<Record<string, PollView>>({});
  private loadRevision = 0;
  private publishRevision = 0;
  private accountRevision = 0;
  private currentSubject:string|null;
  private readonly sessionSync:EffectRef;
  readonly originals = signal<Record<string, ContentItem | null>>({});
  readonly profile = signal<ProfileView | null>(null);
  readonly sharingIds = signal(new Set<string>());
  readonly quoteTargetId = signal<string | null>(null);
  readonly quoteText = new FormControl('', { nonNullable: true, validators: [Validators.maxLength(5000)] });
  readonly composer = new FormGroup({
    text: new FormControl('', { nonNullable: true, validators: [Validators.maxLength(5000)] }),
    pollQuestion: new FormControl('', { nonNullable: true }),
    pollOption1: new FormControl('', { nonNullable: true }),
    pollOption2: new FormControl('', { nonNullable: true })
  });
  readonly composerMediaIds=signal<string[]>([]);
  readonly quoteMediaIds=signal<string[]>([]);
  readonly composerMediaBusy=signal(false);
  readonly quoteMediaBusy=signal(false);
  private readonly composerMediaPicker=viewChild<MobileMediaAttachmentPickerComponent>('composerMediaPicker');
  private readonly quoteMediaPicker=viewChild<MobileMediaAttachmentPickerComponent>('quoteMediaPicker');

  constructor(private readonly api: Api,private readonly session:MobileSession) { this.currentSubject=session.subject();this.sessionSync=effect(()=>{const subject=this.session.subject();if(subject===this.currentSubject)return;this.currentSubject=subject;++this.publishRevision;++this.loadRevision;++this.accountRevision;this.publishing.set(false);this.sharingIds.set(new Set());this.composer.reset();this.composerMediaIds.set([]);this.cancelQuote();this.message.set('');this.items.set([]);this.originals.set({});this.polls.set({});this.savedIds.set(new Set());this.profile.set(null);this.nextCursor.set(null);void this.loadProfile();void this.load(false);});addIcons({ chatbubbleOutline, heart, heartOutline, sendOutline }); }
  ngOnInit(): void { void this.loadProfile(); void this.load(false); }
  ngOnDestroy():void{++this.publishRevision;++this.loadRevision;this.sessionSync.destroy();}

  async switchKind(value: FeedKind): Promise<void> {
    if (!value || value === this.kind()) return;
    this.kind.set(value); this.items.set([]); this.nextCursor.set(null); await this.load(false);
  }

  async publish(): Promise<void> {
    if (!this.canPublish()) return;
    const operation=++this.publishRevision;const ownerSubject=this.session.subject();const ownerAccessToken=this.session.accessToken();
    this.publishing.set(true);
    let mediaTransfer:MobileMediaAttachmentTransfer|undefined;
    try {
      const value = this.composer.getRawValue();
      if (this.pollEnabled() && !this.validPoll(value)) {
        this.message.set('Anket sorusu ve en az iki seçenek gereklidir.');
        return;
      }
      const selectedMediaIds=[...this.composerMediaIds()];mediaTransfer=this.composerMediaPicker()?.transfer();
      const post = await this.api.invoke(createPost, { body: {
        text: value.text.trim() || null, mediaIds: mediaTransfer?.ids.length?mediaTransfer.ids:selectedMediaIds, visibility: 'Public',
        shareKind: 'Original', originalPostId: null, linkUrl: null, contentWarning: null,
        isSensitive: false, isDraft: false, publishAtUtc: null
      }});
      if(!this.publishOperationCurrent(operation,ownerSubject))return;
      if (this.pollEnabled()) {
        try {
          await this.api.invoke(createPoll, { contentId: post.id, body: {
            question: value.pollQuestion.trim(), options: [value.pollOption1.trim(), value.pollOption2.trim()],
            allowMultiple: false, closesAtUtc: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString()
          }});
        } catch {
          if(!this.publishOperationCurrent(operation,ownerSubject))return;
          try {
            await this.api.invoke(deletePost,{contentId:post.id});
            const mediaRemoved=await mediaTransfer?.discard()??true;
            this.message.set(mediaRemoved?'Anket eklenemedi; yarım gönderi ve medyaları kaldırıldı, metnin korunuyor.':'Anket eklenemedi; yarım gönderi kaldırıldı ancak bazı medyalar temizlenemedi. Ekleri yeniden kaldırabilirsin.');
          } catch {
            this.composer.reset();this.pollEnabled.set(false);
            this.kind.set('Following');await this.load(false);
            this.message.set('Gönderi yayınlandı ancak anket eklenemedi.');
          }
          return;
        }
      }
      this.pollEnabled.set(false);
      this.composer.reset();this.composerMediaIds.set([]); this.kind.set('Following'); await this.load(false); this.message.set('Gönderin yayında.');
    } catch(error) { if(!this.publishOperationCurrent(operation,ownerSubject)){if(this.confirmedRejected(error))await mediaTransfer?.discardWithAccessToken(ownerAccessToken);return;}await mediaTransfer?.rollback();this.message.set('Gönderi yayınlanamadı. Metnin ve medyaların korundu; yeniden deneyebilirsin.'); }
    finally { if(operation===this.publishRevision)this.publishing.set(false); }
  }

  async load(append: boolean): Promise<void> {
    if (append && this.loading()) return;
    const revision = ++this.loadRevision;
    const requestedKind = this.kind();
    this.loading.set(true);
    try {
      const page = await this.api.invoke(getFeed, { kind: requestedKind, limit: FEED_PAGE_SIZE, cursor: append ? this.nextCursor() ?? undefined : undefined });
      if (revision !== this.loadRevision) return;
      this.items.update(current => this.mergePage(current, page.items, append));
      this.nextCursor.set(page.nextCursor ?? null);
      await Promise.all([this.loadPolls(page.items),this.loadOriginals(page.items)]);
      const viewSession=this.viewSession();
      await Promise.allSettled(page.items.map(item=>this.api.invoke(recordImpression,{contentId:item.content.id,'X-View-Session':viewSession})));
    } catch {
      if (revision === this.loadRevision) this.message.set('Akış yüklenemedi.');
    }
    finally {
      if (revision === this.loadRevision) this.loading.set(false);
    }
  }

  async refresh(event: RefresherCustomEvent): Promise<void> { await this.load(false); event.target.complete(); }

  async react(item: FeedItem): Promise<void> {
    const previous = structuredClone(item.reactions);
    const counts = { ...item.reactions.counts };
    const removing = item.reactions.viewerReaction === 'Like';
    if (item.reactions.viewerReaction) counts[item.reactions.viewerReaction] = Math.max(0, (counts[item.reactions.viewerReaction] ?? 1) - 1);
    if (!removing) counts['Like'] = (counts['Like'] ?? 0) + 1;
    this.patch(item.content.id, current => ({ ...current, reactions: { ...current.reactions, counts, viewerReaction: removing ? null : 'Like' } }));
    try {
      if (removing) await this.api.invoke(removeReaction, { contentId: item.content.id });
      else await this.api.invoke(setReaction, { contentId: item.content.id, body: { kind: 'Like' } });
    }
    catch { this.patch(item.content.id, current => ({ ...current, reactions: previous })); this.message.set('Tepki geri alındı.'); }
  }

  async comment(event: Event, item: FeedItem, text: string): Promise<void> {
    event.preventDefault(); const body = text.trim(); if (!body) return;
    this.patch(item.content.id, current => ({ ...current, commentCount: current.commentCount + 1 }));
    try { await this.api.invoke(createComment, { contentId: item.content.id, body: { text: body, parentId: null } }); }
    catch { this.patch(item.content.id, current => ({ ...current, commentCount: Math.max(0, current.commentCount - 1) })); this.message.set('Yorum kaydedilemedi.'); }
  }

  async toggleSaved(contentId:string):Promise<void>{const previous=this.savedIds();const next=new Set(previous);const removing=next.delete(contentId);if(!removing)next.add(contentId);this.savedIds.set(next);try{if(removing)await this.api.invoke(removeSavedContent,{contentId,collection:'Genel'});else await this.api.invoke(saveContent,{contentId,body:{collection:'Genel'}});this.message.set(removing?'Kayıt kaldırıldı.':'Gönderi kaydedildi.');}catch{this.savedIds.set(previous);this.message.set('Kaydetme işlemi geri alındı.');}}

  authorLabel(item:FeedItem):string{if(item.author)return `${item.author.displayName} · @${item.author.handle}`;const profile=this.profile();return profile?.ownerId===item.content.authorId?`${profile.displayName} · @${profile.handle}`:'Topluluk üyesi';}
  shareKindLabel(kind:string):string{return kind==='Repost'?'Yeniden paylaşım':kind==='Quote'?'Alıntı gönderi':'Gönderi';}
  viewLabel(count:number):string{return`${new Intl.NumberFormat('tr-TR').format(count)} görüntülenme`;}
  canShare(item:FeedItem):boolean{return item.content.visibility==='Public';}
  isSharing(contentId:string):boolean{return this.sharingIds().has(contentId);}
  openQuote(item:FeedItem):void{if(!this.canShare(item))return;if(this.quoteTargetId()===item.content.id){this.cancelQuote();return;}this.quoteTargetId.set(item.content.id);this.quoteText.reset();this.quoteMediaIds.set([]);this.quoteMediaBusy.set(false);requestAnimationFrame(()=>document.getElementById(`mobile-quote-${item.content.id}`)?.focus());}
  cancelQuote():void{this.quoteTargetId.set(null);this.quoteText.reset();this.quoteMediaIds.set([]);this.quoteMediaBusy.set(false);}
  async repost(item:FeedItem):Promise<void>{if(!this.canShare(item)||this.isSharing(item.content.id))return;this.setSharing(item.content.id,true);this.message.set('');try{await this.api.invoke(createPost,{body:{text:null,mediaIds:[],visibility:'Public',shareKind:'Repost',originalPostId:item.content.id,linkUrl:null,contentWarning:null,isSensitive:false,isDraft:false,publishAtUtc:null}});await this.load(false);this.message.set('Gönderi yeniden paylaşıldı.');}catch{this.message.set('Yeniden paylaşım oluşturulamadı. Kaynak görünürlüğünü kontrol et.');}finally{this.setSharing(item.content.id,false);}}
  async publishQuote(item:FeedItem):Promise<void>{if(!this.canShare(item)||this.quoteTargetId()!==item.content.id||!this.canPublishQuote()||this.isSharing(item.content.id))return;const operation=++this.publishRevision;const ownerSubject=this.session.subject();const ownerAccessToken=this.session.accessToken();this.setSharing(item.content.id,true);this.message.set('');const selectedMediaIds=[...this.quoteMediaIds()];const mediaTransfer=this.quoteMediaPicker()?.transfer();try{await this.api.invoke(createPost,{body:{text:this.quoteText.value.trim()||null,mediaIds:mediaTransfer?.ids.length?mediaTransfer.ids:selectedMediaIds,visibility:'Public',shareKind:'Quote',originalPostId:item.content.id,linkUrl:null,contentWarning:null,isSensitive:false,isDraft:false,publishAtUtc:null}});if(!this.publishOperationCurrent(operation,ownerSubject))return;this.cancelQuote();await this.load(false);this.message.set('Alıntı gönderin yayınlandı.');}catch(error){if(!this.publishOperationCurrent(operation,ownerSubject)){if(this.confirmedRejected(error))await mediaTransfer?.discardWithAccessToken(ownerAccessToken);return;}await mediaTransfer?.rollback();this.message.set('Alıntı yayınlanamadı. Metnin ve medyaların korundu; kaynak görünürlüğünü kontrol edip yeniden deneyebilirsin.');}finally{if(operation===this.publishRevision)this.setSharing(item.content.id,false);}}
  async onQuoteSubmit(event:Event,item:FeedItem):Promise<void>{event.preventDefault();await this.publishQuote(item);}

  togglePoll(): void { this.pollEnabled.update(value => !value); }
  canPublish():boolean{return !this.composer.invalid&&!this.composerMediaBusy()&&(this.composer.controls.text.value.trim().length>0||this.composerMediaIds().length>0);}
  canPublishQuote():boolean{return !this.quoteText.invalid&&!this.quoteMediaBusy()&&(this.quoteText.value.trim().length>0||this.quoteMediaIds().length>0);}
  async vote(contentId: string, optionId: string): Promise<void> {
    try {
      const poll = await this.api.invoke(votePoll, { contentId, body: { optionIds: [optionId] } });
      this.polls.update(current => ({ ...current, [contentId]: poll }));
    } catch { this.message.set('Oy kaydedilemedi. Anket kapanmış veya daha önce oy verilmiş olabilir.'); }
  }
  reactionCount(item: FeedItem): number { return Object.values(item.reactions.counts).reduce((sum, value) => sum + value, 0); }
  focusComment(id: string): void { document.getElementById(`mobile-comment-${id}`)?.focus(); }
  private patch(id: string, transform: (item: FeedItem) => FeedItem): void { this.items.update(items => items.map(item => item.content.id === id ? transform(item) : item)); }
  private mergePage(current: FeedItem[], incoming: FeedItem[], append: boolean): FeedItem[] {
    const byId = new Map((append ? current : []).map(item => [item.content.id, item]));
    for (const item of incoming) byId.set(item.content.id, item);
    return [...byId.values()];
  }
  private validPoll(value: ReturnType<typeof this.composer.getRawValue>): boolean {
    return value.pollQuestion.trim().length > 0 && value.pollOption1.trim().length > 0 && value.pollOption2.trim().length > 0;
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
  private async loadOriginals(items:FeedItem[]):Promise<void>{const accountRevision=this.accountRevision,loadRevision=this.loadRevision;const shared=items.filter(item=>item.content.shareKind!=='Original'&&Boolean(item.content.originalPostId));const entries=await Promise.all(shared.map(async item=>{try{const source=await this.api.invoke(getContent,{contentId:item.content.originalPostId!});return[item.content.id,source]as const;}catch{return[item.content.id,null]as const;}}));if(accountRevision===this.accountRevision&&loadRevision===this.loadRevision&&entries.length){const currentIds=new Set(this.items().map(item=>item.content.id));this.originals.update(current=>({...current,...Object.fromEntries(entries.filter(([id])=>currentIds.has(id)))}));}}
  private async loadProfile():Promise<void>{const revision=this.accountRevision;try{const profile=await this.api.invoke(getMyProfile);if(revision===this.accountRevision)this.profile.set(profile);}catch{if(revision===this.accountRevision)this.profile.set(null);}}
  private setSharing(contentId:string,active:boolean):void{this.sharingIds.update(current=>{const next=new Set(current);if(active)next.add(contentId);else next.delete(contentId);return next;});}
  private publishOperationCurrent(operation:number,ownerSubject:string|null):boolean{return operation===this.publishRevision&&ownerSubject===this.session.subject();}
  private confirmedRejected(error:unknown):boolean{const status=(error as {status?:unknown})?.status;return typeof status==='number'&&status>=400&&status<500;}
  private viewSession():string{const key='escp-mobile-view-session';const current=sessionStorage.getItem(key);if(current)return current;const created=crypto.randomUUID();sessionStorage.setItem(key,created);return created;}
}
