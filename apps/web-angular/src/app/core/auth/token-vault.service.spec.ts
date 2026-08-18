import { DOCUMENT } from '@angular/common';
import { HttpBackend, HttpResponse } from '@angular/common/http';
import { TestBed } from '@angular/core/testing';
import { BrowserAccessToken } from '@platform/api';
import { of, Subject } from 'rxjs';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { TokenVault } from './token-vault.service';

const tokens: BrowserAccessToken = {
  accessToken: 'access-token',
  accessTokenExpiresAtUtc: new Date(Date.now() + 60_000).toISOString(),
};
const accessTokenFor = (subject: string) => `header.${btoa(JSON.stringify({ sub: subject }))}.signature`;

describe('TokenVault browser cookie session', () => {
  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [{ provide: HttpBackend, useValue: { handle: vi.fn() } }] });
    sessionStorage.clear(); localStorage.clear();
    TestBed.inject(DOCUMENT).cookie = 'escp-browser-csrf=csrf-token; path=/';
  });
  afterEach(() => { TestBed.resetTestingModule(); sessionStorage.clear(); localStorage.clear(); });

  it('keeps access tokens only in memory and never writes browser storage', async () => {
    const vault = TestBed.inject(TokenVault);
    await vault.set(tokens);
    expect(vault.accessToken()).toBe(tokens.accessToken);
    expect(sessionStorage.length).toBe(0);
    expect(localStorage.length).toBe(0);
  });

  it('bootstraps a reload from the cookie session and returns only an access token', async () => {
    const backend = TestBed.inject(HttpBackend);
    vi.mocked(backend.handle).mockReturnValue(of(new HttpResponse({ status: 200, body: tokens })));
    const vault = TestBed.inject(TokenVault);
    await expect(vault.validAccessToken()).resolves.toBe(tokens.accessToken);
    expect(backend.handle).toHaveBeenCalledOnce();
    expect(sessionStorage.length).toBe(0);
  });

  it('coalesces concurrent cookie refreshes', async () => {
    const backend = TestBed.inject(HttpBackend);
    vi.mocked(backend.handle).mockReturnValue(of(new HttpResponse({ status: 200, body: tokens })));
    const vault = TestBed.inject(TokenVault);
    await expect(Promise.all([vault.validAccessToken(), vault.validAccessToken()]))
      .resolves.toEqual([tokens.accessToken, tokens.accessToken]);
    expect(backend.handle).toHaveBeenCalledOnce();
  });

  it('awaits old-session cleanup before exposing a different account', async () => {
    const vault = TestBed.inject(TokenVault);
    const first = { ...tokens, accessToken: accessTokenFor('owner-a') };
    const second = { ...tokens, accessToken: accessTokenFor('owner-b') };
    await vault.set(first);
    let release!: () => void;
    const cleanup = new Promise<void>(resolve => { release = resolve; });
    vault.registerBeforeSessionChange(() => cleanup);
    const transition = vault.set(second);
    await Promise.resolve();
    expect(vault.accessToken()).toBe(first.accessToken);
    release(); await transition;
    expect(vault.accessToken()).toBe(second.accessToken);
  });

  it('does not let a delayed refresh restore a cleared session', async () => {
    const backend = TestBed.inject(HttpBackend);
    const response = new Subject<HttpResponse<BrowserAccessToken>>();
    vi.mocked(backend.handle).mockReturnValue(response);
    const vault = TestBed.inject(TokenVault);
    const rotation = vault.validAccessToken();
    await Promise.resolve(); await vault.clear();
    response.next(new HttpResponse({ status: 200, body: tokens })); response.complete();
    await expect(rotation).resolves.toBeNull();
    expect(vault.authenticated()).toBe(false);
  });
});
