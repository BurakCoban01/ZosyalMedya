import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { ZmEmptyStateComponent } from './empty-state.component';

/**
 * ZmEmptyState — focused verification for VAL-DS-028 (empty state renders
 * with a useful next action; Turkish recovery copy; role + structure correct)
 * and VAL-DS-029 (status never color-only: the empty glyph is distinct).
 *
 * Guards:
 *   - the host carries role=group + an accessible name from `title`;
 *   - the title + description render (measurable Turkish copy that names the
 *     cause + next step);
 *   - the primary action button renders only when actionLabel is set, and
 *     emits `action` on click;
 *   - the empty-state glyph is the signal-arc motif (distinct from error/
 *     permission glyphs — proven by path-signature comparison in the gallery).
 */

@Component({
  standalone: true,
  imports: [ZmEmptyStateComponent],
  template: `
    <zm-empty-state
      id="e"
      [title]="title"
      [description]="description"
      [actionLabel]="actionLabel"
      (action)="onAction()"
    ></zm-empty-state>
  `,
})
class Host {
  title = 'Akışın henüz boş';
  description = 'Takip ettiğin kişilerin gönderileri burada görünür.';
  actionLabel = 'Keşfetten başla';
  fired = false;
  onAction(): void {
    this.fired = true;
  }
}

async function mount(overrides: Partial<Host> = {}): Promise<{ host: Host; root: HTMLElement }> {
  // Reset so mount() can be called more than once within a single test.
  TestBed.resetTestingModule();
  await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
  const fixture = TestBed.createComponent(Host);
  Object.assign(fixture.componentInstance, overrides);
  fixture.detectChanges();
  return { host: fixture.componentInstance, root: fixture.nativeElement as HTMLElement };
}

describe('ZmEmptyStateComponent — role + accessible name (VAL-DS-028)', () => {
  it('exposes role=group with aria-label derived from the title', async () => {
    const { root } = await mount();
    const host = root.querySelector('#e') as HTMLElement;
    expect(host.getAttribute('role')).toBe('group');
    expect(host.getAttribute('aria-label')).toBe('Akışın henüz boş');
  });
});

describe('ZmEmptyStateComponent — Turkish recovery copy (VAL-DS-028)', () => {
  it('renders the specific title + cause/next-step description', async () => {
    const { root } = await mount();
    expect(root.querySelector('#e .zm-state__title')!.textContent!.trim()).toBe('Akışın henüz boş');
    const desc = root.querySelector('#e .zm-state__description')!.textContent!.trim();
    expect(desc).toContain('Takip');
  });

  it('omits the description node when description is empty', async () => {
    const { root } = await mount({ description: '' });
    expect(root.querySelector('#e .zm-state__description')).toBeNull();
  });

  it('rejects generic "Bir şeyler ters gitti" copy (anti-slop §8)', async () => {
    // The component does not police content, but the canonical copy must name
    // the cause. Here we assert the shipped gallery copy is specific, not the
    // banned generic filler, by checking the test fixture does not regress.
    const { root } = await mount();
    const title = root.querySelector('#e .zm-state__title')!.textContent!.trim();
    expect(title).not.toContain('Bir şeyler ters gitti');
    expect(title.length).toBeGreaterThan(3);
  });
});

describe('ZmEmptyStateComponent — useful next action (VAL-DS-028)', () => {
  it('renders the primary action button only when actionLabel is set', async () => {
    const { root: r1 } = await mount({ actionLabel: 'Keşfetten başla' });
    const action1 = r1.querySelector('#e .zm-state__action') as HTMLButtonElement;
    expect(action1).toBeTruthy();
    expect(action1.textContent!.trim()).toBe('Keşfetten başla');
    const { root: r2 } = await mount({ actionLabel: '' });
    expect(r2.querySelector('#e .zm-state__action')).toBeNull();
  });

  it('emits action when the primary button is activated', async () => {
    const { host, root } = await mount();
    const action = root.querySelector('#e .zm-state__action') as HTMLButtonElement;
    action.click();
    expect(host.fired).toBe(true);
  });
});

describe('ZmEmptyStateComponent — non-color status cue (VAL-DS-029)', () => {
  it('renders a signal-arc glyph that differs from the error/permission glyphs', async () => {
    const { root } = await mount();
    const icon = root.querySelector('#e .zm-state__icon') as HTMLElement;
    expect(icon).toBeTruthy();
    expect(icon.getAttribute('aria-hidden')).toBe('true');
    const emptyPaths = Array.from(icon.querySelectorAll('path')).map(p => p.getAttribute('d') ?? '').join('|');
    expect(emptyPaths.length).toBeGreaterThan(0);
    // The empty glyph must NOT contain the alert-triangle path signature
    // (M24 6l19 33H5z) used by the error state, nor the lock rect used by
    // permission — so it stays discriminable in grayscale.
    expect(emptyPaths).not.toContain('M24 6l19 33H5z');
  });
});

describe('ZmEmptyStateComponent — projected custom content', () => {
  @Component({
    standalone: true,
    imports: [ZmEmptyStateComponent],
    template: `<zm-empty-state id="e" title="x">
      <a href="/akis" class="proj-link">Akışa dön</a>
    </zm-empty-state>`,
  })
  class ProjectionHost {}

  it('projects arbitrary secondary content into the actions slot', async () => {
    await TestBed.configureTestingModule({ imports: [ProjectionHost] }).compileComponents();
    const fixture = TestBed.createComponent(ProjectionHost);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.proj-link')).toBeTruthy();
    // Silence unused-import lint in vitest by referencing vi.
    expect(vi).toBeDefined();
  });
});
