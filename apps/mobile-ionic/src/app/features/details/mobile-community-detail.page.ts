import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Api, changeCommunity, CommunityDetailView, getCommunityBySlug } from '@platform/api';
import { IonBackButton, IonButton, IonButtons, IonContent, IonHeader, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { Subscription } from 'rxjs';

@Component({
  selector: 'app-mobile-community-detail',
  imports: [RouterLink, IonBackButton, IonButton, IonButtons, IonContent, IonHeader, IonTitle, IonToolbar],
  template: `<ion-header translucent="true"><ion-toolbar><ion-buttons slot="start"><ion-back-button defaultHref="/kesfet"></ion-back-button></ion-buttons><ion-title>Topluluk</ion-title></ion-toolbar></ion-header><ion-content [fullscreen]="true">@if(loading()){<section class="detail-state" aria-busy="true"><h1>Topluluk yükleniyor</h1></section>}@else if(error()){<section class="detail-state" role="alert"><h1>Topluluk açılamadı</h1><ion-button (click)="load()">Tekrar dene</ion-button></section>}@else if(community();as item){<article class="detail-card"><p class="kicker">TOPLULUK</p><h1>{{item.name}}</h1><div class="meta"><span>{{item.activeMemberCount}} aktif üye</span><span>{{item.visibility==='Public'?'Herkese açık':'Onaylı üyelik'}}</span></div><p>{{item.description}}</p>@if(!item.viewerRole&&(!item.viewerMembershipStatus||(item.viewerMembershipStatus==='Removed'&&item.visibility==='Public'))){<ion-button [disabled]="acting()" (click)="join()">{{item.visibility==='Public'?'Topluluğa katıl':'Üyelik isteği gönder'}}</ion-button>}@if(item.viewerRole&&item.viewerRole!=='Owner'){<ion-button fill="outline" color="danger" [disabled]="acting()" (click)="leave()">Topluluktan ayrıl</ion-button>}@if(message()){<p role="status">{{message()}}</p>}<section class="answer"><h2>Topluluk kuralları</h2>@if(item.rules.length){<ol class="rules">@for(rule of item.rules;track $index){<li>{{rule}}</li>}</ol>}@else{<p>Henüz yayımlanmış kural yok.</p>}</section>@if(item.pinnedContentIds.length){<section class="answer"><h2>Sabitlenenler</h2>@for(id of item.pinnedContentIds;track id){<p><a [routerLink]="['/icerik',id]">Sabitlenen gönderiyi aç</a></p>}</section>}</article>}</ion-content>`,
  styleUrl: './mobile-detail.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MobileCommunityDetailPage implements OnInit, OnDestroy {
  readonly community = signal<CommunityDetailView | null>(null);
  readonly loading = signal(true);
  readonly acting = signal(false);
  readonly error = signal(false);
  readonly message = signal('');
  private slug = '';
  private revision = 0;
  private subscription?: Subscription;

  constructor(private readonly api: Api, private readonly route: ActivatedRoute) {}

  ngOnInit(): void {
    this.subscription = this.route.paramMap.subscribe(params => {
      this.slug = params.get('slug') ?? '';
      const revision = ++this.revision;
      this.community.set(null);
      this.message.set('');
      this.acting.set(false);
      void this.load(revision);
    });
  }

  ngOnDestroy(): void { this.subscription?.unsubscribe(); ++this.revision; }

  async load(revision = this.revision): Promise<void> {
    this.loading.set(true); this.error.set(false);
    try {
      const community = await this.api.invoke(getCommunityBySlug, { slug: this.slug });
      if (revision === this.revision) this.community.set(community);
    } catch {
      if (revision === this.revision) { this.community.set(null); this.error.set(true); }
    } finally { if (revision === this.revision) this.loading.set(false); }
  }

  async join(): Promise<void> {
    const item = this.community(); const revision = this.revision;
    const canRequestAgain = item?.viewerMembershipStatus === 'Removed' && item.visibility === 'Public';
    if (!item || this.acting() || item.viewerRole ||
        (item.viewerMembershipStatus && !canRequestAgain)) return;
    this.acting.set(true);
    try {
      await this.api.invoke(changeCommunity, { id: item.id, body: { change: 'RequestMembership', targetId: null, reason: null } });
      if (revision !== this.revision) return;
      await this.load(revision);
      if (revision === this.revision) this.message.set(item.visibility === 'Public' ? 'Topluluğa katıldın.' : 'Üyelik isteğin gönderildi.');
    } catch { if (revision === this.revision) this.message.set('Topluluk işlemi tamamlanamadı.'); }
    finally { if (revision === this.revision) this.acting.set(false); }
  }

  async leave(): Promise<void> {
    const item = this.community(); const revision = this.revision;
    if (!item || this.acting() || !item.viewerRole || item.viewerRole === 'Owner' ||
        !globalThis.confirm('Bu topluluktan ayrılmak istediğine emin misin?')) return;
    this.acting.set(true);
    try {
      await this.api.invoke(changeCommunity, { id: item.id, body: { change: 'Leave', targetId: null, reason: null } });
      if (revision !== this.revision) return;
      await this.load(revision);
      if (revision === this.revision) this.message.set('Topluluktan ayrıldın.');
    } catch { if (revision === this.revision) this.message.set('Topluluk işlemi tamamlanamadı.'); }
    finally { if (revision === this.revision) this.acting.set(false); }
  }
}
