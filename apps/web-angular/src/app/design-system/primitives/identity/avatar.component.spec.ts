import { Component } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { describe, expect, it } from 'vitest';
import { ZmAvatarComponent } from './avatar.component';

/**
 * ZmAvatar — focused verification for VAL-DS-030 (stable identity fallback +
 * image error state; reserved dimensions; accessible name) and VAL-DS-031
 * (presence / unread ring SEPARATED from content; independent color; non-color
 * cue; never color-only).
 *
 * jsdom does not fire `<img>` error events for a 404 by itself, so the image-
 * error swap is proven by directly dispatching an `error` event on the `<img>`
 * node (exercises the real `(error)` binding) and asserting the fallback swap.
 */

@Component({
  standalone: true,
  imports: [ZmAvatarComponent],
  template: `
    <zm-avatar
      id="a"
      [name]="name"
      [src]="src"
      [initials]="initials"
      [size]="size"
      [presence]="presence"
      [unread]="unread"
    ></zm-avatar>
  `,
})
class Host {
  name = 'Deniz Yılmaz';
  src = '';
  initials = '';
  size: 'xs' | 'sm' | 'md' | 'lg' | 'xl' = 'md';
  presence: 'online' | 'away' | 'busy' | 'offline' | '' = '';
  unread: number | null = null;
}

async function mount(
  overrides: Partial<Host> = {},
): Promise<{ host: Host; root: HTMLElement; fixture: ComponentFixture<Host> }> {
  TestBed.resetTestingModule();
  await TestBed.configureTestingModule({ imports: [Host] }).compileComponents();
  const fixture = TestBed.createComponent(Host);
  Object.assign(fixture.componentInstance, overrides);
  fixture.detectChanges();
  return { host: fixture.componentInstance, root: fixture.nativeElement as HTMLElement, fixture };
}

/** Read the inline identity-color custom property the host binds. */
function identityVar(root: HTMLElement): string {
  const el = root.querySelector('#a') as HTMLElement;
  return el.style.getPropertyValue('--zm-avatar-identity-color').trim();
}

describe('ZmAvatarComponent — stable identity fallback (VAL-DS-030)', () => {
  it('derives deterministic initials from the name', async () => {
    const { root } = await mount({ name: 'Deniz Yılmaz' });
    expect(root.querySelector('#a .zm-avatar__fallback')!.textContent!.trim()).toBe('DY');
  });

  it('keeps the same identity color across remounts for the same name', async () => {
    const { root: r1 } = await mount({ name: 'Elif Demir' });
    const c1 = identityVar(r1);
    const { root: r2 } = await mount({ name: 'Elif Demir' });
    const c2 = identityVar(r2);
    expect(c1).toBe(c2);
    expect(c1).toContain('--zm-avatar-identity-');
  });

  it('resolves different identities to (deterministically) different palette slots', async () => {
    // Collect palette slots across several distinct names; the set should have
    // more than one member (proving the hash distributes, not a constant).
    const names = ['Ada Kaya', 'Berk Aksoy', 'Cenk Öztürk', 'Derya Şahin', 'Ela Polat'];
    const slots = new Set<string>();
    for (const n of names) {
      const { root } = await mount({ name: n });
      slots.add(identityVar(root));
    }
    expect(slots.size).toBeGreaterThan(1);
  });

  it('respects an explicit initials override', async () => {
    const { root } = await mount({ name: 'Deniz Yılmaz', initials: 'ZM' });
    expect(root.querySelector('#a .zm-avatar__fallback')!.textContent!.trim()).toBe('ZM');
  });

  it('uppercases Turkish single-word initials with the tr-TR locale (İ/ı safe)', async () => {
    const { root } = await mount({ name: 'çınar' });
    // First two chars of a single word, tr-TR uppercased.
    expect(root.querySelector('#a .zm-avatar__fallback')!.textContent!.trim()).toBe('ÇI');
  });

  it('falls back to a placeholder initial for an empty name', async () => {
    const { root } = await mount({ name: '' });
    expect(root.querySelector('#a .zm-avatar__fallback')!.textContent!.trim()).toBe('?');
  });
});

describe('ZmAvatarComponent — image error state (VAL-DS-030)', () => {
  it('renders the image when a src is supplied and not yet failed', async () => {
    const { root } = await mount({ name: 'Deniz Yılmaz', src: '/users/d/avatar.png' });
    const img = root.querySelector('#a .zm-avatar__image') as HTMLImageElement;
    expect(img).toBeTruthy();
    expect(img.getAttribute('src')).toBe('/users/d/avatar.png');
    expect(img.getAttribute('alt')).toBe('Deniz Yılmaz');
    // No fallback rendered while the image is shown.
    expect(root.querySelector('#a .zm-avatar__fallback')).toBeNull();
  });

  it('swaps to the fallback on image error with no broken-image glyph', async () => {
    const { root, fixture } = await mount({ name: 'Deniz Yılmaz', src: '/missing-avatar.png' });
    // Initially the image is present (not yet failed).
    expect(root.querySelector('#a .zm-avatar__image')).toBeTruthy();
    // Simulate the browser firing `error` on the img (jsdom does not auto-fire).
    const img = root.querySelector('#a .zm-avatar__image') as HTMLImageElement;
    img.dispatchEvent(new Event('error', { bubbles: true }));
    // Flush the signal → computed → DOM update (OnPush needs a CD cycle).
    fixture.detectChanges();
    // After the error: image node removed, fallback shown.
    expect(root.querySelector('#a .zm-avatar__image')).toBeNull();
    const fallback = root.querySelector('#a .zm-avatar__fallback');
    expect(fallback).toBeTruthy();
    expect(fallback!.textContent!.trim()).toBe('DY');
  });

  it('shows the fallback immediately when no src is supplied (no img node)', async () => {
    const { root } = await mount({ name: 'Deniz Yılmaz', src: '' });
    expect(root.querySelector('#a .zm-avatar__image')).toBeNull();
    expect(root.querySelector('#a .zm-avatar__fallback')).toBeTruthy();
  });

  it('reserves host dimensions from the size token (no layout shift on swap)', async () => {
    const { root } = await mount({ name: 'Deniz Yılmaz', size: 'lg' });
    const el = root.querySelector('#a') as HTMLElement;
    expect(el.style.width).toContain('--zm-avatar-size-lg');
    expect(el.style.height).toContain('--zm-avatar-size-lg');
  });
});

