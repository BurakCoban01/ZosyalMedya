import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Overlay } from '@angular/cdk/overlay';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ZmDialogComponent } from './dialog.component';

/**
 * ZmDialog — focused verification for VAL-DS-026 / VAL-DS-027.
 *
 * Guards the DOM/contract mechanism:
 *   - opening attaches a role=dialog + aria-modal=true panel with an
 *     accessible name (aria-label OR aria-labelledby);
 *   - the scrim backdrop is present while open (VAL-DS-027 scrim);
 *   - close() detaches the panel and emits `closed` with a reason;
 *   - a non-dismissible (destructive) dialog cannot be closed via the
 *     `backdrop`/`escape` reasons (VAL-DS-027 negative path);
 *   - opening twice is idempotent (no duplicate overlay).
 *
 * The live focus-trace (focus moves in, Tab cycles, Escape closes, focus
 * returns to the trigger) and the scroll-lock body behavior are proven by the
 * browser probe on /_design and recorded in the feature evidence; here we
 * guard the class/attribute/method mechanism.
 */

const flush = async (): Promise<void> => {
  // Drain the queueMicrotask used by open() to move focus into the panel.
  await Promise.resolve();
  await Promise.resolve();
  await new Promise(r => setTimeout(r, 0));
};

@Component({
  standalone: true,
  imports: [ZmDialogComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<zm-dialog [label]="label" [labelledBy]="labelledBy" [dismissible]="dismissible">
    <h2 id="d-title">Başlık</h2>
  </zm-dialog>`,
})
class DialogHost {
  label = 'Örnek diyalog';
  labelledBy = '';
  dismissible = true;
}

async function mountDialog(overrides: Partial<DialogHost> = {}): Promise<{ host: DialogHost; dialog: ZmDialogComponent }> {
  await TestBed.configureTestingModule({
    imports: [DialogHost],
  }).compileComponents();
  const fixture = TestBed.createComponent(DialogHost);
  Object.assign(fixture.componentInstance, overrides);
  fixture.detectChanges();
  const dialog = fixture.debugElement.children[0].componentInstance as ZmDialogComponent;
  return { host: fixture.componentInstance, dialog };
}

describe('ZmDialogComponent', () => {
  // The CDK overlay attaches to the shared jsdom `document.body`; clear any
  // leaked containers between tests so queries cannot pick up stale panels.
  afterEach(() => {
    document.querySelectorAll('.cdk-overlay-container').forEach(el => el.remove());
    document.documentElement.classList.remove('cdk-global-scrollblock');
  });

  it('renders nothing in-place until opened (content is portaled)', async () => {
    const { dialog } = await mountDialog();
    expect(dialog.isOpen()).toBe(false);
    expect(document.querySelector('.zm-dialog__panel')).toBeNull();
  });

  it('opens a role=dialog + aria-modal=true panel with an accessible name', async () => {
    const { dialog } = await mountDialog({ label: 'Gönderiyi sil' });
    dialog.open();
    await flush();
    const panel = document.querySelector<HTMLElement>('.zm-dialog__panel');
    expect(panel).not.toBeNull();
    expect(panel?.getAttribute('role')).toBe('dialog');
    expect(panel?.getAttribute('aria-modal')).toBe('true');
    expect(panel?.getAttribute('aria-label')).toBe('Gönderiyi sil');
    expect(panel?.getAttribute('tabindex')).toBe('-1');
    dialog.close();
    await flush();
  });

  it('prefers aria-labelledby over aria-label for the dialog name', async () => {
    const { dialog } = await mountDialog({ label: 'ignored', labelledBy: 'd-title' });
    dialog.open();
    await flush();
    const panel = document.querySelector<HTMLElement>('.zm-dialog__panel');
    expect(panel?.getAttribute('aria-labelledby')).toBe('d-title');
    // When labelledBy is set, aria-label is omitted to avoid a double name.
    expect(panel?.getAttribute('aria-label')).toBeNull();
    dialog.close();
    await flush();
  });

  it('exposes a backdrop (scrim) while open (VAL-DS-027 scrim)', async () => {
    const { dialog } = await mountDialog();
    dialog.open();
    await flush();
    const backdrop = document.querySelector('.zm-dialog-backdrop');
    expect(backdrop).not.toBeNull();
    dialog.close();
    await flush();
  });

  it('configures background scroll lock via BlockScrollStrategy (VAL-DS-027 scroll lock)', async () => {
    // CDK's BlockScrollStrategy only adds `.cdk-global-scrollblock` when the
    // page actually overflows, which never happens in jsdom (no layout). We
    // therefore guard the WIRING — that open() requests the block strategy —
    // and the browser probe on /_design proves the live scroll lock. Inject
    // Overlay AFTER mount so we share the component's root-injector instance.
    const { dialog } = await mountDialog();
    const overlay = TestBed.inject(Overlay);
    const blockSpy = vi.spyOn(overlay.scrollStrategies, 'block');
    expect(blockSpy).not.toHaveBeenCalled();
    dialog.open();
    await flush();
    expect(blockSpy).toHaveBeenCalled();
    dialog.close();
    await flush();
  });

  it('emits opened on open and closed with reason on close', async () => {
    const { dialog } = await mountDialog();
    const opened = vi.fn();
    const closed = vi.fn();
    dialog.opened.subscribe(opened);
    dialog.closed.subscribe(closed);
    dialog.open();
    await flush();
    expect(opened).toHaveBeenCalledTimes(1);
    dialog.close('programmatic');
    await flush();
    expect(closed).toHaveBeenCalledTimes(1);
    expect(closed.mock.calls[0][0]).toBe('programmatic');
  });

  it('closes via Escape and reports the escape reason', async () => {
    const { dialog } = await mountDialog();
    const closed = vi.fn();
    dialog.closed.subscribe(closed);
    dialog.open();
    await flush();
    // Simulate the overlay-level Escape (CDK fires keydownEvents on Escape).
    dialog.onKeydown(new KeyboardEvent('keydown', { key: 'Escape' }));
    await flush();
    expect(closed).toHaveBeenCalledTimes(1);
    expect(closed.mock.calls[0][0]).toBe('escape');
    expect(document.querySelector('.zm-dialog__panel')).toBeNull();
  });

  it('dismisses via backdrop (scrim) click when dismissible', async () => {
    const { dialog } = await mountDialog({ dismissible: true });
    const closed = vi.fn();
    dialog.closed.subscribe(closed);
    dialog.open();
    await flush();
    const backdrop = document.querySelector<HTMLElement>('.zm-dialog-backdrop');
    backdrop?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
    expect(closed).toHaveBeenCalledTimes(1);
    expect(closed.mock.calls[0][0]).toBe('backdrop');
  });

  it('non-dismissible (destructive) dialog ignores Escape (VAL-DS-027 negative path)', async () => {
    const { dialog } = await mountDialog({ dismissible: false });
    const closed = vi.fn();
    dialog.closed.subscribe(closed);
    dialog.open();
    await flush();
    dialog.onKeydown(new KeyboardEvent('keydown', { key: 'Escape' }));
    await flush();
    expect(closed).not.toHaveBeenCalled();
    expect(document.querySelector('.zm-dialog__panel')).not.toBeNull();
    dialog.close(); // programmatic close still works
    await flush();
  });

  it('opening twice is idempotent (no duplicate overlay)', async () => {
    const { dialog } = await mountDialog();
    dialog.open();
    dialog.open();
    dialog.open();
    await flush();
    expect(document.querySelectorAll('.zm-dialog__panel').length).toBe(1);
    dialog.close();
    await flush();
  });

  it('is destructive-classified when non-dismissible (visible cue hook)', async () => {
    const { dialog } = await mountDialog({ dismissible: false });
    dialog.open();
    await flush();
    const panel = document.querySelector<HTMLElement>('.zm-dialog__panel');
    expect(panel?.classList.contains('is-destructive')).toBe(true);
    dialog.close();
    await flush();
  });
});
