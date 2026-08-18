import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  Api, CommunityView, createCommunity, initiateMedia, listCommunities,
  MediaView, search, SearchHit, trending, TrendingTagView, uploadMediaContent
} from '@platform/api';
import { MediaResolver, ResolvedMedia } from '../../core/media/media-resolver.service';
import { SessionMediaCleanup } from '../../core/media/session-media-cleanup.service';
import { TokenVault } from '../../core/auth/token-vault.service';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-discovery-page',
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <header class="hero">
      <p>KEŞİF MASASI</p>
      <h1>İnsanları, fikirleri ve toplulukları bul.</h1>
      <span>Arama sonuçları görünürlük, engel ve moderasyon kararlarından sonra sunulur.</span>
    </header>
    <form class="search" [formGroup]="searchForm" (ngSubmit)="runSearch()">
      <input formControlName="query" placeholder="Konu, kişi veya etiket ara" aria-label="Arama sorgusu">
      <button type="submit" [disabled]="searchForm.invalid || searching()">{{searching() ? 'Aranıyor…' : 'Ara'}}</button>
    </form>

    <section class="trend-section" aria-labelledby="trends-title">
      <p class="eyebrow" id="trends-title">GÜNDEMDE</p>
      @if (trends().length) {
        <div class="trends" aria-label="Gündemdeki etiketler">
          @for (item of trends(); track item.tag) {
            <button type="button" (click)="searchTag(item.tag)">#{{item.tag}} <small>{{item.score}}</small></button>
          }
        </div>
      } @else {
        <p class="quiet-empty">Şu anda öne çıkan bir etiket yok.</p>
      }
    </section>

    @if(searchError()) {
      <div class="search-error" role="alert">
        <p>{{searchError()}}</p>
        <button type="button" (click)="runSearch()" [disabled]="searching()">Yeniden dene</button>
      </div>
    }
    @if(message()){<p class="message" role="status">{{message()}}</p>}

    @if(searched()) {
      <section class="results-section" aria-labelledby="results-title">
        <p class="eyebrow" id="results-title">ARAMA SONUÇLARI</p>
        <div class="results">
          @for(item of results(); track item.type + item.id){
            <a [routerLink]="item.deepLink"><small>{{typeLabel(item.type)}}</small><h2>{{item.title}}</h2><p>{{item.snippet}}</p></a>
          } @empty {
            <p class="empty">Bu sorgu için görünür bir sonuç bulunamadı.</p>
          }
        </div>
      </section>
    }

    <section class="community-section" aria-labelledby="communities-title">
      <p class="eyebrow">TOPLULUKLAR</p>
      <h2 id="communities-title">Bir masa seç.</h2>
      <div class="community-list">
        @for(item of communities(); track item.id){
          <a class="community-card" [routerLink]="['/topluluklar', item.slug]"><strong>{{item.name}}</strong><p>{{item.description}}</p><span>{{item.activeMemberCount}} aktif üye · {{visibilityLabel(item.visibility)}}</span></a>
        } @empty {
          <p class="quiet-empty">Henüz katılabileceğin görünür bir topluluk yok.</p>
        }
      </div>
    </section>

    <section class="utilities" aria-labelledby="utilities-title">
      <p class="eyebrow">ARAÇLAR</p>
      <h2 id="utilities-title">İhtiyaç duyduğunda yanında.</h2>

      <details class="utility-disclosure">
        <summary><strong>Yeni topluluk oluştur</strong><span>Ortak bir ilgi alanı için herkese açık masa aç.</span></summary>
        <form [formGroup]="communityForm" (ngSubmit)="createCommunity()">
          <input formControlName="name" placeholder="Topluluk adı" aria-label="Topluluk adı"><input formControlName="slug" placeholder="kisa-adres" aria-label="Topluluk kısa adresi">
          <textarea formControlName="description" placeholder="Bu topluluk ne için var?" aria-label="Topluluk açıklaması"></textarea><button type="submit" [disabled]="communityForm.invalid">Oluştur</button>
        </form>
      </details>

      <details class="utility-disclosure">
        <summary><strong>Medya yükleme aracı</strong><span>Görsel veya videonu güvenli biçimde hazırla.</span></summary>
        <p>Görseller yeniden kodlanır, metadata temizlenir ve duyarlı türevler üretilir.</p>
        <label class="file" [class.file--busy]="uploading()">
          {{uploading() ? 'Medya hazırlanıyor…' : 'Dosya seç'}}
          <input type="file" accept="image/jpeg,image/png,image/webp,video/mp4" [disabled]="uploading()" (change)="upload($event)">
        </label>
        @if(media()){<p class="success">{{media()!.fileName}} · {{media()!.status}}</p>}
        @if(preview(); as resolved){
          <figure class="media-preview">
            @if(resolved.contentType.startsWith('image/')){
              <img [src]="resolved.url" [alt]="media()!.fileName + ' önizlemesi'">
            } @else {
              <video controls preload="metadata" [attr.aria-label]="media()!.fileName + ' önizlemesi'">
                <source [src]="resolved.url" [type]="resolved.contentType">
                Tarayıcın bu video biçimini oynatamıyor.
              </video>
            }
            <figcaption>Yüklenen dosyanın yalnızca bu oturumda açılan güvenli önizlemesi.</figcaption>
          </figure>
        } @else if(previewError()){
          <div class="preview-error" role="alert">
            <span>{{previewError()}}</span>
            <button type="button" (click)="retryPreview()">Yeniden dene</button>
          </div>
        }
      </details>

    </section>`,
  styleUrls: ['./discovery.page.css', './discovery.links.css'],
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class DiscoveryPage implements OnInit, OnDestroy {
  readonly results = signal<SearchHit[]>([]); readonly trends = signal<TrendingTagView[]>([]); readonly communities = signal<CommunityView[]>([]);
  readonly media = signal<MediaView | null>(null); readonly preview = signal<ResolvedMedia | null>(null); readonly previewError = signal(''); readonly uploading = signal(false); readonly message = signal(''); readonly searchError = signal(''); readonly searching = signal(false); readonly searched = signal(false);
  readonly searchForm = new FormGroup({query:new FormControl('',{nonNullable:true,validators:[Validators.required,Validators.minLength(2)]})});
  readonly communityForm = new FormGroup({name:new FormControl('',{nonNullable:true,validators:[Validators.required]}),slug:new FormControl('',{nonNullable:true,validators:[Validators.required]}),description:new FormControl('',{nonNullable:true,validators:[Validators.required]})});
  private searchRevision = 0;
  private previewAbort:AbortController|null=null;
  private destroyed=false;
  private uploadRevision=0;
  private ownedMedia:{id:string;accessToken:string|null}|null=null;
  private readonly cleanupBacklog=new Map<string,string|null>();
  private readonly unregisterSessionCleanup:()=>void;
  private querySubscription?:Subscription;
  constructor(private readonly api:Api,private readonly mediaResolver:MediaResolver,private readonly route:ActivatedRoute,private readonly vault:TokenVault,private readonly sessionCleanup:SessionMediaCleanup){this.unregisterSessionCleanup=this.vault.registerBeforeSessionChange(accessToken=>this.cleanupForSessionChange(accessToken));}
  ngOnInit():void{void Promise.all([this.loadCommunities(),this.loadTrends()]);this.querySubscription=this.route.queryParamMap.subscribe(params=>{const query=params.get('q')?.trim()??'';++this.searchRevision;this.searching.set(false);this.searchError.set('');if(query.length<2){this.searchForm.controls.query.setValue('');this.results.set([]);this.searched.set(false);return;}this.searchForm.controls.query.setValue(query);void this.runSearch();});}
  ngOnDestroy():void{this.destroyed=true;++this.uploadRevision;this.unregisterSessionCleanup();this.querySubscription?.unsubscribe();this.releasePreview();void this.cleanupOwnedMedia();}
  async runSearch():Promise<void>{
    if(this.searchForm.invalid)return;
    const revision=++this.searchRevision;
    this.searching.set(true);
    this.searchError.set('');
    try{
      const page=await this.api.invoke(search,{q:this.searchForm.controls.query.value.trim(),limit:30});
      if(revision!==this.searchRevision)return;
      this.results.set(page.items);
      this.searched.set(true);
    }catch{
      if(revision===this.searchRevision)this.searchError.set('Arama şu anda tamamlanamadı. Sonuçların güncel olduğundan emin olmak için yeniden deneyebilirsin.');
    }finally{
      if(revision===this.searchRevision)this.searching.set(false);
    }
  }
  searchTag(tag:string):void{this.searchForm.controls.query.setValue(tag);void this.runSearch();}
  async createCommunity():Promise<void>{if(this.communityForm.invalid)return;try{await this.api.invoke(createCommunity,{body:{...this.communityForm.getRawValue(),visibility:'Public'}});this.communityForm.reset();await this.loadCommunities();this.message.set('Topluluk yayında.');}catch{this.message.set('Topluluk oluşturulamadı.');}}
  async upload(event:Event):Promise<void>{
    const input=event.target as HTMLInputElement;const file=input.files?.[0];
    if(!file||this.uploading()||this.destroyed)return;
    const revision=++this.uploadRevision;const ownerAccessToken=this.vault.accessToken();
    this.uploading.set(true);this.previewError.set('');
    try{
      if(!await this.cleanupOwnedMedia())throw new Error('previous preview cleanup failed');
      if(this.destroyed||revision!==this.uploadRevision)return;
      const initiated=await this.api.invoke(initiateMedia,{body:{fileName:file.name,contentType:file.type,size:file.size,visibility:'Public'}});
      this.ownedMedia={id:initiated.media.id,accessToken:ownerAccessToken};
      if(this.destroyed||revision!==this.uploadRevision){await this.cleanupOwnedMedia();return;}
      const ready=await this.api.invoke(uploadMediaContent,{id:initiated.media.id,body:file});
      if(this.destroyed||revision!==this.uploadRevision){await this.cleanupOwnedMedia();return;}
      this.media.set(ready);this.message.set('Medya doğrulandı ve hazırlandı.');await this.resolvePreview(ready);
    }catch{
      await this.cleanupOwnedMedia();
      if(!this.destroyed&&revision===this.uploadRevision)this.message.set('Medya yüklenemedi; tür ve boyutu kontrol et.');
    }finally{if(!this.destroyed&&revision===this.uploadRevision)this.uploading.set(false);input.value='';}
  }
  retryPreview():void{const current=this.media();if(current)void this.resolvePreview(current);}
  typeLabel(type:string):string{return ({Profile:'Profil',Content:'İçerik',Question:'Soru',Hashtag:'Etiket',Community:'Topluluk'} as Record<string,string>)[type]??type;}
  visibilityLabel(value:string):string{return value==='Public'?'Herkese açık':value==='Private'?'Onaylı üyelik':'Gizli';}
  private async loadCommunities():Promise<void>{try{this.communities.set(await this.api.invoke(listCommunities,{limit:12}));}catch{this.message.set('Topluluklar yüklenemedi.');}}
  private async loadTrends():Promise<void>{try{this.trends.set(await this.api.invoke(trending,{limit:12}));}catch{/* Keşif ana akışını engellemez. */}}
  private async resolvePreview(media:MediaView):Promise<void>{if(this.destroyed)return;this.previewAbort?.abort();this.preview()?.release();this.preview.set(null);const abort=new AbortController();this.previewAbort=abort;this.previewError.set('');const variant=media.contentType.startsWith('image/')&&media.urls['w960.webp']?'w960.webp':null;try{const resolved=await this.mediaResolver.resolve(media.id,variant,abort.signal);if(abort.signal.aborted||this.destroyed){resolved.release();return;}this.preview.set(resolved);}catch(error){if((error as Error).name!=='AbortError'&&!this.destroyed)this.previewError.set('Önizleme şu anda açılamadı. Dosya hazır; yeniden deneyebilirsin.');}}
  private releasePreview():void{this.previewAbort?.abort();this.previewAbort=null;this.preview()?.release();this.preview.set(null);}
  private async cleanupOwnedMedia():Promise<boolean>{
    const owned=this.ownedMedia;if(owned){this.cleanupBacklog.set(owned.id,owned.accessToken);this.ownedMedia=null;}
    this.releasePreview();this.media.set(null);
    let cleaned=true;
    for(const [id,accessToken] of [...this.cleanupBacklog]){if(await this.sessionCleanup.delete([id],accessToken))this.cleanupBacklog.delete(id);else cleaned=false;}
    return cleaned;
  }
  private async cleanupForSessionChange(accessToken:string|null):Promise<void>{++this.uploadRevision;this.uploading.set(false);if(this.ownedMedia)this.ownedMedia={...this.ownedMedia,accessToken};await this.cleanupOwnedMedia();}
}
