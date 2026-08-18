import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  OnDestroy,
  computed,
  input,
  output,
  signal,
} from '@angular/core';
import { ZM_DURATION, ZM_EASE } from '../../tokens';

/**
 * ZmToast — transient live-region notification.
 *
 * Contract (VAL-DS-028 / VAL-DS-029):
 *
 *   - **Live-region announcement** (VAL-DS-028): the host carries
 *     `role="status"` for `info` / `success` / `warning` variants (polite,
 *     announced when the user is idle) and `role="alert"` for the `error`
 *     variant (assertive, announced immediately). A consumer rendering many
 *     toasts should wrap them in a single region with `aria-live` set to
 *     match the most urgent child, OR render each toast standalone — both
 *     patterns work because the role lives on the toast itself.
 *   - **Auto-dismiss**: each toast schedules a dismiss timer for
 *     `duration()` ms (default `--zm-toast-dismiss-default` = 5000ms). The
 *     timer is paused while the toast is hovered or focused (so the user can
 *     finish reading / interacting) and resumed on leave. Pass `duration=0`
 *     for a persistent toast that only closes via the dismiss control.
 *   - **Focus return**: a toast is a notification, not a dialog — it never
 *     steals focus on appear (that would disrupt the user). If the user
 *     keyboard-navigates into the toast (e.g. to activate an Undo button or
 *     the close control), focus is captured on the way in; on dismiss, focus
 *     returns to the element that was focused before the toast region was
 *     entered (or `document.body` if none is known). This satisfies the
 *     "focus return" requirement without trapping focus or disrupting the
 *     reading flow.
 *   - **Status never color-only** (VAL-DS-029): every variant couples its
 *     accent color with a distinct inline SVG glyph (info → circle-i,
 *     success → check, warning → triangle, error → alert-x). Grayscale
 *     conversion still discriminates the variants.
 *
 * Engine: CSS transitions on transform/opacity (no `@angular/animations`).
 * Reduced motion collapses via the `--zm-toast-duration` token cascade.
 *
 * @example
 * <zm-toast
 *   variant="success"
 *   message="Gönderin yayınlandı."
 *   actionLabel="Geri al"
 *   (actionClicked)="onUndo()"
 *   (dismissed)="onToastGone()"
 * ></zm-toast>
 */
export type ZmToastVariant = 'info' | 'success' | 'warning' | 'error';

@Component({
  selector: 'zm-toast',
  standalone: true,
  styleUrl: './toast.component.css',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'zm-toast',
    '[attr.data-variant]': 'variant()',
    '[attr.role]': 'role()',
    // The role implies aria-live (role=status → polite, role=alert →
    // assertive). We still set aria-live explicitly so AT that reads the
    // attribute rather than the role also gets the right politeness.
    '[attr.aria-live]': 'ariaLive()',
    '[attr.aria-atomic]': '"true"',
    '(mouseenter)': 'pauseTimer()',
    '(mouseleave)': 'resumeTimer()',
    '(focusin)': 'onFocusIn($event)',
    '(focusout)': 'onFocusOut($event)',
  },
  template: `
    <span class="zm-toast__icon" aria-hidden="true">
      @switch (variant()) {
        @case ('info') {
          <svg viewBox="0 0 24 24" focusable="false">
            <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2" />
            <path d="M12 8.5h.01" stroke="currentColor" stroke-width="2.4" stroke-linecap="round" />
            <path d="M12 11v5" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
          </svg>
        }
        @case ('success') {
          <svg viewBox="0 0 24 24" focusable="false">
            <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2" />
            <path d="M8 12.5l2.8 2.8L16.3 9.8" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" />
          </svg>
        }
        @case ('warning') {
          <svg viewBox="0 0 24 24" focusable="false">
            <path d="M12 3.5l9.5 16.5h-19z" fill="none" stroke="currentColor" stroke-width="2" stroke-linejoin="round" />
            <path d="M12 10v4.5" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
            <path d="M12 17.5h.01" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" />
          </svg>
        }
        @case ('error') {
          <svg viewBox="0 0 24 24" focusable="false">
            <circle cx="12" cy="12" r="9" fill="none" stroke="currentColor" stroke-width="2" />
            <path d="M12 7v6" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" />
            <path d="M12 16.5h.01" stroke="currentColor" stroke-width="2.6" stroke-linecap="round" />
          </svg>
        }
      }
    </span>

    <span class="zm-toast__body">
      <span class="zm-toast__message">{{ message() }}</span>
      @if (meta()) {
        <span class="zm-toast__meta">{{ meta() }}</span>
      }
    </span>

    @if (actionLabel()) {
      <button
        type="button"
        class="zm-toast__action zm-feedback"
        (click)="onAction()"
      >
        {{ actionLabel() }}
      </button>
    }

    <button
      type="button"
      class="zm-toast__close zm-feedback"
      [attr.aria-label]="closeLabel()"
      (click)="dismiss('manual')"
    >
      <svg viewBox="0 0 24 24" aria-hidden="true" focusable="false">
        <path d="M6 6l12 12M18 6L6 18" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" />
      </svg>
    </button>
  `,
})
export class ZmToastComponent implements OnDestroy {
  /** Visual + semantic variant. `error` maps to `role=alert` (assertive); the
   *  others map to `role=status` (polite). Each variant also carries a
   *  distinct icon so the status is never color-only (VAL-DS-029). */
  readonly variant = input<ZmToastVariant>('info');

