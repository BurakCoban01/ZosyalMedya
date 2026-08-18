import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { ZmStatusComponent, ZmStatusVariant } from './status.component';

/**
 * ZmStatus — focused verification for VAL-DS-032 (status always carries text
 * + color meaning; color/label pairing consistent) and VAL-DS-029 (status
 * never color-only — distinct leading shape per variant survives grayscale).
 *
 * Also guards the live-region contract: default polite → role=status, and
 * assertive → role=alert, so a status rendered into the document reaches AT.
 */

@Component({
  standalone: true,
  imports: [ZmStatusComponent],
  template: `
    <zm-status
      id="s"
      [label]="label"
      [variant]="variant"
      [dot]="dot"
      [politeness]="politeness"
    ></zm-status>
  `,
})
class Host {
  label = 'Yayında';
  variant: ZmStatusVariant = 'success';
  dot = true;
  politeness: 'polite' | 'assertive' = 'polite';
}

async function mount(overrides: Partial<Host> = {}): Promise<{ host: Host; root: HTMLElement }> {
  TestBed.resetTestingModule();
  await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
  const fixture = TestBed.createComponent(Host);
  Object.assign(fixture.componentInstance, overrides);
  fixture.detectChanges();
  return { host: fixture.componentInstance, root: fixture.nativeElement as HTMLElement };
}

describe('ZmStatusComponent — always carries a textual label (VAL-DS-032)', () => {
  it('renders the label text in a dedicated label node', async () => {
    const { root } = await mount({ label: 'Beklemede' });
    const label = root.querySelector('#s .zm-status__label') as HTMLElement;
    expect(label).toBeTruthy();
    expect(label.textContent!.trim()).toBe('Beklemede');
  });

  it('never renders color-only — every variant still shows the label', async () => {
    const variants: ZmStatusVariant[] = [
      'brand',
      'discovery',
      'info',
      'success',
      'warning',
      'danger',
      'neutral',
    ];
    for (const v of variants) {
      const { root } = await mount({ label: 'Durum', variant: v });
      const label = root.querySelector('#s .zm-status__label') as HTMLElement;
      expect(label.textContent!.trim()).toBe('Durum');
    }
  });
});

describe('ZmStatusComponent — color + shape pairing (VAL-DS-032 / VAL-DS-029)', () => {
  it('sets data-variant on the host so the accent cascade resolves', async () => {
    const { root } = await mount({ variant: 'warning' });
    expect((root.querySelector('#s') as HTMLElement).getAttribute('data-variant')).toBe('warning');
  });

  it('renders a distinct leading shape for every variant (grayscale-readable)', async () => {
    const variants: ZmStatusVariant[] = [
      'brand',
      'discovery',
      'info',
      'success',
      'warning',
      'danger',
      'neutral',
    ];
    const seen = new Set<string>();
    for (const v of variants) {
      const { root } = await mount({ variant: v });
      const shape = root.querySelector('#s .zm-status__shape') as HTMLElement;
      expect(shape).toBeTruthy();
      expect(shape.getAttribute('aria-hidden')).toBe('true');
      const inner = Array.from(shape.querySelectorAll('path,rect,circle'))
        .map(n => n.tagName.toLowerCase() + '|' + (n.getAttribute('d') ?? '') + (n.getAttribute('transform') ?? ''))
        .join('§');
      seen.add(v + '::' + inner);
      expect(inner.length).toBeGreaterThan(0);
    }
    // Seven distinct shape signatures collected.
    expect(seen.size).toBe(7);
  });

  it('hides the leading shape when dot is false', async () => {
    const { root } = await mount({ dot: false });
    expect(root.querySelector('#s .zm-status__shape')).toBeNull();
    // Label still present.
    expect(root.querySelector('#s .zm-status__label')!.textContent!.trim()).toBe('Yayında');
  });
});

describe('ZmStatusComponent — live-region contract (VAL-DS-028 / VAL-DS-029)', () => {
  it('exposes role=status + aria-live=polite by default', async () => {
    const { root } = await mount();
    const host = root.querySelector('#s') as HTMLElement;
    expect(host.getAttribute('role')).toBe('status');
    expect(host.getAttribute('aria-live')).toBe('polite');
    expect(host.getAttribute('aria-label')).toBe('Yayında');
  });

  it('switches to role=alert + aria-live=assertive for hard errors', async () => {
    const { root } = await mount({ politeness: 'assertive', label: 'Yayınlanamadı' });
    const host = root.querySelector('#s') as HTMLElement;
    expect(host.getAttribute('role')).toBe('alert');
    expect(host.getAttribute('aria-live')).toBe('assertive');
    expect(host.getAttribute('aria-label')).toBe('Yayınlanamadı');
  });
});
