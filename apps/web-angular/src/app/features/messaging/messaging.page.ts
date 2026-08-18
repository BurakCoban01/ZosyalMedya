import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, effect, EffectRef, ElementRef, inject, OnDestroy, OnInit, signal, viewChild } from '@angular/core';
import { ActivatedRoute } from '@angular/router';
import { FormControl, FormGroup, ReactiveFormsModule } from '@angular/forms';
import { Api, changeMessage, ConversationView, createConversation, getProfileByHandle, listConversations, listMessages, MessageView, ProfileView, SearchHit, sendMessage } from '@platform/api';
import { TokenVault } from '../../core/auth/token-vault.service';
import { MessagingRealtimeService } from '../../core/realtime/messaging-realtime.service';
import { ZmProfilePickerComponent } from '../profile/profile-picker.component';
import { MediaAttachmentPickerComponent } from '../../core/media/media-attachment-picker.component';
import { AuthorizedMediaGalleryComponent } from '../../core/media/authorized-media-gallery.component';
import { RichTextComponent } from '../../core/social/rich-text.component';
import { ReportActionComponent } from '../../core/moderation/report-action.component';

@Component({
  selector: 'app-messaging-page', imports: [ReactiveFormsModule, DatePipe, ZmProfilePickerComponent, MediaAttachmentPickerComponent, AuthorizedMediaGalleryComponent, RichTextComponent, ReportActionComponent],
  template: `<header class="message-head"><div><p>MESAJLAR</p><h1>Konuşmalar.</h1></div><div class="new-conversation"><zm-profile-picker label="Konuşacağın kişiyi seç" hint="Ad veya kullanıcı adıyla gerçek profiller arasında ara." [excludeOwnerId]="actorId()" [initialSelection]="conversationTarget()" (selectedChange)="selectConversationTarget($event)"></zm-profile-picker><button type="button" (click)="startConversation()" [disabled]="!conversationTarget() || starting()">{{starting() ? 'Başlatılıyor…' : 'Yeni konuşma'}}</button></div></header>
  @if(message()){<p class="status" role="status">{{message()}}</p>}
  <div class="messenger">
    <aside class="inbox" aria-label="Konuşmalar">@for(conversation of conversations();track conversation.id){<button type="button" [class.active]="selected()?.id===conversation.id" (click)="select(conversation)"><span class="conversation-mark">{{conversation.kind==='Group'?'GR':'DM'}}</span><span><strong>{{conversationLabel(conversation)}}</strong><small>{{conversation.updatedAtUtc|date:'dd MMM · HH:mm'}}</small></span>@if(conversation.unreadCount){<b>{{conversation.unreadCount}}</b>}</button>}@empty{<p>Henüz konuşma yok.</p>}</aside>
    <section class="thread">
      @if(selected();as conversation){<header><div><strong>{{conversationLabel(conversation)}}</strong><span>{{conversation.members.length}} üye</span></div><span class="connection-state" [class.connected]="realtimeConnected()">{{realtimeConnected() ? 'Canlı' : 'Geçmiş kullanılabilir'}}</span></header>
        <div #messageList class="message-list" [attr.aria-busy]="loadingMessages()">
          @if(loadingMessages()){
            <p class="thread-state" role="status">Mesajlar yükleniyor…</p>
          }@else if(messageLoadError()){
            <div class="thread-error" role="alert">
              <strong>Mesajlar yüklenemedi.</strong>
              <span>Konuşma geçmişini yeniden istemek için tekrar dene.</span>
              <button type="button" (click)="retryMessages()">Yeniden dene</button>
            </div>
          }@else{
            @for(item of messages();track item.id){
              <article [id]="'message-'+item.id" [class.mine]="item.senderId===actorId()" [class.deleted]="item.status==='Deleted'">
                @if(item.replyToId;as replyId){<button class="reply-context" type="button" (click)="focusMessage(replyId)"><strong>Yanıt</strong><span>{{replyPreview(replyId)}}</span></button>}
                @if(editingId()===item.id){
                  <div class="edit-message"><textarea rows="2" maxlength="5000" [value]="editText()" (input)="editText.set($any($event.target).value)" aria-label="Mesajı düzenle"></textarea><span><button type="button" (click)="cancelEdit()">Vazgeç</button><button type="button" [disabled]="changingId()===item.id||!editText().trim()" (click)="saveEdit(item)">Kaydet</button></span></div>
                }@else{
                  <span class="message-text">@if(item.status==='Deleted'){Mesaj silindi}@else{<zm-rich-text [text]="item.text" />}</span>
                  @if(item.status!=='Deleted'&&item.mediaIds.length){<zm-authorized-media-gallery [mediaIds]="item.mediaIds" label="Mesaj medyası" />}
                  <footer><time>{{item.createdAtUtc|date:'HH:mm'}}@if(item.updatedAtUtc!==item.createdAtUtc&&item.status!=='Deleted'){ · düzenlendi}</time>@if(item.senderId===actorId()&&item.status!=='Deleted'){<small>{{deliveryLabel(item.deliveryState)}}</small>}</footer>
                  @if(item.status!=='Deleted'){<nav class="message-actions" aria-label="Mesaj işlemleri"><button type="button" (click)="replyTo(item)">Yanıtla</button>@if(item.senderId===actorId()&&canEdit(item)){<button type="button" (click)="beginEdit(item)">Düzenle</button>}@if(item.senderId===actorId()&&canDelete(item)){<button type="button" [disabled]="changingId()===item.id" (click)="deleteMessage(item)">Herkesten sil</button>}</nav>@if(item.senderId!==actorId()){<zm-report-action subjectType="Message" [subjectId]="item.id" label="Mesajı bildir" />}}
                }
              </article>
            }@empty{
              <p class="empty-thread">Bu konuşmanın ilk mesajını gönder.</p>
            }
          }
        </div>
        <div class="composer-shell">@if(replyTarget();as reply){<div class="replying"><span><strong>Yanıtlanıyor</strong>{{reply.text||'Medya mesajı'}}</span><button type="button" [disabled]="sending()" (click)="cancelReply()" aria-label="Yanıtı iptal et">Kapat</button></div>}<zm-media-attachment-picker #messageMedia label="Mesaj eki" visibility="Private" [disabled]="sending()" (mediaIdsChange)="mediaIds.set($event)" (uploadingChange)="uploading.set($event)" /><form class="send" [formGroup]="composer" (ngSubmit)="send()"><textarea formControlName="text" rows="2" maxlength="5000" placeholder="Mesaj yaz" aria-label="Mesaj yaz" (input)="typing()"></textarea><button type="submit" [disabled]="cannotSend()">{{sending() ? 'Gönderiliyor…' : 'Gönder'}}</button></form></div>
      }@else{<div class="choose"><strong>Bir konuşma seç.</strong><p>Mesaj içeriğine erişim sunucuda üyelik ile doğrulanır.</p></div>}
    </section>
  </div>`,
  styleUrl: './messaging.page.css', changeDetection: ChangeDetectionStrategy.OnPush
})
export class MessagingPage implements OnInit, OnDestroy {
  readonly conversations=signal<ConversationView[]>([]); readonly selected=signal<ConversationView|null>(null); readonly messages=signal<MessageView[]>([]); readonly message=signal(''); readonly sending=signal(false); readonly starting=signal(false);
  readonly loadingMessages=signal(false); readonly messageLoadError=signal(false); readonly realtimeConnected=signal(false);
  readonly mediaIds=signal<string[]>([]); readonly uploading=signal(false); readonly replyTarget=signal<MessageView|null>(null);
  readonly editingId=signal<string|null>(null); readonly editText=signal(''); readonly changingId=signal<string|null>(null);
  readonly conversationTarget=signal<SearchHit|null>(null); readonly conversationNames=signal<Record<string,string>>({});
  readonly composer=new FormGroup({text:new FormControl('',{nonNullable:true})});
  readonly actorId=signal(''); private unsubscribe?:()=>void; private receiptUnsubscribe?:()=>void; private changeUnsubscribe?:()=>void; private typingTimer?:ReturnType<typeof setTimeout>;
  readonly targetPicker=viewChild(ZmProfilePickerComponent);
  readonly messageList=viewChild<ElementRef<HTMLElement>>('messageList');
  readonly messageMedia=viewChild<MediaAttachmentPickerComponent>('messageMedia');
  private messageLoadRevision=0;
  private conversationLoadRevision=0;
  private sendRevision=0;
  private currentSubject='';
  private readonly sessionSync:EffectRef;
  private requestedConversationId=inject(ActivatedRoute,{optional:true})?.snapshot.queryParamMap.get('conversation')??null;
  private requestedProfileHandle=inject(ActivatedRoute,{optional:true})?.snapshot.queryParamMap.get('profil')?.trim()??'';
  private async preselectRequestedProfile():Promise<void>{const handle=this.requestedProfileHandle;this.requestedProfileHandle='';if(!handle)return;try{const profile=await this.api.invoke(getProfileByHandle,{handle});const hit=this.profileHit(profile);const picker=this.targetPicker();if(picker)picker.choose(hit);else this.selectConversationTarget(hit);}catch{this.message.set('Bağlantıdaki profil seçilemedi; başka bir profil arayabilirsin.');}}
  private profileHit(profile:ProfileView):SearchHit{return{id:profile.id,ownerId:profile.ownerId,type:'Profile',title:profile.displayName,snippet:`@${profile.handle}`,deepLink:`/profil/${profile.handle}`,matchedTags:[],score:1};}
  constructor(private readonly api:Api,private readonly realtime:MessagingRealtimeService,private readonly vault:TokenVault){this.currentSubject=this.subject(vault.accessToken());this.actorId.set(this.currentSubject);this.sessionSync=effect(()=>{const subject=this.subject(this.vault.accessToken());if(subject===this.currentSubject)return;this.currentSubject=subject;++this.sendRevision;++this.messageLoadRevision;++this.conversationLoadRevision;this.sending.set(false);this.actorId.set(subject);this.conversations.set([]);this.selected.set(null);this.messages.set([]);this.mediaIds.set([]);this.replyTarget.set(null);this.composer.reset();void this.loadConversations();});void this.preselectRequestedProfile();}
  ngOnInit():void{void this.loadConversations();this.unsubscribe=this.realtime.onMessage(notice=>{void this.handleRealtimeMessage(notice.messageId,notice.conversationId);});this.receiptUnsubscribe=this.realtime.onReceipt?.(notice=>{if(this.selected()?.id===notice.conversationId)void this.loadMessages(notice.conversationId);});this.changeUnsubscribe=this.realtime.onChanged?.(changed=>{if(this.selected()?.id===changed.conversationId)this.replaceMessage(changed);});void this.realtime.connect().then(()=>this.realtimeConnected.set(true)).catch(()=>{this.realtimeConnected.set(false);this.message.set('Gerçek zamanlı bağlantı kurulamadı; konuşma geçmişi ve gönderim kullanılabilir.');});}
  ngOnDestroy():void{++this.sendRevision;this.sessionSync.destroy();this.unsubscribe?.();this.receiptUnsubscribe?.();this.changeUnsubscribe?.();if(this.typingTimer)clearTimeout(this.typingTimer);}
  async loadConversations():Promise<void>{const revision=++this.conversationLoadRevision;const subject=this.currentSubject;try{const page=await this.api.invoke(listConversations,{limit:50});if(revision!==this.conversationLoadRevision||subject!==this.currentSubject)return;this.conversations.set(page.items);const requestedId=this.requestedConversationId;this.requestedConversationId=null;const currentId=this.selected()?.id;const target=(requestedId? page.items.find(item=>item.id===requestedId):undefined)??(currentId? page.items.find(item=>item.id===currentId):undefined)??page.items[0];if(requestedId&&!page.items.some(item=>item.id===requestedId))this.message.set('Bağlantıdaki konuşma bulunamadı veya artık erişilemiyor.');if(target&&target.id!==currentId)await this.select(target);else if(target)this.selected.set(target);}catch{if(revision===this.conversationLoadRevision&&subject===this.currentSubject)this.message.set('Konuşmalar yüklenemedi.');}}
  async select(conversation:ConversationView):Promise<void>{if(this.selected()?.id!==conversation.id)await this.messageMedia()?.discard();++this.messageLoadRevision;this.selected.set(conversation);this.messages.set([]);this.replyTarget.set(null);this.cancelEdit();this.messageLoadError.set(false);await this.loadMessages(conversation.id);await this.realtime.join(conversation.id).then(()=>this.realtimeConnected.set(true)).catch(()=>this.realtimeConnected.set(false));}
  async loadMessages(id:string):Promise<void>{
    const revision=++this.messageLoadRevision;
    const stickToBottom=this.shouldStickToBottom();
    this.loadingMessages.set(true);
    this.messageLoadError.set(false);
    try{
      const page=await this.api.invoke(listMessages,{conversationId:id,limit:100});
      if(revision!==this.messageLoadRevision||this.selected()?.id!==id)return;
      this.messages.set([...page.items].sort((left,right)=>Date.parse(left.createdAtUtc)-Date.parse(right.createdAtUtc)));
      this.scrollAfterRender(stickToBottom);
    }catch{
      if(revision!==this.messageLoadRevision||this.selected()?.id!==id)return;
      this.messages.set([]);
      this.messageLoadError.set(true);
    }finally{
      if(revision===this.messageLoadRevision)this.loadingMessages.set(false);
    }
  }
  async retryMessages():Promise<void>{const id=this.selected()?.id;if(id)await this.loadMessages(id);}
  private async handleRealtimeMessage(messageId:string,conversationId:string):Promise<void>{try{await this.api.invoke(changeMessage,{messageId,body:{change:'Delivered',text:null}});}catch{ /* A later history read still records Read truthfully. */ }if(this.selected()?.id===conversationId)await this.loadMessages(conversationId);await this.loadConversations();}
  selectConversationTarget(profile:SearchHit|null):void{this.conversationTarget.set(profile);}
  async startConversation():Promise<void>{const target=this.conversationTarget();if(!target||this.starting())return;this.starting.set(true);try{const created=await this.api.invoke(createConversation,{body:{memberIds:[target.ownerId],title:null}});this.conversationNames.update(names=>({...names,[target.ownerId]:target.title}));this.conversationTarget.set(null);this.targetPicker()?.clear();await this.loadConversations();await this.select(created);this.message.set(`${target.title} ile konuşma hazır.`);}catch{this.message.set('Konuşma başlatılamadı. Engel veya üyelik kurallarını kontrol et.');}finally{this.starting.set(false);}}
  async send():Promise<void>{const conversation=this.selected();const text=this.composer.controls.text.value.trim();const picker=this.messageMedia();if(!conversation||this.sending()||this.uploading()||(!text&&!this.mediaIds().length))return;const reply=this.replyTarget();const ownerAccessToken=this.vault.accessToken();const ownerSubject=this.subject(ownerAccessToken);const operation=++this.sendRevision;const transfer=picker?.transfer()??{ids:[] as string[],discard:async()=>true,discardWithAccessToken:async()=>true,rollback:async()=>true};const now=new Date().toISOString();const optimistic:MessageView={id:crypto.randomUUID(),conversationId:conversation.id,senderId:this.actorId(),text,mediaIds:transfer.ids,replyToId:reply?.id??null,status:'Sent',deliveryState:'Sent',createdAtUtc:now,updatedAtUtc:now,version:1};const snapshot=this.messages();this.message.set('');this.messages.update(items=>[...items,optimistic]);this.mediaIds.set([]);this.composer.reset();this.replyTarget.set(null);this.sending.set(true);this.scrollAfterRender(true);try{const sent=await this.api.invoke(sendMessage,{conversationId:conversation.id,body:{text,mediaIds:transfer.ids,replyToId:reply?.id??null}});if(operation===this.sendRevision&&ownerSubject===this.subject(this.vault.accessToken())&&this.selected()?.id===conversation.id)this.messages.update(items=>items.map(item=>item.id===optimistic.id?sent:item));}catch(error){if(operation!==this.sendRevision||ownerSubject!==this.subject(this.vault.accessToken())){if(this.confirmedRejected(error))await transfer.discardWithAccessToken(ownerAccessToken);}else if(this.selected()?.id===conversation.id){this.messages.set(snapshot);await transfer.rollback();this.mediaIds.set(transfer.ids);if(!this.composer.controls.text.value)this.composer.controls.text.setValue(text);this.replyTarget.set(reply);this.message.set('Mesaj gönderilemedi; metin, yanıt ve ekler korunarak yerel değişiklik geri alındı.');}else await transfer.discard();}finally{if(operation===this.sendRevision)this.sending.set(false);}}
  cannotSend():boolean{return this.sending()||this.uploading()||(!this.composer.controls.text.value.trim()&&!this.mediaIds().length);}
  replyTo(item:MessageView):void{this.replyTarget.set(item);this.composer.controls.text.markAsTouched();}
  cancelReply():void{if(!this.sending())this.replyTarget.set(null);}
  replyPreview(id:string):string{const item=this.messages().find(message=>message.id===id);return item?.status==='Deleted'?'Silinmiş mesaj':item?.text||'Medya mesajı';}
  focusMessage(id:string):void{document.getElementById(`message-${id}`)?.scrollIntoView({block:'center',behavior:'smooth'});}
  beginEdit(item:MessageView):void{this.editingId.set(item.id);this.editText.set(item.text);}
  cancelEdit():void{this.editingId.set(null);this.editText.set('');}
  async saveEdit(item:MessageView):Promise<void>{const text=this.editText().trim();if(!text||this.changingId())return;this.changingId.set(item.id);try{const changed=await this.api.invoke(changeMessage,{messageId:item.id,body:{change:'Edit',text}});this.replaceMessage(changed);this.cancelEdit();this.message.set('Mesaj düzenlendi.');}catch{this.message.set('Mesaj düzenlenemedi; süreyi veya mesaj sahipliğini kontrol et.');}finally{this.changingId.set(null);}}
  async deleteMessage(item:MessageView):Promise<void>{if(this.changingId())return;this.changingId.set(item.id);try{const changed=await this.api.invoke(changeMessage,{messageId:item.id,body:{change:'Delete',text:null}});this.replaceMessage(changed);this.message.set('Mesaj herkesten silindi.');}catch{this.message.set('Mesaj silinemedi; süreyi veya mesaj sahipliğini kontrol et.');}finally{this.changingId.set(null);}}
  canEdit(item:MessageView):boolean{return Date.now()-Date.parse(item.createdAtUtc)<=15*60_000;}
  canDelete(item:MessageView):boolean{return Date.now()-Date.parse(item.createdAtUtc)<=24*60*60_000;}
  deliveryLabel(state:MessageView['deliveryState']):string{return state==='Read'?'Okundu':state==='Delivered'?'Teslim edildi':'Gönderildi';}
  private replaceMessage(changed:MessageView):void{++this.messageLoadRevision;this.loadingMessages.set(false);this.messages.update(items=>items.map(item=>item.id===changed.id&&changed.version>=item.version?changed:item));}
  typing():void{const id=this.selected()?.id;if(!id)return;void this.realtime.typing(id,true).catch(()=>undefined);if(this.typingTimer)clearTimeout(this.typingTimer);this.typingTimer=setTimeout(()=>void this.realtime.typing(id,false).catch(()=>undefined),1200);}
  participantLabel(conversation:ConversationView):string{const other=conversation.members.find(x=>x.userId!==this.actorId());return other?(other.displayName?.trim()||this.conversationNames()[other.userId]||'Doğrudan konuşma'):'Grup konuşması';}
  conversationLabel(conversation:ConversationView):string{return conversation.kind==='Direct'?this.participantLabel(conversation):(conversation.title.trim()||this.participantLabel(conversation));}
  private shouldStickToBottom():boolean{const element=this.messageList()?.nativeElement;return !element||element.scrollHeight-element.scrollTop-element.clientHeight<80;}
  private scrollAfterRender(enabled:boolean):void{if(!enabled)return;requestAnimationFrame(()=>{const element=this.messageList()?.nativeElement;if(element)element.scrollTop=element.scrollHeight;});}
  private subject(token:string|null):string{if(!token)return '';try{return JSON.parse(atob(token.split('.')[1].replace(/-/g,'+').replace(/_/g,'/'))).sub??'';}catch{return '';}}
  private confirmedRejected(error:unknown):boolean{const status=(error as {status?:unknown})?.status;return typeof status==='number'&&status>=400&&status<500;}
}
