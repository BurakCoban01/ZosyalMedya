import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { ZmRadioComponent } from './radio.component';

/**
 * ZmRadio — focused verification for VAL-DS-024.
 *
 * Guards the DOM/a11y contract:
 *   - native <input type=radio> carrying role/state to AT;
 *   - persistent <label> associated via for/id;
 *   - shared `name` enables native arrow-key cycling within the group;
 *   - state via icon + position: selected → ring + center dot;
 *   - error tied via aria-describedby + aria-invalid;
 *   - emits `selected` with the radio's value when it becomes checked.
 */

@Component({
  standalone: true,
  imports: [ZmRadioComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<zm-radio
    [label]="label"
    [value]="value"
    [name]="name"
    [checked]="checked"
    [disabled]="disabled"
    [required]="required"
    [helper]="helper"
    [error]="error"
    [highContrast]="highContrast"
    [id]="id"
    (selected)="onSelected($event)"
  ></zm-radio>`,
})
class RadioHost {
  label = 'Herkese açık';
  value = 'public';
  name = 'visibility';
  checked = false;
  disabled = false;
  required = false;
  helper = '';
  error = '';
  highContrast = false;
  id = '';
  lastSelected: string | null = null;
  onSelected(v: string): void {
    this.lastSelected = v;
  }
}

interface HostProps {
  label?: string;
  value?: string;
  name?: string;
  checked?: boolean;
  disabled?: boolean;
  required?: boolean;
  helper?: string;
  error?: string;
  highContrast?: boolean;
  id?: string;
}

async function render(props: HostProps = {}): Promise<{
  fixture: ReturnType<typeof TestBed.createComponent<RadioHost>>;
  input: HTMLInputElement;
  label: HTMLLabelElement;
  row: HTMLElement;
  ring: HTMLElement;
  dot: HTMLElement;
}> {
  TestBed.resetTestingModule();
  await TestBed.configureTestingModule({ imports: [RadioHost] }).compileComponents();
  const fixture = TestBed.createComponent(RadioHost);
  Object.assign(fixture.componentInstance, props);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  const input = root.querySelector('input.zm-radio__input') as HTMLInputElement;
  if (!input) throw new Error('zm-radio did not render its native <input>');
  const label = root.querySelector('label.zm-radio__row') as HTMLLabelElement;
  const row = root.querySelector('.zm-radio__row') as HTMLElement;
  const ring = root.querySelector('.zm-radio__ring') as HTMLElement;
  const dot = root.querySelector('.zm-radio__dot') as HTMLElement;
  return { fixture, input, label, row, ring, dot };
}

describe('ZmRadioComponent — native role/state + label (VAL-DS-024)', () => {
  it('renders a native <input type="radio"> carrying the role to AT', async () => {
    const { input } = await render({ label: 'A', value: 'a', name: 'g', id: 'r-a' });
    expect(input.type).toBe('radio');
    expect(input.id).toBe('r-a');
    expect(input.getAttribute('name')).toBe('g');
    expect(input.getAttribute('value')).toBe('a');
  });

  it('renders a real <label> associated via for/id', async () => {
    const { input, label } = await render({ label: 'Seçenek', value: 'x', name: 'g', id: 'rx' });
    expect(label.getAttribute('for')).toBe('rx');
    expect(input.id).toBe('rx');
    expect(label.textContent).toContain('Seçenek');
  });

  it('generates a stable id when none is supplied', async () => {
    const { input, label } = await render({ label: 'Otomatik', value: 'y', name: 'g' });
    expect(input.id).toMatch(/^zm-radio-\d+$/);
    expect(label.getAttribute('for')).toBe(input.id);
  });

  it('keeps the label visible when checked, disabled, and in error', async () => {
    const a = await render({ label: 'Kalıcı', value: 'a', name: 'g', checked: true });
    expect(a.label.textContent).toContain('Kalıcı');
    const b = await render({ label: 'Kalıcı', value: 'a', name: 'g', disabled: true });
    expect(b.label.textContent).toContain('Kalıcı');
    const c = await render({ label: 'Kalıcı', value: 'a', name: 'g', error: 'Zorunlu' });
    expect(c.label.textContent).toContain('Kalıcı');
  });
});

describe('ZmRadioComponent — state via icon + position (VAL-DS-024)', () => {
  it('unselected: no is-checked class and dot hidden', async () => {
    const { row, dot } = await render({ label: 'Boş', value: 'a', name: 'g', checked: false });
    expect(row.classList.contains('is-checked')).toBe(false);
    expect(getComputedStyle(dot).opacity).toBe('0');
  });

  it('selected: is-checked class set and dot revealed', async () => {
    const { row, dot, input } = await render({ label: 'Seçili', value: 'a', name: 'g', checked: true });
    expect(row.classList.contains('is-checked')).toBe(true);
    expect(input.checked).toBe(true);
    expect(getComputedStyle(dot).opacity).toBe('1');
  });

  it('uses a round ring shape distinct from the checkbox square', async () => {
    const { ring } = await render({ label: 'Yuvarlak', value: 'a', name: 'g' });
    // 50% radius = circle; the checkbox box uses --zm-selection-box-radius (10).
    expect(getComputedStyle(ring).borderRadius).toBe('50%');
  });
});

describe('ZmRadioComponent — keyboard + selection emission', () => {
  it('emits selected with the radio value when it becomes checked', async () => {
    const { fixture, input } = await render({ label: 'A', value: 'option-a', name: 'g' });
    input.checked = true;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    expect(fixture.componentInstance.lastSelected).toBe('option-a');
  });

  it('does NOT emit when the change event fires while unchecked', async () => {
    const { fixture, input } = await render({ label: 'A', value: 'option-a', name: 'g' });
    input.checked = false;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    expect(fixture.componentInstance.lastSelected).toBeNull();
  });
});

describe('ZmRadioComponent — state coverage (VAL-DS-024)', () => {
  it('disabled: carries is-disabled and disables the native input', async () => {
    const { row, input } = await render({ label: 'Kilitli', value: 'a', name: 'g', disabled: true });
    expect(row.classList.contains('is-disabled')).toBe(true);
    expect(input.disabled).toBe(true);
  });

  it('error: carries is-error, sets aria-invalid + ties the error node', async () => {
    const { row, input, fixture } = await render({
      label: 'Hata',
      value: 'a',
      name: 'g',
      error: 'Bir seçim yapın.',
    });
    expect(row.classList.contains('is-error')).toBe(true);
    expect(input.getAttribute('aria-invalid')).toBe('true');
    const describedBy = input.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    const errNode = fixture.nativeElement.querySelector(`#${describedBy}`) as HTMLElement | null;
    expect(errNode?.textContent?.trim()).toBe('Bir seçim yapın.');
    expect(errNode?.getAttribute('role')).toBe('alert');
  });

  it('helper: exposed via aria-describedby node when present', async () => {
    const { input, fixture } = await render({ label: 'Yardım', value: 'a', name: 'g', helper: 'Yardım metni' });
    const describedBy = input.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    const node = fixture.nativeElement.querySelector(`#${describedBy}`) as HTMLElement | null;
    expect(node?.textContent?.trim()).toBe('Yardım metni');
  });

  it('high-contrast: carries is-high-contrast', async () => {
    const { row } = await render({ label: 'Vurgu', value: 'a', name: 'g', highContrast: true });
    expect(row.classList.contains('is-high-contrast')).toBe(true);
  });

  it('required: marks the native input + renders the asterisk marker', async () => {
    const { input, fixture } = await render({ label: 'Zorunlu', value: 'a', name: 'g', required: true });
    expect(input.hasAttribute('required')).toBe(true);
    const marker = fixture.nativeElement.querySelector('.zm-radio__required') as HTMLElement | null;
    expect(marker).toBeTruthy();
    expect(marker!.getAttribute('aria-hidden')).toBe('true');
  });
});
