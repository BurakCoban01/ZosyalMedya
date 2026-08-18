import { ChangeDetectionStrategy, Component, inject, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { IonButton, IonContent, IonInput, IonItem, IonLabel, IonNote, IonSpinner } from '@ionic/angular/standalone';
import { MobileAuthService } from '../../core/auth/mobile-auth.service';

@Component({
  selector: 'app-mobile-reset-password',
  imports: [ReactiveFormsModule, RouterLink, IonButton, IonContent, IonInput, IonItem, IonLabel, IonNote, IonSpinner],
  template: `
    <ion-content [fullscreen]="true" class="auth-page">
      <main class="auth-stage">
        <header>
          <span class="brand" aria-label="Enterprise Social & Community Platform">ENTERPRISE SOCIAL<span>•</span></span>
          <p>HESAP KURTARMA</p>
          <h1>{{ token ? 'Yeni parolanı belirle.' : 'Sıfırlama bağlantısı iste.' }}</h1>
          <p class="lead">{{ token ? 'En az 12 karakterli yeni bir parola kullan.' : 'E-posta adresine tek kullanımlık bir bağlantı göndereceğiz.' }}</p>
        </header>
        <form [formGroup]="form" (ngSubmit)="submit()">
          @if (!token) {
            <ion-item lines="none"><ion-label position="stacked">E-posta</ion-label><ion-input formControlName="email" type="email" autocomplete="email"></ion-input></ion-item>
          } @else {
            <ion-item lines="none"><ion-label position="stacked">Yeni parola</ion-label><ion-input formControlName="password" type="password" autocomplete="new-password"></ion-input></ion-item>
          }
          @if (message()) { <ion-note [color]="failed() ? 'danger' : 'success'" role="status">{{ message() }}</ion-note> }
          <ion-button expand="block" type="submit" [disabled]="busy() || relevantControlInvalid()">
            @if (busy()) { <ion-spinner name="crescent"></ion-spinner> } @else { {{ token ? 'Parolayı değiştir' : 'Bağlantı gönder' }} }
          </ion-button>
        </form>
        <ion-button fill="clear" expand="block" routerLink="/giris">Girişe dön</ion-button>
      </main>
    </ion-content>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MobileResetPasswordPage {
  private readonly route = inject(ActivatedRoute);
  readonly token = this.route.snapshot.queryParamMap.get('token');
  readonly busy = signal(false);
  readonly failed = signal(false);
  readonly message = signal('');
  readonly form = new FormGroup({
    email: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.email] }),
    password: new FormControl('', { nonNullable: true, validators: [Validators.required, Validators.minLength(12)] })
  });

  constructor(private readonly auth: MobileAuthService) {}

  relevantControlInvalid(): boolean {
    return this.token ? this.form.controls.password.invalid : this.form.controls.email.invalid;
  }

  async submit(): Promise<void> {
    if (this.relevantControlInvalid()) return;
    this.busy.set(true);
    this.failed.set(false);
    this.message.set('');
    try {
      if (this.token) {
        await this.auth.resetPassword(this.token, this.form.controls.password.value);
        this.message.set('Parolan değiştirildi. Şimdi yeni parolanla giriş yapabilirsin.');
      } else {
        await this.auth.requestReset(this.form.controls.email.value);
        this.message.set('Hesap mevcutsa sıfırlama bağlantısı e-posta kutuna gönderildi.');
      }
    } catch {
      this.failed.set(true);
      this.message.set('İşlem tamamlanamadı. Bağlantıyı veya bilgilerini kontrol et.');
    } finally {
      this.busy.set(false);
    }
  }
}
