import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Api } from '@platform/api';
import { describe, expect, it, vi } from 'vitest';
import { TokenVault } from '../../core/auth/token-vault.service';
import { ThemeService } from '../../core/preferences/theme.service';
import { SettingsPage } from './settings.page';

describe('SettingsPage', () => {
  it('loads sessions and presents account security controls', async () => {
    const invoke = vi.fn(async () => []);
    await TestBed.configureTestingModule({
      imports: [SettingsPage],
      providers: [provideRouter([]), { provide: Api, useValue: { invoke } }, { provide: TokenVault, useValue: { clear: vi.fn() } }]
    }).compileComponents();
    const fixture = TestBed.createComponent(SettingsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(invoke).toHaveBeenCalledOnce();
    expect(fixture.nativeElement.textContent).toContain('Etkin cihazlar');
    expect(fixture.nativeElement.textContent).toContain('Verilerimi dışa aktar');
    expect(fixture.nativeElement.textContent).toContain('Hesabı sil');
    expect(fixture.nativeElement.textContent).toContain('Deneyim tercihleri');
    expect(fixture.nativeElement.querySelector('.session-list')).toBeTruthy();
    const theme = TestBed.inject(ThemeService);
    fixture.componentInstance.setTheme('light');
    fixture.componentInstance.setMotion('reduce');
    expect(theme.themeMode()).toBe('light');
    expect(theme.motionMode()).toBe('reduce');

    fixture.componentInstance.enrollment.set({
      authenticatorUri: 'otpauth://totp/EnterpriseSocialCommunityPlatform:demo',
      enrollmentToken: 'enrollment-token-must-stay-hidden',
      secret: 'mfa-secret-must-stay-hidden'
    });
    fixture.componentInstance.recoveryCodes.set(['recovery-code-must-stay-hidden']);
    fixture.detectChanges();
    expect(fixture.nativeElement.textContent).toContain('Kurulum anahtarını kopyala');
    expect(fixture.nativeElement.textContent).toContain('1 kurtarma kodu hazır');
    expect(fixture.nativeElement.textContent).not.toContain('mfa-secret-must-stay-hidden');
    expect(fixture.nativeElement.textContent).not.toContain('enrollment-token-must-stay-hidden');
    expect(fixture.nativeElement.textContent).not.toContain('recovery-code-must-stay-hidden');
  });
});
