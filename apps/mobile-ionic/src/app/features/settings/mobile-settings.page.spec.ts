import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Api } from '@platform/api';
import { describe, expect, it, vi } from 'vitest';
import { MobileSession } from '../../core/auth/secure-token-storage';
import { MobileSettingsPage } from './mobile-settings.page';

describe('MobileSettingsPage', () => {
  it('renders security and privacy actions after loading sessions', async () => {
    const invoke = vi.fn(async () => []);
    await TestBed.configureTestingModule({
      imports: [MobileSettingsPage],
      providers: [provideRouter([]), { provide: Api, useValue: { invoke } }, { provide: MobileSession, useValue: { clear: vi.fn() } }]
    }).compileComponents();
    const fixture = TestBed.createComponent(MobileSettingsPage);
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(invoke).toHaveBeenCalledOnce();
    expect(fixture.nativeElement.textContent).toContain('Etkin cihazlar');
    expect(fixture.nativeElement.textContent).toContain('İkinci faktör');
    expect(fixture.nativeElement.textContent).toContain('Hesabı sil');
  });
});
