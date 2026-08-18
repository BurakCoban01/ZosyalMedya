import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { ZmErrorStateComponent } from '../../../design-system/primitives/feedback-states';

/**
 * Feed error state — recoverable error with retry, offline-aware copy
 * (VAL-FEED-001: "recoverable error with retry").
 *
 * Wraps the shared `zm-error-state` primitive so the feed gets the canonical
 * alert-triangle glyph + `role="alert"` + retry button, but specializes the
 * copy to the feed context and to connectivity:
 *
 *   - When `offline` is true, the cause is named as a connection problem and
 *     the retry is framed as "reconnect happened? try again" rather than a
 *     generic server error.
 *   - Otherwise the cause is named as a transient feed-load failure.
 *
 * The retry action MUST be wired to the real `getFeed` operation (the page
 * does this via the `retry` output). Never a fake success.
 *
 * Consumes ONLY `--zm-state-*` tokens (via ZmErrorStateComponent). No hex.
 */
@Component({
  selector: 'zm-feed-error-state',
  standalone: true,
  imports: [ZmErrorStateComponent],
  styleUrl: './feed-error-state.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { class: 'zm-feed-error' },
  template: `
    <zm-error-state
      [title]="title()"
      [description]="description()"
      retryLabel="Tekrar dene"
      (retry)="retry.emit()"
    />
  `,
})
export class ZmFeedErrorStateComponent {
  /** True when the browser reports offline (OnlineStatusService). Changes the
   *  copy so the cause is named honestly as a connection issue. */
  readonly offline = input<boolean>(false);

  /** Emitted when the user activates retry. Wire to the real feed load. */
  readonly retry = output<void>();

  readonly title = computed<string>(() =>
    this.offline()
      ? 'Akışa şu an ulaşılamıyor'
      : 'Akış yenilenemedi',
  );

  readonly description = computed<string>(() =>
    this.offline()
      ? 'Bağlantın kesilmiş gibi görünüyor. Çevrimiçi olunca akışın yeniden yüklenmesi için Tekrar dene.'
      : 'Gönderiler şu an yüklenemedi. Bağlantını kontrol edip Tekrar dene; yayınlanmış içeriklerin kaybolmaz.',
  );
}
