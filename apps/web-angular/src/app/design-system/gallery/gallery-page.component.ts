import { ChangeDetectionStrategy, Component, effect, inject, signal, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, convertToParamMap } from '@angular/router';
import { map, of } from 'rxjs';
import { ZM_COLOR, ZM_DURATION, ZM_DURATION_MS, ZM_EASE, ZM_EASE_BEZIER, ZM_ELEVATION, ZM_RADIUS_ROLE, ZM_TEXT_SIZE } from '../tokens';
import { ZmMotifComponent, type ZmMotifName } from '../iconography';
import { ZmButtonComponent, ZmIconButtonComponent } from '../primitives/button';
import { ZmInputComponent, ZmTextareaComponent, ZmSelectComponent } from '../primitives/form-controls';
import {
  ZmCheckboxComponent,
  ZmRadioComponent,
  ZmSwitchComponent,
  ZmSegmentedComponent,
  ZmSegment,
} from '../primitives/selection-controls';
import {
  ZmTooltipComponent,
  ZmMenuComponent,
  ZmDialogComponent,
  ZmSheetComponent,
} from '../primitives/overlays';
import {
  ZmToastComponent,
  ZmSkeletonComponent,
  ZmEmptyStateComponent,
  ZmErrorStateComponent,
  ZmPermissionStateComponent,
} from '../primitives/feedback-states';
import {
  ZmAvatarComponent,
  ZmChipComponent,
  ZmStatusComponent,
} from '../primitives/identity';

/**
 * Internal design-system gallery — M1 reference surface.
 *
 * Purpose: validate the semantic `--zm-*` token set under real contrast and
 * cascade (VAL-DS-001 every token resolves; VAL-DS-003 warm-neutral canvas,
 * coral brand, readable ink >= 4.5:1) and the typography system under real
 * rendering (VAL-DS-008 three font roles; VAL-DS-009 Turkish glyphs; VAL-DS-010
 * responsive clamp scale; VAL-DS-011 long-form measure 68–72ch). NOT a product
 * surface — internal/dev reference only. Consumes ONLY `--zm-*` tokens
 * (semantic + component layers); no hardcoded hex anywhere in this component.
 *
 * The full primitive/state gallery (deep-linkable, every primitive × state)
 * lands in a later M1 feature; this is the shell + reference button that
 * first applies and verifies the light theme and the typography system.
 */
interface Swatch {
  /** Human role label (Turkish). */
  readonly role: string;
  /** CSS custom-property name, e.g. `--zm-canvas`. */
  readonly token: string;
  /** Inline `var(...)` value bound to the chip background (live cascade). */
  readonly value: string;
  /** Short Turkish note describing intent. */
  readonly note: string;
}

/** Typography role sample for the VAL-DS-008/009 panel. */
interface FontRoleSample {
  /** Role key (ui | display | mono). */
  readonly role: 'ui' | 'display' | 'mono';
  /** Turkish label shown as the section heading. */
  readonly label: string;
  /** CSS custom-property name (e.g. --zm-font-ui; pulled from ZM_FONT). */
  readonly token: string;
  /** Turkish sample text exercising the glyph set: Ç Ğ İ Ş ç ğ ı ö ş ü. */
  readonly sample: string;
  /** Short Turkish note describing the role. */
  readonly note: string;
}

/** Type-scale step for the VAL-DS-010 panel. */
interface ScaleStep {
  /** Step name (xs..display). */
  readonly step: string;
  /** CSS custom-property name (pulled from ZM_TEXT_SIZE — never a literal). */
  readonly token: string;
  /** Turkish sample. */
  readonly sample: string;
}

/** Radius role sample for the design-system §5 shape panel. */
interface RadiusRoleSample {
  /** Role key (control | field | card | sheet). */
  readonly role: string;
  /** CSS custom-property name (pulled from ZM_RADIUS_ROLE — never a literal). */
  readonly token: string;
  /** Turkish role label. */
  readonly label: string;
}

/** Material-depth tier sample for the design-system §6 elevation panel. */
interface MaterialLayerSample {
  /** Tier key (canvas..urgent). */
  readonly tier: string;
  /** z-index value for the tier (documentation, shown alongside the tile). */
  readonly z: number;
  /** Elevation shadow token name (pulled from ZM_ELEVATION — never a literal). */
  readonly elev: string;
  /** Surface tone token name (pulled from ZM_COLOR — never a literal). */
  readonly surface: string;
  /** Turkish tier label. */
  readonly label: string;
}

/** Motion duration token sample for the VAL-DS-012 panel. */
interface MotionDurationSample {
  /** Role key (instant | fast | base | slow | scene). */
  readonly role: string;
  /** CSS custom-property name (pulled from ZM_DURATION — never a literal). */
  readonly token: string;
  /** Canonical nominal ms (mirrors tokens.css + ZM_DURATION_MS). */
  readonly ms: number;
  /** Turkish use-case label (04-MOTION-INTERACTION sec.4). */
  readonly use: string;
}

/** Motion ease token sample for the VAL-DS-012 panel. */
interface MotionEaseSample {
  /** Role key (standard | enter | exit | emphasized). */
  readonly role: string;
  /** CSS custom-property name (pulled from ZM_EASE — never a literal). */
  readonly token: string;
  /** Cubic-bezier control points (mirrors ZM_EASE_BEZIER). */
  readonly bezier: readonly [number, number, number, number];
  /** Turkish use-case label. */
  readonly use: string;
}

