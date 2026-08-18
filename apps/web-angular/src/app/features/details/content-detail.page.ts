import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  Api, CommentView, ContentItem, createComment, deleteComment, getContent, getPoll, getReactionSummary, listComments,
  PollView, ReactionSummary, updateComment
} from '@platform/api';
import { DetailFailure, detailFailure, safeExternalUrl } from './detail-state';
import { AuthorizedMediaGalleryComponent } from '../../core/media/authorized-media-gallery.component';
import { RichTextComponent } from '../../core/social/rich-text.component';
import { ReportActionComponent } from '../../core/moderation/report-action.component';

@Component({
  selector:'app-content-detail-page',imports:[RouterLink,AuthorizedMediaGalleryComponent,RichTextComponent,ReportActionComponent],styleUrl:'./detail-page.css',changeDetection:ChangeDetectionStrategy.OnPush,
  template:`
    <a class="back-link" routerLink="/akis">← Akışa dön</a>
    @if(loading()){<section class="state-panel" aria-busy="true"><strong>Gönderi hazırlanıyor.</strong><p>İçerik ve etkileşim bağlamı yükleniyor.</p></section>}
    @else if(failure();as state){<section class="state-panel error" role="alert"><strong>{{state==='not-found'?'Gönderi bulunamadı.':state==='forbidden'?'Bu gönderi sana açık değil.':'Gönderi yüklenemedi.'}}</strong><p>{{state==='error'?'Bağlantını kontrol edip yeniden deneyebilirsin.':'Gönderi kaldırılmış veya görünürlüğü değişmiş olabilir.'}}</p>@if(state==='error'){<button type="button" (click)="load()">Tekrar dene</button>}</section>}
    @else if(content();as item){
      <header class="detail-head"><p class="kicker">GÖNDERİ</p><h1>Paylaşım ayrıntısı</h1><p class="lede">Gönderi, yorumlar ve etkileşimler kendi görünürlük kurallarıyla gösterilir.</p></header>
      <article class="detail-card content-main">
        <div class="meta-row"><time [attr.datetime]="item.publishedAtUtc">{{dateLabel(item.publishedAtUtc)}}</time><span>{{visibilityLabel(item.visibility)}}</span><span>{{item.viewCount}} görüntülenme</span></div>
        @if(item.contentWarning){<p class="warning">İçerik notu · {{item.contentWarning}}</p>}@else if(item.isSensitive){<p class="warning">Bu gönderi hassas içerik barındırabilir.</p>}
        <p class="body-copy"><zm-rich-text [text]="item.text" /></p>
        @if(item.mediaIds.length){<zm-authorized-media-gallery [mediaIds]="item.mediaIds" label="Gönderi medyası" />}
        @if(item.hashtags.length){<ul class="tag-list" aria-label="Etiketler">@for(tag of item.hashtags;track tag){<li><a routerLink="/kesfet" [queryParams]="{q:'#'+tag}">#{{tag}}</a></li>}</ul>}
        @if(externalUrl(item.linkUrl);as url){<p><a class="external-link" [href]="url" target="_blank" rel="noopener noreferrer nofollow">Bağlantıyı aç</a></p>}
        @if(original();as source){<section class="source"><h2>Kaynak gönderi</h2><p class="body-copy"><zm-rich-text [text]="source.text || 'Metinsiz medya paylaşımı'" /></p>@if(source.mediaIds.length){<zm-authorized-media-gallery [mediaIds]="source.mediaIds" label="Kaynak gönderinin medyası" />}<a class="content-link" [routerLink]="['/icerik',source.id]">Kaynak gönderiyi aç</a></section>}
        @if(poll();as currentPoll){<section class="poll"><h2>{{currentPoll.question}}</h2><ul class="poll-options">@for(option of currentPoll.options;track option.id){<li><span>{{option.text}}</span><strong>{{option.voteCount}}</strong></li>}</ul><p class="quiet">{{currentPoll.totalVotes}} oy · {{currentPoll.isOpen?'Oylama açık':'Oylama kapandı'}}{{currentPoll.allowMultiple?' · Birden fazla seçenek işaretlenebilir':''}}</p></section>}
        @if(reactions();as summary){<section class="reactions"><h2>Tepkiler</h2>@if(reactionEntries(summary).length){<ul class="reaction-list">@for(entry of reactionEntries(summary);track entry.kind){<li>{{reactionLabel(entry.kind)}} · {{entry.count}}</li>}</ul>}@else{<p class="quiet">Henüz tepki yok.</p>}</section>}
        <section class="comments"><h2>Yorumlar</h2>@if(comments().length){<ol class="comment-list">@for(comment of comments();track comment.id){<li [style.--comment-depth]="comment.depth"><header>@if(comment.author;as author){<a [routerLink]="['/profil',author.handle]"><strong>{{author.displayName}}</strong> · &#64;{{author.handle}}</a>}@else{<strong>{{comment.status==='Deleted'?'Silinmiş yorum':'Gizli profil'}}</strong>}<small>{{dateLabel(comment.createdAtUtc)}}</small></header>@if(comment.status==='Deleted'){<p class="quiet">Yorum silindi.</p>}@else if(editingCommentId()===comment.id){<form class="comment-edit" (submit)="saveComment($event,comment,edit.value)"><input #edit [value]="comment.text" maxlength="2000" aria-label="Yorumu düzenle"><button type="button" (click)="editingCommentId.set(null)">Vazgeç</button><button type="submit">Kaydet</button></form>}@else{<p><zm-rich-text [text]="comment.text" /></p><div class="comment-actions">@if(comment.depth<5){<button type="button" (click)="replyTarget.set(comment)">Yanıtla</button>}@if(comment.canManage){<button type="button" (click)="editingCommentId.set(comment.id)">Düzenle</button><button type="button" class="danger" (click)="removeComment(comment)">Sil</button>}</div>}</li>}</ol>}@else{<p class="quiet">Henüz yorum yok.</p>}@if(replyTarget();as target){<p class="replying"><strong>{{target.author?.displayName??'Yoruma'}}</strong> yanıtlanıyor. <button type="button" (click)="replyTarget.set(null)">Vazgeç</button></p>}<form class="comment-compose" (submit)="submitComment($event,commentInput.value)"><input #commentInput maxlength="2000" placeholder="Düşünceni ekle" aria-label="Yorum yaz"><button type="submit" [disabled]="commentPending()">{{commentPending()?'Gönderiliyor…':'Gönder'}}</button></form>@if(commentNextCursor()){<button class="comment-more" type="button" (click)="loadMoreComments()" [disabled]="commentPending()">Daha fazla yorum</button>}@if(commentMessage()){<p class="quiet" role="status">{{commentMessage()}}</p>}</section>
        @if(contextWarning()){<p class="quiet" role="status">{{contextWarning()}}</p>}
        <zm-report-action subjectType="Content" [subjectId]="item.id" label="Gönderiyi bildir" />
      </article>
    }
  `
})
export class ContentDetailPage implements OnInit{
  readonly content=signal<ContentItem|null>(null);readonly original=signal<ContentItem|null>(null);readonly reactions=signal<ReactionSummary|null>(null);readonly comments=signal<CommentView[]>([]);readonly commentNextCursor=signal<string|null>(null);readonly commentPending=signal(false);readonly replyTarget=signal<CommentView|null>(null);readonly editingCommentId=signal<string|null>(null);readonly commentMessage=signal('');readonly poll=signal<PollView|null>(null);readonly loading=signal(true);readonly failure=signal<DetailFailure|null>(null);readonly contextWarning=signal('');
  private readonly route=inject(ActivatedRoute);private readonly api=inject(Api);
  private readonly id=this.route.snapshot.paramMap.get('id')??'';
  ngOnInit():void{void this.load();}
  async load():Promise<void>{
    this.loading.set(true);this.failure.set(null);this.contextWarning.set('');this.original.set(null);this.reactions.set(null);this.comments.set([]);this.commentNextCursor.set(null);this.replyTarget.set(null);this.editingCommentId.set(null);this.poll.set(null);
    try{
      const content=await this.api.invoke(getContent,{contentId:this.id});this.content.set(content);
      const results=await Promise.allSettled([
        this.api.invoke(getReactionSummary,{contentId:this.id}),
        this.api.invoke(listComments,{contentId:this.id,limit:20,cursor:undefined}),
        this.api.invoke(getPoll,{contentId:this.id}),
        content.originalPostId?this.api.invoke(getContent,{contentId:content.originalPostId}):Promise.resolve(null)
      ]);
      if(results[0].status==='fulfilled')this.reactions.set(results[0].value as ReactionSummary);
      if(results[1].status==='fulfilled'){const page=results[1].value as {items:CommentView[];nextCursor?:string|null};this.comments.set(page.items);this.commentNextCursor.set(page.nextCursor??null);}
      if(results[2].status==='fulfilled')this.poll.set(results[2].value as PollView);
      if(results[3].status==='fulfilled')this.original.set(results[3].value as ContentItem|null);
      if(results[0].status==='rejected'||results[1].status==='rejected')this.contextWarning.set('Bazı etkileşim ayrıntıları şu anda gösterilemiyor.');
    }catch(error){this.content.set(null);this.failure.set(detailFailure(error));}
    finally{this.loading.set(false);}
  }
  externalUrl(value:string|null|undefined):string|null{return safeExternalUrl(value);}
  dateLabel(value:string):string{return new Intl.DateTimeFormat('tr-TR',{dateStyle:'long',timeStyle:'short'}).format(new Date(value));}
  visibilityLabel(value:string):string{return ({Public:'Herkese açık',Followers:'Takipçilere açık',CloseFriends:'Yakın çevre',Private:'Özel'} as Record<string,string>)[value]??value;}
  reactionEntries(summary:ReactionSummary):Array<{kind:string;count:number}>{return Object.entries(summary.counts).filter(([,count])=>count>0).map(([kind,count])=>({kind,count}));}
  reactionLabel(kind:string):string{return ({Like:'Beğeni',Love:'Sevgi',Insightful:'Düşündürücü',Support:'Destek',Laugh:'Eğlenceli'} as Record<string,string>)[kind]??kind;}
  async loadMoreComments():Promise<void>{const cursor=this.commentNextCursor();if(!cursor||this.commentPending())return;this.commentPending.set(true);try{const page=await this.api.invoke(listComments,{contentId:this.id,limit:20,cursor});this.comments.update(current=>[...current,...page.items.filter(item=>!current.some(existing=>existing.id===item.id))]);this.commentNextCursor.set(page.nextCursor??null);}catch{this.commentMessage.set('Daha fazla yorum yüklenemedi.');}finally{this.commentPending.set(false);}}
  async submitComment(event:Event,text:string):Promise<void>{event.preventDefault();const clean=text.trim();if(!clean||this.commentPending())return;this.commentPending.set(true);try{const created=await this.api.invoke(createComment,{contentId:this.id,body:{text:clean,parentId:this.replyTarget()?.id??null}});this.comments.update(items=>[...items,created]);this.replyTarget.set(null);(event.target as HTMLFormElement).reset();this.commentMessage.set('Yorum eklendi.');}catch{this.commentMessage.set('Yorum eklenemedi.');}finally{this.commentPending.set(false);}}
  async saveComment(event:Event,comment:CommentView,text:string):Promise<void>{event.preventDefault();const clean=text.trim();if(!clean||this.commentPending())return;this.commentPending.set(true);try{const updated=await this.api.invoke(updateComment,{contentId:this.id,commentId:comment.id,body:{text:clean}});this.replaceComment(updated);this.editingCommentId.set(null);this.commentMessage.set('Yorum güncellendi.');}catch{this.commentMessage.set('Yorum güncellenemedi.');}finally{this.commentPending.set(false);}}
  async removeComment(comment:CommentView):Promise<void>{if(!comment.canManage||this.commentPending()||!window.confirm('Bu yorum silinsin mi?'))return;this.commentPending.set(true);try{this.replaceComment(await this.api.invoke(deleteComment,{contentId:this.id,commentId:comment.id}));this.commentMessage.set('Yorum silindi.');}catch{this.commentMessage.set('Yorum silinemedi.');}finally{this.commentPending.set(false);}}
  private replaceComment(comment:CommentView):void{this.comments.update(items=>items.map(item=>item.id===comment.id?comment:item));}
}
