import { DatePipe } from '@angular/common';
import { ChangeDetectionStrategy, Component, OnDestroy, OnInit, computed, signal } from '@angular/core';
import { Router } from '@angular/router';
import {
  Api,
  listNotifications,
  markNotificationRead,
  NotificationView
} from '@platform/api';
import { MessagingRealtimeService } from '../../core/realtime/messaging-realtime.service';

interface NotificationGroup {
  key: string;
  label: string;
  items: NotificationView[];
}

@Component({
  selector: 'app-notifications-page',
  imports: [DatePipe],
  template: `
    <header class="notification-head">
      <p>BİLDİRİMLER</p>
      <h1>Hareketlerin.</h1>
      <span>Tepkiler, yorumlar, mesajlar ve hesap gelişmeleri zaman sırasıyla burada.</span>
    </header>

    @if (message()) {
      <p
        class="status"
        [class.status-error]="messageIsError()"
        [attr.role]="messageIsError() ? 'alert' : 'status'"
        aria-live="polite"
      >
        {{ message() }}
      </p>
    }

    @if (loading() && items().length === 0) {
      <section class="state-panel" aria-busy="true" aria-live="polite">
        <strong>Bildirimlerin yükleniyor.</strong>
        <p>Son hareketler hesabından alınıyor.</p>
      </section>
    } @else if (loadError() && items().length === 0) {
      <section class="state-panel error-panel" role="alert">
        <strong>Bildirimler yüklenemedi.</strong>
        <p>{{ loadError() }}</p>
        <button class="retry" type="button" (click)="load(false)">Tekrar dene</button>
      </section>
    } @else {
      <div class="notification-groups" aria-live="polite">
        @for (group of groups(); track group.key) {
          <section class="notification-group" [attr.aria-labelledby]="'notification-group-' + group.key">
            <h2 [id]="'notification-group-' + group.key">{{ group.label }}</h2>
            <div class="notification-list">
              @for (item of group.items; track item.id) {
                <button
                  type="button"
                  [class.unread]="!item.isRead"
                  [disabled]="isPending(item.id)"
                  [attr.aria-busy]="isPending(item.id)"
                  (click)="open(item)"
                >
                  <span class="type-icon" aria-hidden="true">
                    <svg viewBox="0 0 24 24" focusable="false">
                      @switch (item.type) {
                        @case ('Message') {
                          <path d="M4 5.5h16v11H9l-5 3v-14Z"></path>
                          <path d="M8 10h8M8 13h5"></path>
                        }
                        @case ('Reaction') {
                          <path d="M12 20s-7-4.2-8.6-9C2.3 7.6 4.2 4.5 7.5 4.5c2 0 3.5 1.2 4.5 2.7 1-1.5 2.5-2.7 4.5-2.7 3.3 0 5.2 3.1 4.1 6.5C19 15.8 12 20 12 20Z"></path>
                        }
                        @case ('Comment') {
                          <path d="M4 5.5h16v11H9l-5 3v-14Z"></path>
                          <path d="M8 10h8"></path>
                        }
                        @case ('NewFollower') {
                          <circle cx="9" cy="8" r="3"></circle>
                          <path d="M3.5 19c.7-4 2.6-6 5.5-6s4.8 2 5.5 6M18 8v6M15 11h6"></path>
                        }
                        @case ('Moderation') {
                          <path d="M12 3 20 6v5c0 5-3.2 8.2-8 10-4.8-1.8-8-5-8-10V6l8-3Z"></path>
                          <path d="m8.5 12 2.2 2.2 4.8-5"></path>
                        }
                        @case ('Community') {
                          <circle cx="8" cy="9" r="3"></circle>
                          <circle cx="17" cy="10" r="2.5"></circle>
                          <path d="M2.5 20c.6-4 2.5-6 5.5-6s4.9 2 5.5 6M14 15c3.5-.5 5.8 1.2 7 4.5"></path>
                        }
                        @default {
                          <path d="M18 9a6 6 0 0 0-12 0c0 6-2.5 8-2.5 8h17S18 15 18 9Z"></path>
                          <path d="M10 21h4"></path>
                        }
                      }
                    </svg>
                  </span>

                  <span class="notification-copy">
                    <span class="notification-meta">
                      <span class="type-label">{{ typeLabel(item) }}</span>
                      @if (!item.isRead) {
                        <span class="unread-label">Okunmadı</span>
                      }
                    </span>
                    <strong>{{ title(item) }}</strong>
                    <small>{{ body(item) }}</small>
                    <time [attr.datetime]="item.createdAtUtc">
                      {{ item.createdAtUtc | date:'HH:mm' }}
                    </time>
                  </span>

                  @if (item.count > 1) {
                    <b [attr.aria-label]="item.count + ' benzer bildirim'">{{ item.count }}</b>
                  }
                </button>
              }
            </div>
          </section>
        } @empty {
          <section class="state-panel empty">
            <strong>Her şey güncel.</strong>
            <p>Yeni bir gelişme olduğunda burada göreceksin.</p>
          </section>
        }
      </div>

      @if (loadError() && items().length > 0) {
        <section class="inline-error" role="alert">
          <span>{{ loadError() }}</span>
          <button class="retry" type="button" (click)="load(false)">Listeyi yenile</button>
        </section>
      }

      @if (nextCursor()) {
        <button class="more" type="button" [disabled]="loadingMore()" (click)="load(true)">
          {{ loadingMore() ? 'Yükleniyor…' : 'Daha fazla' }}
        </button>
      }
    }
  `,
  styleUrl: './notifications.page.css',
  changeDetection: ChangeDetectionStrategy.OnPush
})
export class NotificationsPage implements OnInit, OnDestroy {
  readonly items = signal<NotificationView[]>([]);
  readonly nextCursor = signal<string | null>(null);
  readonly loading = signal(true);
  readonly loadingMore = signal(false);
  readonly loadError = signal('');
  readonly message = signal('');
  readonly messageIsError = signal(false);
  readonly pendingIds = signal<ReadonlySet<string>>(new Set());

