import { Component, ElementRef } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ZmToastComponent, ZmToastDismissReason, ZmToastVariant } from './toast.component';

/**
 * ZmToast — focused verification for VAL-DS-028 (toast renders with the
 * correct live-region role) and VAL-DS-029 (status never color-only: every
 * variant carries a distinct icon glyph).
 *
 * Guards:
 *   - role=status for info/success/warning, role=alert for error (VAL-DS-028);
 *   - aria-live matches the role semantics (polite / assertive);
 *   - aria-atomic=true so the whole toast is one utterance;
 *   - every variant renders a distinct icon (info/success/warning/error);
 *   - message + optional meta + optional action button + close button render;
 *   - the close control carries a non-empty accessible name (aria-label);
 *   - auto-dismiss timer fires after `duration` ms with reason 'auto';
 *   - pauseTimer/resumeTimer suspend + restart the timer;
 *   - dismiss() is idempotent and emits `dismissed` once;
 *   - the inline action emits actionClicked + dismiss('action');
 *   - focus return: when focus enters the toast and it dismisses, focus moves
 *     back to the anchor captured on focusin (VAL-DS-028 focus return).
 *
 * The browser probe on /_design additionally proves hover-pause and the
 * reduced-motion opacity-only collapse; those are documented in the feature
 * evidence and not re-proven here (jsdom does not lay out hover geometry).
 */

@Component({
  standalone: true,
  imports: [ZmToastComponent],
  template: `
    <button id="anchor" type="button">tetikleyici</button>
    <zm-toast
      id="t"
      [variant]="variant"
      [message]="message"
      [meta]="meta"
      [actionLabel]="actionLabel"
      [closeLabel]="closeLabel"
      [duration]="duration"
      (actionClicked)="onAction()"
      (dismissed)="onDismissed($event)"
    ></zm-toast>
  `,
})
class ToastHost {
  variant: ZmToastVariant = 'info';
  message = 'Gönderin yayınlandı.';
  meta = '';
  actionLabel = '';
  closeLabel = 'Kapat';
  duration = 5000;
  lastAction = false;
  lastReason: ZmToastDismissReason | null = null;
  onAction(): void {
    this.lastAction = true;
  }
  onDismissed(reason: ZmToastDismissReason): void {
    this.lastReason = reason;
  }
}

async function mount(overrides: Partial<ToastHost> = {}): Promise<{ host: ToastHost; toast: ZmToastComponent; root: HTMLElement }> {
  // Reset the test module so mount() can be called more than once within a
  // single test (some tests mount multiple variants to compare). Angular's
  // TestBed forbids re-configuring after instantiation without a reset.
  TestBed.resetTestingModule();
  await TestBed.configureTestingModule({ imports: [ToastHost] }).compileComponents();
  const fixture = TestBed.createComponent(ToastHost);
  Object.assign(fixture.componentInstance, overrides);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  const toast = fixture.debugElement.children[1].componentInstance as ZmToastComponent;
  return { host: fixture.componentInstance, toast, root };
}

describe('ZmToastComponent — live-region role (VAL-DS-028)', () => {
  it('uses role=status + aria-live=polite for the info variant', async () => {
    const { root } = await mount({ variant: 'info' });
    const host = root.querySelector('#t') as HTMLElement;
    expect(host.getAttribute('role')).toBe('status');
    expect(host.getAttribute('aria-live')).toBe('polite');
    expect(host.getAttribute('aria-atomic')).toBe('true');
  });

  it('uses role=status for success and warning variants', async () => {
    const { root: r1 } = await mount({ variant: 'success' });
    expect(r1.querySelector('#t')!.getAttribute('role')).toBe('status');
    expect(r1.querySelector('#t')!.getAttribute('aria-live')).toBe('polite');
    const { root: r2 } = await mount({ variant: 'warning' });
    expect(r2.querySelector('#t')!.getAttribute('role')).toBe('status');
  });

  it('uses role=alert + aria-live=assertive for the error variant', async () => {
    const { root } = await mount({ variant: 'error' });
    const host = root.querySelector('#t') as HTMLElement;
    expect(host.getAttribute('role')).toBe('alert');
    expect(host.getAttribute('aria-live')).toBe('assertive');
  });

  it('exposes data-variant so CSS can scope the accent + icon color', async () => {
    const { root } = await mount({ variant: 'warning' });
    expect(root.querySelector('#t')!.getAttribute('data-variant')).toBe('warning');
  });
});

