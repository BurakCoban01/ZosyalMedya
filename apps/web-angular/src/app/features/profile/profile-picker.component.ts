import { ChangeDetectionStrategy, Component, effect, input, output, signal } from '@angular/core';
import { FormControl, ReactiveFormsModule, Validators } from '@angular/forms';
import { Api, search, SearchHit } from '@platform/api';

@Component({
  selector: 'zm-profile-picker',
  imports: [ReactiveFormsModule],
  template: `
    <section class="profile-picker" [attr.aria-label]="label()">
      <div class="profile-picker__heading">
        <label [for]="inputId">{{ label() }}</label>
        <p>{{ hint() }}</p>
      </div>

      @if (selected(); as profile) {
        <div class="profile-picker__selected" role="status">
          <span class="profile-picker__avatar" aria-hidden="true">{{ initials(profile.title) }}</span>
          <span>
            <strong>{{ profile.title }}</strong>
            <small>{{ profile.snippet || 'Görünür profil' }}</small>
          </span>
          <button type="button" (click)="clear()">Değiştir</button>
        </div>
      } @else {
        <form class="profile-picker__search" (submit)="$event.preventDefault(); runSearch()">
          <input
            [id]="inputId"
            [formControl]="query"
            type="search"
            autocomplete="off"
            placeholder="Ad veya kullanıcı adı"
            [attr.aria-describedby]="inputId + '-help'"
          >
          <button type="submit" [disabled]="query.invalid || searching()">
            {{ searching() ? 'Aranıyor…' : 'Profilleri ara' }}
          </button>
        </form>

        <span [id]="inputId + '-help'" class="profile-picker__sr-only">
          En az iki karakter yaz ve görünen profillerden birini seç.
        </span>

        @if (message()) {
          <p class="profile-picker__message" role="status">{{ message() }}</p>
        }

        @if (searched() && !searching()) {
          <div class="profile-picker__results" role="listbox" [attr.aria-label]="label() + ' sonuçları'">
            @for (profile of results(); track profile.ownerId) {
              <button
                type="button"
                role="option"
                aria-selected="false"
                (click)="choose(profile)"
              >
                <span class="profile-picker__avatar" aria-hidden="true">{{ initials(profile.title) }}</span>
                <span>
                  <strong>{{ profile.title }}</strong>
                  <small>{{ profile.snippet || 'Görünür profil' }}</small>
                </span>
                <span class="profile-picker__choose">Seç</span>
              </button>
            } @empty {
              <p>Bu aramayla eşleşen görünür bir profil yok.</p>
            }
          </div>
        }
      }
    </section>
  `,
  styleUrl: './profile-picker.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class ZmProfilePickerComponent {
  private static nextId = 0;

  readonly label = input('Kişi seç');
  readonly hint = input('Gerçek profiller arasında ad veya kullanıcı adıyla ara.');
  readonly excludeOwnerId = input('');
  readonly initialSelection = input<SearchHit | null>(null);
  readonly selectedChange = output<SearchHit | null>();

  readonly inputId = `zm-profile-picker-${++ZmProfilePickerComponent.nextId}`;
  readonly query = new FormControl('', {
    nonNullable: true,
    validators: [Validators.required, Validators.minLength(2)]
  });
  readonly results = signal<SearchHit[]>([]);
  readonly selected = signal<SearchHit | null>(null);
  readonly searching = signal(false);
  readonly searched = signal(false);
  readonly message = signal('');

  constructor(private readonly api: Api) {
    effect(() => {
      const initial = this.initialSelection();
      if (initial && this.selected()?.ownerId !== initial.ownerId) this.selected.set(initial);
    });
  }

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
      this.message.set('Profil araması tamamlanamadı. Tekrar deneyebilirsin.');
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
    this.selectedChange.emit(null);
  }

  initials(title: string): string {
    const words = title.trim().split(/\s+/).filter(Boolean);
    return words.slice(0, 2).map(word => word[0]?.toLocaleUpperCase('tr-TR') ?? '').join('') || 'K';
  }
}