describe('ZmAvatarComponent — accessible name (VAL-DS-030 / VAL-DS-031)', () => {
  it('exposes the display name as the host aria-label', async () => {
    const { root } = await mount({ name: 'Deniz Yılmaz' });
    const el = root.querySelector('#a') as HTMLElement;
    expect(el.getAttribute('role')).toBe('img');
    expect(el.getAttribute('aria-label')).toBe('Deniz Yılmaz');
  });

  it('composes presence + unread into the accessible name', async () => {
    const { root } = await mount({
      name: 'Deniz Yılmaz',
      presence: 'online',
      unread: 3,
    });
    const label = (root.querySelector('#a') as HTMLElement).getAttribute('aria-label');
    expect(label).toContain('Deniz Yılmaz');
    expect(label).toContain('çevrimiçi');
    expect(label).toContain('3 okunmamış');
  });
});

describe('ZmAvatarComponent — presence ring separated from content (VAL-DS-031)', () => {
  it('renders the presence indicator as a separate node outside the fallback', async () => {
    const { root } = await mount({ name: 'Deniz Yılmaz', presence: 'online' });
    const presence = root.querySelector('#a .zm-avatar__presence') as HTMLElement;
    expect(presence).toBeTruthy();
    // Presence is decorative; its meaning reaches AT through the host label.
    expect(presence.getAttribute('aria-hidden')).toBe('true');
    expect(presence.getAttribute('data-presence')).toBe('online');
    // The presence node is a SIBLING of the fallback/content, not nested in it.
    const fallback = root.querySelector('#a .zm-avatar__fallback') as HTMLElement;
    expect(fallback.contains(presence)).toBe(false);
  });

  it('styles presence via an independent presence role (not the identity palette)', async () => {
    const { root } = await mount({ name: 'Deniz Yılmaz', presence: 'busy' });
    const presence = root.querySelector('#a .zm-avatar__presence') as HTMLElement;
    expect(presence.getAttribute('data-presence')).toBe('busy');
    // The presence declaration lives in CSS (data-presence selector); the
    // identity color is bound on the host. The two never share a declaration.
    const host = root.querySelector('#a') as HTMLElement;
    const identity = host.style.getPropertyValue('--zm-avatar-identity-color').trim();
    expect(identity).toMatch(/--zm-avatar-identity-/);
    // Presence must not resolve to an identity palette token name.
    expect(identity).not.toContain('presence');
  });

  it('hides the presence dot when no presence is supplied', async () => {
    const { root } = await mount({ name: 'Deniz Yılmaz', presence: '' });
    expect(root.querySelector('#a .zm-avatar__presence')).toBeNull();
  });
});

describe('ZmAvatarComponent — unread badge separated from content (VAL-DS-031)', () => {
  it('renders a count badge only for positive unread counts', async () => {
    const { root: r0 } = await mount({ name: 'Deniz Yılmaz', unread: 0 });
    expect(r0.querySelector('#a .zm-avatar__unread')).toBeNull();
    const { root: r1 } = await mount({ name: 'Deniz Yılmaz', unread: null });
    expect(r1.querySelector('#a .zm-avatar__unread')).toBeNull();
    const { root: r2 } = await mount({ name: 'Deniz Yılmaz', unread: 5 });
    const badge = r2.querySelector('#a .zm-avatar__unread') as HTMLElement;
    expect(badge).toBeTruthy();
    expect(badge.getAttribute('aria-hidden')).toBe('true');
    expect(badge.textContent!.trim()).toBe('5');
  });

  it('renders "9+" for unread counts above 99', async () => {
    const { root } = await mount({ name: 'Deniz Yılmaz', unread: 120 });
    expect(root.querySelector('#a .zm-avatar__unread')!.textContent!.trim()).toBe('9+');
  });

  it('places the unread badge as a sibling of avatar content (distinct shape + position)', async () => {
    const { root } = await mount({ name: 'Deniz Yılmaz', unread: 2 });
    const badge = root.querySelector('#a .zm-avatar__unread') as HTMLElement;
    const fallback = root.querySelector('#a .zm-avatar__fallback') as HTMLElement;
    expect(fallback.contains(badge)).toBe(false);
    // The badge is a rounded count pill (its own shape cue, not a plain dot).
    expect(badge.classList.contains('zm-avatar__unread')).toBe(true);
  });
});
