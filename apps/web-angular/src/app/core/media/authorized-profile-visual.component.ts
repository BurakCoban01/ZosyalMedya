import { ChangeDetectionStrategy, Component, OnDestroy, effect, input, signal, untracked } from '@angular/core';
import { AuthorizedAvatarComponent } from './authorized-avatar.component';
import { MediaResolver, ResolvedMedia } from './media-resolver.service';

@Component({
  selector: 'zm-authorized-profile-visual',
  imports: [AuthorizedAvatarComponent],
  template: `
    <div class="profile-cover">
      @if (cover(); as media) {
        <img [src]="media.url" [alt]="name() + ' kapak görseli'">
      } @else {
        <div class="profile-cover__fallback" aria-hidden="true"></div>
      }
    </div>
    <div class="profile-identity">
      <zm-authorized-avatar [name]="name()" [mediaId]="profileMediaId()" size="xl" />
      <div class="profile-identity__copy"><ng-content /></div>
    </div>
  `,
  styleUrl: './authorized-profile-visual.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class AuthorizedProfileVisualComponent implements OnDestroy {
  readonly name = input('');
  readonly profileMediaId = input<string | null>(null);
  readonly coverMediaId = input<string | null>(null);
  readonly cover = signal<ResolvedMedia | null>(null);

  private revision = 0;
  private destroyed = false;
  private controller: AbortController | null = null;
  private readonly sync = effect(() => {
    const mediaId = this.coverMediaId();
    this.resolver.sessionRevision?.();
    untracked(() => { void this.loadCover(mediaId); });
  });

  constructor(private readonly resolver: MediaResolver) {}

  ngOnDestroy(): void {
    this.destroyed = true;
    this.revision++;
    this.cancelAndRelease();
    this.sync.destroy();
  }

  private async loadCover(mediaId: string | null): Promise<void> {
    const revision = ++this.revision;
    this.cancelAndRelease();
    if (!mediaId) return;
    const controller = new AbortController();
    this.controller = controller;
    try {
      let media: ResolvedMedia;
      try { media = await this.resolver.resolve(mediaId, 'w960.webp', controller.signal); }
      catch (error) {
        if ((error as Error).name === 'AbortError') throw error;
        if ((error as { status?: number }).status !== 404) throw error;
        media = await this.resolver.resolve(mediaId, null, controller.signal);
      }
      if (this.destroyed || revision !== this.revision) { media.release(); return; }
      this.cover.set(media);
    } catch {
      if (!this.destroyed && revision === this.revision) this.cover.set(null);
    } finally {
      if (this.controller === controller) this.controller = null;
    }
  }

  private cancelAndRelease(): void {
    this.controller?.abort();
    this.controller = null;
    this.cover()?.release();
    this.cover.set(null);
  }
}