  readonly groups = computed<NotificationGroup[]>(() => {
    const grouped = new Map<string, NotificationGroup>();
    for (const item of this.items()) {
      const date = new Date(item.createdAtUtc);
      const validDate = !Number.isNaN(date.getTime());
      const key = validDate
        ? `${date.getFullYear()}-${date.getMonth() + 1}-${date.getDate()}`
        : 'unknown';
      const existing = grouped.get(key);
      if (existing) {
        existing.items.push(item);
      } else {
        grouped.set(key, {
          key,
          label: validDate ? this.dateLabel(date) : 'Daha önce',
          items: [item]
        });
      }
    }
    return [...grouped.values()];
  });

  private unsubscribe?: () => void;
  private loadRevision = 0;

  constructor(
    private readonly api: Api,
    private readonly realtime: MessagingRealtimeService,
    private readonly router: Router
  ) {}

  ngOnInit(): void {
    void this.load(false);
    this.unsubscribe = this.realtime.onNotification(() => void this.load(false));
    void this.realtime.connect().catch(() => undefined);
  }

  ngOnDestroy(): void {
    this.unsubscribe?.();
  }

  async load(append: boolean): Promise<void> {
    if (append && (this.loadingMore() || !this.nextCursor())) return;
    const revision = append ? this.loadRevision : ++this.loadRevision;
    if (append) this.loadingMore.set(true);
    else if (this.items().length === 0) this.loading.set(true);
    this.loadError.set('');

    try {
      const page = await this.api.invoke(listNotifications, {
        limit: 40,
        cursor: append ? this.nextCursor() ?? undefined : undefined
      });
      if (revision !== this.loadRevision) return;
      this.items.set(append ? this.mergeUnique(this.items(), page.items) : page.items);
      this.nextCursor.set(page.nextCursor ?? null);
    } catch {
      if (revision === this.loadRevision) this.loadError.set('Bağlantını kontrol edip yeniden dene; mevcut bildirimlerin korunur.');
    } finally {
      if (revision === this.loadRevision) {
        this.loading.set(false);
        this.loadingMore.set(false);
      }
    }
  }

