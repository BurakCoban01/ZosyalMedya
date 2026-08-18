import { DOCUMENT } from '@angular/common';
import { HttpClient } from '@angular/common/http';
import { Injectable, OnDestroy, effect, inject, signal } from '@angular/core';
import { ApiConfiguration, downloadMedia } from '@platform/api';
import { Observable, Subject, firstValueFrom } from 'rxjs';
import { finalize, map, shareReplay, takeUntil } from 'rxjs/operators';
import { MobileSession } from '../auth/secure-token-storage';

export interface MobileResolvedMedia {
  readonly mediaId: string;
  readonly url: string;
  readonly contentType: string;
  release(): void;
}

interface Entry {
  readonly key: string;
  readonly mediaId: string;
  readonly url: string;
  readonly contentType: string;
  references: number;
  lastUsed: number;
}

@Injectable({ providedIn: 'root' })
export class MobileMediaResolver implements OnDestroy {
  private static readonly maxEntries = 32;
  private readonly http = inject(HttpClient);
  private readonly configuration = inject(ApiConfiguration);
  private readonly document = inject(DOCUMENT);
  private readonly session = inject(MobileSession);
  private readonly cache = new Map<string, Entry>();
  private readonly pending = new Map<string, Observable<Entry>>();
  private readonly cancel = new Subject<void>();
  private observedToken = this.session.accessToken();
  private clock = 0;
  readonly sessionRevision = signal(0);
  readonly authenticated = this.session.authenticated;
  private readonly clearOnSessionChange = effect(() => {
    const token = this.session.accessToken();
    if (token !== this.observedToken) this.clear();
    this.observedToken = token;
  });

  async resolve(mediaId: string, variant?: string | null, signal?: AbortSignal): Promise<MobileResolvedMedia> {
    if(signal?.aborted)throw this.abortError();
    const key = `${mediaId}:${variant?.trim() ?? ''}`;
    const cached = this.cache.get(key);
    if(cached)return this.lease(cached);
    const request=this.pending.get(key)??this.request(key,mediaId,variant);
    let entry:Entry;
    try{entry=await firstValueFrom(signal?request.pipe(takeUntil(this.abortSignal(signal))):request);}
    catch(error){if(signal?.aborted)throw this.abortError();throw error;}
    if(signal?.aborted)throw this.abortError();
    return this.lease(entry);
  }

  private lease(entry:Entry):MobileResolvedMedia{
    entry.references += 1;
    entry.lastUsed = ++this.clock;
    this.evict(entry.key);
    let released = false;
    return {
      mediaId:entry.mediaId,
      url: entry.url,
      contentType: entry.contentType,
      release: () => {
        if (released) return;
        released = true;
        entry.references = Math.max(0, entry.references - 1);
        this.evict();
      },
    };
  }

  clear(): void {
    this.cancel.next();
    for (const entry of this.cache.values()) this.urlApi().revokeObjectURL(entry.url);
    this.cache.clear();
    this.pending.clear();
    this.sessionRevision.update(value => value + 1);
  }

  ngOnDestroy(): void {
    this.clearOnSessionChange.destroy();
    this.clear();
    this.cancel.complete();
  }

  private request(key: string, mediaId: string, variant?: string | null): Observable<Entry> {
    const request = downloadMedia(this.http, this.configuration.rootUrl, { id: mediaId, variant }).pipe(
      takeUntil(this.cancel),
      map(response => {
        const existing = this.cache.get(key);
        if (existing) return existing;
        const entry: Entry = {
          key,
          mediaId,
          url: this.urlApi().createObjectURL(response.body),
          contentType: response.body.type || 'application/octet-stream',
          references: 0,
          lastUsed: ++this.clock,
        };
        this.cache.set(key, entry);
        return entry;
      }),
      finalize(() => this.pending.delete(key)),
      shareReplay({ bufferSize: 1, refCount: true }),
    );
    this.pending.set(key, request);
    return request;
  }

  private evict(protectedKey?: string): void {
    while (this.cache.size > MobileMediaResolver.maxEntries) {
      const candidate = [...this.cache.values()]
        .filter(entry => entry.references === 0 && entry.key !== protectedKey)
        .sort((left, right) => left.lastUsed - right.lastUsed)[0];
      if (!candidate) return;
      this.cache.delete(candidate.key);
      this.urlApi().revokeObjectURL(candidate.url);
    }
  }

  private urlApi(): typeof URL { return this.document.defaultView?.URL ?? URL; }
  private abortSignal(signal:AbortSignal):Observable<void>{return new Observable(subscriber=>{if(signal.aborted){subscriber.next();subscriber.complete();return;}const abort=()=>{subscriber.next();subscriber.complete();};signal.addEventListener('abort',abort,{once:true});return()=>signal.removeEventListener('abort',abort);});}
  private abortError():Error{const error=new Error('Medya çözümleme iptal edildi.');error.name='AbortError';return error;}
}
