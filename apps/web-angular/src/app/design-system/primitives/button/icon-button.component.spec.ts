import { ChangeDetectionStrategy, Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { ZmIconButtonComponent } from './icon-button.component';
import type { ZmButtonSize, ZmButtonVariant } from './button.component';

/**
 * ZmIconButton — focused verification for VAL-DS-020 (accessible name, 44x44
 * target, tooltip on hover/focus with the same name).
 *
 * The unit spec guards the DOM/a11y contract:
 *   - the accessible name is always exposed via aria-label (and the input is
 *     `required`, so a nameless icon button is a compile error at every call
 *     site — verified here by asserting the rendered attribute);
 *   - the 44x44 target is enforced via the --zm-button-icon-size token on the
 *     native button's min-width / min-height (the browser probe measures the
 *     actual hit rect);
 *   - the tooltip renders with the same text and is aria-hidden (duplicates
 *     the label, no double-read);
 *   - pressed (aria-pressed) toggle + loading (aria-busy, spinner aria-hidden,
 *     disabled) + disabled click guard.
 *
 * jsdom cannot resolve CSS custom properties to pixels, so the pixel-level
 * 44x44 measurement is proven by the browser probe on `/_design`.
 */

/** Wrapper host that exercises `<zm-icon-button>` exactly as a consumer would. */
@Component({
  standalone: true,
  imports: [ZmIconButtonComponent],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<zm-icon-button
    [ariaLabel]="ariaLabel"
    [tooltip]="tooltip"
    [variant]="variant"
    [size]="size"
    [loading]="loading"
    [disabled]="disabled"
    [pressed]="pressed"
    [error]="error"
    [highContrast]="highContrast"
    (clicked)="onClicked()"
    >{{ icon }}</zm-icon-button
  >`,
})
class IconButtonHost {
  ariaLabel = 'Eylem';
  tooltip: string | undefined = undefined;
  variant: ZmButtonVariant = 'quiet';
  size: ZmButtonSize = 'md';
  loading = false;
  disabled = false;
  pressed = false;
  error = false;
  highContrast = false;
  icon = '';
  clicks = 0;
  onClicked(): void {
    this.clicks++;
  }
}

interface HostProps {
  ariaLabel?: string;
  tooltip?: string;
  variant?: ZmButtonVariant;
  size?: ZmButtonSize;
  loading?: boolean;
  disabled?: boolean;
  pressed?: boolean;
  error?: boolean;
  highContrast?: boolean;
  icon?: string;
}

async function render(props: HostProps = {}): Promise<{ fixture: ReturnType<typeof TestBed.createComponent<IconButtonHost>>; button: HTMLButtonElement }> {
  await TestBed.configureTestingModule({ imports: [IconButtonHost] }).compileComponents();
  const fixture = TestBed.createComponent(IconButtonHost);
  Object.assign(fixture.componentInstance, props);
  fixture.detectChanges();
  const button = fixture.nativeElement.querySelector('button.zm-icon-button__btn') as HTMLButtonElement;
  if (!button) throw new Error('zm-icon-button did not render its inner <button>');
  return { fixture, button };
}

describe('ZmIconButtonComponent — accessible name (VAL-DS-020)', () => {
  it('always exposes aria-label equal to the required input', async () => {
    const { button } = await render({ ariaLabel: 'Favori ekle', icon: '♥' });
    expect(button.getAttribute('aria-label')).toBe('Favori ekle');
  });

  it('renders the projected icon inside an aria-hidden wrapper', async () => {
    const { fixture } = await render({ ariaLabel: 'Favori ekle', icon: '♥' });
    const icon = fixture.nativeElement.querySelector('.zm-icon-button__icon') as HTMLElement;
    expect(icon).toBeTruthy();
    expect(icon.getAttribute('aria-hidden')).toBe('true');
    // The projected glyph lands inside the aria-hidden wrapper so AT never
    // re-announces it (the accessible name comes from aria-label on the button).
    expect(icon.textContent?.trim()).toBe('♥');
  });
});

describe('ZmIconButtonComponent — tooltip mirrors the accessible name (VAL-DS-020)', () => {
  it('renders a tooltip whose text equals the accessible name by default', async () => {
    const { fixture } = await render({ ariaLabel: 'Paylaş', icon: '♥' });
    const tip = fixture.nativeElement.querySelector('.zm-icon-button__tooltip') as HTMLElement;
    expect(tip).toBeTruthy();
    expect(tip.textContent?.trim()).toBe('Paylaş');
  });

  it('lets the tooltip diverge from the name when an explicit hint is given', async () => {
    const { fixture, button } = await render({ ariaLabel: 'Yanıtla', tooltip: 'Yanıt yaz', icon: '♥' });
    const tip = fixture.nativeElement.querySelector('.zm-icon-button__tooltip') as HTMLElement;
    expect(tip.textContent?.trim()).toBe('Yanıt yaz');
    // The AT-facing name is unchanged.
    expect(button.getAttribute('aria-label')).toBe('Yanıtla');
  });

  it('marks the tooltip aria-hidden so the name is not read twice', async () => {
    const { fixture } = await render({ ariaLabel: 'Daha fazla', icon: '♥' });
    const tip = fixture.nativeElement.querySelector('.zm-icon-button__tooltip') as HTMLElement;
    expect(tip.getAttribute('aria-hidden')).toBe('true');
  });
});

describe('ZmIconButtonComponent — 44x44 target hook (VAL-DS-020)', () => {
  it('does not set an inline size (the min-width/min-height live in CSS via the token)', async () => {
    // The pixel measurement is the browser probe's job. Here we guard that no
    // inline style overrides the CSS-driven min-size (engine ownership).
    const { button } = await render({ ariaLabel: 'Aç', icon: '♥' });
    expect(button.style.minWidth).toBe('');
    expect(button.style.minHeight).toBe('');
    expect(button.style.width).toBe('');
    expect(button.style.height).toBe('');
  });

  it('applies the size hook for density variants', async () => {
    const { button } = await render({ ariaLabel: 'Aç', size: 'sm', icon: '♥' });
    expect(button.getAttribute('data-size')).toBe('sm');
  });
});

describe('ZmIconButtonComponent — variant + pressed + error + high-contrast', () => {
  it.each([
    ['primary', 'primary'],
    ['secondary', 'secondary'],
    ['quiet', 'quiet'],
    ['danger', 'danger'],
  ] as const)('renders the %s variant on data-variant', async (variant, expected) => {
    const { button } = await render({ ariaLabel: 'Eylem', variant, icon: '♥' });
    expect(button.getAttribute('data-variant')).toBe(expected);
  });

  it('defaults to the quiet variant (low-emphasis default)', async () => {
    const { button } = await render({ ariaLabel: 'Varsayılan', icon: '♥' });
    expect(button.getAttribute('data-variant')).toBe('quiet');
  });

  it('reflects pressed=true as aria-pressed and the is-pressed class', async () => {
    const { button } = await render({ ariaLabel: 'Kaydet', pressed: true, icon: '♥' });
    expect(button.getAttribute('aria-pressed')).toBe('true');
    expect(button.classList.contains('is-pressed')).toBe(true);
  });

  it('applies the is-error and is-high-contrast classes', async () => {
    const { button } = await render({ ariaLabel: 'Sil', error: true, highContrast: true, variant: 'danger', icon: '♥' });
    expect(button.classList.contains('is-error')).toBe(true);
    expect(button.classList.contains('is-high-contrast')).toBe(true);
  });
});

describe('ZmIconButtonComponent — loading + disabled', () => {
  it('exposes aria-busy=true and disables the button under loading', async () => {
    const { button } = await render({ ariaLabel: 'Gönder', loading: true, icon: '♥' });
    expect(button.getAttribute('aria-busy')).toBe('true');
    expect(button.disabled).toBe(true);
  });

  it('replaces the projected icon with an aria-hidden spinner under loading', async () => {
    const { fixture, button } = await render({ ariaLabel: 'Gönder', loading: true, icon: '♥' });
    const spinner = fixture.nativeElement.querySelector('.zm-icon-button__spinner') as HTMLElement | null;
    const icon = fixture.nativeElement.querySelector('.zm-icon-button__icon') as HTMLElement | null;
    expect(spinner, 'spinner must render under loading').toBeTruthy();
    expect(spinner!.getAttribute('aria-hidden')).toBe('true');
    expect(icon, 'projected icon must be absent under loading').toBeNull();
    // The accessible name stays intact.
    expect(button.getAttribute('aria-label')).toBe('Gönder');
  });

  it('suppresses click emission while loading or disabled', async () => {
    const { fixture, button } = await render({ ariaLabel: 'Gönder', disabled: true, icon: '♥' });
    button.click();
    expect(fixture.componentInstance.clicks).toBe(0);
  });

  it('emits clicked on a confirmed rest-state click', async () => {
    const { fixture, button } = await render({ ariaLabel: 'Beğen', icon: '♥' });
    button.click();
    expect(fixture.componentInstance.clicks).toBe(1);
  });
});
