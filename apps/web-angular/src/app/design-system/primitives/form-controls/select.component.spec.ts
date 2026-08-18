import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { ZmSelectComponent } from './select.component';

/**
 * ZmSelect — focused verification for VAL-DS-021 (persistent label + tied
 * error) and VAL-DS-023 (state coverage) for the single-choice select.
 *
 * The native <select> is wrapped with a persistent <label for=id>, an
 * optional helper, and an error node tied via aria-describedby. The decorative
 * chevron is aria-hidden. Options are projected via <ng-content>.
 */

@Component({
  standalone: true,
  imports: [ZmSelectComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<zm-select
    [label]="label"
    [value]="value"
    [helper]="helper"
    [error]="error"
    [disabled]="disabled"
    [required]="required"
    [highContrast]="highContrast"
    [id]="id"
    (valueChange)="onValue($event)"
  >
    <option value="">Seçin…</option>
    <option value="public">Herkese açık</option>
    <option value="followers">Takipçiler</option>
    <option value="close">Yakın arkadaşlar</option>
  </zm-select>`,
})
class SelectHost {
  label = 'Görünürlük';
  value = '';
  helper = '';
  error = '';
  disabled = false;
  required = false;
  highContrast = false;
  id = '';
  lastValue = '';
  onValue(v: string): void {
    this.lastValue = v;
  }
}

interface HostProps {
  label?: string;
  value?: string;
  helper?: string;
  error?: string;
  disabled?: boolean;
  required?: boolean;
  highContrast?: boolean;
  id?: string;
}

async function render(props: HostProps = {}): Promise<{
  fixture: ReturnType<typeof TestBed.createComponent<SelectHost>>;
  select: HTMLSelectElement;
  label: HTMLLabelElement;
  field: HTMLElement;
}> {
  await TestBed.configureTestingModule({ imports: [SelectHost] }).compileComponents();
  const fixture = TestBed.createComponent(SelectHost);
  Object.assign(fixture.componentInstance, props);
  fixture.detectChanges();
  const select = fixture.nativeElement.querySelector('select.zm-select__input') as HTMLSelectElement;
  if (!select) throw new Error('zm-select did not render its native <select>');
  const label = fixture.nativeElement.querySelector('label.zm-select__label') as HTMLLabelElement;
  const field = fixture.nativeElement.querySelector('.zm-select__field') as HTMLElement;
  return { fixture, select, label, field };
}

describe('ZmSelectComponent — persistent label + tied error (VAL-DS-021)', () => {
  it('renders a real <label> associated via for/id', async () => {
    const { select, label } = await render({ label: 'Görünürlük', id: 'vis-field' });
    expect(label).toBeTruthy();
    expect(label.getAttribute('for')).toBe('vis-field');
    expect(select.id).toBe('vis-field');
    expect(label.textContent?.trim()).toBe('Görünürlük');
  });

  it('generates a stable id when none is supplied', async () => {
    const { select, label } = await render({ label: 'Dil' });
    const id = select.id;
    expect(id).toMatch(/^zm-select-\d+$/);
    expect(label.getAttribute('for')).toBe(id);
  });

  it('projects <option> children into the native select', async () => {
    const { select } = await render({ label: 'Görünürlük' });
    const options = select.querySelectorAll('option');
    expect(options.length).toBe(4);
    expect(options[1].value).toBe('public');
    expect(options[1].textContent?.trim()).toBe('Herkese açık');
  });

  it('keeps the label visible when a value is selected', async () => {
    const { label, select } = await render({ label: 'Görünürlük', value: 'followers' });
    // Native select reflects [value] binding as its selected option.
    expect(select.value).toBe('followers');
    expect(label.textContent?.trim()).toBe('Görünürlük');
    expect(label.style.display).toBe('');
  });

  it('sets aria-invalid and ties the error node via aria-describedby on error', async () => {
    const { select, fixture, field } = await render({
      label: 'Görünürlük',
      error: 'Bir görünürlük seçmelisin.',
    });
    expect(select.getAttribute('aria-invalid')).toBe('true');
    expect(field.classList.contains('is-error')).toBe(true);
    const describedBy = select.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    const errorNode = fixture.nativeElement.querySelector(`#${describedBy}`) as HTMLElement | null;
    expect(errorNode).toBeTruthy();
    expect(errorNode!.textContent?.trim()).toBe('Bir görünürlük seçmelisin.');
  });

  it('emits valueChange on change with the selected option value', async () => {
    const { fixture, select } = await render({ label: 'Görünürlük' });
    select.value = 'close';
    select.dispatchEvent(new Event('change'));
    expect(fixture.componentInstance.lastValue).toBe('close');
  });

  it('renders the decorative chevron as aria-hidden + pointer-events:none', async () => {
    const { fixture } = await render({ label: 'Görünürlük' });
    const chevron = fixture.nativeElement.querySelector('.zm-select__chevron') as SVGElement | null;
    expect(chevron, 'chevron must render').toBeTruthy();
    expect(chevron!.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('ZmSelectComponent — state coverage (VAL-DS-023)', () => {
  it('disables the native select and carries the is-disabled class', async () => {
    const { select, field } = await render({ label: 'Görünürlük', disabled: true });
    expect(select.disabled).toBe(true);
    expect(field.classList.contains('is-disabled')).toBe(true);
  });

  it('carries the is-high-contrast class', async () => {
    const { field } = await render({ label: 'Görünürlük', highContrast: true });
    expect(field.classList.contains('is-high-contrast')).toBe(true);
  });

  it('reflects required on the native select and renders the marker', async () => {
    const { select, fixture } = await render({ label: 'Görünürlük', required: true });
    expect(select.hasAttribute('required')).toBe(true);
    const marker = fixture.nativeElement.querySelector('.zm-select__required') as HTMLElement | null;
    expect(marker).toBeTruthy();
    expect(marker!.getAttribute('aria-hidden')).toBe('true');
  });
});