  async open(item: NotificationView): Promise<void> {
    if (this.isPending(item.id)) return;
    this.setPending(item.id, true);
    this.message.set('');
    this.messageIsError.set(false);

    try {
      if (!item.isRead) {
        const changed = await this.api.invoke(markNotificationRead, { notificationId: item.id });
        this.items.update(items => items.map(current => current.id === changed.id ? changed : current));
      }

      const target = this.targetLink(item);
      if (target) {
        const navigated = await this.router.navigateByUrl(target);
        if (!navigated) this.message.set('Bildirim okundu; hedef artık kullanılamıyor.');
      } else {
        this.message.set('Bildirim okundu; güvenli bir uygulama bağlantısı olmadığı için hedef açılmadı.');
      }
    } catch {
      this.message.set('Bildirim güncellenemedi. Yeniden deneyebilirsin.');
      this.messageIsError.set(true);
    } finally {
      this.setPending(item.id, false);
    }
  }

  isPending(id: string): boolean {
    return this.pendingIds().has(id);
  }

  title(item: NotificationView): string {
    if (item.titleTemplateKey === 'notification.follow_request.title') return 'Yeni takip isteği';
    if (item.titleTemplateKey === 'notification.question.title') return 'Yeni soru';
    if (item.titleTemplateKey === 'notification.mention.title') return 'Bir gönderide anıldın';
    const titles: Record<string, string> = {
      NewFollower: 'Yeni takipçi',
      Reaction: 'Gönderine tepki geldi',
      Comment: 'Gönderine yorum geldi',
      Message: 'Yeni mesaj',
      Moderation: 'Güvenlik güncellemesi',
      Community: 'Topluluk güncellemesi',
      System: 'Hesap güncellemesi'
    };
    return titles[item.type] ?? 'Yeni bildirim';
  }

  body(item: NotificationView): string {
    const type = item.type as string;
    const actor = item.arguments['actorName'] ?? item.arguments['senderName'] ?? '';
    const preview = item.arguments['preview'] ?? '';
    if (preview) return actor ? `${actor} · ${preview}` : preview;
    if (type === 'NewFollower' && actor) {
      if (item.arguments['followState'] === 'Pending') return `${actor} seni takip etmek istiyor.`;
      return `${actor} seni takip etmeye başladı.`;
    }
    if (actor) return `${actor} ile ilgili yeni bir gelişme var.`;
    return item.count > 1 ? `${item.count} benzer gelişme birleştirildi.` : 'Yeni bir gelişme var.';
  }

  typeLabel(item: NotificationView): string {
    if (item.titleTemplateKey === 'notification.follow_request.title') return 'Takip isteği';
    if (item.titleTemplateKey === 'notification.question.title') return 'Soru';
    if (item.titleTemplateKey === 'notification.mention.title') return 'Anılma';
    const labels: Record<string, string> = {
      NewFollower: 'Takip',
      Reaction: 'Tepki',
      Comment: 'Yorum',
      Message: 'Mesaj',
      Moderation: 'Güvenlik',
      Community: 'Topluluk',
      System: 'Sistem'
    };
    return labels[item.type] ?? 'Bildirim';
  }

  targetLink(item: NotificationView): string | null {
    if ((item.type === 'Reaction' || item.type === 'Comment') && item.entityId)
      return `/icerik/${item.entityId}`;
    if (item.titleTemplateKey === 'notification.question.title' && item.entityId)
      return `/sorular/${item.entityId}`;
    if (item.type === 'NewFollower' && item.arguments['followState'] === 'Pending')
      return '/baglantilar?view=requests';
    if (item.type === 'NewFollower' && item.arguments['actorHandle'])
      return `/profil/${encodeURIComponent(item.arguments['actorHandle'])}`;
    return this.isSafeInternalLink(item.deepLink) ? item.deepLink : null;
  }

  private dateLabel(date: Date): string {
    const today = new Date();
    const todayStart = new Date(today.getFullYear(), today.getMonth(), today.getDate()).getTime();
    const dateStart = new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime();
    const difference = Math.round((todayStart - dateStart) / 86_400_000);
    if (difference === 0) return 'Bugün';
    if (difference === 1) return 'Dün';
    return new Intl.DateTimeFormat('tr-TR', {
      day: 'numeric',
      month: 'long',
      year: date.getFullYear() === today.getFullYear() ? undefined : 'numeric'
    }).format(date);
  }

  private mergeUnique(current: NotificationView[], incoming: NotificationView[]): NotificationView[] {
    const byId = new Map(current.map(item => [item.id, item]));
    for (const item of incoming) byId.set(item.id, item);
    return [...byId.values()];
  }

  private isSafeInternalLink(value: string): boolean {
    return value.startsWith('/') && !value.startsWith('//') && !value.includes('\\');
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
