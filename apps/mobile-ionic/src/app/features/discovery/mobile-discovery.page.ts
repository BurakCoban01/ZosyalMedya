import { ChangeDetectionStrategy, Component, OnInit, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Api, CommunityView, initiateMedia, listCommunities, search, SearchHit, trending, TrendingTagView, uploadMediaContent } from '@platform/api';
import { IonChip, IonContent, IonHeader, IonItem, IonLabel, IonList, IonNote, IonSearchbar, IonTitle, IonToolbar } from '@ionic/angular/standalone';

@Component({selector:'app-mobile-discovery',imports:[ReactiveFormsModule,RouterLink,IonChip,IonContent,IonHeader,IonItem,IonLabel,IonList,IonNote,IonSearchbar,IonTitle,IonToolbar],template:`
  <ion-header translucent="true"><ion-toolbar><ion-title>Keşfet</ion-title></ion-toolbar></ion-header><ion-content [fullscreen]="true">
    <div class="intro"><p>ARAMA</p><h1>Yeni bir iz bul.</h1><span>Görünür ve güvenli sonuçlar.</span></div>
    <ion-searchbar [formControl]="query" placeholder="Konu, kişi veya etiket" (keyup.enter)="runSearch()"></ion-searchbar>
    <div class="chips">@for(item of trends();track item.tag){<ion-chip (click)="pickTag(item.tag)">#{{item.tag}}</ion-chip>}</div>
    @if(message()){<ion-note class="status">{{message()}}</ion-note>}
    <ion-list lines="full">@for(item of results();track item.type+item.id){<ion-item [routerLink]="item.deepLink" detail="true"><ion-label class="ion-text-wrap"><p>{{item.type}}</p><h2>{{item.title}}</h2><p>{{item.snippet}}</p></ion-label></ion-item>}</ion-list>
    <div class="section-title"><p>TOPLULUKLAR</p><h2>Bir masaya katıl.</h2></div>
    <ion-list inset="true">@for(item of communities();track item.id){<ion-item [routerLink]="['/topluluklar',item.slug]" detail="true"><ion-label class="ion-text-wrap"><h2>{{item.name}}</h2><p>{{item.description}}</p><ion-note>{{item.activeMemberCount}} aktif üye</ion-note></ion-label></ion-item>}</ion-list>
    <div class="section-title"><p>MEDYA</p><h2>Telefondan güvenli yükle.</h2><span>Kamera veya galeriden seçilen dosya doğrulanır ve yeniden işlenir.</span></div>
    <label class="upload">Kamera / galeri<input type="file" accept="image/*,video/mp4" capture="environment" (change)="upload($event)"></label>
  </ion-content>`,styles:[`.intro{padding:5rem 1.25rem 1rem}.intro p,.section-title p{color:var(--ion-color-primary);font-size:.68rem;font-weight:850;letter-spacing:.18em;margin:0}.intro h1{font:700 3.7rem/.92 Georgia,serif;letter-spacing:-.06em;margin:.5rem 0}.intro span,.section-title span{color:var(--ion-color-medium)}.chips{display:flex;overflow-x:auto;padding:0 1rem}.status{display:block;margin:1rem 1.25rem}.section-title{padding:2.5rem 1.25rem 1rem}.section-title h2{font:700 2.2rem Georgia,serif;margin:.4rem 0}.upload{display:block;margin:0 1.25rem 3rem;padding:1rem;text-align:center;background:var(--ion-color-primary);color:var(--ion-color-primary-contrast);font-weight:800;border-radius:.75rem}.upload input{display:none}`],changeDetection:ChangeDetectionStrategy.OnPush})
export class MobileDiscoveryPage implements OnInit{
  readonly query=new FormControl('',{nonNullable:true,validators:[Validators.required,Validators.minLength(2)]});readonly results=signal<SearchHit[]>([]);readonly trends=signal<TrendingTagView[]>([]);readonly communities=signal<CommunityView[]>([]);readonly message=signal('');
  constructor(private readonly api:Api){}ngOnInit():void{void Promise.all([this.loadTrends(),this.loadCommunities()]);}
  async runSearch():Promise<void>{if(this.query.invalid)return;try{this.results.set((await this.api.invoke(search,{q:this.query.value.trim(),limit:30})).items);}catch{this.message.set('Arama tamamlanamadı.');}}
  pickTag(tag:string):void{this.query.setValue(tag);void this.runSearch();}
  async upload(event:Event):Promise<void>{const file=(event.target as HTMLInputElement).files?.[0];if(!file)return;try{const initiated=await this.api.invoke(initiateMedia,{body:{fileName:file.name,contentType:file.type,size:file.size,visibility:'Public'}});await this.api.invoke(uploadMediaContent,{id:initiated.media.id,body:file});this.message.set('Medya doğrulandı ve hazır.');}catch{this.message.set('Medya yüklenemedi.');}}
  private async loadTrends():Promise<void>{try{this.trends.set(await this.api.invoke(trending,{limit:12}));}catch{/* Çevrimdışı durumda boş kalabilir. */}}
  private async loadCommunities():Promise<void>{try{this.communities.set(await this.api.invoke(listCommunities,{limit:12}));}catch{this.message.set('Topluluklar yüklenemedi.');}}
}
