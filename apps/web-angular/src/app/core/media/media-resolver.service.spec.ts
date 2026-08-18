import { DOCUMENT } from '@angular/common';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { WritableSignal, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideApiConfiguration } from '@platform/api';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TokenVault } from '../auth/token-vault.service';
import { MediaResolver } from './media-resolver.service';

describe('MediaResolver', () => {
  let http: HttpTestingController;
  let resolver: MediaResolver;
  let createObjectURL: ReturnType<typeof vi.fn>;
  let revokeObjectURL: ReturnType<typeof vi.fn>;
  let authenticated: WritableSignal<boolean>;
  let accessToken: WritableSignal<string | null>;

  beforeEach(() => {
    createObjectURL = vi.fn(() => 'blob:resolved-media');
    revokeObjectURL = vi.fn();
    authenticated = signal(true);
    accessToken = signal('token-a');
    TestBed.configureTestingModule({
      providers: [
        provideHttpClient(),
        provideHttpClientTesting(),
        provideApiConfiguration('/api-root'),
        { provide: TokenVault, useValue: { authenticated, accessToken } },
      ],
    });
    const window = TestBed.inject(DOCUMENT).defaultView!;
    Object.defineProperty(window.URL, 'createObjectURL', { configurable: true, value: createObjectURL });
    Object.defineProperty(window.URL, 'revokeObjectURL', { configurable: true, value: revokeObjectURL });
    http = TestBed.inject(HttpTestingController);
    resolver = TestBed.inject(MediaResolver);
  });

  afterEach(() => {
    resolver.ngOnDestroy();
    http.verify();
    TestBed.resetTestingModule();
  });

  it('deduplicates concurrent downloads and revokes the shared object URL on clear', async () => {
    const first = resolver.resolve('media-1', 'w960.webp');
    const second = resolver.resolve('media-1', 'w960.webp');
    const request = http.expectOne('/api-root/api/v1/media/media-1/download?variant=w960.webp');
    request.flush(new Blob(['image-bytes'], { type: 'image/webp' }));

    const [firstLease, secondLease] = await Promise.all([first, second]);
    expect(firstLease.url).toBe('blob:resolved-media');
    expect(secondLease.url).toBe(firstLease.url);
    expect(firstLease.contentType).toBe('image/webp');
    expect(createObjectURL).toHaveBeenCalledTimes(1);

    firstLease.release();
    firstLease.release();
    secondLease.release();
    resolver.clear();
    expect(revokeObjectURL).toHaveBeenCalledOnce();
  });

  it('does not cache a failed authorization response', async () => {
    const failed = resolver.resolve('private-media');
    http.expectOne('/api-root/api/v1/media/private-media/download').flush(
      new Blob([JSON.stringify({ title: 'Forbidden' })], { type: 'application/problem+json' }),
      { status: 403, statusText: 'Forbidden' },
    );
    await expect(failed).rejects.toBeTruthy();

    const retried = resolver.resolve('private-media');
    http.expectOne('/api-root/api/v1/media/private-media/download').flush(
      new Blob(['allowed'], { type: 'image/png' }),
    );
    const lease = await retried;
    expect(lease.contentType).toBe('image/png');
    lease.release();
  });

  it('cancels an abandoned in-flight request', async () => {
    const controller = new AbortController();
    const result = resolver.resolve('media-to-cancel', null, controller.signal).catch(error => error as Error);
    const request = http.expectOne('/api-root/api/v1/media/media-to-cancel/download');

    controller.abort();

    await expect(result).resolves.toMatchObject({ name: 'AbortError' });
    expect(request.cancelled).toBe(true);
    expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('revokes cached object URLs when the authenticated session ends', async () => {
    const resolved = resolver.resolve('session-media');
    http.expectOne('/api-root/api/v1/media/session-media/download').flush(
      new Blob(['private-image'], { type: 'image/png' }),
    );
    const lease = await resolved;

    authenticated.set(false);
    accessToken.set(null);
    TestBed.flushEffects();

    expect(revokeObjectURL).toHaveBeenCalledWith(lease.url);
    lease.release();
  });

  it('revokes account-scoped object URLs when an authenticated account changes', async () => {
    const resolved = resolver.resolve('account-a-private-media');
    http.expectOne('/api-root/api/v1/media/account-a-private-media/download').flush(
      new Blob(['account-a-image'], { type: 'image/png' }),
    );
    const lease = await resolved;

    accessToken.set('token-b');
    TestBed.flushEffects();

    expect(revokeObjectURL).toHaveBeenCalledWith(lease.url);
    lease.release();
  });
});
