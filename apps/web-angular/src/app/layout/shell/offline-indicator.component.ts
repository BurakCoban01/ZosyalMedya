import { ChangeDetectionStrategy, Component, inject } from '@angular/core';
import { OnlineStatusService } from '../../core/connectivity/online-status.service';

/**
 * ZmOfflineIndicator — shell-wide degraded / offline status banner.
 *
 * Fulfils **VAL-WSH-013**: when the browser goes offline (DevTools offline
 * emulation flips `navigator.onLine` to `false`) or the realtime hub can no
 * longer reach the server, the shell shows a NON-intrusive indicator; the
 * indicator clears the moment connectivity returns. No false "online" while
 * offline.
 *
 * The single source of truth is {@link OnlineStatusService.isOffline}, which
 * tracks `navigator.onLine` via `window` `online` / `offline` events. When
 * the browser reports offline the SignalR hub is also unreachable (its
 * `withAutomaticReconnect` resumes once connectivity returns), so this one
 * signal covers both the "browser offline" and "realtime degraded" cases.
 *
 * Visibility: the banner renders ONLY when offline (`@if (isOffline())`),
 * so the common online state has zero layout cost (no reserved box, no CLS).
 * When it appears it is a slim sticky bar at the top of the workspace; the
 * state is conveyed with text + a shape glyph (never color alone) and is a
 * polite live region so AT announces the change.
 *
 * Engine: CSS only. No `@angular/animations`. Consumes ONLY
 * `--zm-offline-*` component tokens (no hardcoded hex). Reduced-motion
 * collapses the entrance transition; the status text + glyph still convey
 * the state.
 */
@Component({
  selector: 'zm-offline-indicator',
  imports: [],
  templateUrl: './offline-indicator.component.html',
  styleUrl: './offline-indicator.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
})
export class ZmOfflineIndicatorComponent {
  protected readonly online = inject(OnlineStatusService);
}
