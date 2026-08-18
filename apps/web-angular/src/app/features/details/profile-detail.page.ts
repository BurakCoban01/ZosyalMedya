import { ChangeDetectionStrategy, Component, inject, OnDestroy, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import {
  Api, follow, getMyProfile, getProfileByHandle, getProfileQuestions, getRelationship,
  ProfileView, QuestionView, RelationshipView, unblock, unfollow
} from '@platform/api';
import { Subscription } from 'rxjs';
import { AuthorizedProfileVisualComponent } from '../../core/media/authorized-profile-visual.component';
import { DetailFailure, detailFailure, safeExternalUrl } from './detail-state';
import { ProfileTimelineComponent } from './profile-timeline.component';
import { SocialGraphPanelComponent } from '../social/social-graph-panel.component';
import { ReportActionComponent } from '../../core/moderation/report-action.component';
import { RichTextComponent } from '../../core/social/rich-text.component';
import { StoryRailComponent } from '../stories/story-rail.component';

@Component({
  selector: 'app-profile-detail-page',
  imports: [RouterLink, AuthorizedProfileVisualComponent, ProfileTimelineComponent, SocialGraphPanelComponent, ReportActionComponent, RichTextComponent, StoryRailComponent],
  template: `
    <a class="back-link" routerLink="/kesfet">← Keşfete dön</a>
    @if (loading()) {
      <section class="state-panel" aria-busy="true"><strong>Profil hazırlanıyor.</strong><p>Görünür profil bilgileri yükleniyor.</p></section>
    } @else if (failure(); as state) {
      <section class="state-panel error" role="alert">
        <strong>{{ state === 'not-found' ? 'Profil bulunamadı.' : state === 'forbidden' ? 'Bu profil sana açık değil.' : 'Profil yüklenemedi.' }}</strong>
        <p>{{ state === 'error' ? 'Bağlantını kontrol edip yeniden deneyebilirsin.' : 'Profil kaldırılmış, gizlenmiş veya bağlantı değişmiş olabilir.' }}</p>
        @if (state === 'error') { <button type="button" (click)="load()">Tekrar dene</button> }
      </section>
    } @else if (profile(); as current) {
      <header class="detail-head"><p class="kicker">PROFİL</p><h1>{{ current.displayName }}</h1><p class="lede">&#64;{{ current.handle }}</p></header>
      <section class="detail-card" aria-label="Profil özeti">
        <nav class="profile-actions" aria-label="Profil eylemleri">
          @if (isViewer()) {
            <a class="profile-action primary" routerLink="/profil">Kendi profilini aç</a>
          } @else if (relationship(); as relation) {
            @if (relation.isBlocked) {
              <button type="button" (click)="unblockProfile()" [disabled]="acting()">Engeli kaldır</button>
            } @else if (!relation.isBlockedByTarget) {
              <button type="button" class="primary" (click)="toggleFollow()" [disabled]="acting()">
                {{ acting() ? 'İşleniyor…' : relation.followState === 'None' ? 'Takip et' : relation.followState === 'Pending' ? 'İsteği geri çek' : 'Takibi bırak' }}
              </button>
              <a class="profile-action" routerLink="/sorular" [queryParams]="{ profil: current.handle }">Soru sor</a>
              <a class="profile-action" routerLink="/mesajlar" [queryParams]="{ profil: current.handle }">Mesaj gönder</a>
            }
          }
          @if (actionMessage()) { <span class="action-message" [class.error]="actionFailed()" [attr.role]="actionFailed() ? 'alert' : 'status'">{{ actionMessage() }}</span> }
        </nav>
        <zm-authorized-profile-visual [name]="current.displayName" [profileMediaId]="current.profileMediaId ?? null" [coverMediaId]="current.coverMediaId ?? null"><div class="identity-copy">
          <div class="name-line"><h2>{{ current.displayName }}</h2>@if(current.isVerified){<span class="audience">Doğrulanmış</span>}</div>
          <p class="handle">&#64;{{ current.handle }}</p><p class="biography"><zm-rich-text [text]="current.biography || 'Henüz bir biyografi eklenmedi.'" /></p>
        </div></zm-authorized-profile-visual>
        <dl class="facts">
          <div><dt>Görünürlük</dt><dd>{{ current.isPrivate ? 'Özel profil' : 'Herkese açık profil' }}</dd></div>
          @if(current.location){<div><dt>Konum</dt><dd>{{current.location}}</dd></div>}
          @if(current.organization){<div><dt>Organizasyon</dt><dd>{{current.organization}}</dd></div>}
          @if(website(current.websiteUrl);as url){<div><dt>Web sitesi</dt><dd><a class="external-link" [href]="url" target="_blank" rel="noopener noreferrer nofollow">{{websiteLabel(url)}}</a></dd></div>}
        </dl>
        @if(!isViewer()){<zm-report-action subjectType="User" [subjectId]="current.ownerId" label="Profili bildir" />}
      </section>
      <zm-story-rail [ownerId]="current.ownerId" />
      <zm-social-graph-panel [ownerId]="current.ownerId" />
      <section class="detail-card profile-questions" aria-labelledby="profile-questions-title">
        <header><div><p class="kicker">SORU & YANIT</p><h2 id="profile-questions-title">Yanıtlanan sorular</h2></div>@if(!isViewer()&&!relationship()?.isBlocked&&!relationship()?.isBlockedByTarget){<a class="profile-action primary" routerLink="/sorular" [queryParams]="{profil:current.handle}">Bu profile soru sor</a>}</header>
        @if(questionsLoading()){<p class="quiet" role="status">Görünür yanıtlar yükleniyor…</p>}@else if(questionsError()){<div class="inset-error" role="alert"><span>Yanıtlanan sorular yüklenemedi.</span><button type="button" (click)="loadProfileQuestions(current.ownerId)">Tekrar dene</button></div>}@else if(profileQuestions().length){<ol>@for(question of profileQuestions();track question.id){<li><div><span class="audience">{{question.audience==='Public'?'Herkese açık':'Takipçilere açık'}}</span><small>@if(question.isAnonymous){Anonim soru}@else if(question.sender){<a [routerLink]="['/profil',question.sender.handle]">{{question.sender.displayName}} · &#64;{{question.sender.handle}}</a>}@else{Açık soru}</small></div><h3>{{question.body}}</h3><p>{{question.answer}}</p><a class="content-link" [routerLink]="['/sorular',question.id]">Yanıtı aç</a></li>}</ol>}@else{<p class="quiet">Bu izleyiciye açık yanıtlanmış soru henüz yok.</p>}
      </section>
      <zm-profile-timeline [profile]="current" />
    }
  `,
  styleUrl: './detail-page.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProfileDetailPage implements OnInit, OnDestroy {
  readonly profile = signal<ProfileView | null>(null);
  readonly loading = signal(true);
  readonly failure = signal<DetailFailure | null>(null);
  readonly relationship = signal<RelationshipView | null>(null);
  readonly isViewer = signal(false);
  readonly acting = signal(false);
  readonly profileQuestions=signal<QuestionView[]>([]);readonly questionsLoading=signal(false);readonly questionsError=signal(false);
  readonly actionMessage = signal('');
  readonly actionFailed = signal(false);
  private readonly route = inject(ActivatedRoute);
  private readonly api = inject(Api);
  private handle = '';
  private loadRevision = 0;
  private routeSubscription: Subscription | null = null;
  ngOnInit(): void {
    this.routeSubscription = this.route.paramMap.subscribe(params => {
      const handle = params.get('handle') ?? '';
      if (handle === this.handle && this.profile()) return;
      this.handle = handle;
      void this.load();
    });
  }
  ngOnDestroy(): void { this.routeSubscription?.unsubscribe(); }
  async load(): Promise<void> {
    const revision = ++this.loadRevision;
    const handle = this.handle;
    this.loading.set(true); this.failure.set(null); this.actionMessage.set(''); this.actionFailed.set(false);
    try {
      const profile = await this.api.invoke(getProfileByHandle, { handle });
      if (revision !== this.loadRevision) return;
      this.profile.set(profile);
      const viewer = await this.api.invoke(getMyProfile, {}).catch(() => null);
      if (revision !== this.loadRevision) return;
      this.isViewer.set(viewer?.ownerId === profile.ownerId);
      this.relationship.set(null);
      if (!this.isViewer()) {
        try { const relationship=await this.api.invoke(getRelationship, { targetId: profile.ownerId });if(revision===this.loadRevision)this.relationship.set(relationship); }
        catch { if(revision===this.loadRevision){this.actionMessage.set('İlişki durumu alınamadı; profili görüntülemeye devam edebilirsin.');this.actionFailed.set(true);} }
      }
      await this.loadProfileQuestions(profile.ownerId, revision);
    }
    catch (error) { if(revision===this.loadRevision){this.profile.set(null);this.failure.set(detailFailure(error));} }
    finally { if(revision===this.loadRevision)this.loading.set(false); }
  }
  async loadProfileQuestions(ownerId:string,expectedRevision=this.loadRevision):Promise<void>{this.questionsLoading.set(true);this.questionsError.set(false);try{const items=await this.api.invoke(getProfileQuestions,{targetId:ownerId,limit:6});if(expectedRevision===this.loadRevision)this.profileQuestions.set(Array.isArray(items)?items:[]);}catch{if(expectedRevision===this.loadRevision){this.profileQuestions.set([]);this.questionsError.set(true);}}finally{if(expectedRevision===this.loadRevision)this.questionsLoading.set(false);}}
  website(value: string | null | undefined): string | null { return safeExternalUrl(value); }
  websiteLabel(value: string): string { try { const url = new URL(value); return url.hostname; } catch { return value; } }
  async toggleFollow(): Promise<void> {
    const profile = this.profile(); const relationship = this.relationship();
    if (!profile || !relationship || this.acting() || relationship.isBlocked || relationship.isBlockedByTarget) return;
    this.acting.set(true); this.actionMessage.set(''); this.actionFailed.set(false);
    try {
      const operation = relationship.followState === 'None' ? follow : unfollow;
      this.relationship.set(await this.api.invoke(operation, { targetId: profile.ownerId }));
      this.actionMessage.set(relationship.followState === 'None' ? 'Takip durumu güncellendi.' : 'Takip bağlantısı kaldırıldı.');
    } catch { this.actionMessage.set('Takip durumu güncellenemedi.'); this.actionFailed.set(true); }
    finally { this.acting.set(false); }
  }
  async unblockProfile(): Promise<void> {
    const profile = this.profile(); if (!profile || this.acting()) return;
    this.acting.set(true); this.actionMessage.set(''); this.actionFailed.set(false);
    try { this.relationship.set(await this.api.invoke(unblock, { targetId: profile.ownerId })); this.actionMessage.set('Engel kaldırıldı.'); }
    catch { this.actionMessage.set('Engel kaldırılamadı.'); this.actionFailed.set(true); }
    finally { this.acting.set(false); }
  }
}
