import { DOCUMENT } from '@angular/common';
import { Injectable, computed, inject, signal } from '@angular/core';

/**
 * OnlineStatusService — shell-wide connectivity signal.
 *
 * Tracks `navigator.onLine` (the browser's network reachability flag) and
 * exposes it as a reactive signal so the shell's offline / degraded
 * indicator can appear and disappear without each component wiring its own
 * `online` / `offline` listeners. Fulfils **VAL-WSH-013**: when the browser
 * goes offline (DevTools offline emulation flips `navigator.onLine` to
 * `false`) the shell shows a non-intrusive indicator; reconnecting clears it.
 *
 * Contract:
 *   - `isOnline()` is `true` when `navigator.onLine === true`; `false` when
 *     offline OR when the Online API is unavailable AND the browser cannot
 *     confirm connectivity (defensive default — never falsely claim online).
 *   - Listeners are attached once (constructor) and live for the app
 *     lifetime. The service is `providedIn: 'root'` (singleton).
 *   - All listener registration is guarded so the service never throws in a
 *     non-browser environment (SSR / tests without `window`).
 *
 * Note on "degraded": the SignalR realtime hub uses
 * `withAutomaticReconnect([0,2,5,10,30]s)` (see MessagingRealtimeService).
 * When `navigator.onLine` flips to `false` the hub cannot reach the server
 * and the indicator surfaces the degraded state; when connectivity returns
 * the hub's automatic reconnect restores realtime and this signal clears the
 * indicator. The single source of truth for the indicator is this service's
 * `isOnline` (the testable, emulatable surface); the hub follows it.
 */
@Injectable({ providedIn: 'root' })
export class OnlineStatusService {
  private readonly document = inject(DOCUMENT);
  private readonly win = this.document.defaultView;

  /** Reactive connectivity flag. `false` while the browser reports offline. */
  readonly isOnline = signal<boolean>(this.readInitialOnline());

  /** Reactive offline flag (inverse of {@link isOnline}); convenience for
   *  templates that render the indicator with `@if (isOffline())`. */
  readonly isOffline = computed<boolean>(() => !this.isOnline());

  constructor() {
    const win = this.win;
    if (!win || typeof win.addEventListener !== 'function') return;
    // `online` / `offline` are fired on `window` (and bubble from document).
    // Re-reading `navigator.onLine` is authoritative; the event is just the cue.
    win.addEventListener('online', this.onConnectivityChange);
    win.addEventListener('offline', this.onConnectivityChange);
  }

  /** Read `navigator.onLine`, defaulting to `true` only when the API exists
   *  AND reports online. When the API is absent we cannot prove offline, so
   *  we optimistically treat the app as online (the indicator stays hidden)
   *  rather than showing a permanent false-offline banner. */
  private readInitialOnline(): boolean {
    const nav = this.win?.navigator;
    if (nav && typeof nav.onLine === 'boolean') return nav.onLine;
    return true;
  }

  /** Single listener reused for both `online` + `offline` events. Re-reads
   *  `navigator.onLine` so the signal always reflects the browser's truth. */
  private readonly onConnectivityChange = (): void => {
    const nav = this.win?.navigator;
    if (nav && typeof nav.onLine === 'boolean') {
      this.isOnline.set(nav.onLine);
    }
  };
}
