import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../core/auth/auth.service';
import { VerifyEmailPage } from './verify-email.page';

describe('VerifyEmailPage', () => {
  it('confirms the route token and renders the completed state', async () => {
    const verifyEmail = vi.fn(async () => undefined);
    await TestBed.configureTestingModule({
      imports: [VerifyEmailPage],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({ token: 'single-use-token' }) } } },
        { provide: AuthService, useValue: { verifyEmail } }
      ]
    }).compileComponents();

    const fixture = TestBed.createComponent(VerifyEmailPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(verifyEmail).toHaveBeenCalledOnce();
    expect(verifyEmail).toHaveBeenCalledWith('single-use-token');
    expect(fixture.nativeElement.textContent).toContain('E-posta adresin doğrulandı.');
  });
});
