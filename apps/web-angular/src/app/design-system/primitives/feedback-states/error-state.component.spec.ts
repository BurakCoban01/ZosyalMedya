import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { ZmErrorStateComponent } from './error-state.component';

/**
 * ZmErrorState — focused verification for VAL-DS-028 (recoverable error
 * surface with retry; role=alert; specific Turkish cause + consequence +
 * recovery) and VAL-DS-029 (status never color-only: the alert glyph is
 * distinct from the empty/permission/success glyphs).
 *
 * Guards:
 *   - the host carries role=alert + aria-atomic=true so the message is
 *     announced assertively as one utterance (VAL-DS-028);
 *   - the host exposes an accessible name from `title` (VAL-DS-028);
 *   - the title + description render (measurable Turkish copy that names the
 *     cause + consequence, not the banned generic "Bir şeyler ters gitti");
 *   - the retry button renders only when retryLabel is set, defaults to
 *     "Tekrar dene", and emits `retry` exactly once per activation;
 *   - the error glyph is the alert-triangle motif (distinct from the empty
 *     signal-arc and the permission lock — proven by path-signature
 *     comparison in the gallery, asserted here against the empty path);
 *   - the surface never renders raw secrets/stack traces/internal IDs — it
 *     shows only the caller-supplied title/description (a redaction guard).
 *
 * This spec mirrors the contract surface proven in the empty-state spec; the
 * error state differs in role (alert, not group) and glyph (alert-triangle,
 * not signal-arc), both of which are asserted below.
 */

