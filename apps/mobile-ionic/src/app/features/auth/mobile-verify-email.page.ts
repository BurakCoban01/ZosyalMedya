import { ChangeDetectionStrategy, Component, OnInit, signal } from '@angular/core';
import { ActivatedRoute, RouterLink } from '@angular/router';
import { IonButton, IonContent, IonSpinner } from '@ionic/angular/standalone';
import { MobileAuthService } from '../../core/auth/mobile-auth.service';

@Component({
  selector: 'app-mobile-verify-email',
  imports: [RouterLink, IonButton, IonContent, IonSpinner],
  template: `
    <ion-content [fullscreen]="true" class="auth-page">
      <main class="auth-stage" aria-live="polite">
        <header>
          <span class="brand" aria-label="Enterprise Social & Community Platform">ENTERPRISE SOCIAL<span>•</span></span>
          <p>E-POSTA DOĞRULAMA</p>
          <h1>{{ title() }}</h1>
          <p class="lead">{{ detail() }}</p>
        </header>
        @if (busy()) { <ion-spinner name="crescent" aria-label="Doğrulanıyor"></ion-spinner> }
        @if (!busy()) { <ion-button expand="block" routerLink="/giris">Girişe dön</ion-button> }
      </main>
    </ion-content>
  `,
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MobileVerifyEmailPage implements OnInit {
  readonly busy = signal(true);
  readonly title = signal('Bağlantı doğrulanıyor.');
  readonly detail = signal('Bu işlem yalnızca birkaç saniye sürer.');

  constructor(private readonly route: ActivatedRoute, private readonly auth: MobileAuthService) {}

  async ngOnInit(): Promise<void> {
    const token = this.route.snapshot.queryParamMap.get('token');
    if (!token) {
      this.fail('Doğrulama bağlantısında token bulunamadı.');
      return;
    }

    try {
      await this.auth.verifyEmail(token);
      this.title.set('E-posta doğrulandı.');
      this.detail.set('Hesabın hazır. Artık güvenle giriş yapabilirsin.');
    } catch {
      this.fail('Bağlantının süresi dolmuş veya bağlantı daha önce kullanılmış olabilir.');
    } finally {
      this.busy.set(false);
    }
  }

  private fail(detail: string): void {
    this.title.set('Doğrulama tamamlanamadı.');
    this.detail.set(detail);
    this.busy.set(false);
  }
}
