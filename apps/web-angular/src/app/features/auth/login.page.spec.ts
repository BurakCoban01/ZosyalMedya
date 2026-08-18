import { TestBed } from '@angular/core/testing';
import { ActivatedRoute, convertToParamMap, provideRouter, Router } from '@angular/router';
import { PublicDemoMailboxMessage, PublicDemoStatus } from '@platform/api';
import { describe, expect, it, vi } from 'vitest';
import { AuthService } from '../../core/auth/auth.service';
import { LoginPage } from './login.page';

async function mount(returnUrl?: string) {
  const auth = {
    login: vi.fn(async () => undefined),
    register: vi.fn(async () => undefined),
    getPublicDemoStatus: vi.fn<() => Promise<PublicDemoStatus>>(async () => ({ enabled: false })),
    listPublicDemoMailbox: vi.fn<(email: string) => Promise<PublicDemoMailboxMessage[]>>(async () => [])
  };
  await TestBed.configureTestingModule({
    imports: [LoginPage],
    providers: [
      provideRouter([]),
      {
        provide: ActivatedRoute,
        useValue: { snapshot: { queryParamMap: convertToParamMap(returnUrl ? { returnUrl } : {}) } },
      },
      { provide: AuthService, useValue: auth }
    ]
  }).compileComponents();
  const fixture = TestBed.createComponent(LoginPage);
  fixture.detectChanges();
  await fixture.whenStable();
  fixture.detectChanges();
  return { fixture, page: fixture.componentInstance, auth };
}

describe('LoginPage', () => {
  it('preserves the real login call and protected-route navigation', async () => {
    const { page, auth } = await mount();
    const router = TestBed.inject(Router);
    const navigateByUrl = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    page.form.patchValue({
      login: 'validator',
      password: 'ValidPassword!2026',
      mfaCode: ''
    });

    await page.submit();

    expect(auth.login).toHaveBeenCalledWith('validator', 'ValidPassword!2026', '');
    expect(navigateByUrl).toHaveBeenCalledWith('/profil');
  });

  it('returns to the intended protected route after re-authentication', async () => {
    const { page } = await mount('/akis?mode=Discovery');
    const router = TestBed.inject(Router);
    const navigateByUrl = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    page.form.patchValue({ login: 'validator', password: 'ValidPassword!2026' });

    await page.submit();

    expect(navigateByUrl).toHaveBeenCalledWith('/akis?mode=Discovery');
  });

  it('rejects an external return target after login', async () => {
    const { page } = await mount('//attacker.test/path');
    const router = TestBed.inject(Router);
    const navigateByUrl = vi.spyOn(router, 'navigateByUrl').mockResolvedValue(true);
    page.form.patchValue({ login: 'validator', password: 'ValidPassword!2026' });

    await page.submit();

    expect(navigateByUrl).toHaveBeenCalledWith('/profil');
  });

  it('keeps registration honest until email verification completes', async () => {
    const { fixture, page, auth } = await mount();
    page.toggleMode();
    page.form.patchValue({
      email: 'validator@test.local',
      login: 'validator',
      password: 'ValidPassword!2026'
    });

    await page.submit();
    fixture.detectChanges();

    expect(auth.register).toHaveBeenCalledWith(
      'validator',
      'validator@test.local',
      'ValidPassword!2026'
    );
    expect(page.verificationSent()).toBe(true);
    expect(page.registerMode()).toBe(false);
    expect(fixture.nativeElement.textContent).toContain('Doğrulama bağlantısı');
    expect(fixture.nativeElement.textContent).toContain('src/Host/Api/.local/email-pickup');
  });

  it('shows a synthetic-only notice and opens the real in-app verification action in public demo mode', async () => {
    const { fixture, page, auth } = await mount();
    auth.getPublicDemoStatus.mockResolvedValueOnce({ enabled: true, visitorEmailDomain: 'visitor.escp.test', artifactRetentionHours: 24 });
    await page.ngOnInit();
    auth.listPublicDemoMailbox.mockResolvedValueOnce([{ purpose: 'EmailVerification', actionUrl: 'https://demo.example.test/auth/verify-email?token=demo-token', expiresAtUtc: '2026-08-18T00:00:00Z' }]);
    page.toggleMode();
    page.form.patchValue({ email: 'guest@visitor.escp.test', login: 'guest_demo', password: 'ValidPassword!2026' });

    await page.submit();
    fixture.detectChanges();

    expect(fixture.nativeElement.textContent).toContain('Gerçek ad, e-posta veya kişisel bilgi gönderme');
    expect(auth.listPublicDemoMailbox).toHaveBeenCalledWith('guest@visitor.escp.test');
    expect(fixture.nativeElement.textContent).toContain('24 saat');
    expect(fixture.nativeElement.querySelector('.mail-action')?.getAttribute('href')).toBe('/auth/verify-email?token=demo-token');
    expect(fixture.nativeElement.textContent).not.toContain('src/Host/Api/.local/email-pickup');
  });

  it('explains the pending verification step when a new account cannot log in yet', async () => {
    const { fixture, page, auth } = await mount();
    auth.login.mockRejectedValueOnce(new HttpErrorResponse({
      status: 400,
      error: { code: 'identity.email_not_verified' }
    }));
    page.form.patchValue({
      login: 'yeni_kullanici',
      password: 'ValidPassword!2026'
    });

    await page.submit();
    fixture.detectChanges();

    expect(page.error()).toContain('E-posta doğrulaması bekleniyor');
    expect(fixture.nativeElement.textContent).toContain('src/Host/Api/.local/email-pickup');
  });
});
import { HttpErrorResponse } from '@angular/common/http';
