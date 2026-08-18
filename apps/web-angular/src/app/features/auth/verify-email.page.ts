import { ChangeDetectionStrategy, Component, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { AuthService } from '../../core/auth/auth.service';

@Component({selector:'app-verify-email',imports:[RouterLink],template:`<main class="auth-canvas"><section class="auth-story"><p class="brand-mark">ENTERPRISE SOCIAL<span>•</span></p><div><p class="eyebrow">GÜVENLİ BAŞLANGIÇ</p><h1>E-posta<br>doğrulama.</h1></div></section><section class="auth-form-wrap"><div class="auth-form-inner"><p class="step">HESAP GÜVENLİĞİ</p><h2>{{message()}}</h2>@if(busy()){<p>Bağlantı denetleniyor…</p>}<a class="text-action" routerLink="/giris">Giriş ekranına dön</a></div></section></main>`,styleUrl:'./login.page.css',changeDetection:ChangeDetectionStrategy.OnPush})
export class VerifyEmailPage implements OnInit {
  readonly busy=signal(true);readonly message=signal('Bağlantı denetleniyor');
  constructor(private readonly route:ActivatedRoute,private readonly auth:AuthService){}
  async ngOnInit():Promise<void>{const token=this.route.snapshot.queryParamMap.get('token');if(!token){this.message.set('Doğrulama bağlantısı eksik.');this.busy.set(false);return;}try{await this.auth.verifyEmail(token);this.message.set('E-posta adresin doğrulandı.');}catch{this.message.set('Bağlantı geçersiz, süresi dolmuş veya daha önce kullanılmış.');}finally{this.busy.set(false);}}
}
