import { ChangeDetectionStrategy, Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ZmTooltipComponent } from './tooltip.component';

/**
 * ZmTooltip — focused verification for the transient-label contract.
 *
 * The tooltip is NOT a focus-trapping overlay (VAL-DS-026 carves it out). Its
 * contract is: revealed on hover/focus; the trigger carries aria-describedby
 * pointing at the bubble; the bubble has role=tooltip; Escape closes it
 * without disturbing the trigger's focus. Guards here assert the DOM/aria
 * mechanism; the browser probe proves the hover/focus reveal + positioning.
 */

@Component({
  standalone: true,
  imports: [ZmTooltipComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<zm-tooltip [text]="text" [side]="side" [showDelay]="0" [hideDelay]="0">
    <button type="button" data-testid="trigger">?</button>
  </zm-tooltip>`,
})
class TooltipHost {
  text = 'Bu öğeyi kaydeder';
  side: 'top' | 'right' | 'bottom' | 'left' = 'top';
}

async function mountTooltip(overrides: Partial<TooltipHost> = {}): Promise<{
  host: TooltipHost;
  fixture: ComponentFixture<TooltipHost>;
  tooltip: ZmTooltipComponent;
  trigger: HTMLElement;
}> {
  await TestBed.configureTestingModule({ imports: [TooltipHost] }).compileComponents();
  const fixture = TestBed.createComponent(TooltipHost);
  Object.assign(fixture.componentInstance, overrides);
  fixture.detectChanges();
  const tooltip = fixture.debugElement.children[0].componentInstance as ZmTooltipComponent;
  const trigger = fixture.nativeElement.querySelector('[data-testid="trigger"]') as HTMLElement;
  return { host: fixture.componentInstance, fixture, tooltip, trigger };
}

describe('ZmTooltipComponent', () => {
  afterEach(() => {
    document.querySelectorAll('.cdk-overlay-container').forEach(el => el.remove());
  });

  it('renders the trigger in place and nothing open initially', async () => {
    const { tooltip, trigger } = await mountTooltip();
    expect(trigger).toBeTruthy();
    expect(tooltip.isOpen()).toBe(false);
    expect(document.querySelector('.zm-tooltip__bubble')).toBeNull();
  });

  it('opens the bubble with role=tooltip on show()', async () => {
    const { tooltip } = await mountTooltip({ text: 'Yardım metni' });
    tooltip.onShow();
    expect(tooltip.isOpen()).toBe(true);
    const bubble = document.querySelector<HTMLElement>('.zm-tooltip__bubble');
    expect(bubble).not.toBeNull();
    expect(bubble?.getAttribute('role')).toBe('tooltip');
    expect(bubble?.textContent).toContain('Yardım metni');
    tooltip.close('test');
  });

  it('the trigger carries aria-describedby pointing at the bubble when open', async () => {
    const { fixture, tooltip, trigger } = await mountTooltip({ text: 'Açıklama' });
    const anchor = trigger.parentElement as HTMLElement;
    tooltip.onShow();
    // Refresh the signal-bound [attr.aria-describedby] binding on the anchor.
    fixture.detectChanges();
    const bubbleId = document.querySelector('.zm-tooltip__bubble')?.getAttribute('id');
    expect(bubbleId).toBeTruthy();
    expect(anchor.getAttribute('aria-describedby')).toBe(bubbleId);
    // The bubble id matches the tooltip's tipId.
    expect(bubbleId).toBe(tooltip.tipId());
    tooltip.close('test');
  });

  it('aria-describedby is removed when the tooltip closes', async () => {
    const { fixture, tooltip, trigger } = await mountTooltip();
    const anchor = trigger.parentElement as HTMLElement;
    tooltip.onShow();
    fixture.detectChanges();
    expect(anchor.getAttribute('aria-describedby')).toBeTruthy();
    tooltip.onHide();
    // hideDelay=0 → closes via the timer path; force-close to be deterministic.
    tooltip.close('test');
    fixture.detectChanges();
    expect(anchor.getAttribute('aria-describedby')).toBeNull();
  });

  it('Escape closes an open tooltip (focus stays on the trigger)', async () => {
    const { tooltip, trigger } = await mountTooltip();
    trigger.focus();
    tooltip.onShow();
    expect(tooltip.isOpen()).toBe(true);
    tooltip.onKeydown(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(tooltip.isOpen()).toBe(false);
    // Focus is never owned by the tooltip; the trigger retains it.
    expect(document.activeElement).toBe(trigger);
  });

  it('opening twice is idempotent (no duplicate bubble)', async () => {
    const { tooltip } = await mountTooltip();
    tooltip.onShow();
    tooltip.onShow();
    tooltip.onShow();
    expect(document.querySelectorAll('.zm-tooltip__bubble').length).toBe(1);
    tooltip.close('test');
  });

  it('data-side reflects the preferred side', async () => {
    const { tooltip } = await mountTooltip({ side: 'right' });
    tooltip.onShow();
    const bubble = document.querySelector<HTMLElement>('.zm-tooltip__bubble');
    expect(bubble?.getAttribute('data-side')).toBe('right');
    tooltip.close('test');
  });

  it('emits opened/closed lifecycle', async () => {
    const { tooltip } = await mountTooltip();
    const opened = vi.fn();
    const closed = vi.fn();
    tooltip.opened.subscribe(opened);
    tooltip.closed.subscribe(closed);
    tooltip.onShow();
    expect(opened).toHaveBeenCalledTimes(1);
    tooltip.onKeydown(new KeyboardEvent('keydown', { key: 'Escape' }));
    expect(closed).toHaveBeenCalledTimes(1);
    expect(closed.mock.calls[0][0]).toBe('escape');
  });
});
