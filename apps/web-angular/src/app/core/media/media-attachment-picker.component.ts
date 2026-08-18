import { ChangeDetectionStrategy, Component, OnDestroy, computed, effect, input, output, signal } from '@angular/core';
import { Api, MediaView, deleteMedia, initiateMedia, uploadMediaContent } from '@platform/api';
import { MediaResolver, ResolvedMedia } from './media-resolver.service';
import { TokenVault } from '../auth/token-vault.service';
import { SessionMediaCleanup } from './session-media-cleanup.service';

type MediaVisibility = 'Private' | 'Followers' | 'Public';

interface MediaAttachment {
  readonly media: MediaView;
  readonly preview: ResolvedMedia | null;
  readonly previewError: boolean;
}

export interface MediaAttachmentTransfer {
  readonly ids: string[];
  discard(): Promise<boolean>;
  discardWithAccessToken(accessToken: string | null): Promise<boolean>;
  rollback(): Promise<boolean>;
}

let nextPickerId = 0;

@Component({
  selector: 'zm-media-attachment-picker',
  template: `
    <section class="picker" [attr.aria-labelledby]="labelId">
      <div class="picker__heading">
        <div>
          <strong [id]="labelId">{{ label() }}</strong>
          <small>{{ helpText() }}</small>
        </div>
        <label class="picker__choose" [class.picker__choose--disabled]="disabled() || uploading() || full()">
          {{ uploading() ? 'Hazırlanıyor…' : full() ? 'Sınır doldu' : 'Medya ekle' }}
          <input
            type="file"
            [multiple]="fileLimit() > 1"
            [accept]="acceptTypes()"
            [disabled]="disabled() || uploading() || full()"
            (change)="chooseFiles($event)"
          >
        </label>
      </div>

      @if (pendingNames().length) {
        <div class="picker__pending" role="status" aria-live="polite">
          <span class="picker__pulse" aria-hidden="true"></span>
          {{ pendingNames()[0] }} güvenli biçimde hazırlanıyor
          <small>{{ attachments().length + 1 }} / {{ attachments().length + pendingNames().length }}</small>
        </div>
      }

      @if (attachments().length) {
        <div class="picker__grid" aria-label="Gönderiye eklenecek medya">
          @for (attachment of attachments(); track attachment.media.id) {
            <figure class="picker__item">
              @if (attachment.preview; as preview) {
                @if (preview.contentType.startsWith('image/')) {
                  <img [src]="preview.url" [alt]="attachment.media.fileName + ' önizlemesi'">
                } @else {
                  <video controls preload="metadata" [attr.aria-label]="attachment.media.fileName + ' önizlemesi'">
                    <source [src]="preview.url" [type]="preview.contentType">
                  </video>
                }
              } @else {
                <div class="picker__fallback">
                  <span>{{ attachment.previewError ? 'Önizleme açılamadı' : 'Önizleme hazırlanıyor' }}</span>
                  @if (attachment.previewError) {
                    <button type="button" (click)="retryPreview(attachment.media.id)">Yeniden dene</button>
                  }
                </div>
              }
              <figcaption title="{{ attachment.media.fileName }}">{{ attachment.media.fileName }}</figcaption>
              <button
                class="picker__remove"
                type="button"
                [disabled]="disabled() || deletingIds().has(attachment.media.id)"
                (click)="remove(attachment.media.id)"
                [attr.aria-label]="attachment.media.fileName + ' ekini kaldır'"
              >{{ deletingIds().has(attachment.media.id) ? 'Kaldırılıyor…' : 'Kaldır' }}</button>
            </figure>
          }
        </div>
      }

      @if (error()) {
        <p class="picker__error" role="alert">{{ error() }}</p>
      }
    </section>
  `,
  styleUrl: './media-attachment-picker.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class MediaAttachmentPickerComponent implements OnDestroy {
  private static readonly maxFileBytes = 100 * 1024 * 1024;
  private static readonly imageTypes = ['image/jpeg', 'image/png', 'image/webp'] as const;
  private static readonly videoTypes = ['video/mp4'] as const;

  readonly label = input('Gönderi medyası');
  readonly visibility = input<MediaVisibility>('Private');
  readonly disabled = input(false);
  readonly maxFiles = input(10);
  readonly imagesOnly = input(false);
  readonly mediaIdsChange = output<string[]>();
  readonly uploadingChange = output<boolean>();

  readonly attachments = signal<MediaAttachment[]>([]);
  readonly pendingNames = signal<string[]>([]);
  readonly deletingIds = signal(new Set<string>());
  readonly error = signal('');
  readonly fileLimit = computed(() => Math.min(10, Math.max(1, Math.trunc(this.maxFiles()))));
  readonly acceptTypes = computed(() => [...MediaAttachmentPickerComponent.imageTypes,
    ...(this.imagesOnly() ? [] : MediaAttachmentPickerComponent.videoTypes)].join(','));
  readonly helpText = computed(() => `${this.imagesOnly() ? 'JPEG, PNG veya WebP' : 'Görsel veya MP4'} · en fazla ${this.fileLimit()} dosya · dosya başına 100 MB`);
  readonly uploading = computed(() => this.pendingNames().length > 0);
  readonly full = computed(() => this.attachments().length >= this.fileLimit());
  readonly labelId = `media-picker-${++nextPickerId}`;

  private destroyed = false;
  private sessionEpoch = 0;
  private readonly inFlightMediaIds = new Set<string>();
  private readonly deletingOwners = new Map<string, string | null>();
  private readonly previewControllers = new Map<string, AbortController>();
  private readonly unregisterSessionCleanup: () => void;
  private observedResolverRevision: number;
  private readonly resolverSync = effect(() => {
    const revision = this.resolver.sessionRevision?.() ?? 0;
    if (revision !== this.observedResolverRevision) this.refreshPreviews();
    this.observedResolverRevision = revision;
  });

  constructor(
    private readonly api: Api,
    private readonly resolver: MediaResolver,
    private readonly vault: TokenVault,
    private readonly sessionCleanup: SessionMediaCleanup,
  ) {
    this.observedResolverRevision = this.resolver.sessionRevision?.() ?? 0;
    this.unregisterSessionCleanup = this.vault.registerBeforeSessionChange?.(token => this.cleanupBeforeSessionChange(token)) ?? (() => undefined);
  }

  async chooseFiles(event: Event): Promise<void> {
    const inputElement = event.target as HTMLInputElement;
    const selected = Array.from(inputElement.files ?? []);
    inputElement.value = '';
    if (!selected.length || this.disabled() || this.uploading() || this.destroyed) return;

    const available = this.fileLimit() - this.attachments().length;
    if (selected.length > available) {
      this.error.set(`En fazla ${this.fileLimit()} medya ekleyebilirsin. ${available} yer kaldı.`);
      return;
    }
    const allowedTypes = new Set(this.acceptTypes().split(','));
    const invalid = selected.find(file => !allowedTypes.has(file.type) || file.size < 1 || file.size > MediaAttachmentPickerComponent.maxFileBytes);
    if (invalid) {
      this.error.set(`${invalid.name} desteklenmiyor. ${this.imagesOnly() ? 'JPEG, PNG veya WebP' : 'JPEG, PNG, WebP veya MP4'} seç; dosya 100 MB’ı aşmasın.`);
      return;
    }

    const operationEpoch = this.sessionEpoch;
    this.error.set('');
    this.pendingNames.set(selected.map(file => file.name));
    this.uploadingChange.emit(true);
    try {
      for (const file of selected) {
        if (this.destroyed || operationEpoch !== this.sessionEpoch) break;
        await this.upload(file);
        if (operationEpoch === this.sessionEpoch) this.pendingNames.update(names => names.slice(1));
      }
    } finally {
      if (!this.destroyed && operationEpoch === this.sessionEpoch) {
        this.pendingNames.set([]);
        this.uploadingChange.emit(false);
      }
    }
  }

  async remove(mediaId: string): Promise<void> {
    const attachment = this.attachments().find(item => item.media.id === mediaId);
    if (!attachment || this.disabled() || this.deletingIds().has(mediaId)) return;
    this.cancelPreview(mediaId);
    const operationEpoch = this.sessionEpoch;
    const ownerAccessToken = this.vault.accessToken();
    this.deletingOwners.set(mediaId, ownerAccessToken);
    this.setDeleting(mediaId, true);
    this.attachments.update(items => items.filter(item => item.media.id !== mediaId));
    this.emitIds();
    this.error.set('');
    try {
      await this.api.invoke(deleteMedia, { id: mediaId });
      attachment.preview?.release();
    } catch {
      if (!this.destroyed && operationEpoch === this.sessionEpoch) {
        this.attachments.update(items => [...items, attachment]);
        this.emitIds();
        this.error.set('Medya kaldırılamadı. Gönderiye eklenmesini önlemek için yeniden deneyebilirsin.');
        void this.resolvePreview(attachment.media);
      } else {
        attachment.preview?.release();
        await this.sessionCleanup.delete([mediaId], ownerAccessToken);
      }
    } finally {
      this.deletingOwners.delete(mediaId);
      if (operationEpoch === this.sessionEpoch) this.setDeleting(mediaId, false);
    }
  }

  async retryPreview(mediaId: string): Promise<void> {
    const attachment = this.attachments().find(item => item.media.id === mediaId);
    if (!attachment || attachment.preview) return;
    await this.resolvePreview(attachment.media);
  }

  /** Transfer deletion ownership to an in-flight post request before awaiting it. */
  transfer(): MediaAttachmentTransfer {
    const current = this.attachments();
    const ids = current.map(item => item.media.id);
    this.cancelAllPreviews();
    current.forEach(item => item.preview?.release());
    this.attachments.set([]);
    this.error.set('');
    this.emitIds();
    return {
      ids,
      discard: async () => {
        const results = await Promise.allSettled(ids.map(id => this.api.invoke(deleteMedia, { id })));
        const failed = current.filter((_item, index) => results[index].status === 'rejected');
        if (failed.length && !this.destroyed) {
          this.attachments.set(failed.map(item => ({ ...item, preview: null, previewError: false })));
          this.error.set('Bazı medyalar kaldırılamadı. Yeniden deneyebilirsin.');
          this.emitIds();
          failed.forEach(item => { void this.resolvePreview(item.media); });
        }
        return failed.length === 0;
      },
      discardWithAccessToken: accessToken => this.sessionCleanup.delete(ids, accessToken),
      rollback: async () => {
        if (this.destroyed) {
          const results = await Promise.allSettled(ids.map(id => this.api.invoke(deleteMedia, { id })));
          return results.every(result => result.status === 'fulfilled');
        }
        this.attachments.set(current.map(item => ({ ...item, preview: null, previewError: false })));
        this.error.set('İşlem tamamlanmadı; medyaların korundu.');
        this.emitIds();
        current.forEach(item => { void this.resolvePreview(item.media); });
        return true;
      },
    };
  }

  /** Detach the picker after its media IDs have been committed to a post. */
  commit(): void {
    for (const attachment of this.attachments()) attachment.preview?.release();
    this.attachments.set([]);
    this.error.set('');
    this.emitIds();
  }

  /** Delete uploaded but unattached media, for cancelled or rolled-back posts. */
  async discard(): Promise<void> {
    const current = this.attachments();
    const results = await Promise.allSettled(current.map(item => this.api.invoke(deleteMedia, { id: item.media.id })));
    current.forEach((item, index) => {
      if (results[index].status === 'fulfilled') item.preview?.release();
    });
    const failed = current.filter((_item, index) => results[index].status === 'rejected');
    this.attachments.set(failed);
    this.emitIds();
    this.error.set(failed.length ? 'Bazı medyalar kaldırılamadı. Yeniden deneyebilirsin.' : '');
  }

  ngOnDestroy(): void {
    this.destroyed = true;
    this.sessionEpoch++;
    this.unregisterSessionCleanup();
    this.resolverSync.destroy();
    this.uploadingChange.emit(false);
    this.cancelAllPreviews();
    for (const attachment of this.attachments()) {
      attachment.preview?.release();
      void this.api.invoke(deleteMedia, { id: attachment.media.id }).catch(() => undefined);
    }
    for (const [id, accessToken] of this.deletingOwners) void this.sessionCleanup.delete([id], accessToken);
    this.deletingOwners.clear();
    this.attachments.set([]);
  }

  private async upload(file: File): Promise<void> {
    let mediaId: string | null = null;
    const sessionEpoch = this.sessionEpoch;
    const ownerAccessToken = this.vault.accessToken();
    try {
      const initiated = await this.api.invoke(initiateMedia, { body: {
        fileName: file.name,
        contentType: file.type,
        size: file.size,
        visibility: this.visibility(),
      }});
      mediaId = initiated.media.id;
      if (this.destroyed || sessionEpoch !== this.sessionEpoch) {
        await this.sessionCleanup.delete([mediaId], ownerAccessToken);
        return;
      }
      this.inFlightMediaIds.add(mediaId);
      const ready = await this.api.invoke(uploadMediaContent, { id: mediaId, body: file });
      this.inFlightMediaIds.delete(mediaId);
      if (this.destroyed || sessionEpoch !== this.sessionEpoch) {
        await this.sessionCleanup.delete([mediaId], ownerAccessToken);
        return;
      }
      this.attachments.update(items => [...items, { media: ready, preview: null, previewError: false }]);
      this.emitIds();
      await this.resolvePreview(ready);
    } catch {
      if (mediaId) {
        this.inFlightMediaIds.delete(mediaId);
        if (sessionEpoch === this.sessionEpoch)
          await this.api.invoke(deleteMedia, { id: mediaId }).catch(() => undefined);
        else await this.sessionCleanup.delete([mediaId], ownerAccessToken);
      }
      if (!this.destroyed && sessionEpoch === this.sessionEpoch) this.error.set(`${file.name} yüklenemedi. Dosyayı kontrol edip yeniden seçebilirsin.`);
    }
  }

  private async cleanupBeforeSessionChange(accessToken: string | null): Promise<void> {
    this.sessionEpoch++;
    const current = this.attachments();
    const ids = [...current.map(item => item.media.id), ...this.inFlightMediaIds, ...this.deletingOwners.keys()];
    this.inFlightMediaIds.clear();
    this.deletingOwners.clear();
    this.cancelAllPreviews();
    current.forEach(item => item.preview?.release());
    this.attachments.set([]);
    this.pendingNames.set([]);
    this.uploadingChange.emit(false);
    this.emitIds();
    await this.sessionCleanup.delete(ids, accessToken);
  }

  private async resolvePreview(media: MediaView): Promise<void> {
    if (this.previewControllers.has(media.id)) return;
    const controller = new AbortController();
    this.previewControllers.set(media.id, controller);
    const variant = media.contentType.startsWith('image/') && media.urls['w960.webp'] ? 'w960.webp' : null;
    try {
      const preview = await this.resolver.resolve(media.id, variant, controller.signal);
      if (this.destroyed || this.previewControllers.get(media.id) !== controller || !this.attachments().some(item => item.media.id === media.id)) {
        preview.release();
        return;
      }
      this.replace(media.id, current => { current.preview?.release(); return ({ ...current, preview, previewError: false }); });
    } catch (error) {
      if ((error as Error).name !== 'AbortError' && !this.destroyed && this.previewControllers.get(media.id) === controller) this.replace(media.id, current => ({ ...current, preview: null, previewError: true }));
    } finally {
      if (this.previewControllers.get(media.id) === controller) this.previewControllers.delete(media.id);
    }
  }

  private cancelPreview(mediaId: string): void {
    this.previewControllers.get(mediaId)?.abort();
    this.previewControllers.delete(mediaId);
  }

  private cancelAllPreviews(): void {
    this.previewControllers.forEach(controller => controller.abort());
    this.previewControllers.clear();
  }

  private refreshPreviews(): void {
    if (this.destroyed) return;
    this.cancelAllPreviews();
    const current = this.attachments();
    current.forEach(item => item.preview?.release());
    this.attachments.set(current.map(item => ({ ...item, preview: null, previewError: false })));
    current.forEach(item => { void this.resolvePreview(item.media); });
  }

  private replace(mediaId: string, transform: (item: MediaAttachment) => MediaAttachment): void {
    this.attachments.update(items => items.map(item => item.media.id === mediaId ? transform(item) : item));
  }

  private emitIds(): void {
    this.mediaIdsChange.emit(this.attachments().map(item => item.media.id));
  }

  private setDeleting(mediaId: string, pending: boolean): void {
    this.deletingIds.update(current => {
      const next = new Set(current);
      if (pending) next.add(mediaId); else next.delete(mediaId);
      return next;
    });
  }
}