  /** The main announcement text. Should be specific (cause + state), not a
   *  generic "Bir şeyler ters gitti" — per docs/agent/13-ANTI-SLOP.md §8. */
  readonly message = input<string>('');

  /** Optional secondary line (e.g. consequence or timestamp). Rendered with
   *  lower emphasis. Not announced separately (aria-atomic=true on the host
   *  makes the whole toast one utterance). */
  readonly meta = input<string>('');

  /** Optional inline action (e.g. "Geri al"). When clicked, emits
   *  `actionClicked` AND dismisses the toast with reason `'action'`. */
  readonly actionLabel = input<string>('');

  /** Accessible label for the close (dismiss) button. Defaults to the Turkish
   *  "Kapat" verb; override for context-specific wording (e.g. "Bildirimi kapat"). */
  readonly closeLabel = input<string>('Kapat');

  /** Auto-dismiss delay in milliseconds. Default 5000ms (≈ reading speed for a
   *  short Turkish sentence). Pass `0` for a persistent toast that only
   *  closes via the dismiss control (use for error/undo flows). */
  readonly duration = input<number>(5000);

  /** Emitted when the user activates the inline action button. The toast
   *  also dismisses itself on action; listen to `dismissed` for the reason. */
  readonly actionClicked = output<void>();

  /** Emitted when the toast dismisses (auto / manual / action). Carries the
   *  reason so the caller can differentiate "Undo clicked" from "timed out". */
  readonly dismissed = output<ZmToastDismissReason>();

  /** Computed ARIA role for the host. `error` is assertive (alert); the other
   *  three variants are polite (status). */
  readonly role = computed<'status' | 'alert'>(() =>
    this.variant() === 'error' ? 'alert' : 'status',
  );

  /** Computed aria-live politeness. Mirrors the role semantics. */
  readonly ariaLive = computed<'polite' | 'assertive'>(() =>
    this.variant() === 'error' ? 'assertive' : 'polite',
  );

  private timer: ReturnType<typeof setTimeout> | null = null;
  private timerPaused = false;
  /** Element focused before the user Tab-navigated into the toast. Captured
   *  on focusin so we can return focus on dismiss (focus return contract). */
  private focusAnchor: HTMLElement | null = null;
  /** Tracks whether the toast currently owns the active element (focus is
   *  inside it). Used to decide whether to restore focus on dismiss. */
  private ownsFocus = signal<boolean>(false);
  /** True once the toast has dismissed, so repeated calls are idempotent. */
  private dismissed_ = false;

  constructor(private elementRef: ElementRef<HTMLElement>) {}

