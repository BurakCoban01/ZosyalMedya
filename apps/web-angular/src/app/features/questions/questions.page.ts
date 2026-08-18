import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, inject, OnInit, signal, viewChild } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Api, answerQuestion, archiveQuestion, askQuestion, deleteQuestion, getProfileByHandle, getQuestionInbox, ProfileView, QuestionView, SearchHit } from '@platform/api';
import { ZmProfilePickerComponent } from '../profile/profile-picker.component';

@Component({
  selector: 'app-questions-page',
  imports: [ReactiveFormsModule, DatePipe, RouterLink, ZmProfilePickerComponent],
  template: `
    <header class="page-head">
      <div><p class="kicker">SORU ALANI</p><h1>Sor, yanıtla, arşivle.</h1><p>Anonim göndericinin kimliği normal yanıtta hiçbir zaman görünmez.</p></div>
      <select [formControl]="filter" (change)="load()" aria-label="Soru durumu"><option value="">Tümü</option><option value="Published">Yanıt bekleyen</option><option value="Answered">Yanıtlanan</option><option value="Archived">Arşiv</option></select>
    </header>
    <details class="ask-disclosure" [open]="target() !== null">
      <summary><strong>Yeni soru sor</strong><span>Görünür bir profil seçip anonimlik ve hedef kitleyi belirle.</span></summary>
      <div class="ask-target">
        <zm-profile-picker label="Soruyu göndereceğin kişi" hint="Ad veya kullanıcı adıyla görünür bir profil seç." [initialSelection]="target()" (selectedChange)="selectTarget($event)"></zm-profile-picker>
      </div>
      <form class="ask" [formGroup]="askForm" (ngSubmit)="ask()">
        <label class="wide">Soru<textarea formControlName="body" rows="3" maxlength="1000"></textarea></label>
        <label>Yanıtın görünürlüğü<select formControlName="audience"><option value="Profile">Yalnızca profil sahibi</option><option value="Followers">Profil sahibinin takipçileri</option><option value="Public">Herkese açık</option></select><small>{{audienceHelp(askForm.controls.audience.value)}}</small></label>
        <label class="check"><input type="checkbox" formControlName="isAnonymous"><span><strong>Anonim gönder</strong><small>{{askForm.controls.isAnonymous.value?'Kimliğin soru ve yanıt ekranlarında paylaşılmaz.':'Adın ve profil bağlantın soruyla birlikte görünür.'}}</small></span></label>
        <button type="submit" [disabled]="askForm.invalid || !target() || busy()">{{busy() ? 'Gönderiliyor…' : 'Soruyu gönder'}}</button>
      </form>
    </details>
    @if (message()) { <p class="message" [class.message-error]="messageIsError()" [attr.role]="messageIsError()?'alert':'status'">{{message()}}</p> }
    <section class="inbox" aria-live="polite" aria-labelledby="inbox-title">
      <div class="section-head"><div><p class="kicker">GELEN KUTUSU</p><h2 id="inbox-title">Sorular ve yanıtların.</h2></div><p>Yanıtladığın sorular, seçilen görünürlük sınırı içinde gerçek ayrıntı sayfasına bağlanır.</p></div>
      @if(loading()) {
        <div class="inbox-state" aria-busy="true" role="status"><strong>Sorular yükleniyor.</strong><p>Gelen kutun hesabından alınıyor.</p></div>
      } @else if(loadError() && questions().length===0) {
        <div class="inbox-state inbox-error" role="alert"><strong>Sorular yüklenemedi.</strong><p>{{loadError()}}</p><button type="button" (click)="load()">Tekrar dene</button></div>
      } @else { @for (question of questions(); track question.id) {
        <article [class.answered]="question.status === 'Answered'">
          <div class="meta"><span>{{statusLabel(question.status)}} · {{audienceLabel(question.audience)}}</span><time>{{question.createdAtUtc | date:'dd.MM.yyyy HH:mm'}}</time></div>
          <h3>{{question.body}}</h3><p class="sender">@if(question.isAnonymous){Anonim gönderici · kimlik bilgisi paylaşılmaz.}@else if(question.sender){<a [routerLink]="['/profil',question.sender.handle]">{{question.sender.displayName}} · &#64;{{question.sender.handle}}</a>}@else{Gönderen kimliğini açık paylaştı.}</p>
          @if (question.answer) { <blockquote>{{question.answer}}</blockquote> }
          @if (question.status === 'Answered') { <a class="detail-link" [routerLink]="['/sorular',question.id]">Yanıtı ayrıntıda aç</a> }
          @if (question.status === 'Published') { <div class="answer"><input #answerText aria-label="Yanıtını yaz" placeholder="Yanıtını yaz" maxlength="5000"><button type="button" (click)="answer(question, answerText.value)">Yanıtla</button></div> }
          <div class="question-actions">
            @if(question.status === 'Published' || question.status === 'Answered') { <button type="button" class="text" (click)="archive(question)" [disabled]="deletingId()===question.id">Arşivle</button> }
            @if(confirmingDeleteId()===question.id){<span class="delete-confirm" role="group" aria-label="Soruyu silme onayı"><span>Bu soru ve yanıt kalıcı olarak gizlensin mi?</span><button type="button" class="text" (click)="confirmingDeleteId.set(null)">Vazgeç</button><button type="button" class="danger" [disabled]="deletingId()===question.id" (click)="remove(question)">{{deletingId()===question.id?'Siliniyor…':'Evet, sil'}}</button></span>}@else{<button type="button" class="text danger" (click)="confirmingDeleteId.set(question.id)">Sil</button>}
          </div>
        </article>
      } @empty { <p class="empty">Bu filtrede soru yok.</p> } }
    </section>`,
  styleUrl: './questions.page.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class QuestionsPage implements OnInit {
  readonly questions = signal<QuestionView[]>([]); readonly busy = signal(false); readonly loading = signal(true); readonly loadError = signal(''); readonly message = signal(''); readonly messageIsError = signal(false); readonly target = signal<SearchHit | null>(null); readonly confirmingDeleteId=signal<string|null>(null);readonly deletingId=signal<string|null>(null);
  readonly filter = new FormControl<'' | 'Published' | 'Answered' | 'Archived'>('', { nonNullable: true });
  readonly askForm = new FormGroup({
    body: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(4)] }),
    audience: new FormControl<'Profile' | 'Followers' | 'Public'>('Profile', { nonNullable: true }),
    isAnonymous: new FormControl(true, { nonNullable: true })
  });
  readonly targetPicker = viewChild(ZmProfilePickerComponent);
  private readonly route = inject(ActivatedRoute, { optional: true });
  private loadRevision=0;
  private async preselectRequestedProfile(): Promise<void> {
    const handle = this.route?.snapshot.queryParamMap.get('profil')?.trim(); if (!handle) return;
    try {
      const profile = await this.api.invoke(getProfileByHandle, { handle });
      const hit = this.profileHit(profile);
      const picker = this.targetPicker();
      if (picker) picker.choose(hit); else this.selectTarget(hit);
    } catch { this.message.set('Bağlantıdaki profil seçilemedi; başka bir profil arayabilirsin.'); this.messageIsError.set(true); }
  }
  private profileHit(profile: ProfileView): SearchHit {
    return { id: profile.id, ownerId: profile.ownerId, type: 'Profile', title: profile.displayName, snippet: `@${profile.handle}`, deepLink: `/profil/${profile.handle}`, matchedTags: [], score: 1 };
  }
  constructor(private readonly api: Api) {}
  ngOnInit(): void { void this.load(); void this.preselectRequestedProfile(); }
  async load(): Promise<void> { const revision=++this.loadRevision;this.loading.set(true);this.loadError.set('');try { const items=await this.api.invoke(getQuestionInbox, { status: this.filter.value || undefined, limit: 50 });if(revision===this.loadRevision)this.questions.set(items); } catch { if(revision===this.loadRevision)this.loadError.set('Bağlantını kontrol edip yeniden deneyebilirsin.'); } finally { if(revision===this.loadRevision)this.loading.set(false); } }
  selectTarget(profile: SearchHit | null): void { this.target.set(profile); this.message.set('');this.messageIsError.set(false); }
  async ask(): Promise<void> { const target = this.target(); if (this.askForm.invalid || !target || this.busy()) return; this.busy.set(true);this.messageIsError.set(false); try { const value = this.askForm.getRawValue(); await this.api.invoke(askQuestion, { body: { ...value, targetId: target.ownerId, isDraft: false, publishAtUtc: null } }); this.askForm.controls.body.reset(); this.message.set(`${target.title} için soru gönderildi.`); } catch { this.message.set('Soru gönderilemedi.');this.messageIsError.set(true); } finally { this.busy.set(false); } }
  async answer(question: QuestionView, text: string): Promise<void> { if (!text.trim()) return; const snapshot = this.questions();this.messageIsError.set(false); this.questions.update(items => items.map(item => item.id === question.id ? { ...item, status: 'Answered', answer: text } : item)); try { const updated = await this.api.invoke(answerQuestion, { id: question.id, body: { answer: text } }); this.questions.update(items => items.map(item => item.id === updated.id ? updated : item)); } catch { this.questions.set(snapshot); this.message.set('Yanıt kaydedilemedi; görünüm geri alındı.');this.messageIsError.set(true); } }
  async archive(question: QuestionView): Promise<void> { this.messageIsError.set(false);try { const updated = await this.api.invoke(archiveQuestion, { id: question.id }); this.questions.update(items => items.map(item => item.id === updated.id ? updated : item)); } catch { this.message.set('Soru arşivlenemedi.');this.messageIsError.set(true); } }
  async remove(question:QuestionView):Promise<void>{if(this.deletingId())return;++this.loadRevision;this.loading.set(false);this.deletingId.set(question.id);this.messageIsError.set(false);try{await this.api.invoke(deleteQuestion,{id:question.id});this.questions.update(items=>items.filter(item=>item.id!==question.id));this.confirmingDeleteId.set(null);this.message.set('Soru silindi; artık gelen kutusunda veya profil yüzeyinde görünmez.');}catch{this.message.set('Soru silinemedi; yetkini veya bağlantını kontrol et.');this.messageIsError.set(true);}finally{this.deletingId.set(null);}}
  statusLabel(status: QuestionView['status']): string { return ({ Draft: 'Taslak', Scheduled: 'Planlandı', Published: 'Yanıt bekliyor', Answered: 'Yanıtlandı', Archived: 'Arşivlendi', Deleted: 'Silindi' } as const)[status]; }
  audienceLabel(value: QuestionView['audience']): string { return ({ Profile:'Yalnız profil sahibi', Followers:'Takipçiler', Public:'Herkese açık' } as const)[value]; }
  audienceHelp(value: QuestionView['audience']): string { return value==='Profile'?'Yanıtı yalnızca seçtiğin profil görebilir.':value==='Followers'?'Yanıt, profil sahibini gerçekten takip eden hesaplara açılır.':'Yanıtlandıktan sonra herkes ayrıntı sayfasını görebilir.'; }
}
