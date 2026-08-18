import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter } from '@angular/router';
import { describe, expect, it, vi } from 'vitest';
import { MobileAuthService } from '../../core/auth/mobile-auth.service';
import { MobileVerifyEmailPage } from './mobile-verify-email.page';

describe('MobileVerifyEmailPage', () => {
  it('shows a safe error state when a verification token is missing', async () => {
    const verifyEmail = vi.fn(async () => undefined);
    await TestBed.configureTestingModule({
      imports: [MobileVerifyEmailPage],
      providers: [
        provideRouter([]),
        { provide: ActivatedRoute, useValue: { snapshot: { queryParamMap: convertToParamMap({}) } } },
        { provide: MobileAuthService, useValue: { verifyEmail } }
      ]
    }).compileComponents();

    const fixture = TestBed.createComponent(MobileVerifyEmailPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();

    expect(verifyEmail).not.toHaveBeenCalled();
    expect(fixture.componentInstance.busy()).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('Doğrulama tamamlanamadı.');
  });
});