describe('ZmToastComponent — non-color status cues (VAL-DS-029)', () => {
  it('renders a distinct icon per variant (info/success/warning/error)', async () => {
    // Each variant renders a different SVG path set inside .zm-toast__icon.
    // We assert the icon container is present for every variant and that the
    // error glyph differs from the success glyph by path signature.
    const variants: ZmToastVariant[] = ['info', 'success', 'warning', 'error'];
    const pathsByVariant: Record<string, string> = {};
    for (const v of variants) {
      const { root } = await mount({ variant: v });
      const icon = root.querySelector('#t .zm-toast__icon') as HTMLElement;
      expect(icon, `${v} variant must render an icon`).toBeTruthy();
      expect(icon.getAttribute('aria-hidden')).toBe('true');
      const svgPaths = Array.from(icon.querySelectorAll('path')).map(p => p.getAttribute('d') ?? '');
      pathsByVariant[v] = svgPaths.join('|');
      expect(pathsByVariant[v].length, `${v} variant must have non-empty glyph paths`).toBeGreaterThan(0);
    }
    // Pairwise distinctness: no two variants share the same glyph signature.
    const distinct = new Set(Object.values(pathsByVariant));
    expect(distinct.size, 'all four variants must have distinct glyphs').toBe(variants.length);
  });
});

describe('ZmToastComponent — content + controls', () => {
  it('renders the message and the optional meta line', async () => {
    const { root } = await mount({ message: 'Kaydedildi.', meta: 'Taslağınız korunur.' });
    expect(root.querySelector('#t .zm-toast__message')!.textContent!.trim()).toBe('Kaydedildi.');
    expect(root.querySelector('#t .zm-toast__meta')!.textContent!.trim()).toBe('Taslağınız korunur.');
  });

  it('omits the meta node when meta is empty', async () => {
    const { root } = await mount({ meta: '' });
    expect(root.querySelector('#t .zm-toast__meta')).toBeNull();
  });

  it('renders the inline action button only when actionLabel is set', async () => {
    const { root: r1 } = await mount({ actionLabel: 'Geri al' });
    const action1 = r1.querySelector('#t .zm-toast__action') as HTMLButtonElement;
    expect(action1).toBeTruthy();
    expect(action1.textContent!.trim()).toBe('Geri al');
    const { root: r2 } = await mount({ actionLabel: '' });
    expect(r2.querySelector('#t .zm-toast__action')).toBeNull();
  });

  it('always renders a close button with a non-empty accessible name', async () => {
    const { root } = await mount();
    const close = root.querySelector('#t .zm-toast__close') as HTMLButtonElement;
    expect(close).toBeTruthy();
    expect((close.getAttribute('aria-label') ?? '').trim().length).toBeGreaterThan(0);
  });

  it('honors a custom close button label', async () => {
    const { root } = await mount({ closeLabel: 'Bildirimi kapat' });
    expect(root.querySelector('#t .zm-toast__close')!.getAttribute('aria-label')).toBe('Bildirimi kapat');
  });
});

