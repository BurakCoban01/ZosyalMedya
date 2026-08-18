import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { ZmButtonComponent, type ZmButtonSize, type ZmButtonVariant } from './button.component';

/**
 * ZmButton — focused verification for VAL-DS-018 (variant × state matrix) and
 * VAL-DS-019 (loading preserves width + accessible name).
 *
 * The unit spec guards the DOM/a11y contract: the variant hook, the loading
 * hooks (aria-busy, disabled, label-retained, spinner aria-hidden), the
 * selected (aria-pressed) toggle, the disabled click guard, and content
 * projection. The pixel-level width-stability delta (≤ 1px) is a layout
 * property that jsdom cannot compute; it is proven by the browser probe on
 * `/_design` (agent-browser) and recorded in the feature evidence. The
 * mechanism guarded here — label kept in the DOM at opacity:0 rather than
 * display:none / visibility:hidden — is what guarantees that width delta.
 */

/** Wrapper host that exercises `<zm-button>` exactly as a consumer would. */
@Component({
  standalone: true,
  imports: [ZmButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<zm-button
    [variant]="variant"
    [size]="size"
    [loading]="loading"
    [disabled]="disabled"
    [selected]="selected"
    [error]="error"
    [highContrast]="highContrast"
    [type]="type"
    [block]="block"
    (clicked)="onClicked()"
    >{{ label }}</zm-button
  >`,
})
class ButtonHost {
  variant: ZmButtonVariant = 'primary';
  size: ZmButtonSize = 'md';
  loading = false;
  disabled = false;
  selected = false;
  error = false;
  highContrast = false;
  type: 'button' | 'submit' | 'reset' = 'button';
  block = false;
  label = 'Eylem';
  clicks = 0;
  onClicked(): void {
    this.clicks++;
  }
}

interface HostProps {
  variant?: ZmButtonVariant;
  size?: ZmButtonSize;
  loading?: boolean;
  disabled?: boolean;
  selected?: boolean;
  error?: boolean;
  highContrast?: boolean;
  type?: 'button' | 'submit' | 'reset';
  block?: boolean;
  label?: string;
}

async function render(props: HostProps = {}): Promise<{ fixture: ReturnType<typeof TestBed.createComponent<ButtonHost>>; button: HTMLButtonElement }> {
  await TestBed.configureTestingModule({ imports: [ButtonHost] }).compileComponents();
  const fixture = TestBed.createComponent(ButtonHost);
  Object.assign(fixture.componentInstance, props);
  fixture.detectChanges();
  const button = fixture.nativeElement.querySelector('button.zm-button__btn') as HTMLButtonElement;
  if (!button) throw new Error('zm-button did not render its inner <button>');
  return { fixture, button };
}

describe('ZmButtonComponent — variant matrix (VAL-DS-018)', () => {
  it('renders the inner native button with the default primary variant', async () => {
    const { button } = await render({ label: 'Yayınla' });
    expect(button).toBeTruthy();
    expect(button.getAttribute('data-variant')).toBe('primary');
    expect(button.getAttribute('type')).toBe('button');
    expect(button.textContent?.trim()).toBe('Yayınla');
  });

  it.each([
    ['primary', 'primary'],
    ['secondary', 'secondary'],
    ['quiet', 'quiet'],
    ['danger', 'danger'],
  ] as const)('exposes the %s variant on data-variant', async (variant, expected) => {
    const { button } = await render({ variant, label: 'Eylem' });
    expect(button.getAttribute('data-variant')).toBe(expected);
  });

  it('projects the label text into the always-rendered label span', async () => {
    const { fixture } = await render({ label: 'Paylaş' });
    const label = fixture.nativeElement.querySelector('.zm-button__label') as HTMLElement;
    expect(label).toBeTruthy();
    expect(label.textContent?.trim()).toBe('Paylaş');
  });

  it('reflects size on data-size', async () => {
    const { button } = await render({ size: 'sm', label: 'X' });
    expect(button.getAttribute('data-size')).toBe('sm');
  });

  it('applies the block class for full-width buttons', async () => {
    const { button } = await render({ block: true, label: 'Devam et' });
    expect(button.classList.contains('is-block')).toBe(true);
  });
});

describe('ZmButtonComponent — selected toggle (aria-pressed)', () => {
  it('reflects selected=true as aria-pressed and the is-selected class', async () => {
    const { button } = await render({ selected: true, variant: 'quiet', label: 'Kaydet' });
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(button.classList.contains('is-selected')).toBe(true);
  });

  it('omits aria-pressed when not selected (no false noise)', async () => {
    const { button } = await render({ label: 'Eylem' });
    expect(button.getAttribute('aria-pressed')).toBeNull();
  });
});

describe('ZmButtonComponent — error and high-contrast states', () => {
  it('applies the is-error class without dropping the variant', async () => {
    const { button } = await render({ error: true, variant: 'secondary', label: 'Tekrar dene' });
    expect(button.classList.contains('is-error')).toBe(true);
    expect(button.getAttribute('data-variant')).toBe('secondary');
  });

  it('applies the is-high-contrast class', async () => {
    const { button } = await render({ highContrast: true, label: 'Eylem' });
    expect(button.classList.contains('is-high-contrast')).toBe(true);
  });
});

describe('ZmButtonComponent — loading preserves width + a11y name (VAL-DS-019)', () => {
  it('exposes aria-busy=true and disables the button while loading', async () => {
    const { button } = await render({ loading: true, label: 'Yayınla' });
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(button.disabled).toBe(true);
  });

  it('keeps the label text in the DOM (accessible name source) while loading', async () => {
    // The accessible name comes from the label text node. Under loading it is
    // dimmed via opacity:0 (NOT display:none / visibility:hidden), so the
    // text node stays in the accessibility tree and the name is preserved.
    const { fixture, button } = await render({ loading: true, label: 'Yayınla' });
    const label = fixture.nativeElement.querySelector('.zm-button__label') as HTMLElement;
    expect(label, 'label span must remain in the DOM under loading').toBeTruthy();
    expect(label.textContent?.trim()).toBe('Yayınla');
    // The button's own accessible name (text content) therefore still resolves.
    expect(button.textContent?.trim()).toBe('Yayınla');
  });

  it('renders the spinner as aria-hidden so it never pollutes the name', async () => {
    const { fixture } = await render({ loading: true, label: 'Yayınla' });
    const spinner = fixture.nativeElement.querySelector('.zm-button__spinner') as HTMLElement | null;
    expect(spinner, 'spinner must render under loading').toBeTruthy();
    expect(spinner!.getAttribute('aria-hidden')).toBe('true');
  });

  it('uses the is-loading hook (never display:none / visibility:hidden on the label)', async () => {
    // The width-preservation mechanism: the button carries `is-loading` and the
    // label span carries NO hiding class — the CSS maps .is-loading .label to
    // opacity:0 only. Asserting the class hooks here guards the mechanism that
    // the browser probe measures as a ≤ 1px width delta.
    const { fixture, button } = await render({ loading: true, label: 'Yayınla' });
    expect(button.classList.contains('is-loading')).toBe(true);
    const label = fixture.nativeElement.querySelector('.zm-button__label') as HTMLElement;
    expect(label.classList.contains('is-loading')).toBe(false);
    // No inline style hides the label (jsdom reflects only authored inline styles).
    expect(label.style.display).toBe('');
    expect(label.style.visibility).toBe('');
  });

  it('suppresses click emission while loading (no double submit)', async () => {
    const { fixture, button } = await render({ loading: true, label: 'Yayınla' });
    button.click();
    expect(fixture.componentInstance.clicks, 'loading button must not emit clicked').toBe(0);
  });
});

describe('ZmButtonComponent — disabled state', () => {
  it('disables the native button and suppresses click', async () => {
    const { fixture, button } = await render({ disabled: true, label: 'Devre dışı' });
    expect(button.disabled).toBe(true);
    button.click();
    expect(fixture.componentInstance.clicks).toBe(0);
  });

  it('emits clicked on a confirmed rest-state click', async () => {
    const { fixture, button } = await render({ label: 'Onayla' });
    button.click();
    expect(fixture.componentInstance.clicks).toBe(1);
  });

  it('does not apply the active depress transform style inline (engine is CSS)', async () => {
    // Engine ownership: active state is owned by :active in CSS, never inline.
    const { button } = await render({ label: 'Eylem' });
    expect(button.style.transform).toBe('');
  });
});

describe('ZmButtonComponent — type passthrough', () => {
  it.each([
    ['button', 'button'],
    ['submit', 'submit'],
    ['reset', 'reset'],
  ] as const)('forwards type=%s to the native button', async (type, expected) => {
    const { button } = await render({ type, label: 'Gönder' });
    expect(button.getAttribute('type')).toBe(expected);
  });
});
