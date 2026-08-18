import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { ZmSegment, ZmSegmentedComponent } from './segmented.component';

/**
 * ZmSegmented — focused verification for VAL-DS-025.
 *
 * Guards the DOM/a11y + keyboard contract:
 *   - selection model exposed to AT: role=radiogroup (single) / role=group +
 *     aria-multiselectable (multi); each segment role=radio/checkbox +
 *     aria-checked;
 *   - current choice is exposed via aria-checked AND aria-current (position
 *     cue) and reflected by the raised + underlined active segment;
 *   - roving tabindex (segmentTabindex): exactly one segment has tabindex=0,
 *     the rest -1; the roving target follows the active value (single);
 *   - keyboard operable: Arrow/Home/End move focus target (and select in
 *     single mode); Space/Enter toggles in multi mode;
 *   - disabled segments are skipped during arrow cycling and not operable;
 *   - duplicate-event prevention: re-selecting the active value in single
 *     mode does NOT emit valueChange again;
 *   - helper/error wired via aria-describedby + aria-invalid.
 */

/** Shared fixture segments for the visibility picker (single mode). */
const VIS_SEGMENTS: readonly ZmSegment[] = [
  { value: 'public', label: 'Herkese açık' },
  { value: 'followers', label: 'Takipçiler' },
  { value: 'close', label: 'Yakın arkadaşlar' },
  { value: 'private', label: 'Yalnız ben' },
];

/** Shared fixture segments for the filter picker (multi mode), with one
 *  disabled segment to exercise the skip behavior. */
const FILTER_SEGMENTS: readonly ZmSegment[] = [
  { value: 'photo', label: 'Fotoğraf' },
  { value: 'video', label: 'Video', disabled: true },
  { value: 'link', label: 'Bağlantı' },
  { value: 'poll', label: 'Anket' },
];

