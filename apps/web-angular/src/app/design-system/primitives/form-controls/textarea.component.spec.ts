import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { ZmTextareaComponent, type ZmTextareaResize } from './textarea.component';

/**
 * ZmTextarea — focused verification for VAL-DS-021 (persistent label + tied
 * error) and VAL-DS-023 (state coverage) for the multi-line control.
 *
 * The textarea shares the ZmInput field contract; this spec guards the parts
 * that differ: the native <textarea> element, rows/maxlength wiring, the resize
 * attribute, and the same label/error/state hooks.
 */

@Component({
  standalone: true,
  imports: [ZmTextareaComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<zm-textarea
    [label]="label"
    [value]="value"
    [helper]="helper"
    [error]="error"
    [disabled]="disabled"
    [required]="required"
    [readonly]="readonly"
    [rows]="rows"
    [maxlength]="maxlength"
    [resize]="resize"
    [highContrast]="highContrast"
    [id]="id"
    (valueChange)="onValue($event)"
  ></zm-textarea>`,
})
class TextareaHost {
  label = 'Bio';
  value = '';
  helper = '';
  error = '';
  disabled = false;
  required = false;
  readonly = false;
  rows = 4;
  maxlength: number | null = null;
  resize: ZmTextareaResize = 'vertical';
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
  readonly?: boolean;
  rows?: number;
  maxlength?: number | null;
  resize?: ZmTextareaResize;
  highContrast?: boolean;
  id?: string;
}

async function render(props: HostProps = {}): Promise<{
  fixture: ReturnType<typeof TestBed.createComponent<TextareaHost>>;
  textarea: HTMLTextAreaElement;
  label: HTMLLabelElement;
  field: HTMLElement;
}> {
  await TestBed.configureTestingModule({ imports: [TextareaHost] }).compileComponents();
  const fixture = TestBed.createComponent(TextareaHost);
  Object.assign(fixture.componentInstance, props);
  fixture.detectChanges();
  const textarea = fixture.nativeElement.querySelector('textarea.zm-textarea__input') as HTMLTextAreaElement;
  if (!textarea) throw new Error('zm-textarea did not render its native <textarea>');
  const label = fixture.nativeElement.querySelector('label.zm-textarea__label') as HTMLLabelElement;
  const field = fixture.nativeElement.querySelector('.zm-textarea__field') as HTMLElement;
  return { fixture, textarea, label, field };
}

describe('ZmTextareaComponent — persistent label + tied error (VAL-DS-021)', () => {
  it('renders a real <label> associated via for/id', async () => {
    const { textarea, label } = await render({ label: 'Bio', id: 'bio-field' });
    expect(label).toBeTruthy();
    expect(label.getAttribute('for')).toBe('bio-field');
    expect(textarea.id).toBe('bio-field');
    expect(label.textContent?.trim()).toBe('Bio');
  });

  it('generates a stable id when none is supplied', async () => {
    const { textarea, label } = await render({ label: 'Notlar' });
    const id = textarea.id;
    expect(id).toMatch(/^zm-textarea-\d+$/);
    expect(label.getAttribute('for')).toBe(id);
  });

  it('keeps the label visible when populated with content', async () => {
    const { label, textarea } = await render({
      label: 'Bio',
      value: 'Yaşayan editöryel ağ için yazıyorum.',
    });
    expect(textarea.value).toContain('Yaşayan');
    expect(label.textContent?.trim()).toBe('Bio');
    expect(label.style.display).toBe('');
  });

  it('sets aria-invalid and ties the error node via aria-describedby on error', async () => {
    const { textarea, fixture, field } = await render({
      label: 'Bio',
      error: 'Bio en az 10 karakter olmalı.',
    });
    expect(textarea.getAttribute('aria-invalid')).toBe('true');
    expect(field.classList.contains('is-error')).toBe(true);
    const describedBy = textarea.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    const errorNode = fixture.nativeElement.querySelector(`#${describedBy}`) as HTMLElement | null;
    expect(errorNode).toBeTruthy();
    expect(errorNode!.textContent?.trim()).toBe('Bio en az 10 karakter olmalı.');
  });

  it('keeps the label visible when in error', async () => {
    const { label } = await render({ label: 'Bio', error: 'Zorunlu alan.' });
    expect(label.textContent?.trim()).toBe('Bio');
    expect(label.style.display).toBe('');
  });

  it('emits valueChange on input events', async () => {
    const { fixture, textarea } = await render({ label: 'Bio' });
    textarea.value = 'merhaba';
    textarea.dispatchEvent(new Event('input'));
    expect(fixture.componentInstance.lastValue).toBe('merhaba');
  });
});

describe('ZmTextareaComponent — attributes + state coverage (VAL-DS-023)', () => {
  it('applies rows and maxlength on the native textarea', async () => {
    const { textarea } = await render({ label: 'Bio', rows: 6, maxlength: 280 });
    expect(textarea.rows).toBe(6);
    expect(textarea.getAttribute('maxlength')).toBe('280');
  });

  it('reflects the resize attribute from the resize input', async () => {
    const { textarea } = await render({ label: 'Bio', resize: 'none' });
    expect(textarea.getAttribute('resize')).toBe('none');
  });

  it('disables the native textarea and carries the is-disabled class', async () => {
    const { textarea, field } = await render({ label: 'Bio', disabled: true });
    expect(textarea.disabled).toBe(true);
    expect(field.classList.contains('is-disabled')).toBe(true);
  });

  it('carries the is-high-contrast class', async () => {
    const { field } = await render({ label: 'Bio', highContrast: true });
    expect(field.classList.contains('is-high-contrast')).toBe(true);
  });

  it('reflects required and readonly on the native textarea', async () => {
    const { textarea, fixture } = await render({ label: 'Bio', required: true, readonly: true });
    expect(textarea.hasAttribute('required')).toBe(true);
    expect(textarea.readOnly).toBe(true);
    const marker = fixture.nativeElement.querySelector('.zm-textarea__required') as HTMLElement | null;
    expect(marker).toBeTruthy();
    expect(marker!.getAttribute('aria-hidden')).toBe('true');
  });
});
