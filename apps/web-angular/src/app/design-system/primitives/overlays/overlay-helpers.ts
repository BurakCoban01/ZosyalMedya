import { ESCAPE } from '@angular/cdk/keycodes';

/**
 * Shared helpers for the Zm overlay primitives (ZmDialog / ZmSheet / ZmMenu).
 *
 * These are pure functions — no inheritance, no service state — so each
 * overlay component stays independently testable while the VAL-DS-026
 * "return focus on close" and "Escape to close" contracts share one
 * canonical implementation.
 */

/** The CDK keycode that signals "close this overlay". */
export const ZM_OVERLAY_ESCAPE_KEYCODE = ESCAPE;

/** Reason strings emitted on `closed`. Stable vocabulary for tests + telemetry. */
export type ZmOverlayCloseReason = 'escape' | 'backdrop' | 'programmatic';

/**
 * Save a reference to the currently-focused element so it can be restored
 * when the overlay closes (VAL-DS-026: "return focus to the trigger that
 * opened them"). Returns null when there is no focusable owner (SSR / no DOM).
 */
export function zmSaveFocus(): HTMLElement | null {
  if (typeof document === 'undefined') return null;
  const active = document.activeElement;
  return active instanceof HTMLElement ? active : null;
}

/**
 * Restore focus to a previously-focused element (VAL-DS-026). No-op when the
 * element is no longer attached to the document or no focus was saved — this
 * keeps the close path safe even if the trigger was removed mid-flight.
 *
 * Guarded: never throws. If `.focus()` is a no-op (e.g. a `<div>` without
 * tabindex) the browser simply leaves focus where it is, which is still safe.
 */
export function zmRestoreFocus(el: HTMLElement | null): void {
  if (!el) return;
  if (typeof document === 'undefined') return;
  if (!document.body.contains(el)) return;
  try {
    el.focus();
  } catch {
    /* focus() can throw on detached elements; swallow — safe by definition. */
  }
}

/**
 * Returns true when the keydown event should close the overlay per the
 * "Escape to close" contract (VAL-DS-026). Honors both the `Escape` key name
 * and the CDK `ESCAPE` keycode (which also covers `Esc` on some layouts).
 */
export function zmIsEscapeKey(event: KeyboardEvent): boolean {
  return event.key === 'Escape' || event.keyCode === ZM_OVERLAY_ESCAPE_KEYCODE;
}
