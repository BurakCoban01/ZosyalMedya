import { HttpBackend, HttpResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { TokenPair } from '@platform/api';
import { of, Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { MobileSession } from './secure-token-storage';

const tokens:TokenPair={
  accessToken:'mobile-access-token',
  accessTokenExpiresAtUtc:'2026-08-12T22:00:00Z',
  refreshToken:'mobile-refresh-token'
};

describe('MobileSession secure storage boundary',()=>{
  beforeEach(()=>{
    TestBed.configureTestingModule({providers:[{provide:HttpBackend,useValue:{handle:vi.fn()}}]});
    sessionStorage.clear();
  });
  afterEach(()=>{
    sessionStorage.clear();
    TestBed.resetTestingModule();
  });

  it('keeps the browser/PWA fallback in memory and clears it',()=>{
    const session=TestBed.inject(MobileSession);
    session.set(tokens);
    expect(session.accessToken()).toBe(tokens.accessToken);
    expect(sessionStorage.length).toBe(0);
    session.clear();
    expect(session.authenticated()).toBe(false);
  });

  it('exposes the stable JWT subject without treating opaque tokens as identities',()=>{
    const session=TestBed.inject(MobileSession);
    const payload=globalThis.btoa(JSON.stringify({sub:'account-a'})).replace(/=/g,'').replace(/\+/g,'-').replace(/\//g,'_');
    session.set({...tokens,accessToken:`header.${payload}.signature`});
    expect(session.subject()).toBe('account-a');
    session.set(tokens);expect(session.subject()).toBeNull();
  });

  it('coalesces proactive rotation for an expired token',async()=>{
    const rotated={...tokens,accessToken:'rotated',refreshToken:'rotated-refresh',accessTokenExpiresAtUtc:new Date(Date.now()+60_000).toISOString()};
    const backend=TestBed.inject(HttpBackend);
    vi.mocked(backend.handle).mockReturnValue(of(new HttpResponse({status:200,body:rotated})));
    const session=TestBed.inject(MobileSession);
    session.set({...tokens,accessTokenExpiresAtUtc:'2020-01-01T00:00:00Z'});

    await expect(Promise.all([session.validAccessToken(),session.validAccessToken()]))
      .resolves.toEqual(['rotated','rotated']);
    expect(backend.handle).toHaveBeenCalledOnce();
  });

  it('does not let a delayed refresh restore a cleared mobile session',async()=>{
    const response=new Subject<HttpResponse<TokenPair>>();const backend=TestBed.inject(HttpBackend);vi.mocked(backend.handle).mockReturnValue(response);const session=TestBed.inject(MobileSession);session.set({...tokens,accessTokenExpiresAtUtc:'2020-01-01T00:00:00Z'});
    const rotation=session.validAccessToken();await Promise.resolve();session.clear();response.next(new HttpResponse({status:200,body:{...tokens,accessToken:'late-a',refreshToken:'late-a-refresh'}}));response.complete();
    await expect(rotation).resolves.toBeNull();expect(session.authenticated()).toBe(false);expect(sessionStorage.length).toBe(0);
  });

  it('does not let a delayed refresh failure clear a newer account',async()=>{
    const response=new Subject<HttpResponse<TokenPair>>();const backend=TestBed.inject(HttpBackend);vi.mocked(backend.handle).mockReturnValue(response);const session=TestBed.inject(MobileSession);session.set({...tokens,accessTokenExpiresAtUtc:'2020-01-01T00:00:00Z'});
    const rotation=session.validAccessToken();await Promise.resolve();const newer={...tokens,accessToken:'account-b',refreshToken:'account-b-refresh'};session.set(newer);response.error(new Error('old refresh failed'));
    await expect(rotation).resolves.toBeNull();expect(session.accessToken()).toBe(newer.accessToken);expect(session.tokens()?.refreshToken).toBe(newer.refreshToken);
  });
});
