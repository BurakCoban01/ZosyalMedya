import { ChangeDetectionStrategy, Component, OnDestroy, effect, input, signal, untracked } from '@angular/core';
import { ZmAvatarComponent, ZmAvatarSize } from '../../design-system/primitives/identity';
import { MediaResolver, ResolvedMedia } from './media-resolver.service';

@Component({
  selector: 'zm-authorized-avatar',
  imports: [ZmAvatarComponent],
  template: `<zm-avatar [name]="name()" [src]="media()?.url || fallbackSrc()" [size]="size()" />`,
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthorizedAvatarComponent implements OnDestroy {
  readonly name = input('');
  readonly mediaId = input<string | null>(null);
  readonly fallbackSrc = input('');
  readonly size = input<ZmAvatarSize>('md');
  readonly media = signal<ResolvedMedia | null>(null);

  private revision = 0;
  private destroyed = false;
  private controller: AbortController | null = null;
  private readonly sync = effect(() => {
    const mediaId = this.mediaId();
    this.resolver.sessionRevision?.();
    untracked(() => { void this.load(mediaId); });
  });

  constructor(private readonly resolver: MediaResolver) {}

  ngOnDestroy(): void {
    this.destroyed = true;
    this.revision++;
    this.cancelAndRelease();
    this.sync.destroy();
  }

  private async load(mediaId: string | null): Promise<void> {
    const revision = ++this.revision;
    this.cancelAndRelease();
    if (!mediaId) return;
    const controller = new AbortController();
    this.controller = controller;
    try {
      let media: ResolvedMedia;
      try { media = await this.resolver.resolve(mediaId, 'w320.webp', controller.signal); }
      catch (error) {
        if ((error as Error).name === 'AbortError') throw error;
        if ((error as { status?: number }).status !== 404) throw error;
        media = await this.resolver.resolve(mediaId, null, controller.signal);
      }
      if (this.destroyed || revision !== this.revision) { media.release(); return; }
      this.media.set(media);
    } catch {
      if (!this.destroyed && revision === this.revision) this.media.set(null);
    } finally {
      if (this.controller === controller) this.controller = null;
    }
  }

  private cancelAndRelease(): void {
    this.controller?.abort();
    this.controller = null;
    this.media()?.release();
    this.media.set(null);
  }
}
