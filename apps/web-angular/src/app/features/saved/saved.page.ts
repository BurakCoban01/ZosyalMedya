import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnInit, signal } from '@angular/core';
import { RouterLink } from '@angular/router';
import {
  Api,
  listSavedContent,
  removeSavedContent,
  saveContent,
  SavedContentView
} from '@platform/api';
import { AuthorizedMediaGalleryComponent } from '../../core/media/authorized-media-gallery.component';
import { RichTextComponent } from '../../core/social/rich-text.component';
import { ReportActionComponent } from '../../core/moderation/report-action.component';

@Component({
  selector: 'app-saved-page',
  imports: [DatePipe, RouterLink, AuthorizedMediaGalleryComponent, RichTextComponent, ReportActionComponent],
  template: `
    <section class="saved">
      <header>
        <p>KİŞİSEL KÜTÜPHANE</p>
        <h1>Kaydettiklerin.</h1>
        <span>Daha sonra dönmek istediğin içerikler yalnızca senin hesabında tutulur.</span>
      </header>

      @if (message()) {
        <div
          class="status"
          [class.status-error]="messageIsError()"
          [attr.role]="messageIsError() ? 'alert' : 'status'"
          aria-live="polite"
        >
          <span>{{ message() }}</span>
          @if (lastRemoved()) {
            <button type="button" [disabled]="undoing()" (click)="undoRemove()">
              {{ undoing() ? 'Geri alınıyor…' : 'Geri al' }}
            </button>
          }
        </div>
      }

      @if (loading() && items().length === 0) {
        <section class="state-panel" aria-busy="true" aria-live="polite">
          <strong>Kütüphanen hazırlanıyor.</strong>
          <p>Kaydettiğin içerikler hesabından alınıyor.</p>
        </section>
      } @else if (loadError() && items().length === 0) {
        <section class="state-panel error-panel" role="alert">
          <strong>Kaydedilenler yüklenemedi.</strong>
          <p>{{ loadError() }}</p>
          <button type="button" (click)="load(false)">Tekrar dene</button>
        </section>
      } @else {
        <div class="list">
          @for (item of items(); track item.id) {
            <article [attr.aria-busy]="isPending(item.id)">
              <div class="item-meta">
                <span>{{ item.collection }}</span>
                <time [attr.datetime]="item.savedAtUtc">
                  {{ item.savedAtUtc | date:'dd MMM yyyy' }}
                </time>
              </div>

              @if (item.content.contentWarning) {
                <p class="content-warning">
                  <strong>İçerik uyarısı:</strong> {{ item.content.contentWarning }}
                </p>
              }

              <p class="content-text"><zm-rich-text [text]="item.content.text || 'Metinsiz medya paylaşımı'" /></p>

              @if (item.content.mediaIds.length > 0) {
                <zm-authorized-media-gallery [mediaIds]="item.content.mediaIds" label="Kaydedilen gönderinin medyası" />
              }

              @if (item.content.hashtags.length > 0) {
                <div class="hashtags" aria-label="Etiketler">
                  @for (tag of item.content.hashtags; track tag) {
                    <a routerLink="/kesfet" [queryParams]="{q:'#'+tag}">#{{ tag }}</a>
                  }
                </div>
              }

              <dl class="content-context">
                <div><dt>Tür</dt><dd>{{ shareLabel(item.content.shareKind) }}</dd></div>
                <div><dt>Görünürlük</dt><dd>{{ visibilityLabel(item.content.visibility) }}</dd></div>
                <div><dt>Görüntülenme</dt><dd>{{ item.content.viewCount }}</dd></div>
                <div>
                  <dt>Yayınlandı</dt>
                  <dd>{{ item.content.publishedAtUtc | date:'dd MMM · HH:mm' }}</dd>
                </div>
              </dl>

              <footer>
                <div class="item-links">
                  <a [routerLink]="['/icerik', item.content.id]">Gönderiyi aç</a>
                  @if (externalHref(item.content.linkUrl); as link) {
                    <a [href]="link" target="_blank" rel="noopener noreferrer nofollow">
                      Paylaşımdaki bağlantıyı aç
                    </a>
                  }
                </div>
                <button
                  type="button"
                  [disabled]="isPending(item.id)"
                  (click)="remove(item)"
                >
                  {{ isPending(item.id) ? 'Kaldırılıyor…' : 'Kayıttan çıkar' }}
                </button>
              </footer>
              <zm-report-action subjectType="Content" [subjectId]="item.content.id" label="Gönderiyi bildir" />
            </article>
          } @empty {
            <section class="state-panel empty">
              <strong>Henüz kayıt yok.</strong>
              <p>Akıştaki Kaydet düğmesiyle kişisel kütüphaneni oluşturabilirsin.</p>
            </section>
          }
        </div>

        @if (loadError() && items().length > 0) {
          <section class="inline-error" role="alert">
            <span>{{ loadError() }}</span>
            <button type="button" (click)="load(false)">Listeyi yenile</button>
          </section>
        }

        @if (nextCursor()) {
          <button class="more" type="button" [disabled]="loadingMore()" (click)="load(true)">
            {{ loadingMore() ? 'Yükleniyor…' : 'Daha fazla' }}
          </button>
        }
      }
    </section>
  `,
  styleUrl: './saved.page.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class SavedPage implements OnInit {
  readonly items = signal<SavedContentView[]>([]);
  readonly nextCursor = signal<string | null>(null);
  readonly loading = signal(true);
  readonly loadingMore = signal(false);
  readonly loadError = signal('');
  readonly message = signal('');
  readonly messageIsError = signal(false);
  readonly pendingIds = signal<ReadonlySet<string>>(new Set());
  readonly lastRemoved = signal<SavedContentView | null>(null);
  readonly undoing = signal(false);

  constructor(private readonly api: Api) {}

  ngOnInit(): void {
    void this.load(false);
  }

  async load(append: boolean): Promise<boolean> {
    if (append && (this.loadingMore() || !this.nextCursor())) return false;
    if (append) this.loadingMore.set(true);
    else if (this.items().length === 0) this.loading.set(true);
    this.loadError.set('');

    try {
      const page = await this.api.invoke(listSavedContent, {
        limit: 30,
        cursor: append ? this.nextCursor() ?? undefined : undefined
      });
      this.items.set(append ? this.mergeUnique(this.items(), page.items) : page.items);
      this.nextCursor.set(page.nextCursor ?? null);
      return true;
    } catch {
      this.loadError.set('Bağlantını kontrol edip yeniden dene; mevcut liste korunur.');
      return false;
    } finally {
      this.loading.set(false);
      this.loadingMore.set(false);
    }
  }

  async remove(item: SavedContentView): Promise<void> {
    if (this.isPending(item.id)) return;
    const snapshot = this.items();
    this.setPending(item.id, true);
    this.items.update(items => items.filter(current => current.id !== item.id));
    this.lastRemoved.set(null);
    this.message.set('Kayıt kaldırılıyor…');
    this.messageIsError.set(false);

    try {
      await this.api.invoke(removeSavedContent, {
        contentId: item.content.id,
        collection: item.collection
      });
      this.lastRemoved.set(item);
      this.message.set(`“${item.collection}” koleksiyonundaki kayıt kaldırıldı.`);
    } catch {
      this.items.set(snapshot);
      this.message.set('Kayıt kaldırılamadı; görünüm geri alındı.');
      this.messageIsError.set(true);
    } finally {
      this.setPending(item.id, false);
    }
  }

  async undoRemove(): Promise<void> {
    const item = this.lastRemoved();
    if (!item || this.undoing()) return;
    this.undoing.set(true);
    this.message.set('');
    this.messageIsError.set(false);

    try {
      await this.api.invoke(saveContent, {
        contentId: item.content.id,
        body: { collection: item.collection }
      });
      this.lastRemoved.set(null);
      const refreshed = await this.load(false);
      this.message.set(refreshed
        ? 'Kayıt yeniden eklendi.'
        : 'Kayıt yeniden eklendi; liste şu anda yenilenemedi.');
    } catch {
      this.message.set('Kayıt yeniden eklenemedi. Yeniden deneyebilirsin.');
      this.messageIsError.set(true);
    } finally {
      this.undoing.set(false);
    }
  }

  isPending(id: string): boolean {
    return this.pendingIds().has(id);
  }

  shareLabel(value: string): string {
    return ({ Original: 'Özgün gönderi', Repost: 'Yeniden paylaşım', Quote: 'Alıntı' } as Record<string, string>)[value]
      ?? 'Gönderi';
  }

  visibilityLabel(value: string): string {
    return ({
      Public: 'Herkese açık',
      Followers: 'Takipçiler',
      CloseFriends: 'Yakın arkadaşlar',
      Private: 'Yalnızca sen'
    } as Record<string, string>)[value] ?? 'Sınırlı';
  }

  externalHref(value: string | null | undefined): string | null {
    if (!value) return null;
    try {
      const url = new URL(value);
      return url.protocol === 'http:' || url.protocol === 'https:' ? url.href : null;
    } catch {
      return null;
    }
  }

  private mergeUnique(current: SavedContentView[], incoming: SavedContentView[]): SavedContentView[] {
    const byId = new Map(current.map(item => [item.id, item]));
    for (const item of incoming) byId.set(item.id, item);
    return [...byId.values()];
  }

  private setPending(id: string, pending: boolean): void {
    this.pendingIds.update(current => {
      const next = new Set(current);
      if (pending) next.add(id);
      else next.delete(id);
      return next;
    });
  }
}