  /** Begin the auto-dismiss timer. Called by the host region when the toast is
   *  mounted; safe to call multiple times (resets the timer). No-op when
   *  `duration` is 0 (persistent). */
  startTimer(): void {
    this.clearTimer();
    const ms = this.duration();
    if (ms <= 0) return;
    this.timer = setTimeout(() => this.dismiss('auto'), ms);
    this.timerPaused = false;
  }

  /** Pause the auto-dismiss timer (e.g. on hover/focus so the user can read). */
  pauseTimer(): void {
    if (this.timer && !this.timerPaused) {
      clearTimeout(this.timer);
      this.timer = null;
      this.timerPaused = true;
    }
  }

  /** Resume the auto-dismiss timer after a pause (full duration restart). */
  resumeTimer(): void {
    if (this.timerPaused && !this.dismissed_) {
      this.startTimer();
    }
  }

  /** Dismiss the toast with the given reason. Idempotent: a second call is a
   *  no-op. Emits `dismissed` and returns focus if the toast currently owns it. */
  dismiss(reason: ZmToastDismissReason = 'programmatic'): void {
    if (this.dismissed_) return;
    this.dismissed_ = true;
    this.clearTimer();
    if (this.ownsFocus()) {
      this.restoreFocus();
    }
    this.dismissed.emit(reason);
  }

  /** Capture the focus anchor the first time focus enters the toast, so we can
   *  return to it on dismiss. `relatedTarget` is the element that is LOSING
   *  focus (the previously-active element outside the toast) — this is more
   *  reliable than `document.activeElement`, which by the time focusin fires
   *  has already moved to the new target inside the toast. Subsequent
   *  focusins (focus moving within the toast) do not overwrite the anchor. */
  onFocusIn(event: FocusEvent): void {
    if (!this.ownsFocus()) {
      this.focusAnchor = (event.relatedTarget as HTMLElement) ?? null;
      this.ownsFocus.set(true);
    }
    // A focused toast should not auto-dismiss while the user is reading it.
    this.pauseTimer();
  }

  /** Release the owns-focus flag when focus leaves the toast entirely, and
   *  resume the auto-dismiss timer. */
  onFocusOut(event: FocusEvent): void {
    const host = this.elementRef.nativeElement;
    // focusout fires when focus moves to a sibling inside the host; only treat
    // as "left the toast" when the new target is outside the host.
    const next = event.relatedTarget as Node | null;
    if (!next || !host.contains(next)) {
      this.ownsFocus.set(false);
      this.resumeTimer();
    }
  }

  /** Inline action handler: emit `actionClicked`, then dismiss with reason
   *  `'action'` so the caller knows the toast closed via the action (not timeout). */
  onAction(): void {
    this.actionClicked.emit();
    this.dismiss('action');
  }

  /** Restore focus to the element focused before the toast region was entered.
   *  Defensive: guard against detached/hidden anchors. */
  private restoreFocus(): void {
    const target = this.focusAnchor;
    this.focusAnchor = null;
    this.ownsFocus.set(false);
    if (target && document.body.contains(target)) {
      // Only restore to elements that can take focus; others fall through to body.
      const canFocus =
        typeof target.focus === 'function' &&
        target.tabIndex >= 0;
      if (canFocus) {
        target.focus({ preventScroll: true });
        return;
      }
    }
    // Fallback: move focus to body so it does not get lost.
    document.body.focus();
  }

  private clearTimer(): void {
    if (this.timer) {
      clearTimeout(this.timer);
      this.timer = null;
    }
    this.timerPaused = false;
  }

  ngOnDestroy(): void {
    this.clearTimer();
    // Do NOT restore focus on destroy — the consumer is tearing down the toast
    // (e.g. navigation), and stealing focus would be disruptive. The dismiss()
    // path handles focus return for the normal lifecycle.
  }

  // Token names referenced by the CSS file (documentation hook + keeps the
  // component TS free of inline color literals; values live in tokens.css).
  protected readonly durationToken = ZM_DURATION.base;
  protected readonly easeToken = ZM_EASE.enter;
}

export type ZmToastDismissReason = 'auto' | 'manual' | 'action' | 'programmatic';
