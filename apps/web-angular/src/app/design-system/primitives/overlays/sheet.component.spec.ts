import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ZmSheetComponent } from './sheet.component';

/**
 * ZmSheet — focused verification for VAL-DS-026 / VAL-DS-027.
 *
 * Same a11y contract as ZmDialog (focus move-in, trap, Escape, return focus,
 * scrim dismiss, scroll lock). Here we additionally guard the side-anchoring
 * presentation hooks (start/end/top/bottom classes) and the accessible-name
 * contract. The live slide-in + scroll lock + focus trace are proven by the
 * browser probe on /_design.
 */

const flush = async (): Promise<void> => {
  await Promise.resolve();
  await Promise.resolve();
  await new Promise(r => setTimeout(r, 0));
};

@Component({
  standalone: true,
  imports: [ZmSheetComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<zm-sheet [label]="label" [side]="side" [dismissible]="dismissible">
    <h2 id="s-title">Başlık</h2>
  </zm-sheet>`,
})
class SheetHost {
  label = 'Filtreler';
  side: 'start' | 'end' | 'top' | 'bottom' = 'end';
  dismissible = true;
}

async function mountSheet(overrides: Partial<SheetHost> = {}): Promise<ZmSheetComponent> {
  await TestBed.configureTestingModule({ imports: [SheetHost] }).compileComponents();
  const fixture = TestBed.createComponent(SheetHost);
  Object.assign(fixture.componentInstance, overrides);
  fixture.detectChanges();
  return fixture.debugElement.children[0].componentInstance as ZmSheetComponent;
}

describe('ZmSheetComponent', () => {
  afterEach(() => {
    document.querySelectorAll('.cdk-overlay-container').forEach(el => el.remove());
  });

  it('renders nothing in-place until opened', async () => {
    const sheet = await mountSheet();
    expect(sheet.isOpen()).toBe(false);
    expect(document.querySelector('.zm-sheet__panel')).toBeNull();
  });

  it('opens a role=dialog + aria-modal=true panel with an accessible name', async () => {
    const sheet = await mountSheet({ label: 'Detay paneli' });
    sheet.open();
    await flush();
    const panel = document.querySelector<HTMLElement>('.zm-sheet__panel');
    expect(panel).not.toBeNull();
    expect(panel?.getAttribute('role')).toBe('dialog');
    expect(panel?.getAttribute('aria-modal')).toBe('true');
    expect(panel?.getAttribute('aria-label')).toBe('Detay paneli');
    sheet.close();
    await flush();
  });

  it('applies the side-anchoring class for the default (end) side', async () => {
    const sheet = await mountSheet({ side: 'end' });
    sheet.open();
    await flush();
    const panel = document.querySelector<HTMLElement>('.zm-sheet__panel');
    expect(panel?.classList.contains('is-end')).toBe(true);
    sheet.close();
    await flush();
  });

  it('applies the side-anchoring class for the bottom side', async () => {
    const sheet = await mountSheet({ side: 'bottom' });
    sheet.open();
    await flush();
    const panel = document.querySelector<HTMLElement>('.zm-sheet__panel');
    expect(panel?.classList.contains('is-bottom')).toBe(true);
    expect(panel?.classList.contains('is-end')).toBe(false);
    sheet.close();
    await flush();
  });

  it('applies the side-anchoring class for the start side', async () => {
    const sheet = await mountSheet({ side: 'start' });
    sheet.open();
    await flush();
    const panel = document.querySelector<HTMLElement>('.zm-sheet__panel');
    expect(panel?.classList.contains('is-start')).toBe(true);
    sheet.close();
    await flush();
  });

  it('exposes a backdrop (scrim) while open (VAL-DS-027 scrim)', async () => {
    const sheet = await mountSheet();
    sheet.open();
    await flush();
    expect(document.querySelector('.zm-sheet-backdrop')).not.toBeNull();
    sheet.close();
    await flush();
  });

  it('emits opened/closed and reports the escape reason', async () => {
    const sheet = await mountSheet();
    const opened = vi.fn();
    const closed = vi.fn();
    sheet.opened.subscribe(opened);
    sheet.closed.subscribe(closed);
    sheet.open();
    await flush();
    expect(opened).toHaveBeenCalledTimes(1);
    sheet.onKeydown(new KeyboardEvent('keydown', { key: 'Escape' }));
    await flush();
    expect(closed).toHaveBeenCalledTimes(1);
    expect(closed.mock.calls[0][0]).toBe('escape');
  });

  it('dismisses via backdrop click when dismissible', async () => {
    const sheet = await mountSheet({ dismissible: true });
    const closed = vi.fn();
    sheet.closed.subscribe(closed);
    sheet.open();
    await flush();
    const backdrop = document.querySelector<HTMLElement>('.zm-sheet-backdrop');
    backdrop?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    await flush();
    expect(closed.mock.calls[0]?.[0]).toBe('backdrop');
  });

  it('non-dismissible sheet ignores Escape (VAL-DS-027 negative path)', async () => {
    const sheet = await mountSheet({ dismissible: false });
    const closed = vi.fn();
    sheet.closed.subscribe(closed);
    sheet.open();
    await flush();
    sheet.onKeydown(new KeyboardEvent('keydown', { key: 'Escape' }));
    await flush();
    expect(closed).not.toHaveBeenCalled();
    expect(document.querySelector('.zm-sheet__panel')).not.toBeNull();
    sheet.close();
    await flush();
  });

  it('opening is idempotent', async () => {
    const sheet = await mountSheet();
    sheet.open();
    sheet.open();
    await flush();
    expect(document.querySelectorAll('.zm-sheet__panel').length).toBe(1);
    sheet.close();
    await flush();
  });
});
