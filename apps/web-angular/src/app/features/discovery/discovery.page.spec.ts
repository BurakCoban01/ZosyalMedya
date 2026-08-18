import { signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, ParamMap, provideRouter } from '@angular/router';
import { Api, initiateMedia, listCommunities, MediaView, search, SearchHit, trending, uploadMediaContent } from '@platform/api';
import { describe, expect, it, vi } from 'vitest';
import { BehaviorSubject, Observable, of } from 'rxjs';
import { MediaResolver } from '../../core/media/media-resolver.service';
import { SessionMediaCleanup } from '../../core/media/session-media-cleanup.service';
import { TokenVault } from '../../core/auth/token-vault.service';
import { DiscoveryPage } from './discovery.page';

const FIRST_RESULT: SearchHit = {
  deepLink: '/profil/ilk',
  id: 'first',
  matchedTags: [],
  ownerId: 'owner-first',
  score: 1,
  snippet: '@ilk',
  title: 'İlk sonuç',
  type: 'Profile'
};

const LATEST_RESULT: SearchHit = {
  ...FIRST_RESULT,
  deepLink: '/icerik/latest',
  id: 'latest',
  ownerId: 'owner-latest',
  snippet: 'En güncel eşleşme',
  title: 'Güncel sonuç',
  type: 'Content'
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  const promise = new Promise<T>((done) => { resolve = done; });
  return { promise, resolve };
}

async function mount(invoke: ReturnType<typeof vi.fn>, resolve = vi.fn(), queryParamMap?: Observable<ParamMap>) {
  const cleanup = vi.fn().mockResolvedValue(true);
  let beforeSessionChange: ((accessToken: string | null) => Promise<unknown> | unknown) | undefined;
  const accessToken = signal<string | null>('owner-token');
  await TestBed.configureTestingModule({
    imports: [DiscoveryPage],
    providers: [
      { provide: Api, useValue: { invoke } },
      { provide: MediaResolver, useValue: { resolve } },
      { provide: SessionMediaCleanup, useValue: { delete: cleanup } },
      { provide: TokenVault, useValue: { accessToken, registerBeforeSessionChange: (callback: (accessToken: string | null) => Promise<unknown> | unknown) => { beforeSessionChange = callback; return vi.fn(); } } },
      provideRouter([]),
      ...(queryParamMap === undefined ? [] : [{
        provide: ActivatedRoute,
        useValue: { queryParamMap }
      }]),
    ]
  }).compileComponents();
  const fixture = TestBed.createComponent(DiscoveryPage);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, component: fixture.componentInstance, cleanup, changeSession: (token: string | null) => beforeSessionChange?.(token) };
}

