import { ChangeDetectionStrategy, Component, ElementRef, OnDestroy, computed, effect, input, signal, untracked, viewChild } from '@angular/core';
import { MediaResolver, ResolvedMedia } from './media-resolver.service';

interface GalleryItem { readonly id: string; readonly media: ResolvedMedia | null; readonly failed: boolean; }

@Component({
  selector: 'zm-authorized-media-gallery',
  template: `
    <section class="gallery" [attr.aria-label]="label()" [attr.data-count]="items().length">
      @for (item of items(); track item.id) {
        <figure>
          @if (item.media; as media) {
            @if (media.contentType.startsWith('image/')) {
              <button class="media-trigger" type="button" (click)="openViewer($index, $event)" [attr.aria-label]="'Görsel ' + ($index + 1) + ' / ' + items().length + ' · tam boy aç'">
                <img [src]="media.url" alt="Gönderi görseli" loading="lazy">
              </button>
            } @else if (media.contentType.startsWith('video/')) {
              <div class="video-shell">
                <video controls preload="metadata" aria-label="Gönderi videosu"><source [src]="media.url" [type]="media.contentType"></video>
                <button class="viewer-open" type="button" (click)="openViewer($index, $event)">Tam boy aç</button>
              </div>
            }
          } @else {
            <div class="state" [class.error]="item.failed" role="status">
              {{ item.failed ? 'Medya şu anda açılamadı.' : 'Medya hazırlanıyor…' }}
              @if (item.failed) { <button type="button" (click)="retry(item.id)">Yeniden dene</button> }
            </div>
          }
        </figure>
      }
    </section>

    <dialog #viewer class="viewer" [attr.aria-label]="label() + ' görüntüleyici'" (cancel)="closeViewer($event)" (click)="closeFromBackdrop($event)" (keydown)="viewerKeydown($event)">
      @if (selected(); as media) {
        <div class="viewer-panel">
          <header>
            <span>{{ selectedIndex()! + 1 }} / {{ items().length }}</span>
            <button #viewerClose type="button" class="viewer-close" (click)="closeViewer()" aria-label="Görüntüleyiciyi kapat">Kapat</button>
          </header>
          <div class="viewer-stage">
            @if (media.contentType.startsWith('image/')) {
              <img [src]="media.url" alt="Gönderi görseli · tam boy">
            } @else {
              <video controls preload="metadata" aria-label="Gönderi videosu · tam boy"><source [src]="media.url" [type]="media.contentType"></video>
            }
          </div>
          @if (resolvedCount() > 1) {
            <nav aria-label="Medya görüntüleyici gezinmesi">
              <button type="button" (click)="move(-1)" aria-label="Önceki medya">Önceki</button>
              <button type="button" (click)="move(1)" aria-label="Sonraki medya">Sonraki</button>
            </nav>
          }
        </div>
      }
    </dialog>
  `,
  styleUrl: './authorized-media-gallery.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthorizedMediaGalleryComponent implements OnDestroy {
  readonly mediaIds = input.required<readonly string[]>();
  readonly label = input('Gönderi medyası');
  readonly items = signal<GalleryItem[]>([]);
  readonly pendingIds = signal(new Set<string>());
  readonly selectedIndex = signal<number | null>(null);
  readonly selected = computed(() => {
    const index = this.selectedIndex();
    return index === null ? null : this.items()[index]?.media ?? null;
  });
  readonly resolvedCount = computed(() => this.items().filter(item => item.media !== null).length);
  private readonly viewer = viewChild<ElementRef<HTMLDialogElement>>('viewer');
  private readonly viewerClose = viewChild<ElementRef<HTMLButtonElement>>('viewerClose');
  private revision = 0;
  private destroyed = false;
  private readonly controllers = new Map<string, AbortController>();
  private returnFocus: HTMLElement | null = null;
  private viewerRevision = 0;
  private readonly sync = effect(() => {
    const ids = this.mediaIds();
    this.resolver.sessionRevision?.();
    untracked(() => { void this.load(ids); });
  });

  constructor(private readonly resolver: MediaResolver) {}

  retry(id: string): void {
    if (this.pendingIds().has(id)) return;
    this.replace(id, item => ({ ...item, failed: false }));
    void this.resolve(id, this.revision);
  }

  openViewer(index: number, event: Event): void {
    if (!this.items()[index]?.media) return;
    const revision = ++this.viewerRevision;
    this.returnFocus = event.currentTarget as HTMLElement;
    this.selectedIndex.set(index);
    requestAnimationFrame(() => {
      if (revision !== this.viewerRevision || this.selectedIndex() === null) return;
      const dialog = this.viewer()?.nativeElement;
      if (!dialog) return;
      try {
        if (typeof dialog.showModal === 'function') dialog.showModal();
        else dialog.setAttribute('open', '');
      } catch {
        dialog.setAttribute('open', '');
      }
      this.viewerClose()?.nativeElement.focus();
    });
  }

  closeViewer(event?: Event): void {
    event?.preventDefault();
    this.viewerRevision++;
    const dialog = this.viewer()?.nativeElement;
    if (dialog?.open && typeof dialog.close === 'function') dialog.close();
    else dialog?.removeAttribute('open');
    this.selectedIndex.set(null);
    const target = this.returnFocus;
    this.returnFocus = null;
    if (target?.isConnected) requestAnimationFrame(() => target.focus());
  }

  closeFromBackdrop(event: MouseEvent): void {
    if (event.target === this.viewer()?.nativeElement) this.closeViewer();
  }

  viewerKeydown(event: KeyboardEvent): void {
    if ((event.target as Element | null)?.closest('video, button, input, select, textarea, a, [contenteditable="true"]')) return;
    if (event.key === 'ArrowLeft') { event.preventDefault(); this.move(-1); }
    if (event.key === 'ArrowRight') { event.preventDefault(); this.move(1); }
  }

  move(delta: number): void {
    const index = this.selectedIndex();
    const resolved = this.items().flatMap((item, itemIndex) => item.media ? [itemIndex] : []);
    if (index === null || resolved.length < 2) return;
    const position = resolved.indexOf(index);
    if (position < 0) return;
    this.selectedIndex.set(resolved[(position + delta + resolved.length) % resolved.length]);
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.revision++;
    this.closeViewer();
    this.cancelPending();
    this.releaseAll();
    this.sync.destroy();
  }

  private async load(ids: readonly string[]): Promise<void> {
    const revision = ++this.revision;
    this.closeViewer();
    this.cancelPending();
    this.releaseAll();
    this.items.set(ids.map(id => ({ id, media: null, failed: false })));
    await Promise.all(ids.map(id => this.resolve(id, revision)));
  }

  private async resolve(id: string, revision: number): Promise<void> {
    if (this.pendingIds().has(id)) return;
    const controller = new AbortController();
    this.controllers.set(id, controller);
    this.setPending(id,true);
    try {
      const media = await this.resolver.resolve(id, null, controller.signal);
      if (this.destroyed || revision !== this.revision || !this.items().some(item => item.id === id)) {
        media.release();
        return;
      }
      this.replace(id, item => { item.media?.release(); return ({ ...item, media, failed: false }); });
    } catch (error) {
      if ((error as Error).name !== 'AbortError' && !this.destroyed && revision === this.revision) this.replace(id, item => ({ ...item, failed: true }));
    } finally {
      if (this.controllers.get(id) === controller) {
        this.controllers.delete(id);
        this.setPending(id,false);
      }
    }
  }

  private cancelPending(): void {
    this.controllers.forEach(controller => controller.abort());
    this.controllers.clear();
    this.pendingIds.set(new Set());
  }
  private releaseAll(): void { this.items().forEach(item => item.media?.release()); }
  private replace(id: string, transform: (item: GalleryItem) => GalleryItem): void {
    this.items.update(items => items.map(item => item.id === id ? transform(item) : item));
  }
  private setPending(id:string,pending:boolean):void{this.pendingIds.update(current=>{const next=new Set(current);if(pending)next.add(id);else next.delete(id);return next;});}
}
