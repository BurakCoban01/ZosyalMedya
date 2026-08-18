import { describe, expect, it } from 'vitest';
import { ZM_OVERLAY_ESCAPE_KEYCODE, zmIsEscapeKey, zmRestoreFocus, zmSaveFocus } from './overlay-helpers';

/**
 * overlay-helpers — focused verification of the shared VAL-DS-026 mechanisms:
 * focus save/restore (return-focus-on-close) and Escape detection.
 *
 * These are the pure functions every overlay (dialog/sheet/menu) shares, so
 * they get their own contract spec. The browser probe on /_design proves the
 * live focus-trace end-to-end (VAL-DS-026 evidence); here we guard the
 * mechanism: saved focus is restored exactly, lost elements are no-ops, and
 * Escape is detected by both key name and CDK keycode.
 */
describe('zmSaveFocus / zmRestoreFocus', () => {
  it('returns null when nothing focusable is active', () => {
    // jsdom starts with body as the active element; blur first to be safe.
    if (document.activeElement instanceof HTMLElement) {
      document.activeElement.blur();
    }
    // body is not an HTMLElement focus target by default in this harness when
    // nothing has been focused explicitly.
    const saved = zmSaveFocus();
    // Accept either null (no focus owner) or document.body — both are safe.
    expect(saved === null || saved === document.body).toBe(true);
  });

  it('captures the currently-focused element', () => {
    const btn = document.createElement('button');
    btn.type = 'button';
    document.body.appendChild(btn);
    btn.focus();
    const saved = zmSaveFocus();
    expect(saved).toBe(btn);
    btn.remove();
  });

  it('restores focus to a previously-saved element (VAL-DS-026 return-focus)', () => {
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.textContent = 'Aç';
    document.body.appendChild(trigger);
    trigger.focus();
    const saved = zmSaveFocus();

    // Simulate the overlay stealing focus.
    const other = document.createElement('button');
    other.type = 'button';
    document.body.appendChild(other);
    other.focus();
    expect(document.activeElement).toBe(other);

    // Close path restores focus to the trigger.
    zmRestoreFocus(saved);
    expect(document.activeElement).toBe(trigger);

    trigger.remove();
    other.remove();
  });

  it('is a no-op when the saved element is no longer in the document', () => {
    const orphan = document.createElement('button');
    orphan.type = 'button';
    // Never appended to the document.
    zmRestoreFocus(orphan); // must not throw
    expect(document.body.contains(orphan)).toBe(false);
  });

  it('is a no-op when null is passed (never saved)', () => {
    expect(() => zmRestoreFocus(null)).not.toThrow();
  });

  it('never throws when focus() fails', () => {
    const el = document.createElement('div');
    document.body.appendChild(el);
    // Make focus throw.
    const original = el.focus;
    el.focus = (() => {
      throw new Error('detached');
    }) as unknown as typeof el.focus;
    expect(() => zmRestoreFocus(el)).not.toThrow();
    el.focus = original;
    el.remove();
  });
});

describe('zmIsEscapeKey', () => {
  it('detects the Escape key by name', () => {
    expect(zmIsEscapeKey(new KeyboardEvent('keydown', { key: 'Escape' }))).toBe(true);
  });

  it('detects the Escape key by CDK keycode', () => {
    expect(zmIsEscapeKey(new KeyboardEvent('keydown', { keyCode: ZM_OVERLAY_ESCAPE_KEYCODE }))).toBe(true);
  });

  it('returns false for unrelated keys', () => {
    expect(zmIsEscapeKey(new KeyboardEvent('keydown', { key: 'Enter' }))).toBe(false);
    expect(zmIsEscapeKey(new KeyboardEvent('keydown', { key: 'Tab' }))).toBe(false);
    expect(zmIsEscapeKey(new KeyboardEvent('keydown', { key: 'a' }))).toBe(false);
  });
});