describe('DiscoveryPage', () => {
  it('keeps creation and upload utilities collapsed without a UUID-first report form', async () => {
    const invoke = vi.fn(async (operation: unknown) => operation === trending ? [] : operation === listCommunities ? [] : undefined);
    const { fixture } = await mount(invoke);

    const details = Array.from(fixture.nativeElement.querySelectorAll('details')) as HTMLDetailsElement[];
    expect(details).toHaveLength(2);
    expect(details.every((item) => !item.open)).toBe(true);
    expect(fixture.nativeElement.querySelector('[aria-label="Bildirilen kaydın kimliği"]')).toBeNull();
    expect(fixture.nativeElement.textContent).toContain('Henüz katılabileceğin görünür bir topluluk yok.');

    details[1].open = true;
    fixture.detectChanges();
    const fileInput = details[1].querySelector('input[type="file"]') as HTMLInputElement;
    expect(getComputedStyle(fileInput).display).toBe('block');
    expect(fileInput.tabIndex).toBe(0);
  });

  it('ignores a stale response when a newer search finishes first', async () => {
    const first = deferred<{ items: SearchHit[]; limit: number }>();
    const latest = deferred<{ items: SearchHit[]; limit: number }>();
    let searchCall = 0;
    const invoke = vi.fn((operation: unknown) => {
      if (operation === trending || operation === listCommunities) return Promise.resolve([]);
      if (operation === search) return ++searchCall === 1 ? first.promise : latest.promise;
      return Promise.resolve(undefined);
    });
    const { component } = await mount(invoke);

    component.searchForm.controls.query.setValue('ilk');
    const firstSearch = component.runSearch();
    component.searchForm.controls.query.setValue('güncel');
    const latestSearch = component.runSearch();
    latest.resolve({ items: [LATEST_RESULT], limit: 30 });
    await latestSearch;
    first.resolve({ items: [FIRST_RESULT], limit: 30 });
    await firstSearch;

    expect(component.results()).toEqual([LATEST_RESULT]);
    expect(component.searching()).toBe(false);
  });

  it('runs a hashtag deep-link query from the route', async () => {
    const invoke = vi.fn(async (operation: unknown, request?: { q?: string }) => {
      if (operation === trending || operation === listCommunities) return [];
      if (operation === search) return { items: [LATEST_RESULT], limit: 30 };
      return undefined;
    });

    const { component } = await mount(invoke, vi.fn(), of(convertToParamMap({q:'#tasarim'})));

    expect(component.searchForm.controls.query.value).toBe('#tasarim');
    expect(invoke).toHaveBeenCalledWith(search, { q: '#tasarim', limit: 30 });
    expect(component.results()).toEqual([LATEST_RESULT]);
  });

  it('clears and invalidates hashtag results when the route query is removed', async () => {
    const pending=deferred<{items:SearchHit[];limit:number}>();
    const params=new BehaviorSubject<ParamMap>(convertToParamMap({}));
    const invoke=vi.fn((operation:unknown)=>operation===trending||operation===listCommunities?Promise.resolve([]):operation===search?pending.promise:Promise.resolve(undefined));
    const {fixture,component}=await mount(invoke,vi.fn(),params);

    params.next(convertToParamMap({q:'#tasarim'}));
    expect(component.searching()).toBe(true);
    params.next(convertToParamMap({}));
    expect(component.searchForm.controls.query.value).toBe('');expect(component.results()).toEqual([]);expect(component.searched()).toBe(false);expect(component.searching()).toBe(false);
    pending.resolve({items:[LATEST_RESULT],limit:30});await Promise.resolve();await Promise.resolve();fixture.detectChanges();

    expect(component.results()).toEqual([]);expect(component.searched()).toBe(false);
  });

  it('shows typed results with their real deep links and a recoverable error', async () => {
    let shouldFail = false;
    const invoke = vi.fn(async (operation: unknown) => {
      if (operation === trending || operation === listCommunities) return [];
      if (operation === search) {
        if (shouldFail) throw new Error('offline');
        return { items: [LATEST_RESULT], limit: 30 };
      }
      return undefined;
    });
    const { fixture, component } = await mount(invoke);
    component.searchForm.controls.query.setValue('demo');
    await component.runSearch();
    fixture.detectChanges();

    const result = fixture.nativeElement.querySelector('.results a') as HTMLAnchorElement;
    expect(result.getAttribute('href')).toBe(LATEST_RESULT.deepLink);
    expect(result.textContent).toContain('İçerik');
    expect(result.textContent).toContain(LATEST_RESULT.title);

    shouldFail = true;
    await component.runSearch();
    fixture.detectChanges();
    expect(fixture.nativeElement.querySelector('[role="alert"]')?.textContent).toContain('Yeniden dene');
    expect(component.results()).toEqual([LATEST_RESULT]);
  });

  it('renders the authorized preview returned after a real upload', async () => {
    const ready: MediaView = {
      id: 'media-1', fileName: 'istanbul.png', contentType: 'image/png', size: 12,
      visibility: 'Public', status: 'Ready', urls: { 'w960.webp': '/download?variant=w960.webp' },
      createdAtUtc: '2026-08-13T12:00:00Z', version: 3,
    };
    const invoke = vi.fn(async (operation: unknown) => {
      if (operation === trending || operation === listCommunities) return [];
      if (operation === initiateMedia) return { media: { ...ready, status: 'Pending' }, uploadUrl: '/upload', expiresAtUtc: '2026-08-13T13:00:00Z' };
      if (operation === uploadMediaContent) return ready;
      return undefined;
    });
    const release = vi.fn();
    const resolve = vi.fn().mockResolvedValue({ mediaId: ready.id, url: 'blob:preview', contentType: 'image/webp', size: 8, release });
    const { fixture, component, cleanup } = await mount(invoke, resolve);
    const input = document.createElement('input');
    Object.defineProperty(input, 'files', { value: [new File(['image-bytes'], ready.fileName, { type: ready.contentType })] });

    await component.upload({ target: input } as unknown as Event);
    fixture.detectChanges();

    expect(resolve).toHaveBeenCalledWith(ready.id, 'w960.webp', expect.any(AbortSignal));
    expect(fixture.nativeElement.querySelector('.media-preview img')?.getAttribute('src')).toBe('blob:preview');
    expect(fixture.nativeElement.querySelector('.media-preview figcaption')?.textContent).toContain('güvenli önizlemesi');
    component.ngOnDestroy();
    expect(release).toHaveBeenCalledOnce();
    await vi.waitFor(() => expect(cleanup).toHaveBeenCalledWith([ready.id], 'owner-token'));
  });

  it('replaces an older preview with an honest retry state when the next preview fails', async () => {
    const media = (id: string): MediaView => ({
      id, fileName: `${id}.png`, contentType: 'image/png', size: 12,
      visibility: 'Public', status: 'Ready', urls: {},
      createdAtUtc: '2026-08-13T12:00:00Z', version: 3,
    });
    let uploadIndex = 0;
    const invoke = vi.fn(async (operation: unknown) => {
      if (operation === trending || operation === listCommunities) return [];
      if (operation === initiateMedia) return { media: media('pending'), uploadUrl: '/upload', expiresAtUtc: '2026-08-13T13:00:00Z' };
      if (operation === uploadMediaContent) return media(`media-${++uploadIndex}`);
      return undefined;
    });
    const release = vi.fn();
    const resolve = vi.fn()
      .mockResolvedValueOnce({ mediaId: 'media-1', url: 'blob:first', contentType: 'image/png', size: 8, release })
      .mockRejectedValueOnce(new Error('download failed'));
    const { fixture, component } = await mount(invoke, resolve);
    const input = document.createElement('input');
    Object.defineProperty(input, 'files', { configurable: true, value: [new File(['first'], 'first.png', { type: 'image/png' })] });
    await component.upload({ target: input } as unknown as Event);
    Object.defineProperty(input, 'files', { configurable: true, value: [new File(['second'], 'second.png', { type: 'image/png' })] });

    await component.upload({ target: input } as unknown as Event);
    fixture.detectChanges();

    expect(release).toHaveBeenCalledOnce();
    expect(fixture.nativeElement.querySelector('.media-preview')).toBeNull();
    expect(fixture.nativeElement.querySelector('.preview-error')?.textContent).toContain('Yeniden dene');
  });

  it('does not upload or resolve media after navigation destroys the page', async () => {
    const initiated = deferred<{ media: MediaView; uploadUrl: string; expiresAtUtc: string }>();
    const pending: MediaView = {
      id: 'pending-media', fileName: 'pending.png', contentType: 'image/png', size: 12,
      visibility: 'Public', status: 'Pending', urls: {},
      createdAtUtc: '2026-08-13T12:00:00Z', version: 1,
    };
    const invoke = vi.fn((operation: unknown) => {
      if (operation === trending || operation === listCommunities) return Promise.resolve([]);
      if (operation === initiateMedia) return initiated.promise;
      return Promise.resolve(undefined);
    });
    const resolve = vi.fn();
    const { component, cleanup } = await mount(invoke, resolve);
    const input = document.createElement('input');
    Object.defineProperty(input, 'files', { value: [new File(['pending'], pending.fileName, { type: pending.contentType })] });

    const upload = component.upload({ target: input } as unknown as Event);
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledWith(initiateMedia, expect.anything()));
    component.ngOnDestroy();
    initiated.resolve({ media: pending, uploadUrl: '/upload', expiresAtUtc: '2026-08-13T13:00:00Z' });
    await upload;

    expect(invoke).not.toHaveBeenCalledWith(uploadMediaContent, expect.anything());
    expect(resolve).not.toHaveBeenCalled();
    expect(component.preview()).toBeNull();
    expect(cleanup).toHaveBeenCalledWith([pending.id], 'owner-token');
  });
});
