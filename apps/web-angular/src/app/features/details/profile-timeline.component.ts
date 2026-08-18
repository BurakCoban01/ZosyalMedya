import { ChangeDetectionStrategy, Component, computed, effect, input, signal, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Api, ContentItem, FeedItem, PollView, ProfileView, getContent, getFeed, getPoll } from '@platform/api';
import { PostAuthorIdentity, ZmPostCardComponent } from '../feed/components/post-card.component';

@Component({
  selector: 'zm-profile-timeline',
  imports: [RouterLink, ZmPostCardComponent],
  template: `
    <section class="timeline" aria-labelledby="timeline-title">
      <header>
        <div><p class="eyebrow">PAYLAŞIMLAR</p><h2 id="timeline-title">Profil akışı</h2></div>
        <div class="tabs" role="tablist" aria-label="Profil gönderileri">
          <button type="button" role="tab" [attr.aria-selected]="tab()==='all'" (click)="tab.set('all')">Tümü <span>{{items().length}}</span></button>
          <button type="button" role="tab" [attr.aria-selected]="tab()==='media'" (click)="tab.set('media')">Medya <span>{{mediaCount()}}</span></button>
        </div>
      </header>
      @if (loading()) {
        <div class="timeline-state" aria-busy="true"><strong>Paylaşımlar hazırlanıyor.</strong><span>Görünür profil akışı yükleniyor.</span></div>
      } @else if (error()) {
        <div class="timeline-state error" role="alert"><strong>Paylaşımlar yüklenemedi.</strong><span>Bağlantını kontrol edip yeniden deneyebilirsin.</span><button type="button" (click)="retry()">Tekrar dene</button></div>
      } @else if (!items().length) {
        <div class="timeline-state"><strong>Henüz görünür paylaşım yok.</strong><span>Bu profil paylaşım yaptığında burada görünecek.</span></div>
      } @else if (!visibleItems().length) {
        <div class="timeline-state"><strong>Yüklenen gönderilerde medya yok.</strong><span>{{nextCursor() ? 'Daha eski paylaşımlarda medya olabilir.' : 'Bu profil henüz görsel veya video paylaşmadı.'}}</span></div>
      } @else {
        <div class="timeline-list">
          @for (item of visibleItems(); track item.content.id) {
            <zm-post-card [item]="item" [author]="author(item)" [poll]="polls()[item.content.id]" [original]="originals()[item.content.id]" [pollInteractive]="false">
              <footer class="timeline-action"><a [routerLink]="['/icerik',item.content.id]">Gönderiyi aç</a></footer>
            </zm-post-card>
          }
        </div>
      }
      @if (!loading() && !error() && nextCursor()) {
        <button class="load-more" type="button" [disabled]="loadingMore()" (click)="loadMore()">{{loadingMore()?'Yükleniyor…':tab()==='media'?'Daha fazla medya ara':'Daha eski paylaşımları yükle'}}</button>
      }
      @if (loadMoreError()) { <p class="load-more-error" role="alert">Daha eski paylaşımlar alınamadı; yeniden deneyebilirsin.</p> }
    </section>
  `,
  styleUrl: './profile-timeline.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ProfileTimelineComponent {
  readonly profile = input.required<ProfileView>();
  readonly items = signal<FeedItem[]>([]);
  readonly nextCursor = signal<string | null>(null);
  readonly loading = signal(true);
  readonly loadingMore = signal(false);
  readonly error = signal(false);
  readonly loadMoreError = signal(false);
  readonly tab = signal<'all'|'media'>('all');
  readonly originals = signal<Record<string, ContentItem | null | undefined>>({});
  readonly polls = signal<Record<string, PollView | null>>({});
  readonly mediaCount = computed(() => this.items().filter(item => item.content.mediaIds.length > 0).length);
  readonly visibleItems = computed(() => this.tab()==='media' ? this.items().filter(item => item.content.mediaIds.length > 0) : this.items());

  private revision = 0;
  private readonly profileSync = effect(() => {
    this.profile().ownerId;
    untracked(() => { void this.load(false, ++this.revision); });
  });
  constructor(private readonly api: Api) {}
  retry(): void { void this.load(false, ++this.revision); }
  loadMore(): void { if (!this.loadingMore() && this.nextCursor()) void this.load(true, this.revision); }

  author(item: FeedItem): PostAuthorIdentity {
    const summary=item.author;const profile=this.profile();const handle=summary?.handle||profile.handle;
    return {authorId:item.content.authorId,displayName:summary?.displayName||profile.displayName,handle,avatarUrl:'',avatarMediaId:summary?.profileMediaId??profile.profileMediaId??null,profileHref:`/profil/${encodeURIComponent(handle)}`,isViewer:false,resolved:true};
  }

  private async load(append: boolean, revision: number): Promise<void> {
    if (append) {this.loadingMore.set(true);this.loadMoreError.set(false);} else {this.loading.set(true);this.error.set(false);this.loadMoreError.set(false);this.items.set([]);this.nextCursor.set(null);this.originals.set({});this.polls.set({});}
    try {
      const page=await this.api.invoke(getFeed,{kind:'Profile',profileId:this.profile().ownerId,limit:10,cursor:append?this.nextCursor()??undefined:undefined});
      if(revision!==this.revision)return;
      const existing=append?this.items():[];const seen=new Set(existing.map(item=>item.content.id));const added=page.items.filter(item=>!seen.has(item.content.id));this.items.set([...existing,...added]);this.nextCursor.set(page.nextCursor??null);
      await Promise.all(added.map(item=>this.loadContext(item,revision)));
    } catch { if(revision===this.revision){if(append)this.loadMoreError.set(true);else this.error.set(true);} }
    finally {if(revision===this.revision){this.loading.set(false);this.loadingMore.set(false);}}
  }

  private async loadContext(item: FeedItem, revision: number): Promise<void> {
    const contentId=item.content.id;
    if(item.content.originalPostId){const source=await this.api.invoke(getContent,{contentId:item.content.originalPostId}).catch(()=>null);if(revision===this.revision)this.originals.update(values=>({...values,[contentId]:source}));}
    if(item.hasPoll){const poll=await this.api.invoke(getPoll,{contentId}).catch(()=>null);if(revision===this.revision)this.polls.update(values=>({...values,[contentId]:poll}));}
  }
}
