import { ChangeDetectionStrategy, Component, OnDestroy, computed, effect, input, output, signal } from '@angular/core';
import { Api, MediaView, deleteMedia, initiateMedia, uploadMediaContent } from '@platform/api';
import { MobileSession } from '../auth/secure-token-storage';
import { MobileMediaResolver, MobileResolvedMedia } from './mobile-media-resolver.service';
import { MobileSessionMediaCleanup } from './mobile-session-media-cleanup.service';

interface Attachment { media: MediaView; preview: MobileResolvedMedia | null; previewError: boolean; ownerAccessToken: string | null; }
export interface MobileMediaAttachmentTransfer { readonly ids: string[]; discard(): Promise<boolean>; discardWithAccessToken(accessToken:string|null):Promise<boolean>; rollback():Promise<boolean>; }

@Component({
  selector: 'zm-mobile-media-picker',
  template: `
    <section class="media-picker" [attr.aria-label]="label()">
      <div class="media-picker__head">
        <span><strong>{{label()}}</strong><small>Görsel veya MP4 · en fazla {{fileLimit()}} dosya · dosya başına 100 MB</small></span>
        <label [class.disabled]="disabled() || uploading() || full()">
          {{uploading() ? 'Hazırlanıyor…' : full() ? 'Sınır doldu' : 'Medya ekle'}}
          <input type="file" multiple accept="image/jpeg,image/png,image/webp,video/mp4" [disabled]="disabled() || uploading() || full()" (change)="choose($event)">
        </label>
      </div>
      @if (uploading()) { <p class="pending" role="status">{{pending()[0]}} yükleniyor · {{completedCount()}}/{{uploadTotal()}}</p> }
      @if (attachments().length) {
        <div class="media-grid">
          @for (item of attachments(); track item.media.id) {
            <figure>
              @if (item.preview; as preview) {
                @if (preview.contentType.startsWith('image/')) { <img [src]="preview.url" [alt]="item.media.fileName + ' önizlemesi'"> }
                @else { <video controls preload="metadata" [attr.aria-label]="item.media.fileName + ' önizlemesi'"><source [src]="preview.url" [type]="preview.contentType"></video> }
              } @else {
                <div class="fallback"><span>{{item.previewError ? 'Önizleme açılamadı' : 'Önizleme hazırlanıyor'}}</span>@if(item.previewError){<button type="button" (click)="retry(item.media.id)">Yeniden dene</button>}</div>
              }
              <figcaption>{{item.media.fileName}}</figcaption>
              <button type="button" class="remove" [disabled]="disabled() || deleting().has(item.media.id)" (click)="remove(item.media.id)" [attr.aria-label]="item.media.fileName + ' ekini kaldır'">Kaldır</button>
            </figure>
          }
        </div>
      }
      @if(error()){<p class="error" role="alert">{{error()}}</p>}
    </section>
  `,
  styles: [`
    :host{display:block}.media-picker{display:grid;gap:.65rem;padding:.7rem 0;border-top:1px solid var(--ion-border-color)}.media-picker__head{display:flex;align-items:center;justify-content:space-between;gap:.75rem}.media-picker__head span{display:grid;gap:.15rem;min-width:0}.media-picker__head strong{color:var(--ion-text-color);font-size:.86rem}.media-picker__head small{color:var(--ion-color-medium);font-size:.72rem}.media-picker__head label{position:relative;display:grid;place-items:center;min-height:44px;padding:.5rem .75rem;border:1px solid var(--ion-border-color);border-radius:.65rem;color:var(--ion-color-primary);font-weight:750;overflow:hidden}.media-picker__head label.disabled{opacity:.5}.media-picker__head input{position:absolute;inset:0;opacity:0}.media-picker__head label:focus-within,.remove:focus-visible,.fallback button:focus-visible{outline:3px solid var(--ion-color-primary);outline-offset:2px}.pending{margin:0;padding:.55rem .7rem;border-left:3px solid var(--ion-color-primary);background:color-mix(in srgb,var(--ion-color-primary) 9%,transparent);color:var(--ion-text-color);font-size:.82rem}.media-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:.5rem}.media-grid figure{position:relative;min-width:0;margin:0;border:1px solid var(--ion-border-color);border-radius:.8rem;overflow:hidden;background:var(--ion-item-background)}.media-grid img,.media-grid video,.fallback{display:block;width:100%;aspect-ratio:4/3;object-fit:cover;background:var(--ion-background-color)}.fallback{display:grid;place-content:center;gap:.4rem;padding:.5rem;text-align:center;color:var(--ion-color-medium);font-size:.72rem}.fallback button,.remove{border:0;background:transparent;color:var(--ion-color-primary);font:inherit;font-weight:750}.media-grid figcaption{padding:.45rem .55rem 2.45rem;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;color:var(--ion-color-medium);font-size:.7rem}.remove{position:absolute;right:.4rem;bottom:.3rem;min-height:36px;color:var(--ion-color-danger)}.error{margin:0;color:var(--ion-color-danger);font-size:.82rem;font-weight:650}@media(max-width:340px){.media-picker__head{align-items:stretch;flex-direction:column}.media-picker__head label{width:100%}}
  `],
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MobileMediaAttachmentPickerComponent implements OnDestroy {
  readonly label = input('Gönderi medyası');
  readonly visibility = input<'Private'|'Followers'|'Public'>('Public');
  readonly disabled = input(false);
  readonly maxFiles = input(10);
  readonly mediaIdsChange = output<string[]>();
  readonly uploadingChange = output<boolean>();
  readonly attachments = signal<Attachment[]>([]);
  readonly pending = signal<string[]>([]);
  readonly deleting = signal(new Set<string>());
  readonly error = signal('');
  readonly uploading = computed(() => this.pending().length > 0);
  readonly fileLimit = computed(() => Math.min(10, Math.max(1, Math.trunc(this.maxFiles()))));
  readonly full = computed(() => this.attachments().length >= this.fileLimit());
  readonly uploadTotal = signal(0);
  readonly completedCount = computed(() => Math.max(0, this.uploadTotal() - this.pending().length));
  private destroyed = false;
  private sessionEpoch = 0;
  private observedSubject: string | null | undefined;
  private observedMediaRevision:number|undefined;
  private readonly inFlightMedia = new Map<string,string|null>();
  private readonly deletingOwners = new Map<string,string|null>();
  private readonly previewControllers=new Map<string,AbortController>();
  private readonly allowed = new Set(['image/jpeg','image/png','image/webp','video/mp4']);
  private readonly sessionSync=effect(()=>{const subject=this.session.subject();const mediaRevision=this.resolver.sessionRevision();if(this.observedSubject===undefined){this.observedSubject=subject;this.observedMediaRevision=mediaRevision;return;}if(subject!==this.observedSubject){this.observedSubject=subject;this.observedMediaRevision=mediaRevision;void this.cleanupForSessionChange();return;}if(this.observedMediaRevision!==mediaRevision){this.observedMediaRevision=mediaRevision;this.refreshPreviews();}});
  constructor(private readonly api: Api,private readonly resolver:MobileMediaResolver,private readonly session:MobileSession,private readonly sessionCleanup:MobileSessionMediaCleanup){this.observedSubject=this.session.subject();}

  async choose(event: Event): Promise<void> {
    const input = event.target as HTMLInputElement;
    const files = Array.from(input.files ?? []); input.value = '';
    if (!files.length || this.disabled() || this.uploading() || this.destroyed) return;
    const available = this.fileLimit() - this.attachments().length;
    if (files.length > available) { this.error.set(`En fazla ${this.fileLimit()} medya ekleyebilirsin. ${available} yer kaldı.`); return; }
    const invalid = files.find(file => !this.allowed.has(file.type) || file.size < 1 || file.size > 100 * 1024 * 1024);
    if (invalid) { this.error.set(`${invalid.name} desteklenmiyor veya 100 MB sınırını aşıyor.`); return; }
    const epoch=this.sessionEpoch;this.error.set(''); this.uploadTotal.set(files.length); this.pending.set(files.map(file => file.name)); this.uploadingChange.emit(true);
    try { for (const file of files) { if(this.destroyed||epoch!==this.sessionEpoch) break; await this.upload(file);if(epoch===this.sessionEpoch)this.pending.update(names => names.slice(1)); } }
    finally { if(!this.destroyed&&epoch===this.sessionEpoch){this.pending.set([]);this.uploadTotal.set(0);this.uploadingChange.emit(false);} }
  }

  async remove(id: string): Promise<void> {
    const item=this.attachments().find(value=>value.media.id===id);if(!item||this.disabled()||this.deleting().has(id))return;
    const epoch=this.sessionEpoch;this.deletingOwners.set(id,item.ownerAccessToken);
    this.cancelPreview(id);
    this.deleting.update(current=>new Set(current).add(id));this.attachments.update(values=>values.filter(value=>value.media.id!==id));this.emit();this.error.set('');
    try{await this.api.invoke(deleteMedia,{id});item.preview?.release();}
    catch{if(!this.destroyed&&epoch===this.sessionEpoch){this.attachments.update(values=>[...values,item]);this.emit();this.error.set('Medya kaldırılamadı. Yeniden deneyebilirsin.');}else{item.preview?.release();await this.sessionCleanup.delete([id],item.ownerAccessToken);}}
    finally{this.deletingOwners.delete(id);if(epoch===this.sessionEpoch)this.deleting.update(current=>{const next=new Set(current);next.delete(id);return next;});}
  }

  async retry(id:string):Promise<void>{const item=this.attachments().find(value=>value.media.id===id);if(item&&!item.preview)await this.resolve(item.media);}
  transfer():MobileMediaAttachmentTransfer{const values=this.attachments();const ids=values.map(item=>item.media.id);this.cancelAllPreviews();values.forEach(item=>item.preview?.release());this.attachments.set([]);this.error.set('');this.emit();return{ids,discard:async()=>{const results=await Promise.allSettled(ids.map(id=>this.api.invoke(deleteMedia,{id})));const failed=values.filter((_item,index)=>results[index].status==='rejected');if(failed.length&&!this.destroyed){this.attachments.set(failed.map(item=>({...item,preview:null,previewError:false})));this.error.set('Bazı medyalar kaldırılamadı. Yeniden deneyebilirsin.');this.emit();failed.forEach(item=>{void this.resolve(item.media);});}return failed.length===0;},discardWithAccessToken:accessToken=>this.sessionCleanup.delete(ids,accessToken),rollback:async()=>{if(this.destroyed)return this.deleteOwned(values);this.attachments.set(values.map(item=>({...item,preview:null,previewError:false})));this.error.set('İşlem tamamlanmadı; medyaların korundu.');this.emit();values.forEach(item=>{void this.resolve(item.media);});return true;}};}
  commit():void{this.attachments().forEach(item=>item.preview?.release());this.attachments.set([]);this.error.set('');this.emit();}
  async discard():Promise<void>{const values=this.attachments();const results=await Promise.allSettled(values.map(item=>this.api.invoke(deleteMedia,{id:item.media.id})));values.forEach((item,index)=>{if(results[index].status==='fulfilled')item.preview?.release();});const failed=values.filter((_item,index)=>results[index].status==='rejected');this.attachments.set(failed);this.error.set(failed.length?'Bazı medyalar kaldırılamadı. Yeniden deneyebilirsin.':'');this.emit();}
  ngOnDestroy():void{this.destroyed=true;this.sessionEpoch++;this.sessionSync.destroy();this.uploadingChange.emit(false);this.cancelAllPreviews();const values=this.attachments();values.forEach(item=>item.preview?.release());this.attachments.set([]);this.pending.set([]);void this.deleteOwned(values);for(const [id,token] of [...this.inFlightMedia,...this.deletingOwners])void this.sessionCleanup.delete([id],token);this.inFlightMedia.clear();this.deletingOwners.clear();}

  private async upload(file:File):Promise<void>{let id:string|null=null;const epoch=this.sessionEpoch;const ownerAccessToken=this.session.accessToken();try{const initiated=await this.api.invoke(initiateMedia,{body:{fileName:file.name,contentType:file.type,size:file.size,visibility:this.visibility()}});id=initiated.media.id;if(this.destroyed||epoch!==this.sessionEpoch){await this.sessionCleanup.delete([id],ownerAccessToken);return;}this.inFlightMedia.set(id,ownerAccessToken);const ready=await this.api.invoke(uploadMediaContent,{id,body:file});this.inFlightMedia.delete(id);if(this.destroyed||epoch!==this.sessionEpoch){await this.sessionCleanup.delete([id],ownerAccessToken);return;}this.attachments.update(values=>[...values,{media:ready,preview:null,previewError:false,ownerAccessToken}]);this.emit();await this.resolve(ready);}catch{if(id){this.inFlightMedia.delete(id);await this.sessionCleanup.delete([id],ownerAccessToken);}if(!this.destroyed&&epoch===this.sessionEpoch)this.error.set(`${file.name} yüklenemedi. Yeniden seçebilirsin.`);}}
  private async cleanupForSessionChange():Promise<void>{this.sessionEpoch++;const values=this.attachments();const inFlight=[...this.inFlightMedia.entries(),...this.deletingOwners.entries()];this.inFlightMedia.clear();this.deletingOwners.clear();this.cancelAllPreviews();values.forEach(item=>item.preview?.release());this.attachments.set([]);this.pending.set([]);this.deleting.set(new Set());this.uploadTotal.set(0);this.uploadingChange.emit(false);this.emit();await Promise.allSettled([this.deleteOwned(values),...inFlight.map(([id,token])=>this.sessionCleanup.delete([id],token))]);}
  private refreshPreviews():void{this.cancelAllPreviews();const values=this.attachments();values.forEach(item=>item.preview?.release());this.attachments.set(values.map(item=>({...item,preview:null,previewError:false})));values.forEach(item=>{void this.resolve(item.media);});}
  private async deleteOwned(values:readonly Attachment[]):Promise<boolean>{const groups=new Map<string|null,string[]>();for(const item of values){const ids=groups.get(item.ownerAccessToken)??[];ids.push(item.media.id);groups.set(item.ownerAccessToken,ids);}const results=await Promise.all([...groups].map(([token,ids])=>this.sessionCleanup.delete(ids,token)));return results.every(Boolean);}
  private async resolve(media:MediaView):Promise<void>{if(this.previewControllers.has(media.id))return;const controller=new AbortController();this.previewControllers.set(media.id,controller);try{const variant=media.contentType.startsWith('image/')&&media.urls['w960.webp']?'w960.webp':null;const preview=await this.resolver.resolve(media.id,variant,controller.signal);if(this.destroyed||this.previewControllers.get(media.id)!==controller||!this.attachments().some(item=>item.media.id===media.id)){preview.release();return;}this.replace(media.id,item=>{item.preview?.release();return({...item,preview,previewError:false});});}catch(error){if((error as Error).name!=='AbortError'&&!this.destroyed&&this.previewControllers.get(media.id)===controller)this.replace(media.id,item=>({...item,preview:null,previewError:true}));}finally{if(this.previewControllers.get(media.id)===controller)this.previewControllers.delete(media.id);}}
  private cancelPreview(id:string):void{this.previewControllers.get(id)?.abort();this.previewControllers.delete(id);}
  private cancelAllPreviews():void{this.previewControllers.forEach(controller=>controller.abort());this.previewControllers.clear();}
  private replace(id:string,transform:(item:Attachment)=>Attachment):void{this.attachments.update(values=>values.map(item=>item.media.id===id?transform(item):item));}
  private emit():void{this.mediaIdsChange.emit(this.attachments().map(item=>item.media.id));}
}
