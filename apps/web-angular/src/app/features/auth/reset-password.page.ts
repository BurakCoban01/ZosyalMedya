import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';

@Component({selector:'app-reset-password',imports:[ReactiveFormsModule,RouterLink],template:`<main class="auth-canvas"><section class="auth-story"><p class="brand-mark">ENTERPRISE SOCIAL<span>•</span></p><div><p class="eyebrow">HESABINA DÖN</p><h1>Parolanı<br>yenile.</h1></div></section><section class="auth-form-wrap"><div class="auth-form-inner"><p class="step">GÜVENLİK</p><h2>{{hasToken?'Yeni parolanı belirle':'Sıfırlama bağlantısı iste'}}</h2><form [formGroup]="form" (ngSubmit)="submit()">@if(!hasToken){<label>E-posta<input formControlName="email" type="email" autocomplete="email"></label>}@else{<label>Yeni parola<input formControlName="password" type="password" autocomplete="new-password"></label>}@if(message()){<p role="status">{{message()}}</p>}<button class="primary" type="submit" [disabled]="busy()">{{busy()?'Gönderiliyor…':hasToken?'Parolayı yenile':'Bağlantı iste'}}</button></form><a class="text-action" routerLink="/giris">Girişe dön</a></div></section></main>`,styleUrl:'./login.page.css',changeDetection:ChangeDetectionStrategy.OnPush})
export class ResetPasswordPage {
  private readonly route=inject(ActivatedRoute);readonly token=this.route.snapshot.queryParamMap.get('token');readonly hasToken=!!this.token;readonly busy=signal(false);readonly message=signal('');
  readonly form=new FormGroup({email:new FormControl('',{nonNullable:true,validators:[Validators.email]}),password:new FormControl('',{nonNullable:true,validators:[Validators.minLength(12)]})});
  constructor(private readonly auth:AuthService){}
  async submit():Promise<void>{const value=this.form.getRawValue();if((this.hasToken&&value.password.length<12)||(!this.hasToken&&!value.email))return;this.busy.set(true);try{if(this.hasToken)await this.auth.resetPassword(this.token!,value.password);else await this.auth.requestPasswordReset(value.email);this.message.set(this.hasToken?'Parolan yenilendi; artık giriş yapabilirsin.':'Hesap varsa sıfırlama bağlantısı gönderildi.');}catch{this.message.set('Talep tamamlanamadı; bağlantını ve alanları denetle.');}finally{this.busy.set(false);}}
}
