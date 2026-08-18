import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, signal } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import {
  Api,
  FeatureFlagView,
  listModerationCases,
  ModerationCaseView,
  OperationsDashboard,
  operationsDashboard,
  setFeatureFlag
} from '@platform/api';
import { TokenVault } from '../../core/auth/token-vault.service';

interface PendingFlagChange {
  key: string;
  description: string;
  rolloutPercentage: number;
  enabled: boolean;
}

@Component({
  selector: 'app-operations-page',
  imports: [ReactiveFormsModule, DatePipe],
  template: `
    <header class="page-head">
      <p>OPERASYON MERKEZİ</p>
      <h1>Sağlık, güven ve yapılandırma.</h1>
      <span>Bu alan yalnızca yetkili yönetici rollerine sunulur; hassas ayar değerleri gösterilmez.</span>
    </header>

    @if (message()) {
      <p
        class="message"
        [class.message-error]="messageIsError()"
        [attr.role]="messageIsError() ? 'alert' : 'status'"
        aria-live="polite"
      >{{ message() }}</p>
    }

    @if (loading()) {
      <section class="state-panel" aria-busy="true" aria-live="polite">
        <strong>Yetki ve operasyon verisi doğrulanıyor.</strong>
        <p>Yönetim içeriği izin yanıtı gelmeden gösterilmez.</p>
      </section>
    } @else if (permissionDenied()) {
      <section class="state-panel permission-panel" role="alert">
        <strong>Bu alan için yetkin yok.</strong>
        <p>Operasyon verisi ve yapılandırma kontrolleri yalnızca yönetici rolüne açılır.</p>
      </section>
    } @else if (loadError()) {
      <section class="state-panel error-panel" role="alert">
        <strong>Operasyon verisi yüklenemedi.</strong>
        <p>{{ loadError() }}</p>
        <button class="secondary-button" type="button" (click)="load()">Tekrar dene</button>
      </section>
    } @else if (dashboard(); as data) {
      <section class="metrics" aria-label="Operasyon özeti">
        <article><strong>{{ data.flags.length }}</strong><span>özellik bayrağı</span></article>
        <article><strong>{{ data.settings.length }}</strong><span>korunan sistem ayarı</span></article>
        <article><strong>{{ cases().length }}</strong><span>moderasyon vakası</span></article>
        <article><strong>{{ data.backgroundJobs.length }}</strong><span>arka plan işi</span></article>
      </section>

      <div class="grid">
        <section>
          <p class="eyebrow">ARKA PLAN İŞLERİ</p>
          @for (job of data.backgroundJobs; track job) {
            <div class="row"><strong>{{ job }}</strong><span>izleniyor</span></div>
          } @empty {
            <p class="empty-copy">İzlenen arka plan işi yok.</p>
          }
        </section>
        <section>
          <p class="eyebrow">METRİKLER</p>
          @for (metric of metricEntries(data.metrics); track metric[0]) {
            <div class="row"><strong>{{ metric[0] }}</strong><span>{{ metric[1] }}</span></div>
          } @empty {
            <p class="empty-copy">Henüz sayaç oluşmadı.</p>
          }
        </section>
      </div>

      <section class="flags">
        <p class="eyebrow">ÖZELLİK BAYRAKLARI</p>
        @for (flag of data.flags; track flag.key) {
          <div class="row">
            <span>
              <strong>{{ flag.key }}</strong>
              <small>{{ flag.description }}</small>
            </span>
            <span class="flag-state" [class.flag-enabled]="flag.enabled">
              {{ flag.enabled ? 'Açık' : 'Kapalı' }} · %{{ flag.rolloutPercentage }}
            </span>
          </div>
        } @empty {
          <p class="empty-copy">Tanımlı özellik bayrağı yok.</p>
        }
      </section>

      <section class="flag-editor">
        <div class="section-head">
          <p class="eyebrow">BAYRAK GÜNCELLE</p>
          <p>Değişiklik ancak aşağıdaki özet ayrıca onaylandıktan sonra API'ye gönderilir.</p>
        </div>
        <form [formGroup]="flagForm" (ngSubmit)="requestFlagSave()">
          <label>
            Bayrak anahtarı
            <input formControlName="key" autocomplete="off" placeholder="feature.key">
          </label>
          <label>
            Amaç
            <input formControlName="description" autocomplete="off">
          </label>
          <label>
            Dağıtım yüzdesi
            <input formControlName="rollout" type="number" min="0" max="100">
          </label>
          <label class="toggle">
            <input formControlName="enabled" type="checkbox">
            <span>Etkin</span>
          </label>
          <button class="primary-button" type="submit" [disabled]="flagForm.invalid || saving()">
            Değişikliği gözden geçir
          </button>
        </form>

        @if (pendingFlag(); as pending) {
          <section class="confirmation" aria-labelledby="flag-confirmation-title">
            <div>
              <p class="eyebrow">ONAY GEREKLİ</p>
              <h2 id="flag-confirmation-title">{{ pending.key }}</h2>
              <p>
                Bayrak <strong>{{ pending.enabled ? 'açılacak' : 'kapatılacak' }}</strong>
                ve dağıtım oranı <strong>%{{ pending.rolloutPercentage }}</strong> olacak.
              </p>
              <small>{{ pending.description }}</small>
            </div>
            <div class="confirmation-actions">
              <button class="secondary-button" type="button" [disabled]="saving()" (click)="cancelFlagSave()">
                Vazgeç
              </button>
              <button class="danger-button" type="button" [disabled]="saving()" (click)="confirmFlagSave()">
                {{ saving() ? 'Uygulanıyor…' : 'Onayla ve uygula' }}
              </button>
            </div>
          </section>
        }
      </section>

      <section class="cases">
        <p class="eyebrow">AÇIK MODERASYON VAKALARI</p>
        @for (item of cases(); track item.id) {
          <article>
            <div>
              <small>{{ subjectLabel(item.subjectType) }}</small>
              <h2>{{ statusLabel(item.status) }}</h2>
            </div>
            <time class="case-time" [attr.datetime]="item.updatedAtUtc">
              {{ item.updatedAtUtc | date:'dd MMM · HH:mm' }}
            </time>
            <p>{{ actionSummary(item.actions) }}</p>
          </article>
        } @empty {
          <p class="empty-copy">Açık vaka yok.</p>
        }
      </section>
    }
  `,
  styleUrl: './operations.page.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class OperationsPage implements OnInit {
  readonly dashboard = signal<OperationsDashboard | null>(null);
  readonly cases = signal<ModerationCaseView[]>([]);
  readonly loading = signal(true);
  readonly permissionDenied = signal(false);
  readonly loadError = signal('');
  readonly message = signal('');
  readonly messageIsError = signal(false);
  readonly pendingFlag = signal<PendingFlagChange | null>(null);
  readonly saving = signal(false);

  readonly flagForm = new FormGroup({
    key: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    description: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    rollout: new FormControl(100, {
      nonNullable: true,
      validators: [Validators.required, Validators.min(0), Validators.max(100)]
    }),
    enabled: new FormControl(true, { nonNullable: true })
  });

  constructor(private readonly api: Api, private readonly vault: TokenVault) {}

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.permissionDenied.set(false);
    this.loadError.set('');
    this.message.set('');
    this.messageIsError.set(false);
    this.dashboard.set(null);
    this.cases.set([]);

    if (!this.vault.hasRole('Administrator')) {
      this.permissionDenied.set(true);
      this.loading.set(false);
      return;
    }

    try {
      const [dashboard, cases] = await Promise.all([
        this.api.invoke(operationsDashboard),
        this.api.invoke(listModerationCases, { limit: 50 })
      ]);
      this.dashboard.set(dashboard);
      this.cases.set(cases);
    } catch (error) {
      if (this.isPermissionError(error)) {
        this.permissionDenied.set(true);
      } else {
        this.loadError.set('Bağlantını kontrol edip yeniden dene.');
      }
    } finally {
      this.loading.set(false);
    }
  }

  requestFlagSave(): void {
    if (this.flagForm.invalid || this.saving()) {
      this.flagForm.markAllAsTouched();
      return;
    }
    const value = this.flagForm.getRawValue();
    this.pendingFlag.set({
      key: value.key.trim(),
      description: value.description.trim(),
      rolloutPercentage: value.rollout,
      enabled: value.enabled
    });
    this.message.set('');
    this.messageIsError.set(false);
  }

  cancelFlagSave(): void {
    if (this.saving()) return;
    this.pendingFlag.set(null);
  }

  async confirmFlagSave(): Promise<void> {
    const pending = this.pendingFlag();
    const dashboard = this.dashboard();
    if (!pending || !dashboard || this.saving()) return;
    this.saving.set(true);
    this.message.set('');
    this.messageIsError.set(false);

    try {
      const changed = await this.api.invoke(setFeatureFlag, {
        key: pending.key,
        body: {
          description: pending.description,
          enabled: pending.enabled,
          rolloutPercentage: pending.rolloutPercentage
        }
      });
      this.dashboard.set({
        ...dashboard,
        flags: this.upsertFlag(dashboard.flags, changed)
      });
      this.pendingFlag.set(null);
      this.message.set('Özellik bayrağı kaydedildi ve denetim izine eklendi.');
    } catch (error) {
      if (this.isPermissionError(error)) {
        this.permissionDenied.set(true);
        this.dashboard.set(null);
        this.cases.set([]);
        this.pendingFlag.set(null);
        this.message.set('Yönetici yetkisi doğrulanamadı; korunan kontroller kapatıldı.');
      } else {
        this.message.set('Bayrak güncellenemedi. Değişiklik uygulanmadı.');
      }
      this.messageIsError.set(true);
    } finally {
      this.saving.set(false);
    }
  }

  metricEntries(metrics: { [key: string]: number }): [string, number][] {
    return Object.entries(metrics);
  }

  subjectLabel(value: string): string {
    return ({
      Content: 'İçerik incelemesi',
      User: 'Hesap incelemesi',
      Question: 'Soru incelemesi',
      Message: 'Mesaj incelemesi',
      Community: 'Topluluk incelemesi'
    } as Record<string, string>)[value] ?? 'Moderasyon incelemesi';
  }

  statusLabel(value: string): string {
    return ({
      Open: 'Açık vaka',
      InReview: 'İnceleniyor',
      Actioned: 'İşlem uygulandı',
      Appealed: 'İtiraz incelemede',
      Closed: 'Kapatıldı'
    } as Record<string, string>)[value] ?? value;
  }

  actionSummary(actions: readonly string[]): string {
    if (actions.length === 0) return 'Henüz yaptırım yok';
    const labels: Record<string, string> = {
      Warning: 'Uyarı',
      ContentRemoval: 'İçerik kaldırma',
      TemporaryPublishRestriction: 'Geçici yayınlama kısıtlaması',
      TemporaryMessagingRestriction: 'Geçici mesajlaşma kısıtlaması',
      PermanentRestriction: 'Kalıcı hesap kısıtlaması'
    };
    return actions.map(action => labels[action] ?? 'Diğer yaptırım').join(' · ');
  }

  private upsertFlag(flags: FeatureFlagView[], changed: FeatureFlagView): FeatureFlagView[] {
    const exists = flags.some(flag => flag.key === changed.key);
    return exists
      ? flags.map(flag => flag.key === changed.key ? changed : flag)
      : [...flags, changed];
  }

  private isPermissionError(error: unknown): boolean {
    if (typeof error !== 'object' || error === null || !('status' in error)) return false;
    const status = (error as { status?: unknown }).status;
    return status === 401 || status === 403;
  }
}
