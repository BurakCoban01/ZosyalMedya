import { ChangeDetectionStrategy, Component, OnDestroy, computed, effect, input, signal, untracked, viewChild } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Api, StoryView, createStory, deleteStory, getStory, listActiveStories, listProfileStories } from '@platform/api';
import { IonButton, IonButtons, IonContent, IonHeader, IonModal, IonNote, IonSelect, IonSelectOption, IonSpinner, IonTextarea, IonTitle, IonToolbar } from '@ionic/angular/standalone';
import { MobileSession } from '../../core/auth/secure-token-storage';
import { MobileMediaAttachmentPickerComponent, MobileMediaAttachmentTransfer } from '../../core/media/mobile-media-attachment-picker.component';
import { MobileMediaResolver, MobileResolvedMedia } from '../../core/media/mobile-media-resolver.service';

type StoryAudience = 'Public' | 'Followers' | 'CloseFriends';
type ViewerState = 'idle' | 'loading' | 'ready' | 'unavailable';

@Component({
  selector: 'zm-mobile-story-rail',
  imports: [
    ReactiveFormsModule, RouterLink, IonButton, IonButtons, IonContent, IonHeader, IonModal,
    IonNote, IonSelect, IonSelectOption, IonSpinner, IonTextarea, IonTitle, IonToolbar,
    MobileMediaAttachmentPickerComponent,
  ],
  template: `
    <section class="stories" aria-labelledby="mobile-story-heading" [attr.aria-busy]="loading()">
      <header>
        <div><p>ANLAR</p><h2 id="mobile-story-heading">Hikâyeler</h2></div>
        <div class="heading-actions">
          @if(error()){<ion-button fill="clear" size="small" (click)="load(false)">Yeniden dene</ion-button>}
          @if(allowCreate()){<ion-button size="small" (click)="openComposer($event)">Hikâye ekle</ion-button>}
        </div>
      </header>

      @if(loading()&&!items().length){
        <div class="story-skeleton" aria-label="Hikâyeler yükleniyor">@for(_ of [1,2,3,4];track $index){<span></span>}</div>
      } @else if(items().length){
        <div class="story-rail" role="list" aria-label="Etkin Hikâyeler">
          @for(group of authorGroups();track group.ownerId){
            <div class="story-shell" role="listitem">
              <button type="button" class="story-tile" [class.viewed]="groupViewed(group.stories)" (click)="openAuthor(group.stories,$event)" [attr.aria-label]="group.author.displayName+' · '+group.stories.length+' Hikâye · '+groupStatus(group.stories)">
                <span class="portrait" aria-hidden="true">{{initial(group.author.displayName)}}@if(group.stories.length>1){<span class="story-count">{{group.stories.length}}</span>}</span>
                <strong>{{group.author.displayName}}</strong><small>{{groupStatus(group.stories)}}</small>
              </button>
            </div>
          }
          @if(nextCursor()){<ion-button class="more" fill="outline" size="small" [disabled]="loading()" (click)="load(true)">Daha fazla</ion-button>}
        </div>
      } @else if(!error()){
        <ion-note class="empty">{{allowCreate()?'Bugünün ilk Hikâyesini paylaşabilirsin.':'Bu profil için görünür etkin Hikâye yok.'}}</ion-note>
      }
    </section>

    <ion-modal #composerModal class="story-compose-modal" [isOpen]="composerOpen()" [canDismiss]="!publishing()&&!closingComposer()" (didDismiss)="composerDismissed()">
      <ng-template>
        <ion-header><ion-toolbar><ion-buttons slot="start"><ion-button [disabled]="publishing()||closingComposer()" (click)="closeComposer()">Vazgeç</ion-button></ion-buttons><ion-title>Yeni Hikâye</ion-title></ion-toolbar></ion-header>
        <ion-content class="ion-padding">
          <p class="intro">Bir görsel veya video seç. Yükleme durumunu burada izleyebilirsin; Hikâye 24 saat sonra görünmez olur.</p>
          <zm-mobile-media-picker #storyPicker label="Hikâye medyası" visibility="Private" [maxFiles]="1" [disabled]="publishing()||closingComposer()" (mediaIdsChange)="storyMediaIds.set($event)" (uploadingChange)="storyMediaBusy.set($event)" />
          <ion-textarea [formControl]="caption" [autoGrow]="true" maxlength="500" label="Açıklama" labelPlacement="stacked" placeholder="Bu anda ne var?"></ion-textarea>
          <ion-note class="count">{{caption.value.length}}/500</ion-note>
          <ion-select [formControl]="audience" label="Kimler görebilir?" labelPlacement="stacked" interface="action-sheet">
            <ion-select-option value="Public">Herkes</ion-select-option><ion-select-option value="Followers">Takipçiler</ion-select-option><ion-select-option value="CloseFriends">Yakın arkadaşlar</ion-select-option>
          </ion-select>
          @if(composerMessage()){<ion-note class="compose-message" [color]="composerFailed()?'danger':'success'" [attr.role]="composerFailed()?'alert':'status'">{{composerMessage()}}</ion-note>}
          <ion-button class="publish" expand="block" [disabled]="!canPublish()" (click)="publish()">@if(publishing()){<ion-spinner name="crescent"></ion-spinner>}@else{Hikâyeyi paylaş}</ion-button>
        </ion-content>
      </ng-template>
    </ion-modal>

    <ion-modal #viewerModal class="story-viewer-modal" [isOpen]="viewerOpen()" (didDismiss)="viewerDismissed()">
      <ng-template>
        <ion-header><ion-toolbar><ion-buttons slot="start"><ion-button (click)="closeViewer()">Kapat</ion-button></ion-buttons><ion-title>{{selectedAuthorName()||'Hikâye'}}</ion-title></ion-toolbar></ion-header>
        <ion-content [fullscreen]="true">
          <article class="viewer" (touchstart)="touchStart($event)" (touchend)="touchEnd($event)">
            <header>@if(selectedStory();as story){<a [routerLink]="['/profil',story.author.handle]" (click)="closeViewer()"><span class="viewer-avatar">{{initial(story.author.displayName)}}</span><span><strong>{{story.author.displayName}}</strong><small>&#64;{{story.author.handle}} · {{expiryLabel(story)}}</small></span></a>}</header>
            <div class="stage" [attr.aria-busy]="viewerState()==='loading'">
              @if(selectedAuthorStories().length>1){<div class="story-segments" [attr.aria-label]="selectedAuthorPosition()+1+' / '+selectedAuthorStories().length+' Hikâye'">@for(candidate of selectedAuthorStories();track candidate.id){<span [class.active]="candidate.id===selectedStory().id" [class.viewed]="viewedIds().has(candidate.id)" aria-hidden="true"></span>}</div>}
              @if(viewerState()==='loading'){<div class="viewer-state" role="status"><ion-spinner name="crescent"></ion-spinner><span>Hikâye hazırlanıyor…</span></div>}
              @else if(viewerState()==='unavailable'){<div class="viewer-state" role="alert"><strong>Bu Hikâye artık açılamıyor.</strong><p>Süresi dolmuş veya görünürlüğü değişmiş olabilir.</p><ion-button fill="outline" (click)="resolveSelected()">Yeniden dene</ion-button></div>}
              @else if(viewerMedia();as media){@if(media.contentType.startsWith('image/')){<img [src]="media.url" [alt]="selectedAuthorName()+' tarafından paylaşılan Hikâye görseli'">}@else{<video controls playsinline preload="metadata" [attr.aria-label]="selectedAuthorName()+' Hikâye videosu'"><source [src]="media.url" [type]="media.contentType"></video>}}
            </div>
            @if(selectedStory();as story){<footer><div class="copy">@if(story.caption){<p>{{story.caption}}</p>}<small>{{audienceLabel(story.audience)}}</small></div><nav aria-label="Hikâye gezinmesi"><ion-button fill="outline" size="small" [disabled]="selectedAuthorStories().length<2" (click)="move(-1)">Önceki</ion-button><span>{{selectedAuthorPosition()+1}}/{{selectedAuthorStories().length}}</span><ion-button fill="outline" size="small" [disabled]="selectedAuthorStories().length<2" (click)="move(1)">Sonraki</ion-button></nav>@if(viewerMessage()){<ion-note color="danger" role="alert">{{viewerMessage()}}</ion-note>}@if(canDeleteSelected()){<ion-button class="delete" fill="clear" color="danger" [disabled]="deleting()" (click)="deleteConfirm.set(true)">Hikâyeyi sil</ion-button>}@if(deleteConfirm()){<div class="confirm" role="alert"><span>Bu Hikâye kalıcı olarak silinsin mi?</span><ion-button fill="clear" (click)="deleteConfirm.set(false)">Vazgeç</ion-button><ion-button color="danger" [disabled]="deleting()" (click)="removeSelected()">Sil</ion-button></div>}</footer>}
          </article>
        </ion-content>
      </ng-template>
    </ion-modal>
  `,
  styleUrls: ['./mobile-story-rail.component.css', './mobile-story-rail-grouping.component.css'],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MobileStoryRailComponent implements OnDestroy {
  readonly ownerId=input<string|null>(null);readonly allowCreate=input(true);readonly items=signal<StoryView[]>([]);readonly nextCursor=signal<string|null>(null);readonly loading=signal(false);readonly error=signal(false);
  readonly composerOpen=signal(false);readonly closingComposer=signal(false);readonly publishing=signal(false);readonly composerMessage=signal('');readonly composerFailed=signal(false);readonly storyMediaIds=signal<string[]>([]);readonly storyMediaBusy=signal(false);
  readonly viewerOpen=signal(false);readonly selectedIndex=signal(-1);readonly viewerState=signal<ViewerState>('idle');readonly viewerMedia=signal<MobileResolvedMedia|null>(null);readonly viewerMessage=signal('');readonly deleting=signal(false);readonly deleteConfirm=signal(false);readonly viewedIds=signal(new Set<string>());
  readonly authorGroups=computed(()=>{const groups=new Map<string,{ownerId:string;author:StoryView['author'];stories:StoryView[]}>();for(const item of this.items()){const current=groups.get(item.ownerId);if(current)current.stories.push(item);else groups.set(item.ownerId,{ownerId:item.ownerId,author:item.author,stories:[item]});}return[...groups.values()];});
  readonly caption=new FormControl('',{nonNullable:true,validators:[Validators.maxLength(500)]});readonly audience=new FormControl<StoryAudience>('Public',{nonNullable:true});readonly selectedStory=computed(()=>this.items()[this.selectedIndex()]??null);readonly selectedAuthorName=computed(()=>this.selectedStory()?.author.displayName??'');readonly selectedAuthorStories=computed(()=>{const selected=this.selectedStory();return selected?this.items().filter(item=>item.ownerId===selected.ownerId):[];});readonly selectedAuthorPosition=computed(()=>{const selected=this.selectedStory();return selected?Math.max(0,this.selectedAuthorStories().findIndex(item=>item.id===selected.id)):0;});
  private readonly storyPicker=viewChild<MobileMediaAttachmentPickerComponent>('storyPicker');private readonly composerModal=viewChild<IonModal>('composerModal');private readonly viewerModal=viewChild<IonModal>('viewerModal');private loadRevision=0;private viewerRevision=0;private sessionRevision=0;private publishRevision=0;private currentScope:string|null=null;private currentSubject:string|null=null;private observedMediaRevision:number|null=null;private viewerController:AbortController|null=null;private returnFocus:HTMLElement|null=null;private composerReturnFocus:HTMLElement|null=null;private touchOrigin:number|null=null;private destroyed=false;
  private readonly sync=effect(()=>{const owner=this.ownerId();const subject=this.session.subject();const mediaRevision=this.resolver.sessionRevision();untracked(()=>{const scope=`${owner??'active'}:${subject??'anonymous'}`;if(this.currentScope!==scope){this.currentScope=scope;++this.loadRevision;this.items.set([]);this.nextCursor.set(null);this.error.set(false);this.loading.set(false);this.forceCloseComposer();this.closeViewer();this.readViewed(subject);void this.load(false,owner);}if(this.observedMediaRevision!==null&&this.observedMediaRevision!==mediaRevision&&this.viewerOpen())this.closeViewer();this.observedMediaRevision=mediaRevision;if(this.currentSubject!==null&&this.currentSubject!==subject){++this.sessionRevision;++this.publishRevision;this.publishing.set(false);this.forceCloseComposer();this.closeViewer();}this.currentSubject=subject;});});
  constructor(private readonly api:Api,private readonly resolver:MobileMediaResolver,private readonly session:MobileSession){}
  canPublish():boolean{return this.storyMediaIds().length===1&&!this.storyMediaBusy()&&!this.caption.invalid&&!this.publishing()&&!this.closingComposer();}
  initial(name:string):string{return name.trim().charAt(0).toLocaleUpperCase('tr-TR')||'?';}
  async load(append:boolean,owner=this.ownerId()):Promise<void>{if(append&&this.loading())return;const revision=++this.loadRevision;this.loading.set(true);this.error.set(false);try{const page=owner?await this.api.invoke(listProfileStories,{ownerId:owner,limit:20,cursor:append?this.nextCursor()??undefined:undefined}):await this.api.invoke(listActiveStories,{limit:20,cursor:append?this.nextCursor()??undefined:undefined});if(revision!==this.loadRevision||this.destroyed)return;const incoming=page.items??[];this.items.update(current=>append?this.merge(current,incoming):incoming);this.nextCursor.set(page.nextCursor??null);}catch{if(revision===this.loadRevision)this.error.set(true);}finally{if(revision===this.loadRevision)this.loading.set(false);}}
  openComposer(event?:Event):void{if(!this.allowCreate())return;this.composerReturnFocus=event?.currentTarget as HTMLElement|null;this.composerMessage.set('');this.composerFailed.set(false);this.composerOpen.set(true);}
  async closeComposer():Promise<void>{if(this.publishing()||this.closingComposer())return;this.closingComposer.set(true);try{await this.storyPicker()?.discard();this.forceCloseComposer();}finally{this.closingComposer.set(false);}}
  composerDismissed():void{if(this.composerOpen()){void this.closeComposer().finally(()=>this.finishComposerFocus());return;}this.finishComposerFocus();}
  async publish():Promise<void>{if(!this.canPublish())return;const revision=this.sessionRevision;const operation=++this.publishRevision;const ownerAccessToken=this.session.accessToken();this.publishing.set(true);this.composerMessage.set('');this.composerFailed.set(false);let transfer:MobileMediaAttachmentTransfer|undefined;let mediaId='';try{const selected=[...this.storyMediaIds()];transfer=this.storyPicker()?.transfer();mediaId=transfer?.ids[0]??selected[0];const story=await this.api.invoke(createStory,{body:{mediaId,caption:this.caption.value.trim()||null,audience:this.audience.value}});if(this.destroyed||revision!==this.sessionRevision||operation!==this.publishRevision)return;this.acceptCreated(story);}catch{if(this.destroyed||revision!==this.sessionRevision||operation!==this.publishRevision){await transfer?.discardWithAccessToken(ownerAccessToken);return;}const committed=await this.reconcileCreated(mediaId);if(committed){this.acceptCreated(committed);return;}await transfer?.rollback();if(operation!==this.publishRevision)return;this.composerMessage.set('Hikâye yayınlanamadı. Medyan korundu; bağlantını kontrol edip yeniden deneyebilirsin.');this.composerFailed.set(true);}finally{if(operation===this.publishRevision)this.publishing.set(false);}}
  openStory(index:number,event?:Event):void{if(!this.items()[index])return;this.returnFocus=event?.currentTarget as HTMLElement|null;this.selectedIndex.set(index);this.viewerOpen.set(true);this.deleteConfirm.set(false);this.viewerMessage.set('');void this.resolveSelected();}
  openAuthor(stories:StoryView[],event?:Event):void{const selected=stories.find(item=>!this.viewedIds().has(item.id))??stories[0];const index=selected?this.items().findIndex(item=>item.id===selected.id):-1;if(index>=0)this.openStory(index,event);}
  groupViewed(stories:StoryView[]):boolean{return stories.every(item=>this.viewedIds().has(item.id));}
  groupStatus(stories:StoryView[]):string{const unseen=stories.filter(item=>!this.viewedIds().has(item.id)).length;return unseen?`${unseen} yeni`:'Görüldü';}
  async resolveSelected():Promise<void>{const story=this.selectedStory();if(!story)return;const revision=++this.viewerRevision;this.viewerController?.abort();this.releaseViewer();this.viewerState.set('loading');const controller=new AbortController();this.viewerController=controller;try{const current=await this.api.invoke(getStory,{id:story.id});if(revision!==this.viewerRevision||this.destroyed)return;const media=await this.resolver.resolve(current.mediaId,null,controller.signal);if(revision!==this.viewerRevision||this.destroyed){media.release();return;}this.items.update(items=>items.map(item=>item.id===current.id?current:item));this.viewerMedia.set(media);this.viewerState.set('ready');this.markViewed(current.id);}catch(error){if((error as Error).name!=='AbortError'&&revision===this.viewerRevision)this.viewerState.set('unavailable');}finally{if(this.viewerController===controller)this.viewerController=null;}}
  move(delta:number):void{const stories=this.selectedAuthorStories();if(stories.length<2)return;const target=stories[(this.selectedAuthorPosition()+delta+stories.length)%stories.length];const index=this.items().findIndex(item=>item.id===target.id);if(index<0)return;this.selectedIndex.set(index);this.deleteConfirm.set(false);void this.resolveSelected();}
  touchStart(event:TouchEvent):void{const target=event.target as Element|null;if(target?.closest('video,button,a,ion-button')){this.touchOrigin=null;return;}this.touchOrigin=event.changedTouches[0]?.clientX??null;}
  touchEnd(event:TouchEvent):void{const end=event.changedTouches[0]?.clientX;const start=this.touchOrigin;this.touchOrigin=null;if(start===null||end===undefined||Math.abs(end-start)<48)return;this.move(end<start?1:-1);}
  closeViewer():void{++this.viewerRevision;this.viewerController?.abort();this.viewerController=null;this.releaseViewer();this.viewerState.set('idle');this.viewerOpen.set(false);void this.viewerModal()?.dismiss();this.selectedIndex.set(-1);this.deleteConfirm.set(false);this.viewerMessage.set('');}
  viewerDismissed():void{if(this.viewerOpen())this.closeViewer();this.restoreFocus(this.returnFocus);this.returnFocus=null;}
  canDeleteSelected():boolean{return this.selectedStory()?.ownerId===this.session.subject();}
  async removeSelected():Promise<void>{const story=this.selectedStory();if(!story||!this.canDeleteSelected()||this.deleting())return;this.deleting.set(true);this.viewerMessage.set('');try{await this.api.invoke(deleteStory,{id:story.id});this.items.update(items=>items.filter(item=>item.id!==story.id));this.closeViewer();}catch{this.viewerMessage.set('Hikâye silinemedi. Bağlantını kontrol edip yeniden deneyebilirsin.');}finally{this.deleting.set(false);}}
  expiryLabel(story:StoryView):string{const minutes=Math.max(0,Math.ceil((Date.parse(story.expiresAtUtc)-Date.now())/60_000));return minutes>=60?`${Math.ceil(minutes/60)} saat kaldı`:`${minutes} dk kaldı`;}
  audienceLabel(audience:StoryAudience):string{return audience==='Public'?'Herkes':audience==='Followers'?'Takipçiler':'Yakın arkadaşlar';}
  ngOnDestroy():void{this.destroyed=true;++this.loadRevision;++this.viewerRevision;++this.publishRevision;this.sync.destroy();this.viewerController?.abort();this.releaseViewer();}
  private forceCloseComposer():void{this.composerOpen.set(false);void this.composerModal()?.dismiss();this.storyMediaIds.set([]);this.storyMediaBusy.set(false);this.caption.reset();this.audience.reset('Public');this.composerMessage.set('');this.composerFailed.set(false);}
  private releaseViewer():void{this.viewerMedia()?.release();this.viewerMedia.set(null);}
  private acceptCreated(story:StoryView):void{this.items.update(items=>this.merge([story],items));this.forceCloseComposer();}
  private async reconcileCreated(mediaId:string):Promise<StoryView|null>{if(!mediaId)return null;try{const page=await this.api.invoke(listActiveStories,{limit:50,cursor:undefined});return page.items.find(story=>story.mediaId===mediaId&&story.ownerId===this.session.subject())??null;}catch{return null;}}
  private merge(left:StoryView[],right:StoryView[]):StoryView[]{const seen=new Set<string>();return [...left,...right].filter(item=>!seen.has(item.id)&&Boolean(seen.add(item.id)));}
  private restoreFocus(target:HTMLElement|null):void{if(target?.isConnected)requestAnimationFrame(()=>target.focus());}
  private finishComposerFocus():void{this.restoreFocus(this.composerReturnFocus);this.composerReturnFocus=null;}
  private viewedKey(subject:string|null):string{return`escp-mobile-story-viewed:${subject??'anonymous'}`;}
  private readViewed(subject:string|null):void{try{const value=JSON.parse(sessionStorage.getItem(this.viewedKey(subject))??'[]');this.viewedIds.set(new Set(Array.isArray(value)?value.filter(item=>typeof item==='string'):[]));}catch{this.viewedIds.set(new Set());}}
  private markViewed(id:string):void{this.viewedIds.update(current=>new Set(current).add(id));try{sessionStorage.setItem(this.viewedKey(this.session.subject()),JSON.stringify([...this.viewedIds()].slice(-200)));}catch{/* The visible cue remains in memory. */}}
}