describe('ZmToastComponent — auto-dismiss + lifecycle', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('fires dismissed with reason "auto" after the duration elapses', async () => {
    vi.useFakeTimers();
    const { host, toast } = await mount({ duration: 1000 });
    toast.startTimer();
    vi.advanceTimersByTime(999);
    expect(host.lastReason).toBeNull();
    vi.advanceTimersByTime(2);
    expect(host.lastReason).toBe('auto');
  });

  it('does NOT auto-dismiss when duration is 0 (persistent)', async () => {
    vi.useFakeTimers();
    const { host, toast } = await mount({ duration: 0 });
    toast.startTimer();
    vi.advanceTimersByTime(60000);
    expect(host.lastReason).toBeNull();
  });

  it('pauseTimer suspends the auto-dismiss; resumeTimer restarts it', async () => {
    vi.useFakeTimers();
    const { host, toast } = await mount({ duration: 1000 });
    toast.startTimer();
    vi.advanceTimersByTime(500);
    toast.pauseTimer();
    vi.advanceTimersByTime(5000);
    expect(host.lastReason).toBeNull();
    toast.resumeTimer();
    vi.advanceTimersByTime(999);
    expect(host.lastReason).toBeNull();
    vi.advanceTimersByTime(2);
    expect(host.lastReason).toBe('auto');
  });

  it('dismiss() is idempotent and emits dismissed exactly once', async () => {
    const { host, toast } = await mount();
    toast.dismiss('manual');
    toast.dismiss('manual');
    toast.dismiss('auto');
    expect(host.lastReason).toBe('manual');
  });

  it('the close button dismisses with reason "manual"', async () => {
    const { host, root } = await mount();
    const close = root.querySelector('#t .zm-toast__close') as HTMLButtonElement;
    close.click();
    expect(host.lastReason).toBe('manual');
  });

  it('the inline action emits actionClicked and dismisses with reason "action"', async () => {
    const { host, root } = await mount({ actionLabel: 'Geri al' });
    const action = root.querySelector('#t .zm-toast__action') as HTMLButtonElement;
    action.click();
    expect(host.lastAction).toBe(true);
    expect(host.lastReason).toBe('action');
  });
});

describe('ZmToastComponent — focus return (VAL-DS-028)', () => {
  it('captures the relatedTarget on focusin and restores it on dismiss', async () => {
    const { root, toast } = await mount();
    const host = root.querySelector('#t') as HTMLElement;
    const anchor = root.querySelector('#anchor') as HTMLButtonElement;
    anchor.focus();
    expect(document.activeElement).toBe(anchor);
    // Simulate focus moving into the toast (user Tab-navigates to the close).
    // In a real browser, the focusin event carries relatedTarget = the element
    // losing focus (the anchor). The component captures it so it can restore
    // focus on dismiss.
    const close = host.querySelector('.zm-toast__close') as HTMLButtonElement;
    close.focus();
    host.dispatchEvent(new FocusEvent('focusin', { bubbles: true, relatedTarget: anchor }));
    expect(document.activeElement).toBe(close);
    // Dismiss while the toast owns focus → focus must return to the anchor.
    toast.dismiss('manual');
    expect(document.activeElement).toBe(anchor);
  });

  it('does not restore focus on dismiss when the toast never owned it', async () => {
    const { root, toast } = await mount();
    const anchor = root.querySelector('#anchor') as HTMLButtonElement;
    anchor.focus();
    // No focusin into the toast → dismiss should leave focus where it is.
    toast.dismiss('manual');
    expect(document.activeElement).toBe(anchor);
  });
});

describe('ZmToastComponent — token wiring (no inline color literals)', () => {
  it('references the motion tokens via the protected fields (documentation hook)', async () => {
    const { toast } = await mount();
    // The protected fields exist so the CSS file's token names are documented
    // in TS without writing color literals. They reference --zm-* names only.
    expect((toast as unknown as { durationToken: string }).durationToken).toMatch(/^--zm-duration-/);
    expect((toast as unknown as { easeToken: string }).easeToken).toMatch(/^--zm-ease-/);
  });

  it('injects ElementRef (used for focus containment + restore)', async () => {
    const { toast } = await mount();
    expect((toast as unknown as { elementRef: ElementRef<HTMLElement> }).elementRef).toBeTruthy();
  });
});
