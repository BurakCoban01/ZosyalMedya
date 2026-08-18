import { TestBed } from '@angular/core/testing';
import { Router } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { TokenVault } from './token-vault.service';
import { authGuard } from './auth.guard';

describe('authGuard', () => {
  it('keeps the requested protected URL for a successful re-login', async () => {
    const createUrlTree = vi.fn().mockReturnValue('login-tree');
    TestBed.configureTestingModule({
      providers: [
        { provide: TokenVault, useValue: { validAccessToken: () => Promise.resolve(null) } },
        { provide: Router, useValue: { createUrlTree } },
      ],
    });

    const result = await TestBed.runInInjectionContext(() =>
      authGuard({} as never, { url: '/akis?mode=Discovery' } as never),
    );

    expect(result).toBe('login-tree');
    expect(createUrlTree).toHaveBeenCalledWith(['/giris'], {
      queryParams: { returnUrl: '/akis?mode=Discovery' },
    });
  });

  it('allows an authenticated session without redirecting', async () => {
    const createUrlTree = vi.fn();
    TestBed.configureTestingModule({
      providers: [
        { provide: TokenVault, useValue: { validAccessToken: () => Promise.resolve('access') } },
        { provide: Router, useValue: { createUrlTree } },
      ],
    });

    const result = await TestBed.runInInjectionContext(() =>
      authGuard({} as never, { url: '/profil' } as never),
    );

    expect(result).toBe(true);
    expect(createUrlTree).not.toHaveBeenCalled();
  });
});
