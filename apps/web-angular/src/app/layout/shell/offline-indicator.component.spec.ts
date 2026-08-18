import { TestBed } from '@angular/core/testing';
import { signal } from '@angular/core';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OnlineStatusService } from '../../core/connectivity/online-status.service';
import { ZmOfflineIndicatorComponent } from './offline-indicator.component';

/**
 * ZmOfflineIndicator — focused verification for m2-account-theme-status
 * (VAL-WSH-013). The banner renders ONLY when offline, carries a non-color
 * status cue (text + glyph), and is a polite live region so AT announces the
 * connectivity change.
 */

function stubOnline(offline: boolean): OnlineStatusService {
  const isOnline = signal(!offline);
  return {
    isOnline,
    isOffline: () => offline,
  } as unknown as OnlineStatusService;
}

async function render(offline: boolean): Promise<HTMLElement> {
  TestBed.resetTestingModule();
  await TestBed.configureTestingModule({
    imports: [ZmOfflineIndicatorComponent],
    providers: [{ provide: OnlineStatusService, useValue: stubOnline(offline) }],
  }).compileComponents();
  const fixture = TestBed.createComponent(ZmOfflineIndicatorComponent);
  fixture.detectChanges();
  return fixture.nativeElement as HTMLElement;
}

describe('ZmOfflineIndicatorComponent', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  it('renders nothing while online (no layout cost, no false offline)', async () => {
    const host = await render(false);
    const banner = host.querySelector('.offline-indicator');
    expect(banner).toBeNull();
  });

  it('renders the banner when offline', async () => {
    const host = await render(true);
    const banner = host.querySelector('.offline-indicator');
    expect(banner).not.toBeNull();
  });

  it('is a polite live region so AT announces the change (role=status, aria-live=polite)', async () => {
    const host = await render(true);
    const banner = host.querySelector<HTMLElement>('.offline-indicator');
    expect(banner?.getAttribute('role')).toBe('status');
    expect(banner?.getAttribute('aria-live')).toBe('polite');
  });

  it('conveys status with a glyph (non-color cue), never color alone', async () => {
    const host = await render(true);
    const glyph = host.querySelector('.offline-indicator__glyph');
    expect(glyph).not.toBeNull();
    expect(glyph?.getAttribute('aria-hidden')).toBe('true');
  });

  it('uses Turkish copy that names the situation (not generic filler)', async () => {
    const host = await render(true);
    const text = host.querySelector('.offline-indicator__text')?.textContent ?? '';
    expect(text.toLowerCase()).toContain('bağlantı');
    expect(text.toLowerCase()).toContain('çevrimdışı');
  });
});
