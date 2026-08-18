import { DOCUMENT } from '@angular/common';
import { provideHttpClient } from '@angular/common/http';
import { HttpTestingController, provideHttpClientTesting } from '@angular/common/http/testing';
import { WritableSignal, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideApiConfiguration } from '@platform/api';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MobileSession } from '../auth/secure-token-storage';
import { MobileMediaResolver } from './mobile-media-resolver.service';

describe('MobileMediaResolver',()=>{
  let http:HttpTestingController;let resolver:MobileMediaResolver;let token:WritableSignal<string|null>;
  let createObjectURL:ReturnType<typeof vi.fn>;let revokeObjectURL:ReturnType<typeof vi.fn>;
  beforeEach(()=>{
    token=signal('account-a');createObjectURL=vi.fn(()=>'blob:mobile-resolved');revokeObjectURL=vi.fn();
    TestBed.configureTestingModule({providers:[provideHttpClient(),provideHttpClientTesting(),provideApiConfiguration('/api-root'),{provide:MobileSession,useValue:{accessToken:token}}]});
    const url=TestBed.inject(DOCUMENT).defaultView!.URL;Object.defineProperty(url,'createObjectURL',{configurable:true,value:createObjectURL});Object.defineProperty(url,'revokeObjectURL',{configurable:true,value:revokeObjectURL});
    http=TestBed.inject(HttpTestingController);resolver=TestBed.inject(MobileMediaResolver);
  });
  afterEach(()=>{resolver.ngOnDestroy();http.verify();TestBed.resetTestingModule();});

  it('deduplicates concurrent authorized downloads and revokes the shared URL on clear',async()=>{
    const first=resolver.resolve('media','w960.webp');const second=resolver.resolve('media','w960.webp');
    http.expectOne('/api-root/api/v1/media/media/download?variant=w960.webp').flush(new Blob(['image'],{type:'image/webp'}));
    const [a,b]=await Promise.all([first,second]);expect(a.url).toBe(b.url);expect(createObjectURL).toHaveBeenCalledOnce();a.release();b.release();resolver.clear();expect(revokeObjectURL).toHaveBeenCalledWith(a.url);
  });

  it('leases cache hits without retaining a cold pending request',async()=>{
    const first=resolver.resolve('cached-hit');http.expectOne('/api-root/api/v1/media/cached-hit/download').flush(new Blob(['image'],{type:'image/png'}));const initial=await first;initial.release();
    const cached=await resolver.resolve('cached-hit');expect(cached.url).toBe(initial.url);http.expectNone('/api-root/api/v1/media/cached-hit/download');
    expect((resolver as unknown as {pending:Map<string,unknown>}).pending.size).toBe(0);cached.release();
  });

  it('does not cache a 403 response',async()=>{
    const denied=resolver.resolve('private');http.expectOne('/api-root/api/v1/media/private/download').flush(new Blob(),{status:403,statusText:'Forbidden'});await expect(denied).rejects.toBeTruthy();
    const retried=resolver.resolve('private');http.expectOne('/api-root/api/v1/media/private/download').flush(new Blob(['ok'],{type:'image/png'}));expect((await retried).contentType).toBe('image/png');
  });

  it('cancels pending work and revokes cached bytes when the account changes',async()=>{
    const cached=resolver.resolve('cached');http.expectOne('/api-root/api/v1/media/cached/download').flush(new Blob(['x'],{type:'image/png'}));const lease=await cached;
    const pending=resolver.resolve('pending');const request=http.expectOne('/api-root/api/v1/media/pending/download');token.set('account-b');TestBed.flushEffects();
    await expect(pending).rejects.toBeTruthy();expect(request.cancelled).toBe(true);expect(revokeObjectURL).toHaveBeenCalledWith(lease.url);lease.release();
  });

  it('cancels a consumer-abandoned download without creating an object URL',async()=>{
    const controller=new AbortController();const pending=resolver.resolve('large-video',null,controller.signal);const rejection=expect(pending).rejects.toMatchObject({name:'AbortError'});const request=http.expectOne('/api-root/api/v1/media/large-video/download');controller.abort();
    await rejection;expect(request.cancelled).toBe(true);expect(createObjectURL).not.toHaveBeenCalled();
  });

  it('keeps a shared download alive when only one consumer aborts',async()=>{
    const controller=new AbortController();const abandoned=resolver.resolve('shared-video',null,controller.signal);const rejection=expect(abandoned).rejects.toMatchObject({name:'AbortError'});const active=resolver.resolve('shared-video');const request=http.expectOne('/api-root/api/v1/media/shared-video/download');
    controller.abort();await rejection;expect(request.cancelled).toBe(false);
    request.flush(new Blob(['video'],{type:'video/mp4'}));const lease=await active;expect(lease.contentType).toBe('video/mp4');expect(createObjectURL).toHaveBeenCalledOnce();lease.release();
  });
});
