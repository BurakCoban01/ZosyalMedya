import { Component } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { ZmPermissionStateComponent } from './permission-state.component';

/**
 * ZmPermissionState — focused verification for VAL-DS-028 (permission-denied
 * surface: rationale + path to request access, never a bare "Yetkisiz" dead
 * end) and VAL-DS-029 (status never color-only: the lock glyph is distinct
 * from the empty/error/success glyphs).
 *
 * Guards:
 *   - the host carries role=group (permission is informational, not an alert)
 *     with an accessible name from `title`;
 *   - the title + description render (measurable Turkish copy that names the
 *     gate + the path forward; never implies content is missing/empty);
 *   - the primary action renders only when actionLabel is set and emits
 *     `action` on activation;
 *   - the permission glyph is the lock motif (distinct from the empty
 *     signal-arc and the error alert-triangle — proven by path-signature
 *     comparison in the gallery, asserted here against both);
 *   - the surface never leaks protected/internal details (no user IDs, no
 *     role enum names, no policy internals);
 *   - the recovery action button is keyboard-operable (native <button>).
 *
 * This spec mirrors the contract surface proven in the empty-state and
 * error-state specs; the permission state differs in role (group, not alert)
 * and glyph (lock, not alert-triangle), both of which are asserted below.
 */

