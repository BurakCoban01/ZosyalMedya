import { ChangeDetectionStrategy, Component, OnInit, signal } from '@angular/core';
import { DatePipe } from '@angular/common';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { Router } from '@angular/router';
import { Api, MfaEnrollment, SessionView, beginMfaEnrollment, confirmMfaEnrollment, deleteMyIdentityData, disableMfa, exportMyIdentityData, listSessions, revokeSession } from '@platform/api';
import { TokenVault } from '../../core/auth/token-vault.service';
import { MotionMode, ThemeMode, ThemeService, THEME_OPTIONS } from '../../core/preferences/theme.service';

@Component({
  selector: 'app-settings-page',
  imports: [ReactiveFormsModule, DatePipe],
  template: `<section class="settings">
    <header><p>GÜVENLİK VE GİZLİLİK</p><h1>Hesabının kontrolü sende.</h1><span>Etkin cihazları, ikinci faktörü ve kişisel verilerini tek yerde yönet.</span></header>
    @if (message()) { <p class="notice" role="status">{{message()}}</p> }
    <div class="grid">
      <article class="preferences"><small>GÖRÜNÜM VE HAREKET</small><h2>Deneyim tercihleri</h2><p class="muted">Tema ve hareket seçimin anında uygulanır ve bu tarayıcıda korunur.</p>
        <div class="preference-row"><span>Tema</span><div class="option-set" aria-label="Tema tercihi">@for(option of themeOptions;track option.value){<button type="button" [class.selected]="theme.themeMode()===option.value" [attr.aria-pressed]="theme.themeMode()===option.value" (click)="setTheme(option.value)">{{option.label}}</button>}</div></div>
        <div class="preference-row"><span>Hareket</span><div class="option-set" aria-label="Hareket tercihi">@for(option of motionOptions;track option.value){<button type="button" [class.selected]="theme.motionMode()===option.value" [attr.aria-pressed]="theme.motionMode()===option.value" (click)="setMotion(option.value)">{{option.label}}</button>}</div></div>
      </article>
      <article><div class="title"><div><small>OTURUMLAR</small><h2>Etkin cihazlar</h2></div><button type="button" (click)="loadSessions()">Yenile</button></div>
        @if (sessions().length === 0) { <p class="muted">Etkin oturum bulunamadı.</p> }
        <div class="session-list">@for (session of sessions(); track session.id) { <div class="session"><div><strong>{{session.deviceName}}</strong><span>{{session.lastUsedAtUtc | date:'medium'}} · {{session.isRevoked?'İptal edildi':'Etkin'}}</span></div>@if(!session.isRevoked){<button type="button" (click)="revoke(session)">İptal et</button>}</div> }</div>
      </article>
      <article><small>İKİNCİ FAKTÖR</small><h2>Doğrulayıcı uygulama</h2>
        @if (!enrollment()) { <p class="muted">TOTP uyumlu bir uygulamayla hesabına ikinci bir doğrulama katmanı ekle.</p><button class="primary" type="button" (click)="beginMfa()">Kurulumu başlat</button> }
        @else { <p class="muted">Kurulum anahtarını doğrulayıcı uygulamana kopyala, ardından üretilen altı haneli kodu gir. Anahtar ekranda gösterilmez.</p><button type="button" (click)="copyMfaSecret()">Kurulum anahtarını kopyala</button>
          <form [formGroup]="confirmForm" (ngSubmit)="confirmMfa()"><input formControlName="code" inputmode="numeric" autocomplete="one-time-code" placeholder="123456"><button class="primary" type="submit" [disabled]="confirmForm.invalid">Etkinleştir</button></form> }
        <form class="inline" [formGroup]="disableForm" (ngSubmit)="turnOffMfa()"><input formControlName="code" autocomplete="one-time-code" placeholder="MFA veya kurtarma kodu"><button type="submit" [disabled]="disableForm.invalid">MFA'yı kapat</button></form>
        @if (recoveryCodes().length) { <div class="codes"><strong>{{recoveryCodes().length}} kurtarma kodu hazır</strong><span>Kodlar ekranda gösterilmez; güvenli bir metin dosyası olarak bir kez indir.</span><button type="button" (click)="downloadRecoveryCodes()">Kurtarma kodlarını indir</button></div> }
      </article>
      <article><small>VERİ TAŞINABİLİRLİĞİ</small><h2>Verilerimi dışa aktar</h2><p class="muted">Kimlik bilgilerin ve oturum geçmişin, parola ya da gizli anahtarlar eklenmeden JSON olarak hazırlanır.</p><button class="primary" type="button" (click)="downloadExport()">Dışa aktar</button></article>
      <article class="danger"><small>GERİ DÖNDÜRÜLEMEZ İŞLEM</small><h2>Hesabı sil</h2><p class="muted">Kişisel kimlik alanları anonimleştirilir ve bütün oturumlar kapatılır.</p>
        <form [formGroup]="deleteForm" (ngSubmit)="deleteAccount()"><input formControlName="password" type="password" autocomplete="current-password" placeholder="Mevcut parola"><input formControlName="mfaCode" autocomplete="one-time-code" placeholder="MFA etkinse kod"><label><input formControlName="confirmed" type="checkbox"> Bu işlemin geri alınamayacağını anlıyorum.</label><button type="submit" [disabled]="deleteForm.invalid">Hesabımı kalıcı olarak sil</button></form>
      </article>
    </div>
  </section>`,
  styleUrl: './settings.page.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SettingsPage implements OnInit {
  readonly sessions=signal<SessionView[]>([]); readonly enrollment=signal<MfaEnrollment|null>(null); readonly recoveryCodes=signal<string[]>([]); readonly message=signal('');
  readonly themeOptions=THEME_OPTIONS;readonly motionOptions:ReadonlyArray<{value:MotionMode;label:string}>=[{value:'system',label:'Sistem'},{value:'reduce',label:'Azaltılmış'},{value:'full',label:'Tam'}];
  readonly confirmForm=new FormGroup({code:new FormControl('',{nonNullable:true,validators:[Validators.required,Validators.minLength(6)]})});
  readonly disableForm=new FormGroup({code:new FormControl('',{nonNullable:true,validators:[Validators.required]})});
  readonly deleteForm=new FormGroup({password:new FormControl('',{nonNullable:true,validators:[Validators.required]}),mfaCode:new FormControl('',{nonNullable:true}),confirmed:new FormControl(false,{nonNullable:true,validators:[Validators.requiredTrue]})});
  constructor(private readonly api:Api,private readonly vault:TokenVault,private readonly router:Router,readonly theme:ThemeService){}
  ngOnInit():void{void this.loadSessions();}
  setTheme(mode:ThemeMode):void{this.theme.setTheme(mode);}
  setMotion(mode:MotionMode):void{this.theme.setMotion(mode);}
  async loadSessions():Promise<void>{try{this.sessions.set(await this.api.invoke(listSessions));}catch{this.message.set('Oturumlar yüklenemedi.');}}
  async revoke(session:SessionView):Promise<void>{try{await this.api.invoke(revokeSession,{sessionId:session.id});await this.loadSessions();this.message.set('Oturum iptal edildi.');}catch{this.message.set('Oturum iptal edilemedi.');}}
  async beginMfa():Promise<void>{try{this.enrollment.set(await this.api.invoke(beginMfaEnrollment));this.recoveryCodes.set([]);}catch{this.message.set('MFA kurulumu başlatılamadı.');}}
  async copyMfaSecret():Promise<void>{const secret=this.enrollment()?.secret;if(!secret)return;try{await navigator.clipboard.writeText(secret);this.message.set('Kurulum anahtarı panoya kopyalandı.');}catch{this.message.set('Kurulum anahtarı kopyalanamadı; tarayıcı pano iznini kontrol et.');}}
  async confirmMfa():Promise<void>{if(this.confirmForm.invalid||!this.enrollment())return;try{const result=await this.api.invoke(confirmMfaEnrollment,{body:{enrollmentToken:this.enrollment()!.enrollmentToken,code:this.confirmForm.controls.code.value}});this.recoveryCodes.set(result.recoveryCodes);this.enrollment.set(null);this.confirmForm.reset();this.message.set('MFA etkinleştirildi.');}catch{this.message.set('Kod doğrulanamadı.');}}
  async turnOffMfa():Promise<void>{if(this.disableForm.invalid)return;try{await this.api.invoke(disableMfa,{body:{code:this.disableForm.controls.code.value}});this.disableForm.reset();this.message.set('MFA kapatıldı.');}catch{this.message.set('MFA kapatılamadı; kodu kontrol et.');}}
  async downloadExport():Promise<void>{try{const data=await this.api.invoke(exportMyIdentityData);const url=URL.createObjectURL(new Blob([JSON.stringify(data,null,2)],{type:'application/json'}));const anchor=document.createElement('a');anchor.href=url;anchor.download=`hesap-verileri-${data.exportedAtUtc.slice(0,10)}.json`;anchor.click();URL.revokeObjectURL(url);this.message.set('Dışa aktarma hazırlandı.');}catch{this.message.set('Veriler dışa aktarılamadı.');}}
  downloadRecoveryCodes():void{const codes=this.recoveryCodes();if(!codes.length)return;const url=URL.createObjectURL(new Blob([codes.join('\n')+'\n'],{type:'text/plain'}));const anchor=document.createElement('a');anchor.href=url;anchor.download='escp-kurtarma-kodlari.txt';anchor.click();URL.revokeObjectURL(url);this.recoveryCodes.set([]);this.message.set('Kurtarma kodları indirildi; dosyayı güvenli bir yerde sakla.');}
  async deleteAccount():Promise<void>{if(this.deleteForm.invalid)return;const value=this.deleteForm.getRawValue();try{await this.api.invoke(deleteMyIdentityData,{body:{currentPassword:value.password,mfaCode:value.mfaCode||null}});await this.vault.clear();await this.router.navigateByUrl('/giris');}catch{this.message.set('Hesap silinemedi; parola ve MFA kodunu kontrol et.');}}
}
