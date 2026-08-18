import { ChangeDetectionStrategy, Component, OnInit, signal, viewChild } from '@angular/core';
import { FormControl, FormGroup, ReactiveFormsModule, Validators } from '@angular/forms';
import { RouterLink } from '@angular/router';
import { Api, ProfileView, updateMyProfile } from '@platform/api';
import { AuthorizedProfileVisualComponent } from '../../core/media/authorized-profile-visual.component';
import { MediaAttachmentPickerComponent } from '../../core/media/media-attachment-picker.component';
import { ShellNavStateService } from '../../layout/shell/navigation/shell-nav-state.service';

@Component({
  selector: 'app-profile-page',
  imports: [ReactiveFormsModule, RouterLink, AuthorizedProfileVisualComponent, MediaAttachmentPickerComponent],
  template: `
    <header class="page-head">
      <div>
        <p class="kicker">PROFİL</p>
        <h1>{{ profile()?.displayName || 'Profilini oluştur' }}</h1>
        @if (profile(); as current) {
          <p class="handle">&#64;{{ current.handle }}</p>
        }
      </div>
      @if (profile(); as current) {
        <div class="head-actions">
          <div class="completion" aria-label="Profil tamamlanma oranı">
            <strong>{{ current.completenessPercentage }}%</strong>
            <span>tamamlandı</span>
          </div>
          @if (!editing()) {
            <a class="secondary-button" [routerLink]="['/profil',current.handle]">Herkese açık görünüm</a>
            <button class="secondary-button" type="button" (click)="beginEdit()">
              Profili düzenle
            </button>
          }
        </div>
      }
    </header>

    @if (loading()) {
      <section class="state-panel" aria-busy="true" aria-live="polite">
        <strong>Profilin hazırlanıyor.</strong>
        <p>Kimlik ve hesap tercihlerin yükleniyor.</p>
      </section>
    } @else if (loadError()) {
      <section class="state-panel error-panel" role="alert">
        <strong>Profil yüklenemedi.</strong>
        <p>{{ loadError() }}</p>
        <button class="secondary-button" type="button" (click)="load()">Tekrar dene</button>
      </section>
    } @else {
      @if (profile(); as current) {
        <section class="profile-summary" aria-label="Profil özeti">
          <zm-authorized-profile-visual [name]="current.displayName" [profileMediaId]="current.profileMediaId ?? null" [coverMediaId]="current.coverMediaId ?? null">
            <div class="identity-copy">
              <div class="name-line">
                <h2>{{ current.displayName }}</h2>
                @if (current.isVerified) {
                  <span class="verified" aria-label="Doğrulanmış profil">Doğrulanmış</span>
                }
              </div>
              <p class="summary-handle">&#64;{{ current.handle }}</p>
              <p class="biography">
                {{ current.biography || 'Henüz bir biyografi eklenmedi.' }}
              </p>
            </div>
          </zm-authorized-profile-visual>

          <dl class="profile-facts">
            <div>
              <dt>Görünürlük</dt>
              <dd>{{ current.isPrivate ? 'Özel profil' : 'Herkese açık profil' }}</dd>
            </div>
            @if (current.location) {
              <div><dt>Konum</dt><dd>{{ current.location }}</dd></div>
            }
            @if (current.organization) {
              <div><dt>Organizasyon</dt><dd>{{ current.organization }}</dd></div>
            }
            @if (websiteHref(current.websiteUrl); as website) {
              <div>
                <dt>Web sitesi</dt>
                <dd>
                  <a [href]="website" target="_blank" rel="noopener noreferrer nofollow">
                    {{ websiteLabel(website) }}
                  </a>
                </dd>
              </div>
            }
          </dl>
        </section>
      } @else {
        <section class="state-panel onboarding">
          <strong>İnsanların seni tanıyacağı alanı oluştur.</strong>
          <p>Görünen adın ve kullanıcı adın zorunlu; diğer bilgileri daha sonra tamamlayabilirsin.</p>
        </section>
      }

      @if (!profile() || editing()) {
        <form [formGroup]="form" (ngSubmit)="save()" class="profile-form">
          <section>
            <p class="section-kicker">KİMLİK</p>
            <h2>Temel bilgiler</h2>
            <p>İnsanların seni bulduğu ve tanıdığı bilgiler.</p>
          </section>
          <div class="fields">
            <label>
              Kullanıcı adı
              <input formControlName="handle" autocomplete="username" aria-describedby="handle-help">
              <small id="handle-help">En az 3 karakter.</small>
            </label>
            <label>
              Görünen ad
              <input formControlName="displayName" autocomplete="name">
            </label>
            <label class="wide">
              Biyografi
              <textarea formControlName="biography" rows="4" maxlength="500"></textarea>
            </label>
            <label>
              Konum
              <input formControlName="location" autocomplete="address-level2">
            </label>
            <label>
              Organizasyon
              <input formControlName="organization" autocomplete="organization">
            </label>
            <label class="wide">
              Web sitesi
              <input formControlName="websiteUrl" type="url" placeholder="https://" autocomplete="url">
            </label>
          </div>

          <section>
            <p class="section-kicker">GÖRSEL KİMLİK</p>
            <h2>Profil ve kapak görseli</h2>
            <p>JPEG, PNG veya WebP yükle. Yeni görsel ancak profil başarıyla kaydedildiğinde kalıcı olur.</p>
          </section>
          <div class="media-fields">
            @if (profile()?.profileMediaId && !removeProfileMedia()) {
              <div class="existing-media"><span>Mevcut profil görseli korunacak.</span><button type="button" [disabled]="saving()" (click)="toggleExistingMedia('profile')">Mevcut görseli kaldır</button></div>
            } @else if (profile()?.profileMediaId) {
              <div class="existing-media removed"><span>Profil görseli kaydettiğinde kaldırılacak.</span><button type="button" [disabled]="saving()" (click)="toggleExistingMedia('profile')">Görseli koru</button></div>
            }
            <zm-media-attachment-picker #profileMediaPicker label="Yeni profil görseli" [visibility]="mediaVisibility()" [maxFiles]="1" [imagesOnly]="true" [disabled]="saving()" (mediaIdsChange)="onProfileMediaIds($event)" (uploadingChange)="setMediaBusy('profile',$event)" />
            @if (profile()?.coverMediaId && !removeCoverMedia()) {
              <div class="existing-media"><span>Mevcut kapak görseli korunacak.</span><button type="button" [disabled]="saving()" (click)="toggleExistingMedia('cover')">Mevcut kapağı kaldır</button></div>
            } @else if (profile()?.coverMediaId) {
              <div class="existing-media removed"><span>Kapak görseli kaydettiğinde kaldırılacak.</span><button type="button" [disabled]="saving()" (click)="toggleExistingMedia('cover')">Kapağı koru</button></div>
            }
            <zm-media-attachment-picker #coverMediaPicker label="Yeni kapak görseli" [visibility]="mediaVisibility()" [maxFiles]="1" [imagesOnly]="true" [disabled]="saving()" (mediaIdsChange)="onCoverMediaIds($event)" (uploadingChange)="setMediaBusy('cover',$event)" />
          </div>

          <section>
            <p class="section-kicker">HESAP</p>
            <h2>Tercihler</h2>
            <p>Gizlilik, dil ve erişilebilirlik tercihleri hesabınla birlikte saklanır. Bu cihazın temasını hesap menüsünden değiştirebilirsin.</p>
          </section>
          <div class="fields compact">
            <label>
              Varsayılan görünüm
              <select formControlName="theme">
                <option value="System">Sistem</option>
                <option value="Light">Açık</option>
                <option value="Dark">Koyu</option>
              </select>
            </label>
            <label>
              Dil
              <select formControlName="language">
                <option value="Turkish">Türkçe</option>
                <option value="English">İngilizce</option>
              </select>
            </label>
            <label class="toggle">
              <input type="checkbox" formControlName="isPrivate">
              <span>Özel profil</span>
            </label>
            @if (privacyLocked()) { <small class="privacy-note">Profil medyası ekliyken kitle değiştirilemez. İki görseli de kaldırıp kaydederek görünürlüğü değiştirebilirsin.</small> }
            <label class="toggle">
              <input type="checkbox" formControlName="reduceMotion">
              <span>Hareketi azalt</span>
            </label>
          </div>

          <footer>
            <p
              [class.success]="saved()"
              [attr.role]="saved() ? 'status' : message() ? 'alert' : null"
              aria-live="polite"
            >{{ message() }}</p>
            <div class="form-actions">
              @if (profile()) {
                <button class="quiet-button" type="button" [disabled]="saving()" (click)="cancelEdit()">
                  Vazgeç
                </button>
              }
              <button class="primary-button" type="submit" [disabled]="form.invalid || saving() || mediaBusy()">
                {{ saving() ? 'Kaydediliyor…' : profile() ? 'Değişiklikleri kaydet' : 'Profili oluştur' }}
              </button>
            </div>
          </footer>
        </form>
      } @else if (message()) {
        <p class="save-status success" role="status" aria-live="polite">{{ message() }}</p>
      }
    }
  `,
  styleUrl: './profile.page.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ProfilePage implements OnInit {
  readonly profile = signal<ProfileView | null>(null);
  readonly loading = signal(true);
  readonly loadError = signal('');
  readonly editing = signal(false);
  readonly saving = signal(false);
  readonly saved = signal(false);
  readonly message = signal('');
  readonly profileMediaIds = signal<string[]>([]);
  readonly coverMediaIds = signal<string[]>([]);
  readonly removeProfileMedia = signal(false);
  readonly removeCoverMedia = signal(false);
  readonly profileMediaBusy = signal(false);
  readonly coverMediaBusy = signal(false);
  readonly mediaBusy = () => this.profileMediaBusy() || this.coverMediaBusy();
  readonly privacyLocked = signal(false);
  private readonly profileMediaPicker = viewChild<MediaAttachmentPickerComponent>('profileMediaPicker');
  private readonly coverMediaPicker = viewChild<MediaAttachmentPickerComponent>('coverMediaPicker');

  readonly form = new FormGroup({
    handle: new FormControl('', {
      nonNullable: true,
      validators: [Validators.required, Validators.minLength(3)]
    }),
    displayName: new FormControl('', { nonNullable: true, validators: [Validators.required] }),
    biography: new FormControl('', { nonNullable: true }),
    location: new FormControl('', { nonNullable: true }),
    organization: new FormControl('', { nonNullable: true }),
    websiteUrl: new FormControl('', { nonNullable: true }),
    isPrivate: new FormControl(false, { nonNullable: true }),
    theme: new FormControl<'System' | 'Light' | 'Dark'>('System', { nonNullable: true }),
    language: new FormControl<'Turkish' | 'English'>('Turkish', { nonNullable: true }),
    reduceMotion: new FormControl(false, { nonNullable: true })
  });

  constructor(
    private readonly api: Api,
    private readonly shellNavState: ShellNavStateService
  ) {}

  ngOnInit(): void {
    void this.load();
  }

  async load(): Promise<void> {
    this.loading.set(true);
    this.loadError.set('');
    this.message.set('');
    this.saved.set(false);
    try {
      const profile = await this.shellNavState.loadProfile();
      this.applyProfile(profile);
      this.editing.set(false);
    } catch (error) {
      if (this.isNotFound(error)) {
        this.profile.set(null);
        this.resetNewProfileForm();
      } else {
        this.loadError.set('Bağlantını kontrol edip profilini yeniden yükle.');
      }
    } finally {
      this.loading.set(false);
    }
  }

  beginEdit(): void {
    const profile = this.profile();
    if (!profile) return;
    this.patchForm(profile);
    this.message.set('');
    this.saved.set(false);
    this.resetMediaDraft();
    this.editing.set(true);
    this.syncPrivacyControl();
  }

  async cancelEdit(): Promise<void> {
    if (this.saving()) return;
    this.saving.set(true);
    await Promise.all([this.profileMediaPicker()?.discard(), this.coverMediaPicker()?.discard()]);
    if ((this.profileMediaPicker()?.attachments().length ?? 0) || (this.coverMediaPicker()?.attachments().length ?? 0)) {
      this.message.set('Yeni profil medyası temizlenemedi. Kaldırmayı yeniden dene.');
      this.saving.set(false);
      return;
    }
    const profile = this.profile();
    if (profile) this.patchForm(profile);
    this.resetMediaDraft();
    this.message.set('');
    this.saved.set(false);
    this.editing.set(false);
    this.saving.set(false);
  }

  async save(): Promise<void> {
    if (this.form.invalid || this.saving() || this.mediaBusy()) {
      this.form.markAllAsTouched();
      return;
    }
    this.saving.set(true);
    this.saved.set(false);
    this.message.set('');
    const avatarTransfer = this.profileMediaPicker()?.transfer();
    const coverTransfer = this.coverMediaPicker()?.transfer();
    try {
      const value = this.form.getRawValue();
      const current = this.profile();
      const profileMediaId = avatarTransfer?.ids[0] ?? (this.removeProfileMedia() ? null : current?.profileMediaId ?? null);
      const coverMediaId = coverTransfer?.ids[0] ?? (this.removeCoverMedia() ? null : current?.coverMediaId ?? null);
      const profile = await this.api.invoke(updateMyProfile, {
        body: {
          ...value,
          websiteUrl: value.websiteUrl || null,
          profileMediaId,
          coverMediaId
        }
      });
      this.applyProfile(profile);
      this.message.set(current ? 'Profil güncellendi.' : 'Profil oluşturuldu.');
      this.saved.set(true);
      this.editing.set(false);
      this.resetMediaDraft();
    } catch {
      await Promise.all([avatarTransfer?.rollback(), coverTransfer?.rollback()]);
      this.message.set('Profil kaydedilemedi. Bilgileri kontrol edip yeniden dene.');
    } finally {
      this.saving.set(false);
    }
  }

  websiteHref(value: string | null | undefined): string | null {
    if (!value) return null;
    try {
      const url = new URL(value);
      return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
    } catch {
      return null;
    }
  }

  websiteLabel(value: string): string {
    try {
      const url = new URL(value);
      return `${url.hostname}${url.pathname === '/' ? '' : url.pathname}`;
    } catch {
      return value;
    }
  }

  mediaVisibility(): 'Public' | 'Followers' { return this.form.controls.isPrivate.value ? 'Followers' : 'Public'; }
  onProfileMediaIds(ids: string[]): void { this.profileMediaIds.set(ids); this.syncPrivacyControl(); }
  onCoverMediaIds(ids: string[]): void { this.coverMediaIds.set(ids); this.syncPrivacyControl(); }
  setMediaBusy(kind: 'profile'|'cover', busy: boolean): void { (kind === 'profile' ? this.profileMediaBusy : this.coverMediaBusy).set(busy); this.syncPrivacyControl(); }
  toggleExistingMedia(kind: 'profile'|'cover'): void {
    (kind === 'profile' ? this.removeProfileMedia : this.removeCoverMedia).update(value => !value);
    this.syncPrivacyControl();
  }

  private applyProfile(profile: ProfileView): void {
    this.profile.set(profile);
    this.patchForm(profile);
    this.shellNavState.syncProfile(profile);
  }

  private patchForm(profile: ProfileView): void {
    this.form.reset({
      handle: profile.handle,
      displayName: profile.displayName,
      biography: profile.biography ?? '',
      location: profile.location ?? '',
      organization: profile.organization ?? '',
      websiteUrl: profile.websiteUrl ?? '',
      isPrivate: profile.isPrivate,
      theme: profile.theme,
      language: profile.language,
      reduceMotion: profile.reduceMotion
    });
  }

  private resetNewProfileForm(): void {
    this.form.reset({
      handle: '',
      displayName: '',
      biography: '',
      location: '',
      organization: '',
      websiteUrl: '',
      isPrivate: false,
      theme: 'System',
      language: 'Turkish',
      reduceMotion: false
    });
  }

  private resetMediaDraft(): void {
    this.profileMediaIds.set([]); this.coverMediaIds.set([]); this.removeProfileMedia.set(false); this.removeCoverMedia.set(false);
    this.profileMediaBusy.set(false); this.coverMediaBusy.set(false); this.privacyLocked.set(false);
    this.form.controls.isPrivate.enable({ emitEvent: false });
  }

  private syncPrivacyControl(): void {
    const current=this.profile();
    const hasProfile=this.profileMediaIds().length>0 || !!current?.profileMediaId && !this.removeProfileMedia();
    const hasCover=this.coverMediaIds().length>0 || !!current?.coverMediaId && !this.removeCoverMedia();
    const locked=hasProfile||hasCover||this.mediaBusy();this.privacyLocked.set(locked);
    if(locked)this.form.controls.isPrivate.disable({emitEvent:false});else this.form.controls.isPrivate.enable({emitEvent:false});
  }

  private isNotFound(error: unknown): boolean {
    return typeof error === 'object' && error !== null && 'status' in error &&
      (error as { status?: unknown }).status === 404;
  }
}
