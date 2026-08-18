import { ChangeDetectionStrategy, Component, inject, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { Api, getQuestion, QuestionView } from '@platform/api';
import { DetailFailure, detailFailure } from './detail-state';

@Component({
  selector: 'app-question-detail-page', imports: [RouterLink], styleUrl: './detail-page.css', changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a class="back-link" routerLink="/sorular">← Sorulara dön</a>
    @if(loading()){<section class="state-panel" aria-busy="true"><strong>Yanıt hazırlanıyor.</strong><p>Soru ve yanıt yükleniyor.</p></section>}
    @else if(failure();as state){<section class="state-panel error" role="alert"><strong>{{state==='not-found'?'Yanıtlanmış soru bulunamadı.':state==='forbidden'?'Bu soru sana açık değil.':'Soru yüklenemedi.'}}</strong><p>{{state==='error'?'Bağlantını kontrol edip yeniden deneyebilirsin.':'Soru kaldırılmış veya görünürlüğü değişmiş olabilir.'}}</p>@if(state==='error'){<button type="button" (click)="load()">Tekrar dene</button>}</section>}
    @else if(question();as item){
      <header class="detail-head"><p class="kicker">SORU & YANIT</p><h1>{{item.isAnonymous?'Anonim bir soru':'Topluluktan bir soru'}}</h1><p class="lede">Yanıt, seçilen görünürlük sınırları içinde paylaşılır.</p></header>
      <article class="detail-card question-main"><div class="meta-row"><span class="audience">{{audienceLabel(item.audience)}}</span><time [attr.datetime]="item.createdAtUtc">{{dateLabel(item.createdAtUtc)}}</time></div><p class="sender">@if(item.isAnonymous){Anonim gönderici · kimlik bilgisi bu yanıtta paylaşılmaz.}@else if(item.sender){<a [routerLink]="['/profil',item.sender.handle]">{{item.sender.displayName}} · &#64;{{item.sender.handle}}</a>}@else{Gönderen kimliğini açık paylaştı.}</p><p class="body-copy">{{item.body}}</p>
        <section class="answer"><h2>Yanıt</h2><p class="answer-copy">{{item.answer}}</p>@if(item.answeredAtUtc){<p class="quiet">{{dateLabel(item.answeredAtUtc)}} tarihinde yanıtlandı.</p>}</section>
      </article>
    }
  `
})
export class QuestionDetailPage implements OnInit {
  readonly question=signal<QuestionView|null>(null);readonly loading=signal(true);readonly failure=signal<DetailFailure|null>(null);private readonly route=inject(ActivatedRoute);private readonly api=inject(Api);
  private readonly id=this.route.snapshot.paramMap.get('id')??'';
  ngOnInit():void{void this.load();}
  async load():Promise<void>{this.loading.set(true);this.failure.set(null);try{this.question.set(await this.api.invoke(getQuestion,{id:this.id}));}catch(error){this.question.set(null);this.failure.set(detailFailure(error));}finally{this.loading.set(false);}}
  audienceLabel(value:string):string{return value==='Public'?'Herkese açık':value==='Followers'?'Takipçilere açık':'Profilde görünür';}
  dateLabel(value:string):string{return new Intl.DateTimeFormat('tr-TR',{dateStyle:'long'}).format(new Date(value));}
}
