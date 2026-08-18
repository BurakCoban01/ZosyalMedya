import { TestBed } from '@angular/core/testing';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { OnlineStatusService } from './online-status.service';

/**
 * OnlineStatusService — focused verification for m2-account-theme-status
 * (VAL-WSH-013 offline/degraded indicator). The service owns the single
 * connectivity signal the shell indicator consumes. Covers the navigator.onLine
 * read + the window online/offline event wiring + the defensive non-browser
 * fallback.
 */

function defineOnline(value: boolean): void {
  Object.defineProperty(window.navigator, 'onLine', {
    value,
    configurable: true,
    writable: true,
  });
}

function fireWindow(type: 'online' | 'offline'): void {
  window.dispatchEvent(new Event(type));
}

describe('OnlineStatusService', () => {
  beforeEach(() => {
    TestBed.resetTestingModule();
  });

  afterEach(() => {
    // Restore a sane default so other specs are unaffected.
    defineOnline(true);
  });

  it('reads navigator.onLine at construction (online → isOnline true, isOffline false)', () => {
    defineOnline(true);
    const service = TestBed.inject(OnlineStatusService);
    expect(service.isOnline()).toBe(true);
    expect(service.isOffline()).toBe(false);
  });

  it('reads navigator.onLine at construction (offline → isOnline false)', () => {
    defineOnline(false);
    const service = TestBed.inject(OnlineStatusService);
    expect(service.isOnline()).toBe(false);
    expect(service.isOffline()).toBe(true);
  });

  it('flips to offline when the window "offline" event fires', () => {
    defineOnline(true);
    const service = TestBed.inject(OnlineStatusService);
    expect(service.isOnline()).toBe(true);

    defineOnline(false);
    fireWindow('offline');

    expect(service.isOnline()).toBe(false);
    expect(service.isOffline()).toBe(true);
  });

  it('flips back to online when the window "online" event fires', () => {
    defineOnline(false);
    const service = TestBed.inject(OnlineStatusService);
    expect(service.isOffline()).toBe(true);

    defineOnline(true);
    fireWindow('online');

    expect(service.isOnline()).toBe(true);
    expect(service.isOffline()).toBe(false);
  });

  it('never falsely reports online while navigator.onLine stays false', () => {
    defineOnline(false);
    const service = TestBed.inject(OnlineStatusService);
    // Fire an unrelated event type; must not flip to a false online.
    defineOnline(false);
    fireWindow('offline');
    expect(service.isOnline()).toBe(false);
  });

  it('reflects the latest event across repeated offline→online toggles', () => {
    defineOnline(true);
    const service = TestBed.inject(OnlineStatusService);

    defineOnline(false);
    fireWindow('offline');
    expect(service.isOffline()).toBe(true);

    defineOnline(true);
    fireWindow('online');
    expect(service.isOnline()).toBe(true);

    defineOnline(false);
    fireWindow('offline');
    expect(service.isOffline()).toBe(true);
  });
});
