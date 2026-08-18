import { HttpErrorResponse } from '@angular/common/http';
import { ChangeDetectionStrategy, Component, OnInit, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { PublicDemoMailboxMessage, PublicDemoStatus } from '@platform/api';
import { AuthService } from '../../core/auth/auth.service';

@Component({
  selector: 'app-login-page',
  imports: [ReactiveFormsModule, RouterLink],
  template: `
    <main class="auth-canvas">
      <section class="auth-story" aria-labelledby="brand-title">
        <p class="brand-mark" aria-label="Enterprise Social & Community Platform">ENTERPRISE SOCIAL<span>•</span></p>
        <div><p class="eyebrow">KENDİ ÇEVREN, KENDİ RİTMİN</p><h1 id="brand-title">Daha sakin bir<br>paylaşım alanı.</h1><p class="story-copy">Profilini kur, çevreni seç ve konuşmaları gürültüsüz sürdür.</p></div>
        <p class="story-foot">TR · Gizlilik önce gelir</p>
      </section>
      <section class="auth-form-wrap"><div class="auth-form-inner">
        <p class="step">{{ registerMode() ? 'YENİ HESAP' : 'TEKRAR HOŞ GELDİN' }}</p><h2>{{ registerMode() ? 'Alanını oluştur' : 'Devam etmek için giriş yap' }}</h2>
        @if (demoStatus()?.enabled) {
          <aside class="demo-notice" aria-label="Herkese açık demo bilgisi">
            <strong>Geçici portföy demosu</strong>
            <span>Gerçek ad, e-posta veya kişisel bilgi gönderme. Kayıt için yalnızca kurgusal bir <code>&#64;{{ demoStatus()?.visitorEmailDomain }}</code> adresi kullan.</span>
            <span>Ziyaretçi gönderileri, mesajları, soruları, Hikâyeleri ve yüklenen medyası {{ demoStatus()?.artifactRetentionHours ?? 24 }} saat sonra otomatik olarak kaldırılır.</span>
          </aside>
        }
        @if (verificationSent()) {
          <p class="verification-note" role="status">
            Doğrulama bağlantısı hazır.
            @if (demoStatus()?.enabled) {
              Aşağıdaki geçici demo iletisini aç; doğrulamadan sonra aynı bilgilerle giriş yapabilirsin.
            } @else {
              Yerel demoda <code>src/Host/Api/.local/email-pickup</code> klasöründeki en yeni iletiyi aç.
            }
          </p>
        }
        @if (demoMailbox().length) {
          <div class="demo-mailbox" aria-label="Geçici demo posta kutusu">
            <p>Demo posta kutusu</p>
            @for (message of demoMailbox(); track message.purpose) {
              @if (actionPath(message); as path) {
                <a class="mail-action" [href]="path">{{ message.purpose === 'EmailVerification' ? 'E-posta adresini doğrula' : 'Parola yenileme bağlantısını aç' }}</a>
              }
            }
          </div>
        }
        <form [formGroup]="form" (ngSubmit)="submit()" novalidate>
          @if (registerMode()) { <label>E-posta<input formControlName="email" type="email" autocomplete="email" [placeholder]="demoStatus()?.enabled ? 'ornek@' + demoStatus()?.visitorEmailDomain : ''"></label> }
          <label>Kullanıcı adı veya e-posta<input formControlName="login" autocomplete="username"></label>
          <label>Parola<input formControlName="password" type="password" [attr.autocomplete]="registerMode() ? 'new-password' : 'current-password'"></label>
          @if (!registerMode()) { <label>MFA veya kurtarma kodu <input formControlName="mfaCode" inputmode="numeric" autocomplete="one-time-code" placeholder="Etkinse gerekli"></label> }
          @if (error()) { <p class="form-error" role="alert">{{ error() }}</p> }
          <button class="primary" type="submit" [disabled]="form.invalid || busy()">{{ busy() ? 'İşleniyor…' : registerMode() ? 'Hesap oluştur' : 'Giriş yap' }}</button>
        </form>
        <button class="text-action" type="button" (click)="toggleMode()">{{ registerMode() ? 'Zaten hesabın var mı? Giriş yap' : 'Yeni misin? Hesap oluştur' }}</button>
        @if (!registerMode()) { <a class="text-action" routerLink="/auth/reset-password">Parolanı mı unuttun?</a> }
      </div></section>
    </main>`,
  styleUrl: './login.page.css', changeDetection: ChangeDetectionStrategy.OnPush
})
export class LoginPage implements OnInit {
  readonly registerMode = signal(false); readonly busy = signal(false); readonly error = signal(''); readonly verificationSent = signal(false);
  readonly demoStatus = signal<PublicDemoStatus | null>(null);
  readonly demoMailbox = signal<PublicDemoMailboxMessage[]>([]);
  readonly form = new FormGroup({
    login: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(3)] }),
    email: new FormControl('', { nonNullable: true, validators: [Validators.email] }),
    password: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(12)] }),
    mfaCode: new FormControl('', { nonNullable: true })
  });
  constructor(
    private readonly auth: AuthService,
    private readonly router: Router,
    private readonly route: ActivatedRoute,
  ) {}
  async ngOnInit(): Promise<void> {
    this.demoStatus.set(await this.auth.getPublicDemoStatus().catch(() => ({ enabled: false })));
  }
  toggleMode(): void { this.registerMode.update(value => !value); this.error.set(''); this.verificationSent.set(false); this.demoMailbox.set([]); }
  async submit(): Promise<void> {
    if (this.form.invalid) return; this.busy.set(true); this.error.set('');
    try { const value = this.form.getRawValue(); if (this.registerMode()) { if (!value.email) { this.error.set('E-posta adresi gerekli.'); return; } await this.auth.register(value.login, value.email, value.password); this.verificationSent.set(true); this.registerMode.set(false); this.form.controls.login.setValue(value.email); await this.refreshDemoMailbox(value.email); } else { await this.auth.login(value.login, value.password, value.mfaCode); await this.router.navigateByUrl(this.intendedDestination()); } }
    catch (failure) { this.error.set(this.describeFailure(failure)); const email = this.form.controls.login.value; if (this.demoStatus()?.enabled && email.includes('@')) await this.refreshDemoMailbox(email); }
    finally { this.busy.set(false); }
  }

  private describeFailure(failure: unknown): string {
    if (failure instanceof HttpErrorResponse) {
      const problem = failure.error as { code?: unknown } | null;
      if (problem?.code === 'identity.email_not_verified') {
        return this.demoStatus()?.enabled
          ? 'E-posta doğrulaması bekleniyor. Geçici demo posta kutusundaki bağlantıyı aç.'
          : 'E-posta doğrulaması bekleniyor. Yerel demoda src/Host/Api/.local/email-pickup klasöründeki en yeni bağlantıyı aç.';
      }
      if (problem?.code === 'identity.demo_email_required') {
        return `Herkese açık demoda yalnızca kurgusal @${this.demoStatus()?.visitorEmailDomain ?? 'visitor.escp.test'} adresi kullanılabilir.`;
      }
      if (problem?.code === 'identity.invalid_credentials') {
        return 'Kullanıcı adı/e-posta veya parola eşleşmedi.';
      }
      if (problem?.code === 'identity.account_locked') {
        return 'Hesap geçici olarak kilitli. Bir süre sonra yeniden dene.';
      }
    }
    return 'Bilgiler doğrulanamadı. Alanları kontrol edip yeniden dene.';
  }

  actionPath(message: PublicDemoMailboxMessage): string | null {
    try {
      const url = new URL(message.actionUrl, globalThis.location?.origin ?? 'http://localhost');
      if (url.pathname !== '/auth/verify-email' && url.pathname !== '/auth/reset-password') return null;
      const token = url.searchParams.get('token');
      if (!token || token.length > 512) return null;
      return `${url.pathname}?token=${encodeURIComponent(token)}`;
    } catch { return null; }
  }

  private async refreshDemoMailbox(email: string): Promise<void> {
    if (!this.demoStatus()?.enabled) return;
    this.demoMailbox.set(await this.auth.listPublicDemoMailbox(email).catch(() => []));
  }

  /** Keep protected deep links useful when the current tab has no valid session.
   *  Only accept same-origin application paths; malformed/external values fall
   *  back to the established profile landing page. */
  private intendedDestination(): string {
    const candidate = this.route.snapshot.queryParamMap.get('returnUrl')?.trim();
    if (!candidate || !candidate.startsWith('/') || candidate.startsWith('//') || candidate.startsWith('/giris')) {
      return '/profil';
    }
    return candidate;
  }
}
