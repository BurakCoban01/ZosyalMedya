import { DOCUMENT } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Injectable, OnDestroy, effect, inject, signal } from '@angular/core';
import { ApiConfiguration, downloadMedia } from '@platform/api';
import { Observable, Subject, firstValueFrom } from 'rxjs';
import { finalize, map, shareReplay, takeUntil } from 'rxjs/operators';
import { TokenVault } from '../auth/token-vault.service';

export interface ResolvedMedia {
  readonly mediaId: string;
  readonly url: string;
  readonly contentType: string;
  readonly size: number;
  release(): void;
}

interface CacheEntry {
  readonly key: string;
  readonly mediaId: string;
  readonly url: string;
  readonly contentType: string;
  readonly size: number;
  references: number;
  lastUsed: number;
}

/**
 * Resolves bearer-protected media IDs to short-lived object URLs.
 *
 * Concurrent requests are shared, abandoned requests are cancelled when their
 * last subscriber leaves, and object URLs are revoked on eviction, logout and
 * service destruction. Consumers must release every successful lease.
 */
@Injectable({ providedIn: 'root' })
export class MediaResolver implements OnDestroy {
  private static readonly maxCachedEntries = 48;

  private readonly http = inject(HttpClient);
  private readonly configuration = inject(ApiConfiguration);
  private readonly document = inject(DOCUMENT);
  private readonly vault = inject(TokenVault);
  private readonly cache = new Map<string, CacheEntry>();
  private readonly pending = new Map<string, Observable<CacheEntry>>();
  private readonly cancelRequests = new Subject<void>();
  private clock = 0;
  private observedAccessToken = this.vault.accessToken();
  readonly sessionRevision = signal(0);

  private readonly clearOnSessionChange = effect(() => {
    const accessToken = this.vault.accessToken();
    if (this.observedAccessToken !== accessToken) {
      this.clear();
      this.sessionRevision.update(value => value + 1);
    }
    this.observedAccessToken = accessToken;
  });

  async resolve(mediaId: string, variant?: string | null, signal?: AbortSignal): Promise<ResolvedMedia> {
    if (signal?.aborted) throw this.abortError();
    const key = this.cacheKey(mediaId, variant);
    const cached = this.cache.get(key);
    if (cached) return this.lease(cached);

    const request = this.pending.get(key) ?? this.createRequest(key, mediaId, variant);
    try {
      const entry = await firstValueFrom(signal ? request.pipe(takeUntil(this.abortSignal(signal))) : request);
      if (signal?.aborted) throw this.abortError();
      return this.lease(entry);
    } catch (error) {
      if (signal?.aborted) throw this.abortError();
      throw error;
    }
  }

  clear(): void {
    this.cancelRequests.next();
    for (const entry of this.cache.values()) this.revoke(entry.url);
    this.cache.clear();
    this.pending.clear();
  }

  ngOnDestroy(): void {
    this.clearOnSessionChange.destroy();
    this.clear();
    this.cancelRequests.complete();
  }

  private createRequest(key: string, mediaId: string, variant?: string | null): Observable<CacheEntry> {
    const request = downloadMedia(this.http, this.configuration.rootUrl, { id: mediaId, variant }).pipe(
      takeUntil(this.cancelRequests),
      map(response => this.remember(key, mediaId, response.body)),
      finalize(() => this.pending.delete(key)),
      shareReplay({ bufferSize: 1, refCount: true }),
    );
    this.pending.set(key, request);
    return request;
  }

  private remember(key: string, mediaId: string, blob: Blob): CacheEntry {
    const existing = this.cache.get(key);
    if (existing) return existing;
    const entry: CacheEntry = {
      key,
      mediaId,
      url: this.urlApi().createObjectURL(blob),
      contentType: blob.type || 'application/octet-stream',
      size: blob.size,
      references: 0,
      lastUsed: ++this.clock,
    };
    this.cache.set(key, entry);
    return entry;
  }

  private lease(entry: CacheEntry): ResolvedMedia {
    entry.references += 1;
    entry.lastUsed = ++this.clock;
    this.evict(entry.key);
    let released = false;
    return {
      mediaId: entry.mediaId,
      url: entry.url,
      contentType: entry.contentType,
      size: entry.size,
      release: () => {
        if (released) return;
        released = true;
        entry.references = Math.max(0, entry.references - 1);
        this.evict();
      },
    };
  }

  private evict(protectedKey?: string): void {
    while (this.cache.size > MediaResolver.maxCachedEntries) {
      const candidate = [...this.cache.values()]
        .filter(entry => entry.references === 0 && entry.key !== protectedKey)
        .sort((left, right) => left.lastUsed - right.lastUsed)[0];
      if (!candidate) return;
      this.cache.delete(candidate.key);
      this.revoke(candidate.url);
    }
  }

  private abortSignal(signal: AbortSignal): Observable<void> {
    return new Observable(subscriber => {
      if (signal.aborted) {
        subscriber.next();
        subscriber.complete();
        return;
      }
      const abort = () => {
        subscriber.next();
        subscriber.complete();
      };
      signal.addEventListener('abort', abort, { once: true });
      return () => signal.removeEventListener('abort', abort);
    });
  }

  private cacheKey(mediaId: string, variant?: string | null): string {
    return `${mediaId}:${variant?.trim() ?? ''}`;
  }

  private urlApi(): typeof URL {
    return this.document.defaultView?.URL ?? URL;
  }

  private revoke(url: string): void {
    this.urlApi().revokeObjectURL(url);
  }

  private abortError(): Error {
    const error = new Error('Medya çözümleme iptal edildi.');
    error.name = 'AbortError';
    return error;
  }
}