@Component({
  standalone: true,
  imports: [ZmPermissionStateComponent],
  template: `
    <zm-permission-state
      id="p"
      [title]="title"
      [description]="description"
      [actionLabel]="actionLabel"
      (action)="onAction()"
    ></zm-permission-state>
  `,
})
class Host {
  title = 'Bu panel yalnızca yöneticilere açıktır';
  description = 'İçerik denetimi yetkisi gerektirir; erişim talebi gönderilebilir.';
  actionLabel = 'Erişim talep et';
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

describe('ZmPermissionStateComponent — informational role (VAL-DS-028)', () => {
  it('exposes role=group (permission is informational, not an alert)', async () => {
    const { root } = await mount();
    const host = root.querySelector('#p') as HTMLElement;
    // role=group, NOT role=alert — a permission gate is an expected condition,
    // reached because the user's role does not include the required permission.
    // It is not a failure, so it must not be announced assertively.
    expect(host.getAttribute('role')).toBe('group');
    expect(host.getAttribute('role')).not.toBe('alert');
  });

  it('exposes aria-label derived from the title (accessible name)', async () => {
    const { root } = await mount();
    const host = root.querySelector('#p') as HTMLElement;
    expect(host.getAttribute('aria-label')).toBe('Bu panel yalnızca yöneticilere açıktır');
  });
});

describe('ZmPermissionStateComponent — rationale + path forward (VAL-DS-028)', () => {
  it('renders the specific title naming what is gated', async () => {
    const { root } = await mount();
    const title = root.querySelector('#p .zm-state__title')!.textContent!.trim();
    expect(title).toBe('Bu panel yalnızca yöneticilere açıktır');
    expect(title.length).toBeGreaterThan(3);
  });

  it('renders the rationale + path-forward description', async () => {
    const { root } = await mount();
    const desc = root.querySelector('#p .zm-state__description')!.textContent!.trim();
    // Names the gate (yetki gerekir) AND the path (erişim talebi gönderilebilir).
    expect(desc).toContain('yetkisi');
    expect(desc).toMatch(/talebi|talep/);
  });

  it('omits the description node when description is empty', async () => {
    const { root } = await mount({ description: '' });
    expect(root.querySelector('#p .zm-state__description')).toBeNull();
  });

  it('never implies content is missing/empty (distinct from ZmEmptyState)', async () => {
    // A permission state must NOT use empty-state vocabulary ("henüz boş",
    // "içerik yok", "takip et") — it must say access is gated, not that there
    // is nothing to show. Otherwise users wrongly believe the panel would be
    // populated for them.
    const { root } = await mount();
    const text = (root.querySelector('#p')!.textContent ?? '').toLowerCase();
    expect(text).not.toContain('henüz boş');
    expect(text).not.toContain('içerik yok');
    expect(text).not.toMatch(/takip ettiğin kişiler/);
  });

  it('never implies an error occurred (distinct from ZmErrorState)', async () => {
    // A permission gate is expected behavior, not a failure. It must not say
    // "hata", "yüklenemedi", "ters gitti" — those belong to ZmErrorState.
    const { root } = await mount();
    const text = (root.querySelector('#p')!.textContent ?? '').toLowerCase();
    expect(text).not.toContain('yüklenemedi');
    expect(text).not.toContain('ters gitti');
    expect(text).not.toContain('hata oluştu');
  });
});

describe('ZmPermissionStateComponent — recovery action (VAL-DS-028)', () => {
  it('renders the primary action button only when actionLabel is set', async () => {
    const { root: r1 } = await mount({ actionLabel: 'Erişim talep et' });
    const action1 = r1.querySelector('#p .zm-state__action') as HTMLButtonElement;
    expect(action1).toBeTruthy();
    expect(action1.textContent!.trim()).toBe('Erişim talep et');
    const { root: r2 } = await mount({ actionLabel: '' });
    expect(r2.querySelector('#p .zm-state__action')).toBeNull();
  });

  it('emits action when the primary button is activated', async () => {
    const { host, root } = await mount();
    const action = root.querySelector('#p .zm-state__action') as HTMLButtonElement;
    action.click();
    expect(host.fired).toBe(true);
  });

  it('honors an alternative recovery label (e.g. "Herkese açık akışa dön")', async () => {
    const { root } = await mount({ actionLabel: 'Herkese açık akışa dön' });
    const action = root.querySelector('#p .zm-state__action') as HTMLButtonElement;
    expect(action.textContent!.trim()).toBe('Herkese açık akışa dön');
  });
});

describe('ZmPermissionStateComponent — keyboard operability (VAL-DS-028 a11y)', () => {
  it('renders the recovery action as a native, focusable <button>', async () => {
    const { root } = await mount();
    const action = root.querySelector('#p .zm-state__action') as HTMLButtonElement;
    expect(action.tagName).toBe('BUTTON');
    expect(action.type).toBe('button');
    // Native buttons are keyboard-operable by default (Enter/Space activate).
    // A negative tabindex would break that; assert it is not set negatively.
    const tabindex = action.getAttribute('tabindex');
    expect(tabindex === null || tabindex === '0', 'recovery button must be keyboard-reachable')
      .toBe(true);
  });

  it('exposes a visible focus affordance via the zm-feedback class', async () => {
    const { root } = await mount();
    const action = root.querySelector('#p .zm-state__action') as HTMLButtonElement;
    expect(action.classList.contains('zm-feedback')).toBe(true);
    expect(action.classList.contains('zm-state__action--primary')).toBe(true);
  });
});

describe('ZmPermissionStateComponent — distinct non-color status cue (VAL-DS-029)', () => {
  it('renders a lock glyph that is aria-hidden (decorative)', async () => {
    const { root } = await mount();
    const icon = root.querySelector('#p .zm-state__icon') as HTMLElement;
    expect(icon).toBeTruthy();
    expect(icon.getAttribute('aria-hidden')).toBe('true');
  });

  it('uses the discovery-tinted icon class (gated path, not a broken one)', async () => {
    const { root } = await mount();
    const icon = root.querySelector('#p .zm-state__icon') as HTMLElement;
    // Discovery accent, NOT danger — the surface says "this is a gated path",
    // not "something broke". Paired with the lock glyph (never color-only).
    expect(icon.classList.contains('zm-state__icon--discovery')).toBe(true);
    expect(icon.classList.contains('zm-state__icon--danger')).toBe(false);
  });

  it('the lock glyph path differs from the empty signal-arc and error alert-triangle', async () => {
    // The permission glyph MUST carry the lock rect signature (x="11" y="22"
    // shackle rect) and MUST NOT reuse the empty signal-arc path
    // (M10 32c6-10 22-10 28 0) or the error alert-triangle path
    // (M24 6l19 33H5z), so the three states stay discriminable in grayscale.
    const { root } = await mount();
    const icon = root.querySelector('#p .zm-state__icon') as HTMLElement;
    const permSignatures = Array.from(icon.querySelectorAll('rect, path'))
      .map(el => {
        if (el.tagName.toLowerCase() === 'rect') {
          return `rect:${el.getAttribute('x')},${el.getAttribute('y')}`;
        }
        return el.getAttribute('d') ?? '';
      })
      .join('|');
    expect(permSignatures.length).toBeGreaterThan(0);
    // Lock shackle rect signature.
    expect(permSignatures).toContain('rect:11,22');
    // Not the empty signal-arc, not the error alert-triangle.
    expect(permSignatures).not.toContain('M10 32c6-10 22-10 28 0');
    expect(permSignatures).not.toContain('M24 6l19 33H5z');
  });
});

describe('ZmPermissionStateComponent — never leaks protected details (VAL-DS-028)', () => {
  /**
   * A permission surface must explain WHY access is gated in user-meaningful
   * terms; it must never expose the underlying role/policy internals, user
   * IDs, role enum names, or the existence of specific protected resources.
   * Those are operational/authorization internals (AGENTS.md §13; docs/agent/
   * 13-ANTI-SLOP.md §8). The component owns only the caller-supplied title/
   * description; this guard asserts the surface never leaks internal
   * signatures regardless of the caller's content.
   */
  it('renders only the title + description + action label (no role/policy internals)', async () => {
    const { root } = await mount({
      title: 'Bu panel yalnızca yöneticilere açıktır',
      description: 'İçerik denetimi yetkisi gerektirir.',
      actionLabel: 'Erişim talep et',
    });
    const host = root.querySelector('#p') as HTMLElement;
    const text = (host.textContent ?? '').trim();
    expect(text).toContain('Bu panel yalnızca yöneticilere açıktır');
    expect(text).toContain('Erişim talep et');
    // No internal-leak signatures should ever be produced by the component.
    expect(text).not.toMatch(/role:\s*\w+/i); // no role enum dumps
    expect(text).not.toMatch(/policy:\s*\w+/i); // no policy dumps
    expect(text).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}/i); // no GUIDs
    expect(text).not.toMatch(/Bearer\s+[A-Za-z0-9._-]+/i); // no JWTs
  });

  it('does not invent an internal role/policy string from clean copy', async () => {
    const { root } = await mount();
    const host = root.querySelector('#p') as HTMLElement;
    const text = (host.textContent ?? '').trim();
    expect(text).not.toMatch(/Administrator|Moderator|PolicyViolation|AuthorizationException/i);
  });
});

describe('ZmPermissionStateComponent — projected secondary path', () => {
  @Component({
    standalone: true,
    imports: [ZmPermissionStateComponent],
    template: `
      <zm-permission-state id="p" title="Bu panel yalnızca yöneticilere açıktır">
        <a href="/akis" class="proj-link">Herkese açık akışa dön</a>
      </zm-permission-state>
    `,
  })
  class ProjectionHost {}

  it('projects an alternate-path link into the actions slot', async () => {
    await TestBed.configureTestingModule({ imports: [ProjectionHost] }).compileComponents();
    const fixture = TestBed.createComponent(ProjectionHost);
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('.proj-link')).toBeTruthy();
    expect(fixture.nativeElement.querySelector('.proj-link').textContent!.trim())
      .toBe('Herkese açık akışa dön');
  });
});
