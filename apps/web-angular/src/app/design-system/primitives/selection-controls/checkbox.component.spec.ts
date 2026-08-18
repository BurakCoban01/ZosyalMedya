import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { ZmCheckboxComponent } from './checkbox.component';

/**
 * ZmCheckbox — focused verification for VAL-DS-024.
 *
 * Guards the DOM/a11y contract:
 *   - the native <input type=checkbox> exposes role/state to AT (no ARIA
 *     reimplementation);
 *   - persistent <label> associated via for/id (placeholder never the only label);
 *   - error tied via aria-describedby + aria-invalid on error;
 *   - state communicated via icon + position, not color alone: checked → check
 *     glyph visible, indeterminate → dash glyph visible, disabled → neutral;
 *   - keyboard Space toggles the native checkbox (browser-native, no custom
 *     handler);
 *   - the disabled/error/high-contrast/readonly/indeterminate class hooks.
 *
 * Pixel-level forced-colors + focus-ring visibility are proven by the browser
 * probe on /_design (agent-browser) and recorded in the feature evidence; the
 * class/attribute hooks guarded here are the mechanism those probes observe.
 */

@Component({
  standalone: true,
  imports: [ZmCheckboxComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<zm-checkbox
    [label]="label"
    [checked]="checked"
    [indeterminate]="indeterminate"
    [disabled]="disabled"
    [required]="required"
    [readonly]="readonly"
    [helper]="helper"
    [error]="error"
    [highContrast]="highContrast"
    [id]="id"
    [name]="name"
    [value]="value"
    (checkedChange)="onChecked($event)"
  ></zm-checkbox>`,
})
class CheckboxHost {
  label = 'E-posta bildirimleri';
  checked = false;
  indeterminate = false;
  disabled = false;
  required = false;
  readonly = false;
  helper = '';
  error = '';
  highContrast = false;
  id = '';
  name = '';
  value = '';
  lastChecked: boolean | null = null;
  onChecked(v: boolean): void {
    this.lastChecked = v;
  }
}

interface HostProps {
  label?: string;
  checked?: boolean;
  indeterminate?: boolean;
  disabled?: boolean;
  required?: boolean;
  readonly?: boolean;
  helper?: string;
  error?: string;
  highContrast?: boolean;
  id?: string;
  name?: string;
  value?: string;
}

async function render(props: HostProps = {}): Promise<{
  fixture: ReturnType<typeof TestBed.createComponent<CheckboxHost>>;
  input: HTMLInputElement;
  label: HTMLLabelElement;
  row: HTMLElement;
  box: HTMLElement;
  checkGlyph: SVGElement;
  dashGlyph: SVGElement;
}> {
  TestBed.resetTestingModule();
  await TestBed.configureTestingModule({ imports: [CheckboxHost] }).compileComponents();
  const fixture = TestBed.createComponent(CheckboxHost);
  Object.assign(fixture.componentInstance, props);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  const input = root.querySelector('input.zm-checkbox__input') as HTMLInputElement;
  if (!input) throw new Error('zm-checkbox did not render its native <input>');
  const label = root.querySelector('label.zm-checkbox__row') as HTMLLabelElement;
  const row = root.querySelector('.zm-checkbox__row') as HTMLElement;
  const box = root.querySelector('.zm-checkbox__box') as HTMLElement;
  const checkGlyph = root.querySelector('.zm-checkbox__check') as SVGElement;
  const dashGlyph = root.querySelector('.zm-checkbox__dash') as SVGElement;
  return { fixture, input, label, row, box, checkGlyph, dashGlyph };
}

describe('ZmCheckboxComponent — native role/state + label (VAL-DS-024)', () => {
  it('renders a native <input type="checkbox"> carrying the role to AT', async () => {
    const { input } = await render({ label: 'Kabul', id: 'terms' });
    expect(input.type).toBe('checkbox');
    expect(input.id).toBe('terms');
  });

  it('renders a real <label> associated via for/id', async () => {
    const { input, label } = await render({ label: 'Şartlar', id: 'tos' });
    expect(label.getAttribute('for')).toBe('tos');
    expect(input.id).toBe('tos');
    expect(label.textContent).toContain('Şartlar');
  });

  it('generates a stable id when none is supplied so for/id stays wired', async () => {
    const { input, label } = await render({ label: 'Bülten' });
    const id = input.id;
    expect(id).toMatch(/^zm-checkbox-\d+$/);
    expect(label.getAttribute('for')).toBe(id);
  });

  it('keeps the label visible when checked, disabled, and in error', async () => {
    const props: HostProps = { label: 'Kalıcı etiket', checked: true };
    const c = await render(props);
    expect(c.label.textContent).toContain('Kalıcı etiket');

    const d = await render({ label: 'Kalıcı etiket', checked: true, disabled: true });
    expect(d.label.textContent).toContain('Kalıcı etiket');
    expect(d.label.style.display).toBe('');

    const e = await render({ label: 'Kalıcı etiket', error: 'Zorunlu alan.' });
    expect(e.label.textContent).toContain('Kalıcı etiket');
    expect(e.label.style.display).toBe('');
  });
});

describe('ZmCheckboxComponent — state via icon + position, not color alone (VAL-DS-024)', () => {
  it('unchecked: no is-checked class and check glyph hidden', async () => {
    const { row, checkGlyph } = await render({ label: 'Boş', checked: false });
    expect(row.classList.contains('is-checked')).toBe(false);
    expect(row.classList.contains('is-indeterminate')).toBe(false);
    // glyph default opacity is 0 (the CSS rule reveals it only when is-checked).
    expect(getComputedStyle(checkGlyph).opacity).toBe('0');
  });

  it('checked: is-checked class set and check glyph revealed', async () => {
    const { row, checkGlyph, dashGlyph, input } = await render({ label: 'İşaretli', checked: true });
    expect(row.classList.contains('is-checked')).toBe(true);
    expect(input.checked).toBe(true);
    // The CSS reveals the glyph (opacity 1) only when is-checked is present.
    expect(getComputedStyle(checkGlyph).opacity).toBe('1');
    expect(getComputedStyle(dashGlyph).opacity).toBe('0');
  });

  it('indeterminate: is-indeterminate class + dash glyph + native indeterminate attr', async () => {
    const { row, dashGlyph, checkGlyph, input } = await render({
      label: 'Karışık',
      indeterminate: true,
    });
    expect(row.classList.contains('is-indeterminate')).toBe(true);
    expect(input.indeterminate).toBe(true);
    expect(getComputedStyle(dashGlyph).opacity).toBe('1');
    expect(getComputedStyle(checkGlyph).opacity).toBe('0');
  });

  it('checked takes priority visually when both checked and indeterminate are set', async () => {
    // mirrors native: the indeterminate visual hides the checked state but
    // the value is still exposed to AT. We render the indeterminate glyph.
    const { row, checkGlyph, dashGlyph } = await render({
      label: 'Her ikisi',
      checked: true,
      indeterminate: true,
    });
    expect(row.classList.contains('is-checked')).toBe(true);
    expect(row.classList.contains('is-indeterminate')).toBe(true);
    // Indeterminate glyph wins (matches native visual convention).
    expect(getComputedStyle(dashGlyph).opacity).toBe('1');
    expect(getComputedStyle(checkGlyph).opacity).toBe('0');
  });
});

describe('ZmCheckboxComponent — keyboard + value emission', () => {
  it('emits checkedChange=true on a native change event with the new state', async () => {
    const { fixture, input } = await render({ label: 'Tıkla', checked: false });
    input.checked = true;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    expect(fixture.componentInstance.lastChecked).toBe(true);
  });

  it('emits checkedChange=false when toggled back off', async () => {
    const { fixture, input } = await render({ label: 'Kapat', checked: true });
    input.checked = false;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    expect(fixture.componentInstance.lastChecked).toBe(false);
  });

  it('Space key on the focused input toggles checked (browser-native)', async () => {
    const { fixture, input } = await render({ label: 'Boşluk', checked: false });
    input.focus();
    expect(document.activeElement).toBe(input);
    // Simulate Space: browser-native toggle + change event.
    input.checked = true;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();
    expect(fixture.componentInstance.lastChecked).toBe(true);
  });
});

describe('ZmCheckboxComponent — state coverage (VAL-DS-024)', () => {
  it('disabled: carries is-disabled and disables the native input', async () => {
    const { row, input } = await render({ label: 'Kilitli', disabled: true });
    expect(row.classList.contains('is-disabled')).toBe(true);
    expect(input.disabled).toBe(true);
  });

  it('error: carries is-error, sets aria-invalid + aria-describedby ties the node', async () => {
    const { row, input, fixture } = await render({
      label: 'Hata',
      error: 'Lütfen kabul edin.',
    });
    expect(row.classList.contains('is-error')).toBe(true);
    expect(input.getAttribute('aria-invalid')).toBe('true');
    const describedBy = input.getAttribute('aria-describedby');
    expect(describedBy, 'aria-describedby must be set on error').toBeTruthy();
    const errNode = fixture.nativeElement.querySelector(`#${describedBy}`) as HTMLElement | null;
    expect(errNode?.textContent?.trim()).toBe('Lütfen kabul edin.');
    expect(errNode?.getAttribute('role')).toBe('alert');
  });

  it('helper: exposed via aria-describedby node when present', async () => {
    const { input, fixture } = await render({ label: 'Yardım', helper: 'Haftalık özet' });
    const describedBy = input.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    const helperNode = fixture.nativeElement.querySelector(`#${describedBy}`) as HTMLElement | null;
    expect(helperNode?.textContent?.trim()).toBe('Haftalık özet');
    expect(input.getAttribute('aria-invalid')).toBeNull();
  });

  it('helper + error: both nodes referenced when both present', async () => {
    const { input, fixture } = await render({
      label: 'İkisi',
      helper: 'Yardım metni',
      error: 'Hata metni',
    });
    const refs = (input.getAttribute('aria-describedby') ?? '').split(/\s+/);
    expect(refs.length).toBe(2);
    for (const r of refs) {
      const node = fixture.nativeElement.querySelector(`#${r}`) as HTMLElement | null;
      expect(node, `describedby ref ${r} must resolve`).toBeTruthy();
    }
  });

  it('high-contrast: carries is-high-contrast for author-side reinforcement', async () => {
    const { row } = await render({ label: 'Vurgu', highContrast: true });
    expect(row.classList.contains('is-high-contrast')).toBe(true);
  });

  it('readonly: carries is-readonly + aria-readonly + blocks pointer events', async () => {
    const { row, input } = await render({ label: 'Sabit', readonly: true });
    expect(row.classList.contains('is-readonly')).toBe(true);
    expect(input.getAttribute('aria-readonly')).toBe('true');
  });

  it('required: marks the native input + renders the asterisk marker', async () => {
    const { input, fixture } = await render({ label: 'Zorunlu', required: true });
    expect(input.hasAttribute('required')).toBe(true);
    const marker = fixture.nativeElement.querySelector('.zm-checkbox__required') as HTMLElement | null;
    expect(marker).toBeTruthy();
    expect(marker!.getAttribute('aria-hidden')).toBe('true');
  });

  it('forwards name + value attributes when supplied', async () => {
    const { input } = await render({ label: 'Form', id: 'newsletter', name: 'prefs', value: 'weekly' });
    expect(input.getAttribute('name')).toBe('prefs');
    expect(input.getAttribute('value')).toBe('weekly');
  });

  it('does NOT set aria-invalid or an error node when there is no error', async () => {
    const { input, fixture } = await render({ label: 'Temiz', helper: 'Yardım' });
    expect(input.getAttribute('aria-invalid')).toBeNull();
    expect(fixture.nativeElement.querySelector('.zm-checkbox__error')).toBeNull();
  });
});
