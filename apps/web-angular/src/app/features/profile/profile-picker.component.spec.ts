import { TestBed } from '@angular/core/testing';
import { Api, search, SearchHit } from '@platform/api';
import { describe, expect, it, vi } from 'vitest';
import { ZmProfilePickerComponent } from './profile-picker.component';

const PROFILE: SearchHit = {
  deepLink: '/profil/ayse_dev',
  id: 'profile-id',
  matchedTags: [],
  ownerId: '11111111-1111-1111-1111-111111111111',
  score: 1,
  snippet: '@ayse_dev Angular ve erişilebilirlik',
  title: 'Ayşe Yılmaz',
  type: 'Profile'
};

async function mount(invoke: ReturnType<typeof vi.fn>) {
  await TestBed.configureTestingModule({
    imports: [ZmProfilePickerComponent],
    providers: [{ provide: Api, useValue: { invoke } }]
  }).compileComponents();
  const fixture = TestBed.createComponent(ZmProfilePickerComponent);
  fixture.detectChanges();
  return { fixture, component: fixture.componentInstance };
}

describe('ZmProfilePickerComponent', () => {
  it('searches only real profile documents', async () => {
    const invoke = vi.fn(async () => ({ items: [PROFILE], limit: 8 }));
    const { component } = await mount(invoke);
    component.query.setValue('Ayşe');

    await component.runSearch();

    expect(invoke).toHaveBeenCalledWith(search, { q: 'Ayşe', type: 'Profile', limit: 8 });
    expect(component.results()).toEqual([PROFILE]);
  });

  it('handles the real form submit without navigating or clearing the query', async () => {
    const invoke = vi.fn(async () => ({ items: [PROFILE], limit: 8 }));
    const { fixture, component } = await mount(invoke);
    component.query.setValue('Ayşe');
    fixture.detectChanges();
    const event = new Event('submit', { bubbles: true, cancelable: true });

    fixture.nativeElement.querySelector('form').dispatchEvent(event);
    await fixture.whenStable();
    fixture.detectChanges();

    expect(event.defaultPrevented).toBe(true);
    expect(component.query.value).toBe('Ayşe');
    expect(component.results()).toEqual([PROFILE]);
  });

  it('excludes the current account from selectable results', async () => {
    const invoke = vi.fn(async () => ({ items: [PROFILE], limit: 8 }));
    const { fixture, component } = await mount(invoke);
    fixture.componentRef.setInput('excludeOwnerId', PROFILE.ownerId);
    component.query.setValue('Ayşe');

    await component.runSearch();

    expect(component.results()).toEqual([]);
  });

  it('emits the selected profile without rendering its internal id', async () => {
    const invoke = vi.fn(async () => ({ items: [PROFILE], limit: 8 }));
    const { fixture, component } = await mount(invoke);
    const selected = vi.fn();
    component.selectedChange.subscribe(selected);
    component.query.setValue('Ayşe');
    await component.runSearch();
    fixture.detectChanges();

    component.choose(PROFILE);
    fixture.detectChanges();

    expect(selected).toHaveBeenCalledWith(PROFILE);
    expect(fixture.nativeElement.textContent).toContain('Ayşe Yılmaz');
    expect(fixture.nativeElement.textContent).not.toContain(PROFILE.ownerId);
    expect(fixture.nativeElement.textContent).not.toContain(PROFILE.id);
  });

  it('keeps failure truthful and clears stale results', async () => {
    const invoke = vi.fn(async () => { throw new Error('offline'); });
    const { component } = await mount(invoke);
    component.results.set([PROFILE]);
    component.query.setValue('Ayşe');

    await component.runSearch();

    expect(component.results()).toEqual([]);
    expect(component.message()).toContain('tamamlanamadı');
  });
});
