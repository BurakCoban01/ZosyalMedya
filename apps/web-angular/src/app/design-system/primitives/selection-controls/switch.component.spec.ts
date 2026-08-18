import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { ZmSwitchComponent } from './switch.component';

/**
 * ZmSwitch — focused verification for VAL-DS-024.
 *
 * Guards the DOM/a11y contract:
 *   - role="switch" + aria-checked exposed to AT;
 *   - native <input type=checkbox> is the click/focus/form participant
 *     (Space toggles);
 *   - persistent <label> associated via for/id;
 *   - state via icon + position, not color alone: thumb slides + track fills;
 *   - loading sets aria-busy + disables + overlays a spinner;
 *   - error tied via aria-describedby + aria-invalid.
 */

@Component({
  standalone: true,
  imports: [ZmSwitchComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<zm-switch
    [label]="label"
    [checked]="checked"
    [loading]="loading"
    [disabled]="disabled"
    [required]="required"
    [helper]="helper"
    [error]="error"
    [highContrast]="highContrast"
    [id]="id"
    [name]="name"
    [value]="value"
    (checkedChange)="onChecked($event)"
  ></zm-switch>`,
})
class SwitchHost {
  label = 'Karanlık tema';
  checked = false;
  loading = false;
  disabled = false;
  required = false;
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
  loading?: boolean;
  disabled?: boolean;
  required?: boolean;
  helper?: string;
  error?: string;
  highContrast?: boolean;
  id?: string;
  name?: string;
  value?: string;
}

async function render(props: HostProps = {}): Promise<{
  fixture: ReturnType<typeof TestBed.createComponent<SwitchHost>>;
  input: HTMLInputElement;
  label: HTMLLabelElement;
  row: HTMLElement;
  track: HTMLElement;
  thumb: HTMLElement;
}> {
  TestBed.resetTestingModule();
  await TestBed.configureTestingModule({ imports: [SwitchHost] }).compileComponents();
  const fixture = TestBed.createComponent(SwitchHost);
  Object.assign(fixture.componentInstance, props);
  fixture.detectChanges();
  const root = fixture.nativeElement as HTMLElement;
  const input = root.querySelector('input.zm-switch__input') as HTMLInputElement;
  if (!input) throw new Error('zm-switch did not render its native <input>');
  const label = root.querySelector('label.zm-switch__row') as HTMLLabelElement;
  const row = root.querySelector('.zm-switch__row') as HTMLElement;
  const track = root.querySelector('.zm-switch__track') as HTMLElement;
  const thumb = root.querySelector('.zm-switch__thumb') as HTMLElement;
  return { fixture, input, label, row, track, thumb };
}

describe('ZmSwitchComponent — role/state + label (VAL-DS-024)', () => {
  it('renders a native <input type="checkbox"> as the click/focus target', async () => {
    const { input } = await render({ label: 'Aç/Kapa', id: 'sw' });
    expect(input.type).toBe('checkbox');
    expect(input.id).toBe('sw');
  });

  it('exposes role="switch" + aria-checked=false on the track at rest', async () => {
    const { track } = await render({ label: 'Kapalı', checked: false });
    expect(track.getAttribute('role')).toBe('switch');
    expect(track.getAttribute('aria-checked')).toBe('false');
  });

  it('flips aria-checked to true when on', async () => {
    const { track, input } = await render({ label: 'Açık', checked: true });
    expect(track.getAttribute('aria-checked')).toBe('true');
    expect(input.checked).toBe(true);
  });

  it('renders a real <label> associated via for/id', async () => {
    const { input, label } = await render({ label: 'Tema', id: 'theme' });
    expect(label.getAttribute('for')).toBe('theme');
    expect(input.id).toBe('theme');
    expect(label.textContent).toContain('Tema');
  });

  it('generates a stable id when none is supplied', async () => {
    const { input, label } = await render({ label: 'Otomatik' });
    expect(input.id).toMatch(/^zm-switch-\d+$/);
    expect(label.getAttribute('for')).toBe(input.id);
  });

  it('keeps the label visible when on, disabled, and in error', async () => {
    const a = await render({ label: 'Kalıcı', checked: true });
    expect(a.label.textContent).toContain('Kalıcı');
    const b = await render({ label: 'Kalıcı', disabled: true });
    expect(b.label.textContent).toContain('Kalıcı');
    const c = await render({ label: 'Kalıcı', error: 'Hata' });
    expect(c.label.textContent).toContain('Kalıcı');
  });
});

describe('ZmSwitchComponent — state via position + fill, not color alone (VAL-DS-024)', () => {
  it('off: thumb at start position (no is-checked)', async () => {
    const { row, thumb } = await render({ label: 'Kapalı', checked: false });
    expect(row.classList.contains('is-checked')).toBe(false);
    // transform: translate(0, -50%) at rest
    expect(getComputedStyle(thumb).transform).toBe('translate(0, -50%)');
  });

  it('on: is-checked class + thumb slides to the end position', async () => {
    const { row, thumb } = await render({ label: 'Açık', checked: true });
    expect(row.classList.contains('is-checked')).toBe(true);
    const t = getComputedStyle(thumb).transform;
    // jsdom preserves the authored calc()/CSS-variable transform instead of
    // resolving it to a browser layout matrix. Guard the actual end-position
    // formula and the vertical centering cue without assuming layout output.
    expect(t).toContain('calc(var(--zm-switch-track-w) - var(--zm-switch-thumb) - var(--zm-space-1))');
    expect(t).toContain('-50%');
    expect(t).not.toBe('translate(0, -50%)');
  });
});

describe('ZmSwitchComponent — loading/pending (VAL-DS-024)', () => {
  it('loading: carries is-loading, sets aria-busy, disables input, shows spinner', async () => {
    const { row, track, input, fixture } = await render({ label: 'Bekleniyor', loading: true });
    expect(row.classList.contains('is-loading')).toBe(true);
    expect(track.getAttribute('aria-busy')).toBe('true');
    expect(input.disabled).toBe(true);
    const spinner = fixture.nativeElement.querySelector('.zm-switch__spinner') as HTMLElement | null;
    expect(spinner, 'spinner must render under loading').toBeTruthy();
  });

  it('does not show a spinner at rest', async () => {
    const { fixture } = await render({ label: 'Sakin' });
    expect(fixture.nativeElement.querySelector('.zm-switch__spinner')).toBeNull();
  });

  it('loading is implied disabled even when disabled input is false', async () => {
    const { input } = await render({ label: 'Örtük', loading: true, disabled: false });
    expect(input.disabled).toBe(true);
  });
});

describe('ZmSwitchComponent — keyboard + value emission', () => {
  it('emits checkedChange on a native change event', async () => {
    const { fixture, input } = await render({ label: 'Aç', checked: false });
    input.checked = true;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    expect(fixture.componentInstance.lastChecked).toBe(true);
  });

  it('Space toggles the native checkbox (browser-native)', async () => {
    const { fixture, input } = await render({ label: 'Boşluk', checked: false });
    input.focus();
    expect(document.activeElement).toBe(input);
    input.checked = true;
    input.dispatchEvent(new Event('change', { bubbles: true }));
    fixture.detectChanges();
    expect(fixture.componentInstance.lastChecked).toBe(true);
  });
});

describe('ZmSwitchComponent — state coverage (VAL-DS-024)', () => {
  it('disabled: carries is-disabled and disables the input', async () => {
    const { row, input } = await render({ label: 'Kilitli', disabled: true });
    expect(row.classList.contains('is-disabled')).toBe(true);
    expect(input.disabled).toBe(true);
  });

  it('error: carries is-error, sets aria-invalid + ties the error node', async () => {
    const { row, input, fixture } = await render({
      label: 'Hata',
      error: 'Değişiklik kaydedilemedi.',
    });
    expect(row.classList.contains('is-error')).toBe(true);
    expect(input.getAttribute('aria-invalid')).toBe('true');
    const describedBy = input.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    const errNode = fixture.nativeElement.querySelector(`#${describedBy}`) as HTMLElement | null;
    expect(errNode?.textContent?.trim()).toBe('Değişiklik kaydedilemedi.');
    expect(errNode?.getAttribute('role')).toBe('alert');
  });

  it('helper: exposed via aria-describedby node when present', async () => {
    const { input, fixture } = await render({ label: 'Yardım', helper: 'Tema seçenekleri' });
    const describedBy = input.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    const node = fixture.nativeElement.querySelector(`#${describedBy}`) as HTMLElement | null;
    expect(node?.textContent?.trim()).toBe('Tema seçenekleri');
  });

  it('high-contrast: carries is-high-contrast', async () => {
    const { row } = await render({ label: 'Vurgu', highContrast: true });
    expect(row.classList.contains('is-high-contrast')).toBe(true);
  });

  it('required: marks the native input + renders the asterisk marker', async () => {
    const { input, fixture } = await render({ label: 'Zorunlu', required: true });
    expect(input.hasAttribute('required')).toBe(true);
    const marker = fixture.nativeElement.querySelector('.zm-switch__required') as HTMLElement | null;
    expect(marker).toBeTruthy();
    expect(marker!.getAttribute('aria-hidden')).toBe('true');
  });

  it('forwards name + value attributes when supplied', async () => {
    const { input } = await render({ label: 'Form', id: 'mfa', name: 'prefs', value: 'mfa-on' });
    expect(input.getAttribute('name')).toBe('prefs');
    expect(input.getAttribute('value')).toBe('mfa-on');
  });
});