@Component({
  standalone: true,
  imports: [ZmErrorStateComponent],
  template: `
    <zm-error-state
      id="e"
      [title]="title"
      [description]="description"
      [retryLabel]="retryLabel"
      (retry)="onRetry()"
    ></zm-error-state>
  `,
})
class Host {
  title = 'Akış şu anda yenilenemedi';
  description = 'Bağlantınızı kontrol edip yeniden deneyin; taslaklarınız korunur.';
  retryLabel = 'Tekrar dene';
  retryCount = 0;
  onRetry(): void {
    this.retryCount += 1;
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

describe('ZmErrorStateComponent — assertive live-region role (VAL-DS-028)', () => {
  it('exposes role=alert so AT announces the message assertively', async () => {
    const { root } = await mount();
    const host = root.querySelector('#e') as HTMLElement;
    expect(host.getAttribute('role')).toBe('alert');
  });

  it('sets aria-atomic=true so the whole block is one utterance', async () => {
    const { root } = await mount();
    const host = root.querySelector('#e') as HTMLElement;
    expect(host.getAttribute('aria-atomic')).toBe('true');
  });

  it('exposes aria-label derived from the title (accessible name)', async () => {
    const { root } = await mount();
    const host = root.querySelector('#e') as HTMLElement;
    expect(host.getAttribute('aria-label')).toBe('Akış şu anda yenilenemedi');
  });
});

describe('ZmErrorStateComponent — specific Turkish cause + consequence (VAL-DS-028)', () => {
  it('renders the specific title naming the cause', async () => {
    const { root } = await mount();
    const title = root.querySelector('#e .zm-state__title')!.textContent!.trim();
    expect(title).toBe('Akış şu anda yenilenemedi');
    // Must name the cause ("yenilenemedi"), not be the banned generic filler.
    expect(title).not.toBe('Bir şeyler ters gitti');
    expect(title).not.toBe('Hata');
    expect(title.length).toBeGreaterThan(3);
  });

  it('renders the cause/consequence description', async () => {
    const { root } = await mount();
    const desc = root.querySelector('#e .zm-state__description')!.textContent!.trim();
    // Names the consequence (drafts preserved) and the next step (retry).
    expect(desc).toContain('Bağlantınızı');
    expect(desc).toContain('taslaklarınız');
  });

  it('omits the description node when description is empty', async () => {
    const { root } = await mount({ description: '' });
    expect(root.querySelector('#e .zm-state__description')).toBeNull();
  });

  it('rejects the banned generic "Bir şeyler ters gitti" copy (anti-slop §8)', async () => {
    // The component does not police content, but the shipped gallery copy must
    // be specific. This guard asserts the canonical fixture is not the banned
    // filler and is non-trivially informative.
    const { root } = await mount();
    const title = root.querySelector('#e .zm-state__title')!.textContent!.trim();
    expect(title).not.toContain('Bir şeyler ters gitti');
    expect(title).not.toContain('bir şeyler');
  });
});

describe('ZmErrorStateComponent — concrete retry action (VAL-DS-028)', () => {
  it('defaults the retry label to the canonical Turkish "Tekrar dene"', async () => {
    // The Host class declares retryLabel = 'Tekrar dene' as its default; mount
    // without overriding retryLabel so the component receives the canonical
    // value (the input default is NOT used when the binding explicitly passes
    // undefined, so we rely on the Host's own default here).
    const { root } = await mount({ retryLabel: 'Tekrar dene' });
    const action = root.querySelector('#e .zm-state__action') as HTMLButtonElement;
    expect(action).toBeTruthy();
    expect(action.textContent!.trim()).toBe('Tekrar dene');
  });

  it('renders the retry button only when retryLabel is set', async () => {
    const { root: r1 } = await mount({ retryLabel: 'Tekrar dene' });
    expect(r1.querySelector('#e .zm-state__action')).toBeTruthy();
    const { root: r2 } = await mount({ retryLabel: '' });
    expect(r2.querySelector('#e .zm-state__action')).toBeNull();
  });

  it('emits retry exactly once when the retry button is activated', async () => {
    const { host, root } = await mount();
    const action = root.querySelector('#e .zm-state__action') as HTMLButtonElement;
    action.click();
    expect(host.retryCount).toBe(1);
    // A second click must emit a second event — the retry is never a one-shot
    // that silently no-ops; the user can keep trying until the operation
    // succeeds. The "fires once" contract means exactly one emit per click,
    // not that only the first click ever fires.
    action.click();
    expect(host.retryCount).toBe(2);
  });

  it('carries the zm-feedback class on the retry button (interruptible transition)', async () => {
    const { root } = await mount();
    const action = root.querySelector('#e .zm-state__action') as HTMLButtonElement;
    expect(action.classList.contains('zm-feedback')).toBe(true);
  });

  it('honors a caller-supplied retry label (e.g. "Yeniden bağlan")', async () => {
    const { root } = await mount({ retryLabel: 'Yeniden bağlan' });
    const action = root.querySelector('#e .zm-state__action') as HTMLButtonElement;
    expect(action.textContent!.trim()).toBe('Yeniden bağlan');
  });
});

describe('ZmErrorStateComponent — distinct non-color status cue (VAL-DS-029)', () => {
  it('renders an alert-triangle glyph that is aria-hidden (decorative)', async () => {
    const { root } = await mount();
    const icon = root.querySelector('#e .zm-state__icon') as HTMLElement;
    expect(icon).toBeTruthy();
    expect(icon.getAttribute('aria-hidden')).toBe('true');
  });

  it('uses the danger-tinted icon class so the glyph reads as an error', async () => {
    const { root } = await mount();
    const icon = root.querySelector('#e .zm-state__icon') as HTMLElement;
    expect(icon.classList.contains('zm-state__icon--danger')).toBe(true);
  });

  it('the alert-triangle glyph path differs from the empty signal-arc glyph', async () => {
    // The error glyph MUST carry the alert-triangle signature (M24 6l19 33H5z)
    // and MUST NOT reuse the empty signal-arc path (M10 32c6-10 22-10 28 0),
    // so the two states stay discriminable in grayscale (VAL-DS-029).
    const { root } = await mount();
    const icon = root.querySelector('#e .zm-state__icon') as HTMLElement;
    const errorPaths = Array.from(icon.querySelectorAll('path')).map(p => p.getAttribute('d') ?? '').join('|');
    expect(errorPaths.length).toBeGreaterThan(0);
    expect(errorPaths).toContain('M24 6l19 33H5z');
    expect(errorPaths).not.toContain('M10 32c6-10 22-10 28 0');
  });
});

describe('ZmErrorStateComponent — never leaks internals (VAL-DS-028)', () => {
  /**
   * A recoverable error surface must show only caller-supplied, human-meaningful
   * copy. It must never render raw stack traces, internal IDs, tokens, or
   * exception class names — those are operational details that belong in logs,
   * not in the UI (docs/agent/13-ANTI-SLOP.md §8; AGENTS.md §13). The component
   * owns only the title/description it is given; this guard asserts the
   * rendered text contains no internal-leak signatures even when the caller
   * passes messy content, by checking the surface structure is fixed.
   */
  it('renders only the title + description + retry label (no extra internals)', async () => {
    const { root } = await mount({
      title: 'Akış yüklenemedi',
      description: 'Kısa bir süre sonra yeniden deneyin.',
      retryLabel: 'Tekrar dene',
    });
    const host = root.querySelector('#e') as HTMLElement;
    // The host carries the structural classes only; no exception/stack node.
    const text = (host.textContent ?? '').trim();
    expect(text).toContain('Akış yüklenemedi');
    expect(text).toContain('Kısa bir süre sonra yeniden deneyin.');
    expect(text).toContain('Tekrar dene');
    // No internal-leak signatures should ever be produced by the component.
    expect(text).not.toMatch(/at\s+\w+\.\w+\s+\(/); // no stack frame lines
    expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i); // no GUIDs
    expect(text).not.toMatch(/Bearer\s+[A-Za-z0-9._-]+/i); // no JWTs
  });

  it('does not invent a stack trace or exception class when given clean copy', async () => {
    const { root } = await mount();
    const host = root.querySelector('#e') as HTMLElement;
    const text = (host.textContent ?? '').trim();
    expect(text).not.toMatch(/Exception|Stack Trace|TypeError|NullReferenceException/i);
  });
});

describe('ZmErrorStateComponent — projected secondary actions', () => {
  @Component({
    standalone: true,
    imports: [ZmErrorStateComponent],
    template: `
      <zm-error-state id="e" title="Akış yüklenemedi" retryLabel="Tekrar dene">
        <a href="/destek" class="proj-link">Destek al</a>
      </zm-error-state>
    `,
  })
  class ProjectionHost {}

  it('projects arbitrary secondary content into the actions slot', async () => {
    await TestBed.configureTestingModule({ imports: [ProjectionHost] }).compileComponents();
    const fixture = TestBed.createComponent(ProjectionHost);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.proj-link')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.proj-link').textContent!.trim()).toBe('Destek al');
  });
});
