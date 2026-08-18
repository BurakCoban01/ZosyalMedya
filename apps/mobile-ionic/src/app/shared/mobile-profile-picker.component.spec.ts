import { TestBed } from '@angular/core/testing';
import { Api, search, SearchHit } from '@platform/api';
import { describe, expect, it, vi } from 'vitest';
import { MobileProfilePickerComponent } from './mobile-profile-picker.component';

const PROFILE: SearchHit = {
  deepLink: '/profil/ayse_dev',
  id: 'profile-id',
  matchedTags: [],
  ownerId: '11111111-1111-1111-1111-111111111111',
  score: 1,
  snippet: '@ayse_dev · Erişilebilir ürünler',
  title: 'Ayşe Yılmaz',
  type: 'Profile'
};

async function mount(invoke: ReturnType<typeof vi.fn>) {
  await TestBed.configureTestingModule({
    imports: [MobileProfilePickerComponent],
    providers: [{ provide: Api, useValue: { invoke } }]
  }).compileComponents();
  const fixture = TestBed.createComponent(MobileProfilePickerComponent);
  fixture.detectChanges();
  return { fixture, component: fixture.componentInstance };
}

describe('MobileProfilePickerComponent', () => {
  it('searches only real profile documents', async () => {
    const invoke = vi.fn(async () => ({ items: [PROFILE], limit: 8 }));
    const { component } = await mount(invoke);
    component.query.setValue('Ayşe');

    await component.runSearch();

    expect(invoke).toHaveBeenCalledWith(search, { q: 'Ayşe', type: 'Profile', limit: 8 });
    expect(component.results()).toEqual([PROFILE]);
  });

  it('excludes the current account from results', async () => {
    const invoke = vi.fn(async () => ({ items: [PROFILE], limit: 8 }));
    const { fixture, component } = await mount(invoke);
    fixture.componentRef.setInput('excludeOwnerId', PROFILE.ownerId);
    component.query.setValue('Ayşe');

    await component.runSearch();

    expect(component.results()).toEqual([]);
  });

  it('emits a friendly selected profile without exposing identifiers', async () => {
    const invoke = vi.fn();
    const { fixture, component } = await mount(invoke);
    const selected = vi.fn();
    component.selectedChange.subscribe(selected);

    component.choose(PROFILE);
    fixture.detectChanges();

    expect(selected).toHaveBeenCalledWith(PROFILE);
    expect(fixture.nativeElement.textContent).toContain('Ayşe Yılmaz');
    expect(fixture.nativeElement.textContent).not.toContain(PROFILE.ownerId);
    expect(fixture.nativeElement.textContent).not.toContain(PROFILE.id);
  });

  it('clears stale results after a failed search', async () => {
    const invoke = vi.fn(async () => { throw new Error('offline'); });
    const { component } = await mount(invoke);
    component.results.set([PROFILE]);
    component.query.setValue('Ayşe');

    await component.runSearch();

    expect(component.results()).toEqual([]);
    expect(component.message()).toContain('tamamlanamadı');
  });

  it('renders a route-preselected profile without emitting a duplicate selection', async () => {
    const { fixture, component } = await mount(vi.fn());
    const selected = vi.fn(); component.selectedChange.subscribe(selected);
    fixture.componentRef.setInput('initialSelection', PROFILE); fixture.detectChanges();
    expect(component.selected()).toEqual(PROFILE);
    expect(fixture.nativeElement.textContent).toContain(PROFILE.title);
    expect(selected).not.toHaveBeenCalled();
  });
});
