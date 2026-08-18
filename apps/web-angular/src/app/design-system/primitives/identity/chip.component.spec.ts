import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { ZmChipComponent, ZmChipVariant } from './chip.component';

/**
 * ZmChip — focused verification for VAL-DS-032 (chip + status always carry
 * text + color meaning; remove affordance has aria-label; color/label pairing
 * consistent) and VAL-DS-029 (status never color-only — distinct glyph per
 * variant survives grayscale).
 */

@Component({
  standalone: true,
  imports: [ZmChipComponent],
  template: `
    <zm-chip
      id="c"
      [label]="label"
      [variant]="variant"
      [size]="size"
      [selected]="selected"
      [removable]="removable"
      [removeLabel]="removeLabel"
      (removed)="onRemoved()"
    ></zm-chip>
  `,
})
class Host {
  label = 'Moda';
  variant: ZmChipVariant = 'discovery';
  size: 'sm' | 'md' = 'md';
  selected = false;
  removable = false;
  removeLabel = '';
  removedFired = false;
  onRemoved(): void {
    this.removedFired = true;
  }
}

async function mount(overrides: Partial<Host> = {}): Promise<{ host: Host; root: HTMLElement }> {
  TestBed.resetTestingModule();
  await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
  const fixture = TestBed.createComponent(Host);
  Object.assign(fixture.componentInstance, overrides);
  fixture.detectChanges();
  return { host: fixture.componentInstance, root: fixture.nativeElement as HTMLElement };
}

describe('ZmChipComponent — always carries a textual label (VAL-DS-032)', () => {
  it('renders the label text in a dedicated label node', async () => {
    const { root } = await mount({ label: 'Yeni' });
    const label = root.querySelector('#c .zm-chip__label') as HTMLElement;
    expect(label).toBeTruthy();
    expect(label.textContent!.trim()).toBe('Yeni');
  });

  it('never renders color-only — every variant still shows the label', async () => {
    const variants: ZmChipVariant[] = [
      'brand',
      'discovery',
      'info',
      'success',
      'warning',
      'danger',
      'neutral',
    ];
    for (const v of variants) {
      const { root } = await mount({ label: 'Etiket', variant: v });
      const label = root.querySelector('#c .zm-chip__label') as HTMLElement;
      expect(label.textContent!.trim()).toBe('Etiket');
    }
  });
});

describe('ZmChipComponent — color + glyph pairing (VAL-DS-032 / VAL-DS-029)', () => {
  it('sets data-variant on the host so the accent cascade resolves', async () => {
    const { root } = await mount({ variant: 'success' });
    expect((root.querySelector('#c') as HTMLElement).getAttribute('data-variant')).toBe('success');
  });

  it('renders a distinct leading glyph for every non-neutral variant', async () => {
    const variants: ZmChipVariant[] = [
      'brand',
      'discovery',
      'info',
      'success',
      'warning',
      'danger',
    ];
    const seen = new Set<string>();
    for (const v of variants) {
      const { root } = await mount({ variant: v });
      const glyph = root.querySelector('#c .zm-chip__glyph') as HTMLElement;
      expect(glyph).toBeTruthy();
      expect(glyph.getAttribute('aria-hidden')).toBe('true');
      // Capture the inner SVG path/shape signature so we can prove pairwise
      // distinctness (grayscale readability).
      const inner = Array.from(glyph.querySelectorAll('path,rect,circle'))
        .map(n => n.tagName.toLowerCase() + '|' + (n.getAttribute('d') ?? '') + (n.getAttribute('transform') ?? ''))
        .join('§');
      seen.add(v + '::' + inner);
      expect(inner.length).toBeGreaterThan(0);
    }
    // Six distinct glyph signatures collected.
    expect(seen.size).toBe(6);
  });

  it('omits the glyph for the neutral variant (no accent cue needed)', async () => {
    const { root } = await mount({ variant: 'neutral' });
    expect(root.querySelector('#c .zm-chip__glyph')).toBeNull();
  });
});

describe('ZmChipComponent — remove affordance accessible name (VAL-DS-032)', () => {
  it('renders a remove button only when removable', async () => {
    const { root: r1 } = await mount({ removable: false });
    expect(r1.querySelector('#c .zm-chip__remove')).toBeNull();
    const { root: r2 } = await mount({ removable: true, label: 'Moda' });
    const btn = r2.querySelector('#c .zm-chip__remove') as HTMLButtonElement;
    expect(btn).toBeTruthy();
    // The remove control MUST carry an accessible name (never unnamed).
    expect(btn.getAttribute('aria-label')).toBe('Kaldır: Moda');
  });

  it('honors an explicit removeLabel override', async () => {
    const { root } = await mount({
      removable: true,
      label: 'Moda',
      removeLabel: 'Moda etiketini kaldır',
    });
    expect(
      (root.querySelector('#c .zm-chip__remove') as HTMLButtonElement).getAttribute('aria-label'),
    ).toBe('Moda etiketini kaldır');
  });

  it('emits removed when the remove button is activated', async () => {
    const { host, root } = await mount({ removable: true });
    (root.querySelector('#c .zm-chip__remove') as HTMLButtonElement).click();
    expect(host.removedFired).toBe(true);
  });

  it('falls back to a generic "Kaldır" name when the label is empty', async () => {
    const { root } = await mount({ removable: true, label: '' });
    expect(
      (root.querySelector('#c .zm-chip__remove') as HTMLButtonElement).getAttribute('aria-label'),
    ).toBe('Kaldır');
  });
});

describe('ZmChipComponent — selected state', () => {
  it('reflects selection on aria-selected and exposes it only when true', async () => {
    const { root: r1 } = await mount({ selected: false });
    expect((r1.querySelector('#c') as HTMLElement).getAttribute('aria-selected')).toBeNull();
    const { root: r2 } = await mount({ selected: true });
    expect((r2.querySelector('#c') as HTMLElement).getAttribute('aria-selected')).toBe('true');
  });
});
