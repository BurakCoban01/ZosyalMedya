import { ChangeDetectionStrategy, Component, OnDestroy, effect, input, signal, untracked } from '@angular/core';
import { MobileMediaResolver, MobileResolvedMedia } from './mobile-media-resolver.service';

interface MobileGalleryItem { readonly id:string; readonly media:MobileResolvedMedia|null; readonly failed:boolean; }

@Component({
  selector:'zm-mobile-authorized-media-gallery',
  template:`<section class="gallery" [attr.aria-label]="label()" [attr.data-count]="items().length">@for(item of items();track item.id){<figure>@if(item.media;as media){@if(media.contentType.startsWith('image/')){<img [src]="media.url" [alt]="label()" loading="lazy">}@else if(media.contentType.startsWith('video/')){<video controls preload="metadata" [attr.aria-label]="label()"><source [src]="media.url" [type]="media.contentType"></video>}}@else{<div class="state" role="status">{{item.failed?'Medya şu anda açılamadı.':'Medya hazırlanıyor…'}}@if(item.failed){<button type="button" (click)="retry(item.id)">Yeniden dene</button>}</div>}</figure>}</section>`,
  styles:[`:host{display:block;margin:.65rem 0}.gallery{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.4rem}.gallery[data-count="1"]{grid-template-columns:minmax(0,1fr)}figure{margin:0;min-width:0;aspect-ratio:16/9;overflow:hidden;border:1px solid var(--ion-border-color);border-radius:.85rem;background:var(--ion-item-background)}img,video,.state{display:block;width:100%;height:100%;object-fit:cover}.state{display:grid;place-content:center;gap:.4rem;padding:.7rem;text-align:center;color:var(--ion-color-medium);font-size:.75rem}.state button{min-height:44px;border:0;background:transparent;color:var(--ion-color-primary);font:inherit;font-weight:750}.state button:focus-visible{outline:3px solid var(--ion-color-primary);outline-offset:2px}@media(max-width:360px){.gallery{grid-template-columns:minmax(0,1fr)}}`],
  changeDetection:ChangeDetectionStrategy.OnPush,
})
export class MobileAuthorizedMediaGalleryComponent implements OnDestroy{
  readonly mediaIds=input.required<readonly string[]>();readonly label=input('Gönderi medyası');readonly items=signal<MobileGalleryItem[]>([]);readonly pendingIds=signal(new Set<string>());private revision=0;private destroyed=false;
  private readonly controllers=new Map<string,AbortController>();
  private readonly sync=effect(()=>{const ids=this.mediaIds();this.resolver.sessionRevision();const authenticated=this.resolver.authenticated();untracked(()=>{void this.load(authenticated?ids:[]);});});
  constructor(private readonly resolver:MobileMediaResolver){}
  retry(id:string):void{if(this.pendingIds().has(id))return;this.replace(id,item=>({...item,failed:false}));void this.resolve(id,this.revision);}
  ngOnDestroy():void{this.destroyed=true;this.revision++;this.cancelPending();this.releaseAll();this.sync.destroy();}
  private async load(ids:readonly string[]):Promise<void>{const revision=++this.revision;this.cancelPending();this.releaseAll();this.items.set(ids.map(id=>({id,media:null,failed:false})));await Promise.all(ids.map(id=>this.resolve(id,revision)));}
  private async resolve(id:string,revision:number):Promise<void>{if(this.pendingIds().has(id))return;const controller=new AbortController();this.controllers.set(id,controller);this.setPending(id,true);try{const media=await this.resolver.resolve(id,null,controller.signal);if(this.destroyed||revision!==this.revision||!this.items().some(item=>item.id===id)){media.release();return;}this.replace(id,item=>{item.media?.release();return{...item,media,failed:false};});}catch(error){if((error as Error).name!=='AbortError'&&!this.destroyed&&revision===this.revision)this.replace(id,item=>({...item,failed:true}));}finally{if(this.controllers.get(id)===controller){this.controllers.delete(id);this.setPending(id,false);}}}
  private cancelPending():void{this.controllers.forEach(controller=>controller.abort());this.controllers.clear();this.pendingIds.set(new Set());}
  private releaseAll():void{this.items().forEach(item=>item.media?.release());}
  private replace(id:string,transform:(item:MobileGalleryItem)=>MobileGalleryItem):void{this.items.update(items=>items.map(item=>item.id===id?transform(item):item));}
  private setPending(id:string,pending:boolean):void{this.pendingIds.update(current=>{const next=new Set(current);if(pending)next.add(id);else next.delete(id);return next;});}
}