@Component({
  standalone: true,
  imports: [ZmSegmentedComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<zm-segmented
    [label]="label"
    [variant]="variant"
    [segments]="segments"
    [value]="value"
    [values]="values"
    [disabled]="disabled"
    [error]="error"
    [helper]="helper"
    [highContrast]="highContrast"
    [id]="id"
    (valueChange)="onValue($event)"
    (valuesChange)="onValues($event)"
  ></zm-segmented>`,
})
class SegmentedHost {
  label = 'Görünüm';
  variant: 'single' | 'multi' = 'single';
  segments: readonly ZmSegment[] = VIS_SEGMENTS;
  value = '';
  values: readonly string[] = [];
  disabled = false;
  error = '';
  helper = '';
  highContrast = false;
  id = '';
  valueEmitCount = 0;
  lastValue: string | null = null;
  valuesEmitCount = 0;
  lastValues: readonly string[] | null = null;
  onValue(v: string): void {
    this.value = v;
    this.valueEmitCount++;
    this.lastValue = v;
  }
  onValues(v: readonly string[]): void {
    this.values = v;
    this.valuesEmitCount++;
    this.lastValues = v;
  }
}

interface HostProps {
  label?: string;
  variant?: 'single' | 'multi';
  segments?: readonly ZmSegment[];
  value?: string;
  values?: readonly string[];
  disabled?: boolean;
  error?: string;
  helper?: string;
  highContrast?: boolean;
  id?: string;
}

async function render(
  props: HostProps = {},
): Promise<{
  fixture: ReturnType<typeof TestBed.createComponent<SegmentedHost>>;
  host: SegmentedHost;
  field: HTMLElement;
  track: HTMLElement;
  segButtons: HTMLButtonElement[];
  segWrappers: HTMLElement[];
}> {
  // Allow render() to be called more than once within a single test (re-renders
  // after state changes) by resetting any prior module configuration first.
  TestBed.resetTestingModule();
  await TestBed.configureTestingModule({ imports: [SegmentedHost] }).compileComponents();
  const fixture = TestBed.createComponent(SegmentedHost);
  Object.assign(fixture.componentInstance, props);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  const field = root.querySelector('.zm-segmented__field') as HTMLElement;
  const track = root.querySelector('.zm-segmented__track') as HTMLElement;
  const segButtons = Array.from(root.querySelectorAll('.zm-segmented__segment-btn')) as HTMLButtonElement[];
  const segWrappers = Array.from(root.querySelectorAll('.zm-segmented__segment')) as HTMLElement[];
  return { fixture, host: fixture.componentInstance, field, track, segButtons, segWrappers };
}

/** Dispatch a keydown on a segment button (cancelable + bubbles). */
function keydown(target: HTMLElement, key: string): void {
  target.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
}

/** Find the index of the segment button whose aria-checked is 'true'. */
function checkedIndex(buttons: HTMLButtonElement[]): number {
  return buttons.findIndex(b => b.getAttribute('aria-checked') === 'true');
}

describe('ZmSegmentedComponent — selection model exposed to AT (VAL-DS-025)', () => {
  it('single variant: renders role=radiogroup on the field', async () => {
    const { field } = await render({ variant: 'single', segments: VIS_SEGMENTS, value: 'public' });
    expect(field.getAttribute('role')).toBe('radiogroup');
  });

  it('multi variant: renders role=group + aria-multiselectable=true', async () => {
    const { field } = await render({ variant: 'multi', segments: FILTER_SEGMENTS, values: ['photo'] });
    expect(field.getAttribute('role')).toBe('group');
    expect(field.getAttribute('aria-multiselectable')).toBe('true');
  });

  it('group always carries the accessible name via aria-label', async () => {
    const { field } = await render({ label: 'Görünürlük seçici', segments: VIS_SEGMENTS });
    expect(field.getAttribute('aria-label')).toBe('Görünürlük seçici');
  });

  it('single variant: each segment carries role=radio', async () => {
    const { segButtons } = await render({ variant: 'single', segments: VIS_SEGMENTS, value: 'public' });
    expect(segButtons.length).toBe(VIS_SEGMENTS.length);
    for (const btn of segButtons) {
      expect(btn.getAttribute('role')).toBe('radio');
    }
  });

  it('multi variant: each segment carries role=checkbox', async () => {
    const { segButtons } = await render({ variant: 'multi', segments: FILTER_SEGMENTS, values: [] });
    for (const btn of segButtons) {
      expect(btn.getAttribute('role')).toBe('checkbox');
    }
  });

  it('aria-checked reflects the current single choice and updates on change', async () => {
    const { segButtons, host } = await render({ variant: 'single', segments: VIS_SEGMENTS, value: 'public' });
    expect(checkedIndex(segButtons)).toBe(0);
    // click the third segment
    segButtons[2].click();
    host; // host.onValue updates value; trigger CD
    expect(host.lastValue).toBe('close');
    const { segButtons: after } = await render({ variant: 'single', segments: VIS_SEGMENTS, value: 'close' });
    expect(checkedIndex(after)).toBe(2);
    expect(after[2].getAttribute('aria-checked')).toBe('true');
    expect(after[0].getAttribute('aria-checked')).toBe('false');
  });

  it('aria-checked reflects each multi membership and toggles on click', async () => {
    const { segButtons, host } = await render({ variant: 'multi', segments: FILTER_SEGMENTS, values: ['photo'] });
    expect(segButtons[0].getAttribute('aria-checked')).toBe('true');
    expect(segButtons[2].getAttribute('aria-checked')).toBe('false');
    // toggle 'link' on
    segButtons[2].click();
    expect(host.lastValues).toEqual(['photo', 'link']);
    // toggle 'photo' off
    const { segButtons: b2, host: h2 } = await render({ variant: 'multi', segments: FILTER_SEGMENTS, values: ['photo', 'link'] });
    b2[0].click();
    expect(h2.lastValues).toEqual(['link']);
  });

  it('aria-current="true" redundantly marks the active segment (position cue)', async () => {
    const { segWrappers } = await render({ variant: 'single', segments: VIS_SEGMENTS, value: 'followers' });
    expect(segWrappers[1].getAttribute('aria-current')).toBe('true');
    expect(segWrappers[0].getAttribute('aria-current')).toBeNull();
  });
});

describe('ZmSegmentedComponent — roving tabindex (VAL-DS-025)', () => {
  it('exactly one segment has tabindex=0; the rest are -1', async () => {
    const { segButtons } = await render({ variant: 'single', segments: VIS_SEGMENTS, value: 'followers' });
    const tabindexes = segButtons.map(b => b.getAttribute('tabindex'));
    expect(tabindexes.filter(t => t === '0').length).toBe(1);
    expect(tabindexes.filter(t => t === '-1').length).toBe(segButtons.length - 1);
    // the roving target follows the active value
    expect(segButtons[1].getAttribute('tabindex')).toBe('0');
  });

  it('when no value is set, the roving target is the first enabled segment', async () => {
    const { segButtons } = await render({ variant: 'single', segments: VIS_SEGMENTS, value: '' });
    expect(segButtons[0].getAttribute('tabindex')).toBe('0');
  });

  it('after single selection changes, the roving target follows the new active segment', async () => {
    const { fixture, host, segButtons } = await render({ variant: 'single', segments: VIS_SEGMENTS, value: 'public' });
    expect(segButtons[0].getAttribute('tabindex')).toBe('0');
    segButtons[2].click();
    fixture.detectChanges();
    expect(host.value).toBe('close');
    const after = Array.from(fixture.nativeElement.querySelectorAll('.zm-segmented__segment-btn')) as HTMLButtonElement[];
    expect(after[2].getAttribute('tabindex')).toBe('0');
    expect(after[0].getAttribute('tabindex')).toBe('-1');
  });
});

describe('ZmSegmentedComponent — keyboard navigation (VAL-DS-025)', () => {
  it('single: ArrowRight selects the next segment and emits valueChange', async () => {
    const { segButtons, host } = await render({ variant: 'single', segments: VIS_SEGMENTS, value: 'public' });
    keydown(segButtons[0], 'ArrowRight');
    expect(host.lastValue).toBe('followers');
    expect(host.valueEmitCount).toBe(1);
  });

  it('single: ArrowLeft selects the previous segment (wraps from first to last)', async () => {
    const { segButtons, host } = await render({ variant: 'single', segments: VIS_SEGMENTS, value: 'public' });
    keydown(segButtons[0], 'ArrowLeft');
    expect(host.lastValue).toBe('private'); // wraps to last
  });

  it('single: Home jumps to the first segment; End to the last', async () => {
    const { segButtons, host } = await render({ variant: 'single', segments: VIS_SEGMENTS, value: 'close' });
    keydown(segButtons[2], 'Home');
    expect(host.lastValue).toBe('public');
    const r = await render({ variant: 'single', segments: VIS_SEGMENTS, value: 'close' });
    keydown(r.segButtons[2], 'End');
    expect(r.host.lastValue).toBe('private');
  });

  it('single: ArrowDown works as a vertical alias of ArrowRight', async () => {
    const { segButtons, host } = await render({ variant: 'single', segments: VIS_SEGMENTS, value: 'public' });
    keydown(segButtons[0], 'ArrowDown');
    expect(host.lastValue).toBe('followers');
  });

  it('multi: ArrowRight does NOT toggle values (moves focus target only)', async () => {
    const { segButtons, host } = await render({ variant: 'multi', segments: FILTER_SEGMENTS, values: ['photo'] });
    keydown(segButtons[0], 'ArrowRight');
    expect(host.valuesEmitCount).toBe(0);
    expect(host.lastValues).toBeNull();
  });

  it('multi: Space toggles the focused segment membership', async () => {
    const { segButtons, host } = await render({ variant: 'multi', segments: FILTER_SEGMENTS, values: ['photo'] });
    keydown(segButtons[0], ' ');
    expect(host.lastValues).toEqual([]); // photo removed
    const r = await render({ variant: 'multi', segments: FILTER_SEGMENTS, values: ['photo'] });
    keydown(r.segButtons[2], ' '); // link was off → on
    expect(r.host.lastValues).toEqual(['photo', 'link']);
  });

  it('multi: Enter toggles the focused segment membership', async () => {
    const { segButtons, host } = await render({ variant: 'multi', segments: FILTER_SEGMENTS, values: [] });
    keydown(segButtons[0], 'Enter');
    expect(host.lastValues).toEqual(['photo']);
  });

  it('disabled segments are skipped during arrow cycling', async () => {
    // FILTER_SEGMENTS[1] (video) is disabled. ArrowRight from photo (0)
    // must land on link (2), NOT video (1).
    const { segButtons, host } = await render({ variant: 'single', segments: FILTER_SEGMENTS, value: 'photo' });
    keydown(segButtons[0], 'ArrowRight');
    expect(host.lastValue).toBe('link');
  });

  it('disabled segment is not operable via click', async () => {
    const { segButtons, host, segWrappers } = await render({ variant: 'single', segments: FILTER_SEGMENTS, value: 'photo' });
    expect(segWrappers[1].classList.contains('is-disabled')).toBe(true);
    expect(segButtons[1].disabled).toBe(true);
    segButtons[1].click();
    expect(host.valueEmitCount).toBe(0);
  });

  it('defaultPrevented is set for handled keys (no browser scroll/parent handler)', async () => {
    const { segButtons } = await render({ variant: 'single', segments: VIS_SEGMENTS, value: 'public' });
    const evt = new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true });
    segButtons[0].dispatchEvent(evt);
    expect(evt.defaultPrevented).toBe(true);
  });
});

describe('ZmSegmentedComponent — duplicate-event prevention', () => {
  it('single: clicking the already-active segment does not re-emit', async () => {
    const { segButtons, host } = await render({ variant: 'single', segments: VIS_SEGMENTS, value: 'public' });
    segButtons[0].click();
    expect(host.valueEmitCount).toBe(0);
    expect(host.lastValue).toBeNull();
  });

  it('single: arrowing onto the already-active segment does not re-emit', async () => {
    const { segButtons, host } = await render({ variant: 'single', segments: VIS_SEGMENTS, value: 'public' });
    // ArrowLeft from index 0 wraps to last (private) — that IS a change.
    // But ArrowRight onto the same value is impossible in single mode because
    // arrow always moves. Instead verify Home when already on first is a no-op
    // for emission: Home from index 0 lands on index 0 (same value) → no emit.
    keydown(segButtons[0], 'Home');
    expect(host.valueEmitCount).toBe(0);
  });

  it('multi: Space on an unchanged state still emits consistently (toggle always changes)', async () => {
    // Toggling always changes membership, so each Space is a real change.
    const { segButtons, host } = await render({ variant: 'multi', segments: FILTER_SEGMENTS, values: ['photo'] });
    keydown(segButtons[0], ' ');
    expect(host.valuesEmitCount).toBe(1);
    expect(host.lastValues).toEqual([]);
  });
});

describe('ZmSegmentedComponent — state coverage (VAL-DS-025)', () => {
  it('whole-bar disabled: every segment button is disabled and not operable', async () => {
    const { field, segButtons, host } = await render({
      variant: 'single',
      segments: VIS_SEGMENTS,
      value: 'public',
      disabled: true,
    });
    expect(field.classList.contains('is-disabled')).toBe(true);
    for (const btn of segButtons) {
      expect(btn.disabled).toBe(true);
    }
    segButtons[2].click();
    expect(host.valueEmitCount).toBe(0);
  });

  it('error: carries is-error, sets aria-invalid on the group + ties the error node', async () => {
    const { field, fixture } = await render({
      variant: 'single',
      segments: VIS_SEGMENTS,
      value: 'public',
      error: 'Bir görünüm seçmelisin.',
    });
    expect(field.classList.contains('is-error')).toBe(true);
    expect(field.getAttribute('aria-invalid')).toBe('true');
    const describedBy = field.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    const errNode = fixture.nativeElement.querySelector(`#${describedBy}`) as HTMLElement | null;
    expect(errNode?.textContent?.trim()).toBe('Bir görünüm seçmelisin.');
    expect(errNode?.getAttribute('role')).toBe('alert');
  });

  it('helper: exposed via aria-describedby node when present', async () => {
    const { field, fixture } = await render({
      variant: 'single',
      segments: VIS_SEGMENTS,
      helper: 'Bu gönderiyi kimler görebilir?',
    });
    const describedBy = field.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    const node = fixture.nativeElement.querySelector(`#${describedBy}`) as HTMLElement | null;
    expect(node?.textContent?.trim()).toBe('Bu gönderiyi kimler görebilir?');
  });

  it('high-contrast: carries is-high-contrast', async () => {
    const { field } = await render({ variant: 'single', segments: VIS_SEGMENTS, highContrast: true });
    expect(field.classList.contains('is-high-contrast')).toBe(true);
  });

  it('active segment carries is-active wrapper class (raised + underline target)', async () => {
    const { segWrappers } = await render({ variant: 'single', segments: VIS_SEGMENTS, value: 'close' });
    expect(segWrappers[2].classList.contains('is-active')).toBe(true);
    expect(segWrappers[0].classList.contains('is-active')).toBe(false);
  });

  it('resolves a stable id and wires helper/error element ids from it', async () => {
    const { field, fixture } = await render({
      variant: 'single',
      segments: VIS_SEGMENTS,
      id: 'vis-picker',
      helper: 'yardım',
      error: 'hata',
    });
    // group itself does not need an id, but the helper/error nodes derive from it
    const helper = fixture.nativeElement.querySelector('#vis-picker--helper') as HTMLElement | null;
    const error = fixture.nativeElement.querySelector('#vis-picker--error') as HTMLElement | null;
    expect(helper?.textContent?.trim()).toBe('yardım');
    expect(error?.textContent?.trim()).toBe('hata');
    const describedBy = field.getAttribute('aria-describedby');
    expect(describedBy).toContain('vis-picker--helper');
    expect(describedBy).toContain('vis-picker--error');
  });

  it('segmentAriaLabel includes the description when provided', async () => {
    const segs: readonly ZmSegment[] = [
      { value: 'a', label: 'Az', description: 'en az görülür' },
      { value: 'b', label: 'Çok' },
    ];
    const { segButtons } = await render({ variant: 'single', segments: segs, value: 'a' });
    expect(segButtons[0].getAttribute('aria-label')).toBe('Az: en az görülür');
    expect(segButtons[1].getAttribute('aria-label')).toBe('Çok');
  });
});

describe('ZmSegmentedComponent — empty / degenerate inputs', () => {
  it('no segments: is-disabled true, no buttons rendered', async () => {
    const { field, segButtons } = await render({ variant: 'single', segments: [] });
    expect(field.classList.contains('is-disabled')).toBe(true);
    expect(segButtons.length).toBe(0);
  });
});