@Component({
  selector: 'zm-gallery-page',
  standalone: true,
  imports: [
    ZmButtonComponent,
    ZmIconButtonComponent,
    ZmInputComponent,
    ZmTextareaComponent,
    ZmSelectComponent,
    ZmCheckboxComponent,
    ZmRadioComponent,
    ZmSwitchComponent,
    ZmSegmentedComponent,
    ZmTooltipComponent,
    ZmMenuComponent,
    ZmDialogComponent,
    ZmSheetComponent,
    ZmToastComponent,
    ZmSkeletonComponent,
    ZmEmptyStateComponent,
    ZmErrorStateComponent,
    ZmPermissionStateComponent,
    ZmAvatarComponent,
    ZmChipComponent,
    ZmStatusComponent,
    ZmMotifComponent,
  ],
  styleUrl: './gallery-page.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="gallery">
      <header class="gallery__head">
        <!--
          Signature motif accent (VAL-DS-033/034): a signal-arc sits in the
          header corner — a non-text region — as ornament. It is decorative
          (aria-hidden) and never underlies the title/lede text, so contrast
          is unaffected. This is the canonical "motif in header" position.
        -->
        <zm-motif class="gallery__head-accent" name="signal-arc" [size]="'clamp(4rem, 10vw, 6.5rem)'"></zm-motif>
        <p class="eyebrow">Tasarım sistemi · Temel</p>
        <h1 class="gallery__title">Yaşayan Editöryel Ağ</h1>
        <p class="gallery__lede">
          Sıcak nötr zemin, mercan marka ve okunaklı mürekkep. Bu yüz, ışık
          temalı anlamsal <code>--zm-*</code> simgelerinin gerçek karşıtlıkta
          doğrulandığı referans alanıdır.
        </p>
        <p class="gallery__deeplink" aria-live="polite">
          <span class="gallery__deeplink-label">Derin bağlantı:</span>
          <code>/_design?prim=motif</code>
          · aktif süzgeç: <code>{{ prim() || '—' }}</code>{{ state() ? ' · durum: ' + state() : '' }}
        </p>
      </header>

      <!-- Reference component: button variants consuming the component layer -->
      <section class="panel" aria-labelledby="gallery-ref-heading" data-panel="ref"
               [hidden]="!panelVisible('ref','reference')">
        <h2 id="gallery-ref-heading">Referans bileşen</h2>
        <p class="panel__hint">
          Düğmeler yalnızca <code>--zm-button-*</code> bileşen katmanını kullanır;
          bu katman <code>--zm-brand</code>, <code>--zm-brand-on</code> ve
          <code>--zm-text-*</code> anlamsal rollerini birleştirir.
        </p>
        <p class="readable">
          Bu paragraf, <code>--zm-text-1</code> mürekkebini
          <code>--zm-canvas</code> zemininde ölçer. Yaşayan Editöryel Ağ, sakin
          okuma yüzeylerini canlı sosyal sinyallerle birleştirir; metin her
          zaman önceliklidir ve <strong>en az 4,5:1 karşıtlıkta</strong> okunur.
        </p>
        <div class="ref-actions">
          <button type="button" class="zm-btn zm-btn--primary">Yayınla</button>
          <button type="button" class="zm-btn zm-btn--secondary">İptal</button>
          <button type="button" class="zm-btn zm-btn--quiet">Daha fazla</button>
          <button type="button" class="zm-btn zm-btn--primary" disabled>
            Bekleniyor
          </button>
        </div>
      </section>

      <!--
        Düğmeler paneli — VAL-DS-018 (variant × state matrix), VAL-DS-019
        (loading preserves width + accessible name), VAL-DS-020 (icon buttons:
        aria-label + 44×44 target + tooltip). Uses the REAL primitive
        components <zm-button> / <zm-icon-button>, not the class-based reference
        row above (which is the VAL-DS-003 pixel-sampling target).
      -->
      <section class="panel" aria-labelledby="gallery-buttons-heading" data-panel="button"
               [hidden]="!panelVisible('button')">
        <h2 id="gallery-buttons-heading">Düğmeler</h2>
        <p class="panel__hint">
          Dört varyant — <strong>birincil</strong>, <strong>ikincil</strong>,
          <strong>sessiz</strong>, <strong>tehlike</strong> — ve her varyant için
          dinlenme, seçili (<code>aria-pressed</code>), devre dışı ve yükleniyor
          durumları. Yüklenirken düğme genişliği ve erişilebilir adı korunur
          (VAL-DS-019).
        </p>

        <div class="zm-matrix" role="table" aria-label="Düğme varyant ve durum matrisi">
          <div class="zm-matrix__head" role="row">
            <span role="columnheader">Varyant \ Durum</span>
            <span role="columnheader">Dinlenme</span>
            <span role="columnheader">Seçili</span>
            <span role="columnheader">Devre dışı</span>
            <span role="columnheader">Yükleniyor</span>
          </div>
          @for (row of buttonMatrix; track row.variant) {
            <div class="zm-matrix__row" role="row">
              <span class="zm-matrix__label" role="rowheader">{{ row.label }}</span>
              <span class="zm-matrix__cell" role="cell">
                <zm-button [variant]="row.variant">Eylem</zm-button>
              </span>
              <span class="zm-matrix__cell" role="cell">
                <zm-button [variant]="row.variant" [selected]="true">Eylem</zm-button>
              </span>
              <span class="zm-matrix__cell" role="cell">
                <zm-button [variant]="row.variant" [disabled]="true">Eylem</zm-button>
              </span>
              <span class="zm-matrix__cell" role="cell">
                @if (row.variant !== 'quiet') {
                  <zm-button [variant]="row.variant" [loading]="true">Eylem</zm-button>
                } @else {
                  <span class="zm-matrix__na" aria-label="Sessiz varyant yüklenmez">—</span>
                }
              </span>
            </div>
          }
        </div>

        <h3 class="type-subhead">Yükleniyor · genişlik koruması</h3>
        <p class="panel__hint">
          Aşağıdaki düğme yüklenirken etiketini <code>opacity: 0</code> ile
          gizler (asla <code>display:none</code> veya <code>visibility:hidden</code>);
          böylece hem kutu genişliği hem de erişilebilir adı korunur. Genişlik
          farkı bir pikselden azdır (VAL-DS-019).
        </p>
        <div class="zm-loading-demo">
          <zm-button [loading]="loadingDemo()" (clicked)="onToggleLoadingDemo()">
            Yayınla
          </zm-button>
          <button
            type="button"
            class="zm-btn zm-btn--quiet zm-feedback"
            (click)="onToggleLoadingDemo()"
          >
            Yüklemeyi {{ loadingDemo() ? 'kapat' : 'aç' }}
          </button>
          <span class="zm-loading-demo__state" aria-live="polite">
            {{ loadingDemo() ? 'Yükleniyor · aria-busy=true · disabled' : 'Dinlenme' }}
          </span>
        </div>

        <h3 class="type-subhead">Hata ve yüksek karşıtlık</h3>
        <p class="panel__hint">
          Hata durumu, tehlike halkasını varyant rengiyle birleştirir; yüksek
          karşıtlık, yapısal sınırı güçlendirir. Durum asla yalnızca renkle
          iletilmez (halka/konum/herz zaman görünür).
        </p>
        <div class="ref-actions">
          <zm-button variant="secondary" [error]="true">Tekrar dene</zm-button>
          <zm-button variant="primary" [highContrast]="true">Vurgula</zm-button>
          <zm-button variant="secondary" [highContrast]="true">İkincil</zm-button>
        </div>
      </section>

      <!--
        Simgeli düğmeler paneli — VAL-DS-020: her simgeli düğme erişilebilir ada
        (aria-label) sahip, 44×44 hedef boyutunu karşılar ve üzerine gelince /
        odakta aynı adı taşıyan bir araç ipucu gösterir.
      -->
      <section class="panel" aria-labelledby="gallery-icon-buttons-heading" data-panel="icon-button"
               [hidden]="!panelVisible('icon-button','iconbutton')">
        <h2 id="gallery-icon-buttons-heading">Simgeli düğmeler</h2>
        <p class="panel__hint">
          Her simgeli düğme zorunlu bir <code>aria-label</code> taşır (giriş
          <code>required</code>; adsız simgesel düğme derleme hatasıdır). Hedef
          <code>--zm-button-icon-size</code> ile 44×44 CSS pikseli altına
          düşmez. Klavye odağında ve üzerine gelince aynı adı taşıyan araç
          ipucu belirir.
        </p>

        <div class="ref-actions zm-icon-row">
          <zm-icon-button ariaLabel="Beğen" [pressed]="likedDemo()" (clicked)="onToggleLiked()">
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path
                [attr.d]="likedDemo() ? 'M12 21s-7-4.5-9.5-9C1 9 2.5 5.5 6 5.5c2 0 3.2 1.2 4 2.4.8-1.2 2-2.4 4-2.4 3.5 0 5 3.5 3.5 6.5C19 16.5 12 21 12 21z' : 'M12 21s-7-4.5-9.5-9C1 9 2.5 5.5 6 5.5c2 0 3.2 1.2 4 2.4.8-1.2 2-2.4 4-2.4 3.5 0 5 3.5 3.5 6.5'"
                [attr.fill]="likedDemo() ? 'currentColor' : 'none'"
                stroke="currentColor"
                stroke-width="2"
              />
            </svg>
          </zm-icon-button>

          <zm-icon-button ariaLabel="Kaydet" variant="secondary" [pressed]="savedDemo()" (clicked)="onToggleSaved()">
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path
                [attr.d]="savedDemo() ? 'M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z' : 'M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z'"
                [attr.fill]="savedDemo() ? 'currentColor' : 'none'"
                stroke="currentColor"
                stroke-width="2"
              />
            </svg>
          </zm-icon-button>

          <zm-icon-button ariaLabel="Paylaş" tooltip="Paylaş veya bağlantıyı kopyala">
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <circle cx="6" cy="12" r="2.5" fill="currentColor" />
              <circle cx="18" cy="6" r="2.5" fill="currentColor" />
              <circle cx="18" cy="18" r="2.5" fill="currentColor" />
              <line x1="8" y1="11" x2="16" y2="7" stroke="currentColor" stroke-width="1.6" />
              <line x1="8" y1="13" x2="16" y2="17" stroke="currentColor" stroke-width="1.6" />
            </svg>
          </zm-icon-button>

          <zm-icon-button ariaLabel="Sil" variant="danger" [error]="true">
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M5 7h14M10 7V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2M7 7l1 13h8l1-13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
            </svg>
          </zm-icon-button>

          <zm-icon-button ariaLabel="Birincil eylem" variant="primary" [highContrast]="true">
            <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
              <path d="M12 4v16M4 12h16" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" />
            </svg>
          </zm-icon-button>
        </div>

        <p class="panel__hint">
          Beğen ve Kaydet düğmeleri <code>aria-pressed</code> iki durumlu
          davranışını gösterir; üzerine gelin veya klavyeyle odaklayın — araç
          ipucu erişilebilir adın aynısını taşır.
        </p>
      </section>

      <!--
        Form denetimleri paneli — VAL-DS-021 (persistent label + tied error),
        VAL-DS-022 (password reveal with safe focus/state), VAL-DS-023
        (focus-visible / disabled / error / high-contrast coverage). Uses the
        REAL primitives <zm-input> / <zm-textarea> / <zm-select> so the gallery
        is the browser-QA surface for the contract.
      -->
      <section class="panel" aria-labelledby="gallery-form-heading" data-panel="form"
               [hidden]="!panelVisible('form','input','textarea','select')">
        <h2 id="gallery-form-heading">Form denetimleri</h2>
        <p class="panel__hint">
          Her alan kalıcı bir <code>&lt;label&gt;</code> taşır (yer tutucu asla
          tek başına etiket değildir); hata <code>aria-describedby</code> ile
          alana bağlanır ve <code>aria-invalid</code> işaretlenir. Şifre alanı,
          odağı denetim grubunda tutan güvenli bir göster/gizle düğmesi taşır.
        </p>

        <h3 class="type-subhead">ZmInput · metin / e-posta / şifre</h3>
        <div class="zm-form__grid">
          <zm-input
            label="E-posta"
            type="email"
            inputmode="email"
            autocomplete="email"
            [helper]="'user@ornek.com biçiminde'"
            placeholder="user@ornek.com"
            [value]="emailValue()"
            (valueChange)="emailValue.set($event)"
          ></zm-input>

          <zm-input
            label="Yaşadığı şehir"
            [helper]="'Herkes açık görünür'"
            placeholder="İstanbul"
            [value]="cityValue()"
            (valueChange)="cityValue.set($event)"
          ></zm-input>

          <zm-input
            label="Şifre"
            type="password"
            autocomplete="current-password"
            [helper]="'En az 8 karakter'"
            [value]="passwordValue()"
            (valueChange)="passwordValue.set($event)"
          ></zm-input>

          <zm-input
            label="Hatalı e-posta"
            type="email"
            value="gecersiz-deger"
            [error]="'Geçerli bir e-posta adresi girin.'"
          ></zm-input>

          <zm-input label="Devre dışı alan" value="dokunulamaz" [disabled]="true"></zm-input>

          <zm-input label="Vurgulu alan" value="görsel üzerinde" [highContrast]="true"></zm-input>
        </div>

        <h3 class="type-subhead">Şifre · göster/gizle (VAL-DS-022)</h3>
        <p class="panel__hint">
          Aşağıdaki düğmeye basın: <code>type</code> <code>password</code> ↔
          <code>text</code> arasında döner; <code>aria-pressed</code> ve
          <code>aria-label</code> durumu yansıtır; odağı alan grubunda tutar.
          İlk tür her zaman <code>password</code> olur (otomatik gösterme yok).
        </p>
        <div class="zm-form__single">
          <zm-input
            label="Hesap parolası"
            type="password"
            [value]="passwordValue()"
            (valueChange)="passwordValue.set($event)"
          ></zm-input>
        </div>

        <h3 class="type-subhead">ZmTextarea · çok satırlı</h3>
        <div class="zm-form__grid">
          <zm-textarea
            label="Kısa bio"
            [rows]="4"
            [maxlength]="280"
            [helper]="'Maks 280 karakter · ' + (bioValue().length) + '/280'"
            placeholder="Yaşayan editöryel ağ için yazın…"
            [value]="bioValue()"
            (valueChange)="bioValue.set($event)"
          ></zm-textarea>

          <zm-textarea
            label="Hatalı bio"
            [rows]="3"
            value="kısa"
            [error]="'Bio en az 10 karakter olmalı.'"
          ></zm-textarea>

          <zm-textarea label="Devre dışı not" [rows]="3" value="kilitli" [disabled]="true"></zm-textarea>
        </div>

        <h3 class="type-subhead">ZmSelect · tek seçim</h3>
        <div class="zm-form__grid">
          <zm-select
            label="Görünürlük"
            [helper]="'Bu gönderiyi kimler görebilir?'"
            [value]="selectValue()"
            (valueChange)="selectValue.set($event)"
          >
            <option value="">Seçin…</option>
            <option value="public">Herkese açık</option>
            <option value="followers">Takipçiler</option>
            <option value="close">Yakın arkadaşlar</option>
            <option value="private">Yalnız ben</option>
          </zm-select>

          <zm-select label="Hatalı seçim" [error]="'Bir görünürlük seçmelisin.'">
            <option value="">Seçin…</option>
            <option value="public">Herkese açık</option>
          </zm-select>

          <zm-select label="Devre dışı seçim" [disabled]="true">
            <option value="public">Herkese açık</option>
          </zm-select>
        </div>

        <p class="zm-form__state" aria-live="polite">
          email=<code>{{ emailValue() || '—' }}</code> · şifre uzunluğu=<code>{{ passwordValue().length }}</code>
          · bio=<code>{{ bioValue().length }}/280</code> · görünürlük=<code>{{ selectValue() || '—' }}</code>
        </p>
      </section>

      <!--
        Seçim denetimleri paneli — VAL-DS-024 (checkbox / radio / switch expose
        state + labels, non-color cues) and VAL-DS-025 (segmented: single/multi
        selection + current choice exposed to AT + keyboard operable). Uses the
        REAL primitives <zm-checkbox> / <zm-radio> / <zm-switch> /
        <zm-segmented> so the gallery is the browser-QA surface for the contract.
      -->
      <section class="panel" aria-labelledby="gallery-selection-heading" data-panel="selection"
               [hidden]="!panelVisible('selection','checkbox','radio','switch','segmented')">
        <h2 id="gallery-selection-heading">Seçim denetimleri</h2>
        <p class="panel__hint">
          Onay kutusu, radyo ve anahtar; durumu simge + konum + metinle iletir
          (asla yalnızca renkle). Bölümlenmiş denetim, tekli/çoklu seçimi
          <code>aria-checked</code> ve <code>aria-current</code> ile erişilebilir
          teknolojiye sunar; ok, Home/End, Boşluk ve Enter ile çalışır.
        </p>

        <h3 class="type-subhead">ZmCheckbox · onay / yarı-seçili / devre dışı</h3>
        <div class="zm-form__grid">
          <zm-checkbox
            label="Kullanım koşullarını kabul ediyorum"
            [helper]="'Hesabını oluşturmak için gerekli'"
            [checked]="termsChecked()"
            (checkedChange)="termsChecked.set($event)"
          ></zm-checkbox>

          <zm-checkbox
            label="Tüm bildirimleri seç (yarı-seçili)"
            [indeterminate]="true"
            [helper]="'Bazı bildirimler açık'"
          ></zm-checkbox>

          <zm-checkbox label="Kilitli tercih" [checked]="true" [disabled]="true"></zm-checkbox>

          <zm-checkbox
            label="Yaş onayı zorunlu"
            [required]="true"
            [error]="'Devam etmek için onaylamalısın.'"
          ></zm-checkbox>
        </div>

        <h3 class="type-subhead">ZmRadio · görünürlük grubu (ok tuşlarıyla döner)</h3>
        <p class="panel__hint">
          Her radyo aynı <code>name</code> ile gruplanır; tarayıcı ok tuşlarıyla
          grup içinde döner. Seçili seçenek dolu halka + merkez noktasıyla
          okunur (renk dışı işaret).
        </p>
        <div class="zm-selection__group" role="presentation">
          <zm-radio
            name="gallery-visibility"
            value="public"
            label="Herkese açık"
            [helper]="'Herkes görebilir'"
            [checked]="radioVisibility() === 'public'"
            (selected)="radioVisibility.set($event)"
          ></zm-radio>
          <zm-radio
            name="gallery-visibility"
            value="followers"
            label="Takipçiler"
            [helper]="'Yalnız takipçilerin'"
            [checked]="radioVisibility() === 'followers'"
            (selected)="radioVisibility.set($event)"
          ></zm-radio>
          <zm-radio
            name="gallery-visibility"
            value="close"
            label="Yakın arkadaşlar"
            [helper]="'Sınırlı çevre'"
            [checked]="radioVisibility() === 'close'"
            (selected)="radioVisibility.set($event)"
          ></zm-radio>
          <zm-radio name="gallery-visibility" value="private" label="Yalnız ben" [disabled]="true"></zm-radio>
        </div>

        <h3 class="type-subhead">ZmSwitch · açık/kapalı + yükleniyor</h3>
        <div class="zm-form__grid">
          <zm-switch
            label="Karanlık tema"
            [helper]="'Gözü yormayan yüz'"
            [checked]="switchDark()"
            (checkedChange)="switchDark.set($event)"
          ></zm-switch>

          <zm-switch
            label="İki adımlı doğrulama"
            [helper]="'Kaydediliyor…'"
            [loading]="switchLoading()"
            [checked]="switchMfa()"
            (checkedChange)="switchMfa.set($event)"
          ></zm-switch>

          <zm-switch label="Bildirim sesi" [checked]="true"></zm-switch>
          <zm-switch label="Kilitli anahtar" [disabled]="true"></zm-switch>
        </div>
        <p class="zm-form__state" aria-live="polite">
          <button
            type="button"
            class="zm-btn zm-btn--quiet zm-feedback"
            (click)="switchLoading.set(!switchLoading())"
          >
            MFA yüklemeyi {{ switchLoading() ? 'kapat' : 'aç' }}
          </button>
        </p>

        <h3 class="type-subhead">ZmSegmented · tekli seçim (radyo grubu)</h3>
        <p class="panel__hint">
          Aktif segment <strong>kabartılır</strong> ve marka çubuğuyla
          <strong>altı çizilir</strong> (konum işareti — renk dışı). Ok tuşları
          hem odağı hem seçimi taşır; Tab yalnızca aktif segmente girer.
        </p>
        <div class="zm-selection__segmented">
          <zm-segmented
            label="Akış görünümü"
            variant="single"
            [segments]="viewSegments"
            [value]="segView()"
            (valueChange)="segView.set($event)"
          ></zm-segmented>
        </div>

        <h3 class="type-subhead">ZmSegmented · çoklu seçim (onay kutusu grubu)</h3>
        <p class="panel__hint">
          Çoklu kipte her segment <code>role=checkbox</code>; Boşluk/Enter
          üyeliği değiştirir, ok tuşları odağı taşır. Seçili segmentlerde onay
          işareti belirir (renk dışı pekiştirme).
        </p>
        <div class="zm-selection__segmented">
          <zm-segmented
            label="İçerik süzgeçleri"
            variant="multi"
            [segments]="filterSegments"
            [values]="segFilters()"
            (valuesChange)="segFilters.set($event)"
          ></zm-segmented>
        </div>

        <h3 class="type-subhead">ZmSegmented · hata ve devre dışı</h3>
        <div class="zm-form__grid">
          <zm-segmented
            label="Hatalı seçim"
            variant="single"
            [segments]="viewSegments"
            [value]="segView()"
            [error]="'En az bir görünüm seçmelisin.'"
            (valueChange)="segView.set($event)"
          ></zm-segmented>
          <zm-segmented
            label="Devre dışı seçim"
            variant="single"
            [segments]="viewSegments"
            [value]="segView()"
            [disabled]="true"
          ></zm-segmented>
        </div>

        <p class="zm-form__state" aria-live="polite">
          koşullar=<code>{{ termsChecked() ? '✓' : '—' }}</code> · radyo=<code>{{ radioVisibility() || '—' }}</code>
          · tema=<code>{{ switchDark() ? 'karanlık' : 'aydınlık' }}</code> · görünüm=<code>{{ segView() || '—' }}</code>
          · süzgeçler=<code>{{ segFilters().length ? segFilters().join('+') : '—' }}</code>
        </p>
      </section>

      <!--
        Overlays panel — VAL-DS-026 (focus trap + Escape + return focus) and
        VAL-DS-027 (outside-click + scroll lock). Uses the REAL primitives
        <zm-tooltip> / <zm-menu> / <zm-dialog> / <zm-sheet> so the gallery is
        the browser-QA surface for the overlay contract. Each overlay:
          - moves focus inside on open, traps Tab, closes on Escape, returns
            focus to the trigger;
          - dismisses on outside pointer-down (scrim for dialog/sheet;
            transparent backdrop for menu) and locks background scroll;
          - the destructive dialog (dismissible=false) ignores scrim + Escape.
      -->
      <section class="panel" aria-labelledby="gallery-overlays-heading" data-panel="overlay"
               [hidden]="!panelVisible('overlay','tooltip','menu','dialog','sheet')">
        <h2 id="gallery-overlays-heading">Yer paylaşımı</h2>
        <p class="panel__hint">
          Araç ipucu (<strong>tooltip</strong>), menü, diyalog ve levha
          (<strong>sheet</strong>). Her biri odağı içeri taşır, Tab döngüsünü
          kilitler, <code>Escape</code> ile kapanır ve odağı tetikleyiciye
          geri verir. Diyalog ve levha, dış tıklama ile kapanır ve arka plan
          kaydırmasını kilitler. Yıkıcı diyalog, dış tıklamayı ve Escape'i
          yok sayar.
        </p>

        <h3 class="type-subhead">ZmTooltip · üzerine gel / odakla</h3>
        <div class="zm-overlay-row">
          <zm-tooltip text="Bu düğme gönderiyi kaydeder" side="top">
            <button type="button" class="zm-btn zm-btn--secondary zm-feedback">Üzerine gel</button>
          </zm-tooltip>
          <zm-tooltip text="Klavyeyle odaklayın · araç ipucu belirir" side="right">
            <button type="button" class="zm-btn zm-btn--quiet zm-feedback">Klavyeyle dene</button>
          </zm-tooltip>
        </div>
        <p class="panel__hint">
          Tetikleyici <code>aria-describedby</code> ile ipucu metnini taşır;
          ekran okuyucu, ipucu görünmese de metni duyurur.
        </p>

        <h3 class="type-subhead">ZmMenu · tetikleyiciye bağlı açılır liste</h3>
        <div class="zm-overlay-row">
          <button
            type="button"
            class="zm-btn zm-btn--secondary zm-feedback"
            #menuTrigger
            data-testid="gallery-menu-trigger"
            (click)="menu.open(menuTrigger)"
          >
            Eylemler menüsü
          </button>
          <zm-menu #menu label="Gönderi eylemleri">
            <div role="menuitem" class="zm-menu__item" tabindex="-1" (click)="onMenuAction('Düzenle'); menu.close()">
              Düzenle
            </div>
            <div role="menuitem" class="zm-menu__item" tabindex="-1" (click)="onMenuAction('Paylaş'); menu.close()">
              Paylaş
            </div>
            <div role="menuitem" class="zm-menu__item" tabindex="-1" aria-disabled="true">
              Bağlantıyı kopyala (devre dışı)
            </div>
            <div role="menuitem" class="zm-menu__item" tabindex="-1" (click)="onMenuAction('Sil'); menu.close()">
              Sil
            </div>
          </zm-menu>
        </div>
        <p class="panel__hint">
          Aç tuşuna basın, sonra ok tuşlarıyla (aşağı/yukarı/Home/End) gezin.
          Boşluk/Enter bir öğeyi çalıştırır; <code>Escape</code> kapatır ve
          odağı tetikleyiciye geri verir. Dışarı tıklamak menüyü kapatır.
        </p>

        <h3 class="type-subhead">ZmDialog · onay diyalogu</h3>
        <div class="zm-overlay-row">
          <button type="button" class="zm-btn zm-btn--primary zm-feedback" (click)="confirmDialog.open()">
            Gönderiyi sil (onay)
          </button>
          <zm-dialog #confirmDialog label="Gönderiyi sil?" size="sm" (closed)="onOverlayClosed($event)">
            <p>Bu işlem geri alınamaz. Gönderi kalıcı olarak silinecek.</p>
            <div class="zm-overlay__actions">
              <zm-button variant="quiet" (clicked)="confirmDialog.close('programmatic')">Vazgeç</zm-button>
              <zm-button variant="danger" (clicked)="confirmDialog.close('programmatic')">Sil</zm-button>
            </div>
          </zm-dialog>
        </div>

        <h3 class="type-subhead">ZmDialog · yıkıcı (kapatılamaz) · VAL-DS-027 olumsuz yol</h3>
        <div class="zm-overlay-row">
          <button type="button" class="zm-btn zm-btn--danger zm-feedback" (click)="blockingDialog.open()">
            Hesabı sil (engelleyici)
          </button>
          <zm-dialog #blockingDialog label="Hesabını sil" [dismissible]="false" size="md" (closed)="onOverlayClosed($event)">
            <p>
              Bu diyalog <strong>kapatılamaz</strong>: dış perdeye tıklamak ve
              <code>Escape</code> tuşu yok sayılır. Yalnızca aşağıdaki açık
              düğmelerle kapanır (VAL-DS-027).
            </p>
            <div class="zm-overlay__actions">
              <zm-button variant="quiet" (clicked)="blockingDialog.close('programmatic')">Geri dön</zm-button>
              <zm-button variant="danger" (clicked)="blockingDialog.close('programmatic')">Anladım, sil</zm-button>
            </div>
          </zm-dialog>
        </div>

        <h3 class="type-subhead">ZmSheet · yan levha (filtreler)</h3>
        <div class="zm-overlay-row">
          <button type="button" class="zm-btn zm-btn--secondary zm-feedback" (click)="filterSheet.open()">
            Filtreleri aç (sağ)
          </button>
          <zm-sheet #filterSheet label="Süzgeçler" side="end" (closed)="onOverlayClosed($event)">
            <h2 id="sheet-filtre-title">Süzgeçler</h2>
            <p>Yan levha odağı içeri taşır, Tab döngüsünü kilitler ve arka
              planı kaydırmaz. Dış perdeye tıklamak veya <code>Escape</code>
              ile kapanır.</p>
            <div class="zm-overlay__stack">
              <zm-checkbox label="Yalnız medya" [checked]="filterMedia()" (checkedChange)="filterMedia.set($event)"></zm-checkbox>
              <zm-checkbox label="Takip ettiklerim" [checked]="filterFollowing()" (checkedChange)="filterFollowing.set($event)"></zm-checkbox>
            </div>
            <div class="zm-overlay__actions">
              <zm-button variant="quiet" (clicked)="filterSheet.close('programmatic')">Vazgeç</zm-button>
              <zm-button variant="primary" (clicked)="filterSheet.close('programmatic')">Uygula</zm-button>
            </div>
          </zm-sheet>
        </div>

        <p class="zm-form__state" aria-live="polite">
          son kapanış nedeni=<code>{{ lastCloseReason() || '—' }}</code>
          · son menü eylemi=<code>{{ lastMenuAction() || '—' }}</code>
        </p>
      </section>

      <!--
        Durum yüzleri paneli — VAL-DS-028 (toast / skeleton / empty / error /
        permission states all render with Turkish recovery copy + concrete
        action) and VAL-DS-029 (status never color-only: every variant couples
        its accent color with a distinct inline SVG glyph). Uses the REAL
        primitives <zm-toast> / <zm-skeleton> / <zm-empty-state> /
        <zm-error-state> / <zm-permission-state> so the gallery is the
        browser-QA surface for the feedback-state contract.

        Copy follows docs/agent/13-ANTI-SLOP.md §8: specific reason +
        consequence + next step, never the banned generic "Bir şeyler ters
        gitti".
      -->
      <section class="panel" aria-labelledby="gallery-states-heading" data-panel="states"
               [hidden]="!panelVisible('states','toast','skeleton','empty','error','permission','feedback')">
        <h2 id="gallery-states-heading">Durum yüzleri</h2>
        <p class="panel__hint">
          Beş durum yüzü: <strong>toast</strong> (canlı bölge bildirimi),
          <strong>iskelet</strong> (yükleniyor yer tutucu), <strong>boş durum</strong>,
          <strong>hata durumu</strong> ve <strong>izin durumu</strong>. Her yüz
          Türkçe kurtarma metni + somut bir eylem taşır; durum asla yalnızca
          renkle iletilmez (her varyant kendi simgesiyle ayrışır).
        </p>

        <h3 class="type-subhead">ZmToast · dört varyant (VAL-DS-028 canlı bölge)</h3>
        <p class="panel__hint">
          Her bildiri <code>role=status</code> (info/success/warning) veya
          <code>role=alert</code> (error) taşır; simgesi varyanta göre değişir
          (renk dışı işaret). Kalıcı (<code>duration=0</code>) olarak
          yerleştirildiler; üzerlerine gelince veya odaklayınca zamanlayıcı
          duraklar. Aşağıdaki düğme 4 saniyede sonra otomatik kapanan geçici
          bir toast gösterir (VAL-DS-028 otomatik kapanma + geri dönüş).
        </p>
        <div class="zm-states__toast-stack" role="region" aria-label="Toast örnekleri">
          <zm-toast
            variant="info"
            message="Yeni bir takip isteğin var."
            meta="Profilden kabul edebilirsin."
            closeLabel="Bildirimi kapat"
            [duration]="0"
            (dismissed)="onToastDismissed($event)"
          ></zm-toast>
          <zm-toast
            variant="success"
            message="Gönderin yayınlandı."
            actionLabel="Geri al"
            closeLabel="Kapat"
            [duration]="0"
            (actionClicked)="onToastAction()"
            (dismissed)="onToastDismissed($event)"
          ></zm-toast>
          <zm-toast
            variant="warning"
            message="Hesabının yedeğini henüz almadın."
            meta="Kurtarma kodlarını indirmek iyi olur."
            closeLabel="Kapat"
            [duration]="0"
            (dismissed)="onToastDismissed($event)"
          ></zm-toast>
          <zm-toast
            variant="error"
            message="Gönderi paylaşılamadı."
            meta="Bağlantını kontrol edip tekrar dene."
            closeLabel="Kapat"
            [duration]="0"
            (dismissed)="onToastDismissed($event)"
          ></zm-toast>
        </div>

        <h3 class="type-subhead">ZmToast · otomatik kapanma (VAL-DS-028)</h3>
        <p class="panel__hint">
          Aşağıdaki düğme 4 saniyede sonra kendiliğinden kapanan bir başarı
          toastu gösterir. Toast görünürken klavyeyle içine Tab yaparsan,
          kapandığında odağı düğmeye geri verir. Üzerine gelince zamanlayıcı
          duraklar.
        </p>
        <div class="zm-states__interactive">
          <button
            type="button"
            class="zm-btn zm-btn--primary zm-feedback"
            (click)="onShowTransientToast()"
          >
            Geçici toast göster
          </button>
          <span class="zm-states__state" aria-live="polite">
            {{ transientToastVisible() ? 'Toast görünür · 4 sn sonra kapanır' : 'Toast kapalı' }}
            · son kapanış nedeni=<code>{{ lastToastReason() || '—' }}</code>
          </span>
        </div>
        @if (transientToastVisible()) {
          <div class="zm-states__transient" role="region" aria-label="Geçici toast">
            <zm-toast
              #transientToast
              variant="success"
              message="Taslak kaydedildi."
              actionLabel="Geri al"
              closeLabel="Kapat"
              [duration]="4000"
              (actionClicked)="onToastAction()"
              (dismissed)="onTransientToastDismissed($event)"
            ></zm-toast>
          </div>
        }

        <h3 class="type-subhead">ZmSkeleton · yükleniyor yer tutucu (VAL-DS-028)</h3>
        <p class="panel__hint">
          İskelet, içerik gelene kadar yer ayrırır; <code>aria-hidden</code>
          ile dekoratiftir. Hareket azaltıldığında parıltı durur, tonal blok
          kalır (VAL-DS-016). Metin, daire ve dikdörtgen varyantları aşağıda.
        </p>
        <div class="zm-states__skeleton">
          <div class="zm-states__skeleton-text">
            <zm-skeleton variant="text" [lines]="3"></zm-skeleton>
          </div>
          <div class="zm-states__skeleton-row">
            <zm-skeleton variant="circle" width="3rem"></zm-skeleton>
            <div class="zm-states__skeleton-inline">
              <zm-skeleton variant="text" [lines]="2"></zm-skeleton>
            </div>
          </div>
          <zm-skeleton variant="rect" width="100%" height="6rem"></zm-skeleton>
        </div>

        <h3 class="type-subhead">ZmEmptyState · boş durum (VAL-DS-028)</h3>
        <p class="panel__hint">
          Boş durum asla çıkmaz sokak değildir: belirli bir başlık, neden +
          sonraki adım açıklaması ve somut bir eylem taşır. Aşağıdaki "Akışın
          henüz boş" örneği keşfe yönlendirir.
        </p>
        <div class="zm-states__surface">
          <zm-empty-state
            title="Akışın henüz boş"
            description="Takip ettiğin kişilerin gönderileri burada görünür."
            actionLabel="Keşfetten başla"
            (action)="onStateAction('empty')"
          ></zm-empty-state>
        </div>

        <h3 class="type-subhead">ZmErrorState · kurtarılabilir hata (VAL-DS-028)</h3>
        <p class="panel__hint">
          Hata yüzü <code>role=alert</code> ile duyurulur; belirli bir neden +
          sonuç + "Tekrar dene" eylemi taşır. Genel "Bir şeyler ters gitti"
          metni yasaktır. Aşağıdaki örnek akış yenileme hatasını gösterir.
        </p>
        <div class="zm-states__surface">
          <zm-error-state
            title="Akış şu anda yenilenemedi"
            description="Bağlantını kontrol edip yeniden deneyin; taslaklarınız korunur."
            retryLabel="Tekrar dene"
            (retry)="onStateAction('error-retry')"
          >
            <a href="/destek" class="zm-states__link">Destek al</a>
          </zm-error-state>
        </div>

        <h3 class="type-subhead">ZmPermissionState · izin durumu (VAL-DS-028)</h3>
        <p class="panel__hint">
          İzin yüzü, erişimin neden kapalı olduğunu açıklar ve bir talep
          yolu sunar; asla çıplak "Yetkisiz" çıkmazı değildir. İçerik
          eksikliği veya hata anlamına gelmez; kilit simgesi ile ayrışır
          (VAL-DS-029).
        </p>
        <div class="zm-states__surface">
          <zm-permission-state
            title="Bu panel yalnızca yöneticilere açıktır"
            description="İçerik denetimi yetkisi gerektirir; erişim talebi gönderilebilir."
            actionLabel="Erişim talep et"
            (action)="onStateAction('permission')"
          >
            <a href="/akis" class="zm-states__link">Herkese açık akışa dön</a>
          </zm-permission-state>
        </div>

        <p class="zm-form__state" aria-live="polite">
          son durum eylemi=<code>{{ lastStateAction() || '—' }}</code>
          · son toast eylemi=<code>{{ lastToastAction() || '—' }}</code>
        </p>
      </section>

      <!--
        Kimlik ve etiketler paneli — VAL-DS-030 (avatar stable identity
        fallback + image error state), VAL-DS-031 (presence / unread ring
        SEPARATED from content), VAL-DS-032 (chip + status carry text +
        color meaning). Uses the REAL primitives <zm-avatar> / <zm-chip> /
        <zm-status>. The avatar grid exercises: working image, broken-image
        (404) fallback, initials-only, four presence states, unread counts,
        and the size ladder. The chip row shows every variant with its
        distinct leading glyph + label. The status row pairs each color with
        its leading shape + Turkish label (never color-only).
      -->
      <section class="panel" aria-labelledby="gallery-identity-heading" data-panel="identity"
               [hidden]="!panelVisible('identity','avatar','chip','status')">
        <h2 id="gallery-identity-heading">Kimlik ve etiketler</h2>
        <p class="panel__hint">
          <strong>Avatar</strong> aynı kimlik için aynı renk + baş harfi
          üretir; görsel yüklenemezse yer tutucusuna döner (boyut sabit kalır).
          <strong>Varlık halkası</strong> içerikten ayrıdır: varlık noktası ve
          okunmamış sayacı köşe yuvalarında, bağımsız renkle, renk dışı işaretle
          (konum + şekil + etiket) anlam taşır. <strong>Çip</strong> ve
          <strong>durum</strong> asla yalnızca renk değildir: her varyant kendi
          şekil işareti + metin etiketi ile gelir.
        </p>

        <h3 class="type-subhead">ZmAvatar · kararlı kimlik + görsel hatası (VAL-DS-030)</h3>
        <p class="panel__hint">
          İlk iki avatar bir görsel taşır (yerel SVG); ikinci sıradaki avatar
          bilinçli olarak boş bir adrese işaret eder ve görsel hatasında
          kararlı kimlik yer tutucusuna döner (kırık görsel simgesi veya
          yer değiştirme olmadan). Üçüncü avatar yalnızca baş harfler.
        </p>
        <div class="zm-identity__avatars" role="list" aria-label="Avatar örnekleri">
          <div class="zm-identity__cell" role="listitem">
            <zm-avatar
              name="Deniz Yılmaz"
              src="data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 80 80'><rect width='80' height='80' rx='40' fill='%2373594a'/><circle cx='31' cy='34' r='5' fill='%23f4f0e8'/><circle cx='49' cy='34' r='5' fill='%23f4f0e8'/><path d='M28 52c4 6 20 6 24 0' stroke='%23f4f0e8' stroke-width='3' fill='none' stroke-linecap='round'/></svg>"
              size="md"
            ></zm-avatar>
            <span class="zm-identity__cap">Görsel · Deniz Yılmaz</span>
          </div>
          <div class="zm-identity__cell" role="listitem">
            <zm-avatar
              name="Ela Polat"
              src="/_design/does-not-exist-avatar.png"
              size="md"
            ></zm-avatar>
            <span class="zm-identity__cap">Hatalı görsel · Ela Polat (EP)</span>
          </div>
          <div class="zm-identity__cell" role="listitem">
            <zm-avatar name="Çınar Aydın" size="md"></zm-avatar>
            <span class="zm-identity__cap">Yalnızca baş harf · Çınar Aydın</span>
          </div>
        </div>

        <h3 class="type-subhead">ZmAvatar · varlık halkası içerikten ayrı (VAL-DS-031)</h3>
        <p class="panel__hint">
          Her avatar farklı bir varlık durumu taşır: çevrimiçi, uzakta, meşgul,
          çevrimdışı. Varlık noktası köşede, kimlik renginden bağımsız bir
          renkle, yuvarlak şekliyle ayrışır. Son avatarda okunmamış sayacı
          (üst köşe) farklı bir şekil ve konumda anlam taşır.
        </p>
        <div class="zm-identity__avatars" role="list" aria-label="Varlık ve okunmamış örnekleri">
          <div class="zm-identity__cell" role="listitem">
            <zm-avatar name="Ada Kaya" presence="online" size="lg"></zm-avatar>
            <span class="zm-identity__cap">Çevrimiçi</span>
          </div>
          <div class="zm-identity__cell" role="listitem">
            <zm-avatar name="Berk Aksoy" presence="away" size="lg"></zm-avatar>
            <span class="zm-identity__cap">Uzakta</span>
          </div>
          <div class="zm-identity__cell" role="listitem">
            <zm-avatar name="Cenk Öztürk" presence="busy" size="lg"></zm-avatar>
            <span class="zm-identity__cap">Meşgul</span>
          </div>
          <div class="zm-identity__cell" role="listitem">
            <zm-avatar name="Derya Şahin" presence="offline" size="lg"></zm-avatar>
            <span class="zm-identity__cap">Çevrimdışı</span>
          </div>
          <div class="zm-identity__cell" role="listitem">
            <zm-avatar name="Mert Kılıç" presence="online" [unread]="3" size="lg"></zm-avatar>
            <span class="zm-identity__cap">3 okunmamış</span>
          </div>
          <div class="zm-identity__cell" role="listitem">
            <zm-avatar name="Selin Yıldız" [unread]="120" size="lg"></zm-avatar>
            <span class="zm-identity__cap">120 okunmamış · 9+</span>
          </div>
        </div>

        <h3 class="type-subhead">ZmAvatar · boyut merdiveni</h3>
        <div class="zm-identity__avatars" role="list" aria-label="Boyut örnekleri">
          <div class="zm-identity__cell" role="listitem">
            <zm-avatar name="Zeynep" size="xs"></zm-avatar>
            <span class="zm-identity__cap">xs</span>
          </div>
          <div class="zm-identity__cell" role="listitem">
            <zm-avatar name="Zeynep" size="sm"></zm-avatar>
            <span class="zm-identity__cap">sm</span>
          </div>
          <div class="zm-identity__cell" role="listitem">
            <zm-avatar name="Zeynep" size="md"></zm-avatar>
            <span class="zm-identity__cap">md</span>
          </div>
          <div class="zm-identity__cell" role="listitem">
            <zm-avatar name="Zeynep" size="lg"></zm-avatar>
            <span class="zm-identity__cap">lg</span>
          </div>
          <div class="zm-identity__cell" role="listitem">
            <zm-avatar name="Zeynep" size="xl"></zm-avatar>
            <span class="zm-identity__cap">xl</span>
          </div>
        </div>

        <h3 class="type-subhead">ZmChip · metin + renk anlamı (VAL-DS-032)</h3>
        <p class="panel__hint">
          Her çip bir metin etiketi taşır; renk kategorisi ayrı bir şekil
          işaretiyle eşleşir (gri tonlu olsa bile okunur). Kaldırılabilir
          çiplerin kapatma düğmesi erişilebilir ada sahiptir.
        </p>
        <div class="zm-identity__chips" role="list" aria-label="Çip varyantları">
          <zm-chip label="Yeni" variant="brand"></zm-chip>
          <zm-chip label="Keşfet" variant="discovery" [selected]="true"></zm-chip>
          <zm-chip label="Bilgi" variant="info"></zm-chip>
          <zm-chip label="Onaylı" variant="success"></zm-chip>
          <zm-chip label="Beklemede" variant="warning"></zm-chip>
          <zm-chip label="Reddedildi" variant="danger"></zm-chip>
          <zm-chip label="Nötr" variant="neutral"></zm-chip>
          <zm-chip
            label="Moda"
            variant="discovery"
            [removable]="true"
            (removed)="onChipRemoved('Moda')"
          ></zm-chip>
          <zm-chip
            label="Spor"
            variant="success"
            [removable]="true"
            removeLabel="Spor etiketini kaldır"
            (removed)="onChipRemoved('Spor')"
          ></zm-chip>
        </div>

        <h3 class="type-subhead">ZmStatus · metin + renk anlamı (VAL-DS-032)</h3>
        <p class="panel__hint">
          Her durum bir metin etiketi + baştaki şekil işareti taşır; durum
          asla yalnızca renk değildir. Varsayılan canlı bölge kibardır
          (<code>role=status</code>); <code>politeness="assertive"</code> ile
          <code>role=alert</code> olur.
        </p>
        <div class="zm-identity__statuses" role="list" aria-label="Durum varyantları">
          <zm-status label="Canlı" variant="brand"></zm-status>
          <zm-status label="Keşifte" variant="discovery"></zm-status>
          <zm-status label="Bilgi" variant="info"></zm-status>
          <zm-status label="Yayında" variant="success"></zm-status>
          <zm-status label="Beklemede" variant="warning"></zm-status>
          <zm-status label="Yayınlanamadı" variant="danger" politeness="assertive"></zm-status>
          <zm-status label="Taslak" variant="neutral"></zm-status>
        </div>

        <p class="zm-form__state" aria-live="polite">
          son kaldırılan çip=<code>{{ lastChipRemoved() || '—' }}</code>
        </p>
      </section>

      <!-- Semantic swatch grid: every VAL-DS-001 role, live cascade value -->
      <section class="panel" aria-labelledby="gallery-swatches-heading" data-panel="swatches"
               [hidden]="!panelVisible('swatches','color','tokens','theme')">
        <h2 id="gallery-swatches-heading">Anlamsal roller</h2>
        <p class="panel__hint">
          Her renk örneği canlı basamak değeridir; tema değiştiğinde
          (<code>data-theme</code>) örnek de güncellenir.
        </p>
        <ul class="swatches">
          @for (s of swatches; track s.token) {
            <li class="swatch">
              <span
                class="swatch__chip"
                [style.background]="s.value"
                [attr.aria-label]="s.role + ' örneği'"
              ></span>
              <span class="swatch__meta">
                <span class="swatch__label">{{ s.role }}</span>
                <span class="swatch__token">{{ s.token }}</span>
                <span class="swatch__note">{{ s.note }}</span>
              </span>
            </li>
          }
        </ul>
      </section>

      <!--
        Typography panel — VAL-DS-008 (three font roles), VAL-DS-009 (Turkish
        glyphs), VAL-DS-010 (responsive clamp scale), VAL-DS-011 (long-form
        measure 68–72ch). All three roles are exercised with the Turkish
        glyph set (Ç Ğ İ Ş ç ğ ı ö ş ü) so rasterization + diacritic placement
        is verifiable in a single capture.
      -->
      <section class="panel" aria-labelledby="gallery-type-heading" data-panel="type"
               [hidden]="!panelVisible('type','typography','font')">
        <h2 id="gallery-type-heading">Tipografi</h2>
        <p class="panel__hint">
          Üç ayrı yazı tipi rolü: <strong>arayüz</strong> (Manrope Variable),
          <strong>editöryel</strong> (Newsreader Variable) ve
          <strong>mono</strong> (sistem). Türkçe harf örnekleri
          (<code>Ç Ğ İ Ş ç ğ ı ö ş ü</code>) her rolde doğrulanır.
        </p>

        <ul class="type-roles">
          @for (r of fontRoles; track r.role) {
            <li class="type-role" [attr.data-role]="r.role">
              <p class="type-role__meta">
                <span class="type-role__label">{{ r.label }}</span>
                <span class="type-role__token">{{ r.token }}</span>
              </p>
              <p class="type-role__sample">{{ r.sample }}</p>
              <p class="type-role__note">{{ r.note }}</p>
            </li>
          }
        </ul>

        <h3 class="type-subhead">Akışkan ölçek</h3>
        <p class="panel__hint">
          Her basamak <code>clamp(min, pref, max)</code> ile tanımlı; görüntü
          genişliği değiştikçe boyut akıcı olarak ölçeklenir.
        </p>
        <dl class="type-scale">
          @for (s of scaleSteps; track s.token) {
            <div class="type-scale__row">
              <dt class="type-scale__name">{{ s.step }}</dt>
              <dd class="type-scale__sample" [style.font-size]="'var(' + s.token + ')'">
                {{ s.sample }}
              </dd>
            </div>
          }
        </dl>

        <h3 class="type-subhead">Uzun metin ölçüsü</h3>
        <p class="panel__hint">
          Aşağıdaki paragraf <code>--zm-measure-long-form</code> sütun genişliğini
          kullanır; hedef 68–72 ortalama karakter satır başına (VAL-DS-011).
        </p>
        <p class="long-form">
          Yaşayan Editöryel Ağ, sakin okuma yüzeylerini canlı sosyal sinyallerle
          birleştirir. Uzun bir gönderi, okuyucunun dikkatine saygı duyar; bu
          yüzden sütun genişliği ortalama altmış sekiz ile yetmiş iki karakter
          arasında tutulur. Daha dar satırlar yorgunluk, daha geniş satırlar
          kayıp yaratır. Ç ğ ı İ ş ö ü harfleri her rolde kesintisiz çalışmalı;
          noktalı i, noktasız ı ve sehpa üstü aksanlar hiçbir zaman tofu
          kutusuna dönüşmemeli. Bu ölçü, yalnızca tipografik bir tercih değil,
          erişilebilir okuma deneyiminin temelidir.
        </p>
      </section>

      <!--
        Shape & depth panel — design-system §5 (radius roles + border weights
        + separators) and §6 (seven material-depth tiers). Radius role tiles
        render at their live curvature; the material stack shows each tier at
        its elevation shadow + surface tone, demonstrating "tonal separation
        before shadows". Consumes ONLY --zm-* tokens (roles + component layer).
      -->
      <section class="panel" aria-labelledby="gallery-shape-heading" data-panel="shape"
               [hidden]="!panelVisible('shape','radius','elevation','depth')">
        <h2 id="gallery-shape-heading">Şekil ve derinlik</h2>
        <p class="panel__hint">
          Eğri rolleri bileşen türüne göre ayrılır: <strong>kontrol</strong>
          (çip, durum, simge), <strong>alan</strong> (girdi, düğme),
          <strong>kart</strong> (içerik, ortam) ve <strong>levha</strong>
          (diyalog, büyük yer paylaşımı). Derinlik yedi katmanlıdır; gölge
          yalnızca yapışkan ve üzeri katmanlarda belirir.
        </p>

        <h3 class="type-subhead">Eğri rolleri</h3>
        <ul class="shape-roles">
          @for (r of radiusRoles; track r.token) {
            <li class="shape-role">
              <span
                class="shape-role__tile"
                [style.borderRadius]="'var(' + r.token + ')'"
                [attr.aria-label]="r.label + ' eğri örneği'"
              ></span>
              <span class="shape-role__meta">
                <span class="shape-role__label">{{ r.label }}</span>
                <span class="shape-role__token">{{ r.token }}</span>
              </span>
            </li>
          }
        </ul>

        <h3 class="type-subhead">Sınır ağırlıkları</h3>
        <div class="shape-borders">
          <span class="shape-border shape-border--hair">İnce · 1px</span>
          <span class="shape-border shape-border--strong">Belirgin · 2px</span>
        </div>

        <h3 class="type-subhead">Ayraçlar</h3>
        <div class="shape-seps">
          <p class="shape-sep">İnce ayraç · satır ayrımı</p>
          <p class="shape-sep shape-sep--strong">Belirgin ayraç · bölüm ayrımı</p>
        </div>

        <h3 class="type-subhead">Malzeme derinliği</h3>
        <p class="panel__hint">
          Her levha kendi katmanının yüz tonunu ve gölgesini taşır; tuval ve
          sayfa gölgesiz kalır, böylece okuma yüzeyi sakin kalır.
        </p>
        <ol class="material-stack">
          @for (m of materialLayers; track m.tier) {
            <li class="material-layer"
                [style.background]="'var(' + m.surface + ')'"
                [style.boxShadow]="'var(' + m.elev + ')'">
              <span class="material-layer__tier">{{ m.label }}</span>
              <span class="material-layer__z">z · {{ m.z }}</span>
            </li>
          }
        </ol>
      </section>

      <!--
        Motion panel — VAL-DS-012 (tokens exist + bound), VAL-DS-013
        (enter/leave + view-transitions present), VAL-DS-014 (rapid repeated
        input does not queue), VAL-DS-016 (reduced motion disables spatial),
        VAL-DS-017 (reduced motion preserves state feedback). The duration +
        ease tables surface every motion token; the rapid-toggle demo proves
        CSS-transition interruptibility; the state-feedback matrix proves
        every state is discriminable without motion.
      -->
      <section class="panel" aria-labelledby="gallery-motion-heading" data-panel="motion"
               [hidden]="!panelVisible('motion','animation')">
        <h2 id="gallery-motion-heading">Hareket</h2>
        <p class="panel__hint">
          Hareket, yalnızca <code>transform</code> ve <code>opacity</code>
          üzerinden çalışır; süreler <code>--zm-duration-*</code>, kolaylar
          <code>--zm-ease-*</code> simgeleriyle bağlanır. Hareketin azaltıldığı
          durumda uzaysal hareket opaklığa döner; durum geri bildirimi
          (renk, simge, metin) korunur.
        </p>

        <h3 class="type-subhead">Süre simgeleri</h3>
        <p class="panel__hint">
          Beş adımsalık merdiven: anlık → sahne. Her basamak canlı
          <code>var(--zm-duration-*)</code> değerini taşır.
        </p>
        <dl class="motion-table">
          @for (d of motionDurations; track d.token) {
            <div class="motion-row">
              <dt class="motion-row__name">{{ d.role }}</dt>
              <dd class="motion-row__value"
                  [style.transitionDuration]="'var(' + d.token + ')'">
                <span class="motion-row__bar" aria-hidden="true"></span>
                <span class="motion-row__ms">{{ d.ms }} ms</span>
              </dd>
              <dd class="motion-row__use">{{ d.use }}</dd>
            </div>
          }
        </dl>

        <h3 class="type-subhead">Kolaylık simgeleri</h3>
        <p class="panel__hint">
          Dört kübik-bezier eğrisi; her biri <code>var(--zm-ease-*)</code>
          simgesine bağlıdır ve farklı bir giriş/çıkış karakterine sahiptir.
        </p>
        <dl class="motion-table">
          @for (e of motionEases; track e.token) {
            <div class="motion-row">
              <dt class="motion-row__name">{{ e.role }}</dt>
              <dd class="motion-row__value">
                <span class="motion-row__bezier"
                      [style.transitionTimingFunction]="'var(' + e.token + ')'"></span>
              </dd>
              <dd class="motion-row__use">{{ e.use }}</dd>
            </div>
          }
        </dl>

        <h3 class="type-subhead">Giriş / çıkış sınıfları</h3>
        <p class="panel__hint">
          <code>.zm-enter</code> ve <code>.zm-leave</code> sınıfları kısa,
          kesilebilir ve yalnızca dönüşüm + opaklık kullanır. Aşağıdaki kart
          göründüğünde <code>.zm-enter</code> ile giriş yapar; hızlı tekrar
          aç/kapa kuyruk birikmez (VAL-DS-014).
        </p>
        <p class="motion-demo-actions">
          <button type="button"
                  class="zm-btn zm-btn--secondary zm-feedback"
                  (click)="onToggleEnterDemo()">
            {{ showEnterDemo() ? 'Girişi gizle' : 'Girişi göster' }}
          </button>
        </p>
        @if (showEnterDemo()) {
          <div class="motion-enter-card zm-enter">
            <p class="motion-enter-card__title">Yeni içerik</p>
            <p class="motion-enter-card__body">
              Bu kart, ağaçtaki yerini <code>.zm-enter</code> hareketiyle
              alır. Aşağıdaki sıçrama denetimi, hareketi taşıyan bir denetimin
              hızlı tekrar girişte nasıl davrandığını gösterir.
            </p>
          </div>
        }

        <h3 class="type-subhead">Hızlı giriş · kuyruksuz</h3>
        <p class="panel__hint">
          Aşağıdaki düğmeye saniyede on kez basın; konum yine de son değere
          <code>2 × --zm-duration-base</code> içinde yerleşir (VAL-DS-014).
          Hareketi taşıyan denetim <code>.zm-feedback</code> geçişini kullanır;
          bu geçiş her zaman kesilebilir.
        </p>
        <p class="motion-demo-actions">
          <button type="button"
                  class="zm-btn zm-btn--primary zm-feedback"
                  (click)="onMotionToggle()">
            Sıçrama · {{ toggleState() ? 'AÇIK' : 'kapalı' }}
          </button>
          <button type="button"
                  class="zm-btn zm-btn--quiet zm-feedback"
                  (click)="onMotionRapid()">
            10× hızlı bas
          </button>
          <span class="motion-toggle-count" aria-live="polite">
            Basış: {{ toggleCount() }}
          </span>
        </p>
        <div class="motion-toggle-track">
          <span class="motion-toggle-thumb"
                [class.is-on]="toggleState()"
                role="presentation"></span>
        </div>

        <h3 class="type-subhead">Durum geri bildirimi</h3>
        <p class="panel__hint">
          Her durum renk + metin + opaklık ile ayırt edilir; hareket asla
          tek başına gösterge değildir (VAL-DS-017). Hareket azaltıldığında
          bile her durum statik karede okunabilir.
        </p>
        <ul class="motion-states">
          <li class="motion-state"><span class="motion-state__dot motion-state__dot--rest"></span>Dinlenme</li>
          <li class="motion-state"><span class="motion-state__dot motion-state__dot--hover"></span>Üzerinde</li>
          <li class="motion-state"><span class="motion-state__dot motion-state__dot--active"></span>Basıldı</li>
          <li class="motion-state"><span class="motion-state__dot motion-state__dot--selected"></span>Seçildi</li>
          <li class="motion-state"><span class="motion-state__dot motion-state__dot--pending"></span>Bekliyor</li>
          <li class="motion-state"><span class="motion-state__dot motion-state__dot--success"></span>Başarı</li>
          <li class="motion-state"><span class="motion-state__dot motion-state__dot--warning"></span>Uyarı</li>
          <li class="motion-state"><span class="motion-state__dot motion-state__dot--error"></span>Hata</li>
        </ul>
      </section>

      <!--
        İkonografi ve imza motifler paneli — VAL-DS-033 (tek normalize
        simge ailesi + dört imza motif), VAL-DS-034 (motifler yalnızca
        dekoratif, asla metnin üstünden geçmez), VAL-DS-035 (denetimlerde
        emoji yok, genel 3D blob/stok görsel yok). Dört motif — sinyal yayı,
        vuruş düğümü, editöryel kesiş, iplik çizgisi — ürünün imzasıdır.
      -->
      <section class="panel" aria-labelledby="gallery-iconography-heading" data-panel="iconography"
               [hidden]="!panelVisible('iconography','motif','motifs','icon')">
        <h2 id="gallery-iconography-heading">İkonografi ve imza motifler</h2>
        <p class="panel__hint">
          Tek bir normalize edilmiş simge ailesi: her denetim (düğme, menü,
          durum, etiket) aynı üretilmiş vektör dilini paylaşır — ortak uç
          biçimi, <code>currentColor</code>, tek çizgi kalınlığı. Dört imza
          motifi (sinyal yayı, vuruş düğümü, editöryel kesiş, iplik çizgisi)
          yalnızca dekoratiftir: erişilebilir teknolojiye ad taşımazlar ve
          anlam asla onlara bağlı değildir (VAL-DS-033/034).
        </p>

        <h3 class="type-subhead">Dört imza motif · dekoratif kütüphane</h3>
        <p class="panel__hint">
          Aşağıdaki döşemeler her motifin tek başına halidir. Her biri
          <code>aria-hidden</code> ve <code>role="presentation"</code> taşır;
          hiçbiri erişilebilir ad almaz. Motifin rengi düşük kromalı bir
          ayraç tonudur (<code>--zm-motif-fg</code>), marka/durum dolgusu değil.
        </p>
        <ul class="zm-motif-grid" role="presentation">
          @for (m of motifCatalog; track m.name) {
            <li class="zm-motif-tile">
              <span class="zm-motif-tile__mark" [attr.data-tone]="m.tone">
                <zm-motif [name]="m.name" [size]="'3.5rem'"></zm-motif>
              </span>
              <span class="zm-motif-tile__name">{{ m.label }}</span>
              <span class="zm-motif-tile__use">{{ m.use }}</span>
            </li>
          }
        </ul>

        <h3 class="type-subhead">Bağlamda motif · başlık köşesi (sinyal yayı)</h3>
        <p class="panel__hint">
          Sinyal yayı, bir başlık/hero köşesinde — metin olmayan bir bölgede —
          süs olarak durur. Başlık veya metin üzerine gelmez; karşıtlığı
          etkilemez (VAL-DS-034). Aşağıdaki kart, kanonik konumu gösterir.
        </p>
        <figure class="zm-motif-context zm-motif-context--hero">
          <zm-motif class="zm-motif-context__accent" name="signal-arc" [size]="'clamp(3.5rem, 8vw, 5.5rem)'"></zm-motif>
          <figcaption class="zm-motif-context__body">
            <span class="eyebrow">Editöryel başlık</span>
            <strong class="zm-motif-context__title">Bu hafta ağda</strong>
            <span class="zm-motif-context__text">
              Üç yeni bağı, iki canlı sohbeti ve bir editöryel seçkiyi
              birleştiren iplik. Motif yalnızca köşededir; metin boşlukta
              durur ve karşıtlığı korur.
            </span>
          </figcaption>
        </figure>

        <h3 class="type-subhead">Bağlamda motif · editöryel ayraç (kesiş)</h3>
        <p class="panel__hint">
          Kesiş, iki bölümün arasında — olukta — durur; asla bir başlığın
          altında çizgi olarak kullanılmaz. Aşağıdaki ayraç iki paragrafı
          ayırır, metnin altından geçmez.
        </p>
        <div class="zm-motif-context zm-motif-context--separator">
          <p class="readable">
            Yaşayan Editöryel Ağ, sakin okuma yüzeylerini canlı sosyal
            sinyallerle birleştirir. İlk bölüm burada biter.
          </p>
          <zm-motif class="zm-motif-context__rule" name="editorial-cut" [size]="'100%'"></zm-motif>
          <p class="readable">
            İkinci bölüm, kesişin ardından başlar. Ayraç iki blok arasında
            durur; her iki paragraf da motifin altında değildir.
          </p>
        </div>

        <h3 class="type-subhead">Bağlamda motif · zaman ipliği (iplik çizgisi)</h3>
        <p class="panel__hint">
          İplik çizgisi, bir zaman/akış olukta içerikle yan yana durur; asla
          gövde metninin üzerinden geçmez. Aşağıda, her öğenin solundaki
          olukta bir iplik akar.
        </p>
        <ol class="zm-thread" role="list">
          @for (item of threadItems; track item.id) {
            <li class="zm-thread__item">
              <span class="zm-thread__gutter" aria-hidden="true">
                <zm-motif name="thread-line" [size]="'1.75rem'"></zm-motif>
              </span>
              <span class="zm-thread__content">
                <strong class="zm-thread__title">{{ item.title }}</strong>
                <span class="zm-thread__text">{{ item.text }}</span>
              </span>
            </li>
          }
        </ol>

        <h3 class="type-subhead">Bağlamda motif · etkin gösterge (vuruş düğümü)</h3>
        <p class="panel__hint">
          Vuruş düğümü, etkin/gezinti öğesinin yanında — etiketin yanında,
          arkasında değil — canlılık gösterir. Hareket azaltıldığında halkalar
          durur; dolu merkez yine de "etkin" okunur (durum hareketle tek başına iletilmez).
        </p>
        <ul class="zm-nav-sample" role="list">
          @for (n of navSample; track n.id) {
            <li class="zm-nav-sample__item" [class.is-active]="n.active">
              <span class="zm-nav-sample__dot" [class.is-active]="n.active">
                @if (n.active) {
                  <zm-motif name="pulse-node" [size]="'1.25rem'"></zm-motif>
                } @else {
                  <span class="zm-nav-sample__rest" aria-hidden="true"></span>
                }
              </span>
              <span class="zm-nav-sample__label">{{ n.label }}</span>
              <span class="zm-nav-sample__hint">{{ n.active ? 'Etkin' : '' }}</span>
            </li>
          }
        </ul>

        <h3 class="type-subhead">Normalize simge ailesi · denetim içi simgeler</h3>
        <p class="panel__hint">
          Tüm denetim simgeleri aynı üretilmiş SVG ailesinden gelir (ortak
          <code>viewBox</code>, <code>currentColor</code>, yuvarlak uç, tek
          çizgi kalınlığı ailesi). Denetimlerde emoji yok, genel 3D blob yok,
          stok maskot yok (VAL-DS-035). Aşağıdaki örnekler, ürünün gerçek
          düğmelerinde kullanılan simgeleri gösterir.
        </p>
        <div class="zm-icon-family" role="presentation">
          <span class="zm-icon-family__chip" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false"><path d="M12 21s-7-4.5-9.5-9C1 9 2.5 5.5 6 5.5c2 0 3.2 1.2 4 2.4.8-1.2 2-2.4 4-2.4 3.5 0 5 3.5 3.5 6.5C19 16.5 12 21 12 21z" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>
          </span>
          <span class="zm-icon-family__chip" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false"><path d="M6 3h12a1 1 0 0 1 1 1v17l-7-4-7 4V4a1 1 0 0 1 1-1z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" /></svg>
          </span>
          <span class="zm-icon-family__chip" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false"><circle cx="6" cy="12" r="2.5" fill="currentColor" /><circle cx="18" cy="6" r="2.5" fill="currentColor" /><circle cx="18" cy="18" r="2.5" fill="currentColor" /><line x1="8" y1="11" x2="16" y2="7" stroke="currentColor" stroke-width="1.6" /><line x1="8" y1="13" x2="16" y2="17" stroke="currentColor" stroke-width="1.6" /></svg>
          </span>
          <span class="zm-icon-family__chip" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false"><path d="M5 7h14M10 7V5a1 1 0 0 1 1-1h2a1 1 0 0 1 1 1v2M7 7l1 13h8l1-13" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /></svg>
          </span>
          <span class="zm-icon-family__chip" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false"><circle cx="11" cy="11" r="7" fill="none" stroke="currentColor" stroke-width="2" /><line x1="16.5" y1="16.5" x2="21" y2="21" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
          </span>
          <span class="zm-icon-family__chip" aria-hidden="true">
            <svg viewBox="0 0 24 24" focusable="false"><path d="M18 8a6 6 0 0 0-12 0c0 7-3 9-3 9h18s-3-2-3-9" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" /><path d="M10 21a2 2 0 0 0 4 0" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" /></svg>
          </span>
        </div>
        <p class="panel__hint">
          Simgeler <code>currentColor</code> miras alır; yüzey tonuna uyum sağlar
          ve açık/koyu temada tutarlı kalır. Hiçbiri dış kaynaklı değil; hepsi
          ürün içinde üretilmiştir.
        </p>
      </section>
    </div>
  `,
})
export class GalleryPageComponent {
  /**
   * Deep-link query params (VAL-DS-036). The gallery is unauthenticated and
   * drivable by `?prim=<panel>&state=<hint>` so each assertion can deep-link
   * to a single primitive/state view. `prim` filters the visible panel set;
   * `state` is an informational hint surfaced in the header (validators use it
   * to point at a sub-state, e.g. `?prim=button&state=loading`). Unknown /
   * empty `prim` renders the whole gallery.
   *
   * `ActivatedRoute` is injected as OPTIONAL so unit-test mounts without a
   * router harness still work (the signal defaults to the empty query map and
   * every panel renders). In the live app the routed component always has a
   * real `ActivatedRoute`, so deep-linking works end-to-end.
   */
  private readonly route = inject(ActivatedRoute, { optional: true });
  private readonly queryMap$ = this.route ? this.route.queryParamMap : of(convertToParamMap({}));
  /** Normalized `prim` query param (lowercased, trimmed) or '' when absent. */
  readonly prim = toSignal(
    this.queryMap$.pipe(map(pm => (pm.get('prim') ?? '').trim().toLowerCase())),
    { initialValue: '' },
  );
  /** Normalized `state` query param (lowercased, trimmed) or '' when absent. */
  readonly state = toSignal(
    this.queryMap$.pipe(map(pm => (pm.get('state') ?? '').trim().toLowerCase())),
    { initialValue: '' },
  );

  /**
   * Returns true when the panel with one of `keys` should render under the
   * current deep-link filter. With no `prim`, every panel renders. When `prim`
   * matches one of the panel's keys, only that panel renders (the rest carry
   * [hidden] and drop out of the accessibility tree).
   */
  panelVisible(...keys: string[]): boolean {
    const filter = this.prim();
    if (!filter) return true;
    return keys.includes(filter);
  }

  /** Every semantic color role listed in VAL-DS-001, in editorial order. */
  readonly swatches: readonly Swatch[] = [
    { role: 'canvas', token: '--zm-canvas', value: 'var(--zm-canvas)', note: 'Sıcak nötr zemin' },
    { role: 'canvas-raised', token: '--zm-canvas-raised', value: 'var(--zm-canvas-raised)', note: 'Kabartılmış zemin' },
    { role: 'surface-1', token: '--zm-surface-1', value: 'var(--zm-surface-1)', note: 'Birinci yüzey' },
    { role: 'surface-2', token: '--zm-surface-2', value: 'var(--zm-surface-2)', note: 'İkinci yüzey' },
    { role: 'surface-3', token: '--zm-surface-3', value: 'var(--zm-surface-3)', note: 'Üçüncü yüzey' },
    { role: 'text-1', token: '--zm-text-1', value: 'var(--zm-text-1)', note: 'Birincil mürekkep' },
    { role: 'text-2', token: '--zm-text-2', value: 'var(--zm-text-2)', note: 'İkincil mürekkep' },
    { role: 'text-3', token: '--zm-text-3', value: 'var(--zm-text-3)', note: 'Üçüncül / meta' },
    { role: 'border-subtle', token: '--zm-border-subtle', value: 'var(--zm-border-subtle)', note: 'İnce ayraç' },
    { role: 'border-strong', token: '--zm-border-strong', value: 'var(--zm-border-strong)', note: 'Belirgin ayraç' },
    { role: 'brand', token: '--zm-brand', value: 'var(--zm-brand)', note: 'Mercan marka' },
    { role: 'brand-hover', token: '--zm-brand-hover', value: 'var(--zm-brand-hover)', note: 'Marka · üzerine gelince' },
    { role: 'brand-on', token: '--zm-brand-on', value: 'var(--zm-brand-on)', note: 'Marka üzerinde metin' },
    { role: 'discovery', token: '--zm-discovery', value: 'var(--zm-discovery)', note: 'Keşif sinyali' },
    { role: 'info', token: '--zm-info', value: 'var(--zm-info)', note: 'Bilgi sinyali' },
    { role: 'success', token: '--zm-success', value: 'var(--zm-success)', note: 'Başarı sinyali' },
    { role: 'warning', token: '--zm-warning', value: 'var(--zm-warning)', note: 'Uyarı sinyali' },
    { role: 'danger', token: '--zm-danger', value: 'var(--zm-danger)', note: 'Tehlike sinyali' },
    { role: 'focus', token: '--zm-focus', value: 'var(--zm-focus)', note: 'Odak halkası' },
    { role: 'scrim', token: '--zm-scrim', value: 'var(--zm-scrim)', note: 'Karartma katmanı' },
  ];

  /**
   * Three font roles for VAL-DS-008/009. Each sample exercises the Turkish
   * glyph set (Ç Ğ İ Ş ç ğ ı ö ş ü) plus a short semantic sentence. The
   * browser probe verifies the computed font-family resolves the variable
   * font for ui + display, and the system mono stack for mono.
   */
  readonly fontRoles: readonly FontRoleSample[] = [
    {
      role: 'ui',
      label: 'Arayüz',
      token: '--zm-font-ui',
      sample: 'ÇĞİŞç ğ ı ö ş ü · Arayüz metni Manrope ile okunur.',
      note: 'Manrope Variable — düğmeler, etiketler, gezinme, gövde.',
    },
    {
      role: 'display',
      label: 'Editöryel',
      token: '--zm-font-display',
      sample: 'ÇĞİŞç ğ ı ö ş ü · Editöryel başlıklar Newsreader ile kurulur.',
      note: 'Newsreader Variable — başlıklar, uzun metin, profil kimliği.',
    },
    {
      role: 'mono',
      label: 'Mono',
      token: '--zm-font-mono',
      sample: 'ÇĞİŞç ğ ı ö ş ü · system-ui mono · 0123456789 { code }',
      note: 'Sistem mono yığını — kod, sayı, veri tabloları.',
    },
  ];

  /**
   * Responsive clamp scale (VAL-DS-010). Each row's font-size binds to the
   * live token via inline style. Token names are pulled from ZM_TEXT_SIZE
   * (kept in sync with tokens.css) so the gallery never hardcodes a stale
   * token name; the --zm-text-2xl step is referenced via ZM_TEXT_SIZE.xl2.
   */
  readonly scaleSteps: readonly ScaleStep[] = [
    { step: 'xs',      token: ZM_TEXT_SIZE.xs,      sample: 'xs · altyazı · gösterge' },
    { step: 'sm',      token: ZM_TEXT_SIZE.sm,      sample: 'sm · yardımcı metin · meta' },
    { step: 'md',      token: ZM_TEXT_SIZE.md,      sample: 'md · gövde · düğme etiketi' },
    { step: 'lg',      token: ZM_TEXT_SIZE.lg,      sample: 'lg · kart başlığı · lede' },
    { step: 'xl',      token: ZM_TEXT_SIZE.xl,      sample: 'xl · bölüm başlığı' },
    { step: '2xl',     token: ZM_TEXT_SIZE.xl2,     sample: '2xl · sayfa başlığı' },
    { step: 'display', token: ZM_TEXT_SIZE.display, sample: 'display · editöryel kapak' },
  ];

  /**
   * Four radius roles (design-system §5) for the shape panel. Token names are
   * pulled from ZM_RADIUS_ROLE so the gallery never hardcodes a stale name.
   */
  readonly radiusRoles: readonly RadiusRoleSample[] = [
    { role: 'control', token: ZM_RADIUS_ROLE.control, label: 'Kontrol' },
    { role: 'field',   token: ZM_RADIUS_ROLE.field,   label: 'Alan' },
    { role: 'card',    token: ZM_RADIUS_ROLE.card,    label: 'Kart' },
    { role: 'sheet',   token: ZM_RADIUS_ROLE.sheet,   label: 'Levha' },
  ];

  /**
   * Seven material-depth tiers (design-system §6) for the elevation stack.
   * Surface tones come from ZM_COLOR (so surface names are never written as
   * literals here) and elevation shadows from ZM_ELEVATION. Ordered low →
   * high: canvas, page, raised, sticky, popover, dialog, urgent.
   */
  readonly materialLayers: readonly MaterialLayerSample[] = [
    { tier: 'canvas',  z: 0,   elev: ZM_ELEVATION.canvas,  surface: ZM_COLOR.canvas,       label: 'Tuval' },
    { tier: 'page',    z: 10,  elev: ZM_ELEVATION.page,    surface: ZM_COLOR.surface1,     label: 'Sayfa' },
    { tier: 'raised',  z: 20,  elev: ZM_ELEVATION.raised,  surface: ZM_COLOR.surface2,     label: 'Kabartılmış' },
    { tier: 'sticky',  z: 100, elev: ZM_ELEVATION.sticky,  surface: ZM_COLOR.canvasRaised, label: 'Yapışkan' },
    { tier: 'popover', z: 200, elev: ZM_ELEVATION.popover, surface: ZM_COLOR.canvasRaised, label: 'Açılır' },
    { tier: 'dialog',  z: 300, elev: ZM_ELEVATION.dialog,  surface: ZM_COLOR.canvasRaised, label: 'Diyalog' },
    { tier: 'urgent',  z: 400, elev: ZM_ELEVATION.urgent,  surface: ZM_COLOR.canvasRaised, label: 'Acil' },
  ];

  /**
   * Five motion duration tokens (VAL-DS-012). The ms values mirror
   * tokens.css :root and ZM_DURATION_MS so the gallery table is a faithful
   * reference; under reduced motion tokens.css collapses these to 0/80/100ms
   * and the live `var(--zm-duration-*)` binding reflects that automatically.
   */
  readonly motionDurations: readonly MotionDurationSample[] = [
    { role: 'instant', token: ZM_DURATION.instant, ms: ZM_DURATION_MS.instant, use: 'Anlık geri bildirim' },
    { role: 'fast',    token: ZM_DURATION.fast,    ms: ZM_DURATION_MS.fast,    use: 'Basma · vurgu' },
    { role: 'base',    token: ZM_DURATION.base,    ms: ZM_DURATION_MS.base,    use: 'Geçiş · sekme · süzgeç' },
    { role: 'slow',    token: ZM_DURATION.slow,    ms: ZM_DURATION_MS.slow,    use: 'Yol rotası · diyalog' },
    { role: 'scene',   token: ZM_DURATION.scene,   ms: ZM_DURATION_MS.scene,   use: 'İmza · sahne' },
  ];

  /**
   * Four ease tokens (VAL-DS-012). Each binding references the live
   * `var(--zm-ease-*)` value so reduced motion (tokens.css → linear) cascades
   * into the demo beziers. The control-point display stays at the canonical
   * values to document the intended curve.
   */
  readonly motionEases: readonly MotionEaseSample[] = [
    { role: 'standard',   token: ZM_EASE.standard,   bezier: ZM_EASE_BEZIER.standard,   use: 'Genel arayüz hareketi' },
    { role: 'enter',      token: ZM_EASE.enter,      bezier: ZM_EASE_BEZIER.enter,      use: 'Giriş — yumuşak duruş' },
    { role: 'exit',       token: ZM_EASE.exit,       bezier: ZM_EASE_BEZIER.exit,       use: 'Çıkış — hızlı çekilme' },
    { role: 'emphasized', token: ZM_EASE.emphasized, bezier: ZM_EASE_BEZIER.emphasized, use: 'Vurgulu imza anı' },
  ];

  /**
   * Rapid-toggle demo (VAL-DS-014). The thumb rides a CSS transition on
   * `transform`; rapid clicks restart from the current visual state and the
   * browser interpolates to the latest computed value, so no queue forms.
   * `toggleCount` is exposed via `aria-live` so the settle behavior is
   * observable to AT and to the browser probe.
   */
  readonly toggleState = signal<boolean>(false);
  readonly toggleCount = signal<number>(0);
  readonly showEnterDemo = signal<boolean>(false);

  onMotionToggle(): void {
    this.toggleState.update(v => !v);
    this.toggleCount.update(n => n + 1);
  }

  /** Simulate a rapid 10× burst on the toggle (VAL-DS-014 demo). */
  onMotionRapid(): void {
    for (let i = 0; i < 10; i++) {
      this.toggleState.update(v => !v);
      this.toggleCount.update(n => n + 1);
    }
  }

  onToggleEnterDemo(): void {
    this.showEnterDemo.update(v => !v);
  }

  /* --- Buttons panel (VAL-DS-018/019/020) --- */

  /** Variant × state matrix rows. `loading` is omitted for `quiet` per the
   *  design contract (quiet buttons do not enter a loading state; they are
   *  dismissed or replaced by a primary action when an async starts). */
  readonly buttonMatrix: readonly { variant: 'primary' | 'secondary' | 'quiet' | 'danger'; label: string }[] = [
    { variant: 'primary', label: 'Birincil' },
    { variant: 'secondary', label: 'İkincil' },
    { variant: 'quiet', label: 'Sessiz' },
    { variant: 'danger', label: 'Tehlike' },
  ];

  /** Loading width-stability demo (VAL-DS-019). The browser probe measures
   *  getBoundingClientRect().width before/after toggling this and asserts a
   *  ≤ 1px delta. */
  readonly loadingDemo = signal<boolean>(false);

  /** Icon-button pressed/selected toggle demos (VAL-DS-020 aria-pressed). */
  readonly likedDemo = signal<boolean>(false);
  readonly savedDemo = signal<boolean>(false);

  onToggleLoadingDemo(): void {
    this.loadingDemo.update(v => !v);
  }
  onToggleLiked(): void {
    this.likedDemo.update(v => !v);
  }
  onToggleSaved(): void {
    this.savedDemo.update(v => !v);
  }

  /* --- Form controls panel (VAL-DS-021/022/023) --- */

  /** Live-bound values for the form-controls demos. Exposed so the browser
   *  probe can read typed/revealed state and the gallery spec can assert the
   *  field wiring. */
  readonly emailValue = signal<string>('');
  readonly cityValue = signal<string>('');
  readonly passwordValue = signal<string>('');
  readonly bioValue = signal<string>('');
  readonly selectValue = signal<string>('');

  /* --- Selection controls panel (VAL-DS-024 / VAL-DS-025) --- */

  /** Checkbox demo — terms acceptance. */
  readonly termsChecked = signal<boolean>(false);

  /** Radio group — current visibility choice. */
  readonly radioVisibility = signal<string>('public');

  /** Switch demos — dark theme + MFA (loading). */
  readonly switchDark = signal<boolean>(false);
  readonly switchMfa = signal<boolean>(false);
  readonly switchLoading = signal<boolean>(false);

  /** Segmented single-select — feed view mode. */
  readonly segView = signal<string>('feed');
  /** Segmented multi-select — content filters. */
  readonly segFilters = signal<readonly string[]>(['photo']);

  /** Segmented single-select options (gallery view switcher). */
  readonly viewSegments: readonly ZmSegment[] = [
    { value: 'feed', label: 'Akış' },
    { value: 'discover', label: 'Keşfet' },
    { value: 'saved', label: 'Kayıtlar' },
    { value: 'profile', label: 'Profil' },
  ];

  /** Segmented multi-select options (content type filters). One disabled to
   *  demonstrate the keyboard skip behavior. */
  readonly filterSegments: readonly ZmSegment[] = [
    { value: 'photo', label: 'Fotoğraf' },
    { value: 'video', label: 'Video', disabled: true },
    { value: 'link', label: 'Bağlantı' },
    { value: 'poll', label: 'Anket' },
  ];

  /* --- Overlays panel (VAL-DS-026 / VAL-DS-027) --- */

  /** Sheet filter demo state (exercises real interactive content in the trap). */
  readonly filterMedia = signal<boolean>(false);
  readonly filterFollowing = signal<boolean>(true);

  /** Last close reason emitted by any overlay (proves the closed lifecycle). */
  readonly lastCloseReason = signal<string>('');
  /** Last menu action invoked (proves menuitem execution). */
  readonly lastMenuAction = signal<string>('');

  onOverlayClosed(reason: string): void {
    this.lastCloseReason.set(reason);
  }

  onMenuAction(action: string): void {
    this.lastMenuAction.set(action);
  }

  /* --- Feedback states panel (VAL-DS-028 / VAL-DS-029) --- */

  /** Last dismiss reason emitted by any persistent gallery toast. */
  readonly lastToastReason = signal<string>('');
  /** Last inline action invoked on any gallery toast (e.g. "Geri al"). */
  readonly lastToastAction = signal<string>('');
  /** Last recovery action invoked on an empty/error/permission surface. */
  readonly lastStateAction = signal<string>('');

  /** Controls the visibility of the transient (auto-dismiss) toast demo. */
  readonly transientToastVisible = signal<boolean>(false);

  /** View query for the transient toast instance (renders only while
   *  `transientToastVisible` is true). Used to start its auto-dismiss timer
   *  once it mounts. */
  readonly transientToastRef = viewChild('transientToast', { read: ZmToastComponent });

  /** When the transient toast mounts, start its 4s auto-dismiss timer. */
  private readonly transientTimerStarter = effect(() => {
    const toast = this.transientToastRef();
    if (toast) {
      toast.startTimer();
    }
  });

  onToastDismissed(reason: string): void {
    this.lastToastReason.set(reason);
  }

  onToastAction(): void {
    this.lastToastAction.set('Geri al');
  }

  /** Mount the transient toast; the effect above starts its auto-dismiss
   *  timer once the view binds. The toast dismisses itself after 4s or when
   *  the user activates the close/action control (focus returns to the
   *  trigger captured on focusin). */
  onShowTransientToast(): void {
    this.transientToastVisible.set(true);
  }

  onTransientToastDismissed(reason: string): void {
    this.lastToastReason.set(reason);
    this.transientToastVisible.set(false);
  }

  onStateAction(action: string): void {
    this.lastStateAction.set(action);
  }

  /* --- Identity panel (VAL-DS-030 / VAL-DS-031 / VAL-DS-032) --- */

  /** Last chip label removed from the gallery chip demo (proves the remove
   *  affordance carries its accessible name + emits). */
  readonly lastChipRemoved = signal<string>('');

  onChipRemoved(label: string): void {
    this.lastChipRemoved.set(label);
  }

  /* --- Iconography & signature motifs panel (VAL-DS-033 / 034 / 035) --- */

  /**
   * The four signature motifs of the Living Editorial Network, each with its
   * canonical Turkish label and a one-line use description. The `tone` field
   * only affects the gallery tile presentation (which surface tone the mark
   * sits on); every motif renders in `--zm-motif-fg` regardless.
   */
  readonly motifCatalog: readonly {
    readonly name: ZmMotifName;
    readonly label: string;
    readonly use: string;
    readonly tone: 'subtle' | 'raised';
  }[] = [
    { name: 'signal-arc', label: 'Sinyal yayı', use: 'Başlık/hero köşesi · yayılım', tone: 'raised' },
    { name: 'pulse-node', label: 'Vuruş düğümü', use: 'Etkin gezinti · canlılık', tone: 'subtle' },
    { name: 'editorial-cut', label: 'Editöryel kesiş', use: 'Bölüm ayracı · oluk', tone: 'subtle' },
    { name: 'thread-line', label: 'İplik çizgisi', use: 'Zaman/akış oluk · bağlantı', tone: 'raised' },
  ];

  /**
   * Thread-line context demo (VAL-DS-034): a vertical thread runs in a reserved
   * GUTTER beside each item's content. The motif never crosses the body text;
   * it sits in its own column. Real Turkish copy, no lorem.
   */
  readonly threadItems: readonly {
    readonly id: string;
    readonly title: string;
    readonly text: string;
  }[] = [
    { id: 't1', title: 'Bağlantı isteği', text: 'Deniz, ağ profiline seni takip etmek istiyor.' },
    { id: 't2', title: 'Yeni gönderi', text: 'Çınar, "Yaşayan editöryel ağ" başlıklı bir yazı paylaştı.' },
    { id: 't3', title: 'Yanıt', text: 'Ela, sorunu "Sinyal yayısıyla" yanıtladı.' },
  ];

  /**
   * Pulse-node context demo (VAL-DS-033 active-state indicator): the active nav
   * item carries a pulse-node BESIDE its label (never behind it). Inactive
   * items show a quiet rest dot. The motif is the only motion on the row; the
   * label is plain text so contrast is unaffected.
   */
  readonly navSample: readonly {
    readonly id: string;
    readonly label: string;
    readonly active: boolean;
  }[] = [
    { id: 'n1', label: 'Akış', active: true },
    { id: 'n2', label: 'Keşfet', active: false },
    { id: 'n3', label: 'Mesajlar', active: false },
    { id: 'n4', label: 'Bildirimler', active: false },
  ];
}
