import { ChangeDetectionStrategy, Component, effect, input, output, signal, untracked } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { Api, search, SearchHit } from '@platform/api';
import {
  IonButton,
  IonItem,
  IonLabel,
  IonList,
  IonNote,
  IonSearchbar,
  IonSpinner
} from '@ionic/angular/standalone';

@Component({
  selector: 'zm-mobile-profile-picker',
  imports: [
    ReactiveFormsModule,
    IonButton,
    IonItem,
    IonLabel,
    IonList,
    IonNote,
    IonSearchbar,
    IonSpinner
  ],
  template: `
    <section class="profile-picker" [attr.aria-label]="label()">
      <header>
        <strong>{{ label() }}</strong>
        <p>{{ hint() }}</p>
      </header>

      @if (selected(); as profile) {
        <ion-list inset="true" class="selected-profile">
          <ion-item lines="none">
            <span class="avatar" slot="start" aria-hidden="true">{{ initials(profile.title) }}</span>
            <ion-label>
              <h2>{{ profile.title }}</h2>
              <p>{{ profile.snippet || 'Görünür profil' }}</p>
            </ion-label>
            <ion-button slot="end" fill="clear" type="button" (click)="clear()">Değiştir</ion-button>
          </ion-item>
        </ion-list>
      } @else {
        <form (ngSubmit)="runSearch()">
          <ion-searchbar
            [formControl]="query"
            inputmode="search"
            autocomplete="off"
            placeholder="Ad veya kullanıcı adı"
            [attr.aria-label]="label()"
            [attr.aria-describedby]="inputId + '-help'"
          ></ion-searchbar>
          <ion-button expand="block" type="submit" [disabled]="query.invalid || searching()">
            @if (searching()) {
              <ion-spinner name="crescent" aria-hidden="true"></ion-spinner>
              Aranıyor
            } @else {
              Profilleri ara
            }
          </ion-button>
        </form>

        <p [id]="inputId + '-help'" class="help">En az iki karakter yaz ve sonuçlardan bir profil seç.</p>

        @if (message()) {
          <ion-note class="message" role="status">{{ message() }}</ion-note>
        }

        @if (searched() && !searching()) {
          <ion-list inset="true" class="results" role="listbox" [attr.aria-label]="label() + ' sonuçları'">
            @for (profile of results(); track profile.ownerId) {
              <ion-item
                button="true"
                detail="false"
                role="option"
                aria-selected="false"
                (click)="choose(profile)"
              >
                <span class="avatar" slot="start" aria-hidden="true">{{ initials(profile.title) }}</span>
                <ion-label>
                  <h2>{{ profile.title }}</h2>
                  <p>{{ profile.snippet || 'Görünür profil' }}</p>
                </ion-label>
                <ion-note slot="end">Seç</ion-note>
              </ion-item>
            } @empty {
              <ion-item lines="none">
                <ion-label class="ion-text-wrap">
                  <h2>Eşleşen profil yok</h2>
                  <p>Adı veya kullanıcı adını değiştirerek yeniden arayabilirsin.</p>
                </ion-label>
              </ion-item>
            }
          </ion-list>
        }
      }
    </section>
  `,
  styleUrl: './mobile-profile-picker.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class MobileProfilePickerComponent {
  private static nextId = 0;

  readonly label = input('Kişi seç');
  readonly hint = input('Görünür profiller arasında ad veya kullanıcı adıyla ara.');
  readonly excludeOwnerId = input('');
  readonly initialSelection = input<SearchHit | null>(null);
  readonly selectedChange = output<SearchHit | null>();

  readonly inputId = `mobile-profile-picker-${++MobileProfilePickerComponent.nextId}`;
  readonly query = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.minLength(2)]
  });
  readonly results = signal<SearchHit[]>([]);
  readonly selected = signal<SearchHit | null>(null);
  readonly searching = signal(false);
  readonly searched = signal(false);
  readonly message = signal('');
  private readonly syncInitial = effect(() => {
    const initial = this.initialSelection();
    untracked(() => this.selected.set(initial));
  });

  constructor(private readonly api: Api) {}

  async runSearch(): Promise<void> {
    const query = this.query.value.trim();
    if (query.length < 2 || this.searching()) return;

    this.searching.set(true);
    this.message.set('');
    try {
      const page = await this.api.invoke(search, { q: query, type: 'Profile', limit: 8 });
      this.results.set(page.items.filter(profile => profile.ownerId !== this.excludeOwnerId()));
      this.searched.set(true);
    } catch {
      this.results.set([]);
      this.searched.set(false);
      this.message.set('Profil araması tamamlanamadı. Bağlantını kontrol edip tekrar dene.');
    } finally {
      this.searching.set(false);
    }
  }

  choose(profile: SearchHit): void {
    this.selected.set(profile);
    this.message.set('');
    this.selectedChange.emit(profile);
  }

  clear(): void {
    this.selected.set(null);
    this.results.set([]);
    this.searched.set(false);
    this.query.reset();
    this.selectedChange.emit(null);
  }

  initials(title: string): string {
    const words = title.trim().split(/\s+/).filter(Boolean);
    return words.slice(0, 2).map(word => word[0]?.toLocaleUpperCase('tr-TR') ?? '').join('') || 'K';
  }
}
