import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { ZmSkeletonComponent } from './skeleton.component';

/**
 * ZmSkeleton — focused verification for VAL-DS-028 (skeleton renders) and
 * VAL-DS-016 (shimmer disabled under reduced motion, handled via the token
 * cascade — proven in tokens.spec + the browser probe).
 *
 * Guards:
 *   - the host is decorative (role=presentation + aria-hidden=true);
 *   - the text variant renders N line bars, last line marked short (ragged);
 *   - circle/rect variants render a single block at the resolved size;
 *   - custom width/height inputs reach the bar via inline style.
 */

@Component({
  standalone: true,
  imports: [ZmSkeletonComponent],
  template: `
    <zm-skeleton id="txt" variant="text" [lines]="3"></zm-skeleton>
    <zm-skeleton id="one" variant="text"></zm-skeleton>
    <zm-skeleton id="cir" variant="circle" width="3rem"></zm-skeleton>
    <zm-skeleton id="rec" variant="rect" width="100%" height="8rem"></zm-skeleton>
  `,
})
class Host {}

async function mount(): Promise<HTMLElement> {
  await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
  const fixture = TestBed.createComponent(Host);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('ZmSkeletonComponent', () => {
  it('is decorative: role=presentation + aria-hidden=true (VAL-DS-028)', async () => {
    const root = await mount();
    const skel = root.querySelector('#txt') as HTMLElement;
    expect(skel.getAttribute('role')).toBe('presentation');
    expect(skel.getAttribute('aria-hidden')).toBe('true');
  });

  it('renders multiple text lines with the last one marked short (ragged edge)', async () => {
    const root = await mount();
    const bars = Array.from(root.querySelectorAll('#txt .zm-skeleton__bar')) as HTMLElement[];
    expect(bars.length, 'three text lines must render').toBe(3);
    // Only the last line of a multi-line block is shortened.
    expect(bars[0].classList.contains('is-short')).toBe(false);
    expect(bars[1].classList.contains('is-short')).toBe(false);
    expect(bars[2].classList.contains('is-short')).toBe(true);
  });

  it('renders a single text line without the short class when lines=1', async () => {
    const root = await mount();
    const bars = Array.from(root.querySelectorAll('#one .zm-skeleton__bar')) as HTMLElement[];
    expect(bars.length).toBe(1);
    expect(bars[0].classList.contains('is-short')).toBe(false);
  });

  it('renders circle variant as a single block bound to the passed width', async () => {
    const root = await mount();
    const circle = root.querySelector('#cir .zm-skeleton__bar') as HTMLElement;
    expect(circle).toBeTruthy();
    expect(circle.style.width).toBe('3rem');
    expect(circle.style.height).toBe('3rem');
  });

  it('renders rect variant as a single block with width + height', async () => {
    const root = await mount();
    const rect = root.querySelector('#rec .zm-skeleton__bar') as HTMLElement;
    expect(rect).toBeTruthy();
    expect(rect.style.width).toBe('100%');
    expect(rect.style.height).toBe('8rem');
  });

  it('exposes a distinct data-variant attribute per shape', async () => {
    const root = await mount();
    expect(root.querySelector('#txt')!.getAttribute('data-variant')).toBe('text');
    expect(root.querySelector('#cir')!.getAttribute('data-variant')).toBe('circle');
    expect(root.querySelector('#rec')!.getAttribute('data-variant')).toBe('rect');
  });

  it('clamps a single-line request to exactly one bar', async () => {
    const root = await mount();
    const bars = Array.from(root.querySelectorAll('#one .zm-skeleton__bar')) as HTMLElement[];
    expect(bars.length).toBe(1);
  });
});
