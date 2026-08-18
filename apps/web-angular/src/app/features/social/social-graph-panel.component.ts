import { ChangeDetectionStrategy, Component, effect, inject, input, signal, untracked } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { toSignal } from '@angular/core/rxjs-interop';
import { map } from 'rxjs';
import { Api, acceptFollow, getSocialGraphSummary, listIncomingFollowRequests, listSocialGraphProfiles, rejectFollow, SocialGraphProfileView, SocialGraphSummaryView } from '@platform/api';
import { AuthorizedAvatarComponent } from '../../core/media/authorized-avatar.component';

type PanelKind = 'Followers' | 'Following' | 'Requests';

@Component({
  selector: 'zm-social-graph-panel',
  imports: [RouterLink, AuthorizedAvatarComponent],
  template: `
    <section class="graph-panel" aria-labelledby="graph-title">
      <div class="graph-heading"><div><p class="kicker">SOSYAL AĞ</p><h2 id="graph-title">Bağlantılar</h2></div>
        @if(summary();as value){<div class="counts" aria-label="Bağlantı sayıları">
          <button type="button" [class.active]="kind()==='Followers'" (click)="select('Followers')"><strong>{{value.followerCount}}</strong><span>Takipçi</span></button>
          <button type="button" [class.active]="kind()==='Following'" (click)="select('Following')"><strong>{{value.followingCount}}</strong><span>Takip</span></button>
          @if(value.canManageRequests){<button type="button" [class.active]="kind()==='Requests'" (click)="select('Requests')"><strong>{{value.pendingRequestCount}}</strong><span>İstek</span></button>}
        </div>}
      </div>
      @if(summaryLoading()){<p class="state" aria-busy="true">Bağlantı özeti yükleniyor.</p>}
      @else if(summaryError()){<p class="state error" role="alert">Bağlantı özeti alınamadı. <button type="button" (click)="reload()">Tekrar dene</button></p>}
      @else if(summary()){
        @if(listLoading() && items().length===0){<p class="state" aria-busy="true">Liste yükleniyor.</p>}
        @else if(listError() && items().length===0){<p class="state error" role="alert">Liste yüklenemedi. <button type="button" (click)="loadList(true)">Tekrar dene</button></p>}
        @else if(items().length===0){<p class="state">{{kind()==='Requests'?'Bekleyen takip isteğin yok.':kind()==='Followers'?'Henüz görünür takipçi yok.':'Henüz görünür takip edilen profil yok.'}}</p>}
        @else {<ul class="people">
          @for(person of items();track person.ownerId){<li><a [routerLink]="['/profil',person.handle]"><zm-authorized-avatar [name]="person.displayName" [mediaId]="person.profileMediaId ?? null" size="md"/><span><strong>{{person.displayName}} @if(person.isVerified){<span class="verified">Doğrulanmış</span>}</strong><small>&#64;{{person.handle}}</small></span></a>
            @if(kind()==='Requests'){<div class="request-actions"><button type="button" class="primary" (click)="decide(person,true)" [disabled]="actingId()===person.ownerId">Kabul et</button><button type="button" (click)="decide(person,false)" [disabled]="actingId()===person.ownerId">Reddet</button></div>}
          </li>}
        </ul>}
        @if(nextCursor()){<button class="more" type="button" (click)="loadList(false)" [disabled]="listLoading()">{{listLoading()?'Yükleniyor…':'Daha fazla göster'}}</button>}
        @if(actionMessage()){<p class="action-message" [class.error]="actionError()" [attr.role]="actionError()?'alert':'status'">{{actionMessage()}}</p>}
      }
    </section>
  `,
  styleUrl: './social-graph-panel.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SocialGraphPanelComponent {
  readonly ownerId=input.required<string>();
  readonly initialKind=input<PanelKind|null>(null);
  readonly summary=signal<SocialGraphSummaryView|null>(null);readonly summaryLoading=signal(true);readonly summaryError=signal(false);
  readonly kind=signal<PanelKind>('Followers');readonly items=signal<SocialGraphProfileView[]>([]);readonly nextCursor=signal<string|null>(null);readonly listLoading=signal(false);readonly listError=signal(false);
  readonly actingId=signal<string|null>(null);readonly actionMessage=signal('');readonly actionError=signal(false);
  private revision=0;
  private listRevision=0;
  private readonly routeKind=toSignal(inject(ActivatedRoute).queryParamMap.pipe(map(params=>params.get('view')==='requests'?'Requests' as const:'Followers' as const)),{initialValue:'Followers' as const});
  private readonly sync=effect(()=>{const ownerId=this.ownerId();const initialKind=this.initialKind()??this.routeKind();untracked(()=>{void this.reload(ownerId,initialKind);});});
  constructor(private readonly api:Api){}
  async reload(ownerId=this.ownerId(),initialKind=this.initialKind()??this.routeKind()):Promise<void>{const revision=++this.revision;++this.listRevision;this.listLoading.set(false);this.actingId.set(null);this.actionMessage.set('');this.actionError.set(false);this.summaryLoading.set(true);this.summaryError.set(false);this.summary.set(null);this.items.set([]);this.nextCursor.set(null);this.kind.set('Followers');try{const summary=await this.api.invoke(getSocialGraphSummary,{ownerId});if(revision!==this.revision)return;this.summary.set(summary);this.kind.set(initialKind==='Requests'&&summary.canManageRequests?'Requests':initialKind==='Following'?'Following':'Followers');await this.loadList(true,revision);}catch{if(revision===this.revision)this.summaryError.set(true);}finally{if(revision===this.revision)this.summaryLoading.set(false);}}
  select(kind:PanelKind):void{if(kind==='Requests'&&!this.summary()?.canManageRequests)return;this.kind.set(kind);this.actionMessage.set('');void this.loadList(true);}
  async loadList(reset:boolean,revision=this.revision):Promise<void>{if(!reset&&this.listLoading())return;const listRevision=reset?++this.listRevision:this.listRevision;this.listLoading.set(true);this.listError.set(false);const kind=this.kind();const cursor=reset?undefined:this.nextCursor()??undefined;try{const page=kind==='Requests'?await this.api.invoke(listIncomingFollowRequests,{limit:20,cursor}):await this.api.invoke(listSocialGraphProfiles,{ownerId:this.ownerId(),kind,limit:20,cursor});if(revision!==this.revision||listRevision!==this.listRevision||kind!==this.kind())return;this.items.update(current=>reset?page.items:[...current,...page.items.filter(item=>!current.some(existing=>existing.ownerId===item.ownerId))]);this.nextCursor.set(page.nextCursor??null);}catch{if(revision===this.revision&&listRevision===this.listRevision&&kind===this.kind())this.listError.set(true);}finally{if(revision===this.revision&&listRevision===this.listRevision&&kind===this.kind())this.listLoading.set(false);}}
  async decide(person:SocialGraphProfileView,accept:boolean):Promise<void>{if(this.actingId())return;const revision=this.revision;const ownerId=this.ownerId();this.actingId.set(person.ownerId);this.actionError.set(false);try{await this.api.invoke(accept?acceptFollow:rejectFollow,{requesterId:person.ownerId});if(revision!==this.revision||ownerId!==this.ownerId())return;this.items.update(items=>items.filter(item=>item.ownerId!==person.ownerId));this.summary.update(value=>value?{...value,followerCount:value.followerCount+(accept?1:0),pendingRequestCount:Math.max(0,value.pendingRequestCount-1)}:value);this.actionMessage.set(accept?'Takip isteği kabul edildi.':'Takip isteği reddedildi.');}catch{if(revision===this.revision&&ownerId===this.ownerId()){this.actionMessage.set('Takip isteği güncellenemedi.');this.actionError.set(true);}}finally{if(revision===this.revision&&ownerId===this.ownerId()&&this.actingId()===person.ownerId)this.actingId.set(null);}}
}
