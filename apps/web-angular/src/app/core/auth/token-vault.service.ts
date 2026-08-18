import { DOCUMENT } from '@angular/common';
import { HttpBackend, HttpClient } from '@angular/common/http';
import { Injectable, computed, inject, signal } from '@angular/core';
import { firstValueFrom } from 'rxjs';
import { browserRefresh, BrowserAccessToken } from '@platform/api';
import { environment } from '../../../environments/environment';

@Injectable({ providedIn: 'root' })
export class TokenVault {
  private readonly document = inject(DOCUMENT);
  private readonly rawHttp: HttpClient;
  private readonly tokens = signal<BrowserAccessToken | null>(null);
  private rotation: Promise<string | null> | null = null;
  private sessionEpoch = 0;
  private readonly beforeSessionChange = new Set<(accessToken: string | null) => Promise<unknown> | unknown>();

  readonly accessToken = computed(() => this.tokens()?.accessToken ?? null);
  readonly authenticated = computed(() => this.accessToken() !== null);
  readonly roles = computed(() => this.readRoles(this.accessToken()));

  constructor(backend: HttpBackend) { this.rawHttp = new HttpClient(backend); }

  async set(tokens: BrowserAccessToken): Promise<void> {
    const current = this.tokens();
    const transition = ++this.sessionEpoch;
    if (current && this.readSubject(current.accessToken) !== this.readSubject(tokens.accessToken))
      await this.notifyBeforeSessionChange(current.accessToken);
    if (transition === this.sessionEpoch) this.tokens.set(tokens);
  }

  async clear(): Promise<void> {
    const transition = ++this.sessionEpoch;
    await this.notifyBeforeSessionChange(this.accessToken());
    if (transition === this.sessionEpoch) this.tokens.set(null);
  }

  registerBeforeSessionChange(callback: (accessToken: string | null) => Promise<unknown> | unknown): () => void {
    this.beforeSessionChange.add(callback);
    return () => this.beforeSessionChange.delete(callback);
  }

  rotate(): Promise<string | null> {
    if (!this.rotation) {
      const sessionEpoch = this.sessionEpoch;
      const execute = () => this.refreshCookieSession(sessionEpoch);
      const locks = this.document.defaultView?.navigator.locks;
      const operation: Promise<string | null> = locks
        ? locks.request<Promise<string | null>>('escp-browser-refresh', execute).then(value => value)
        : execute();
      this.rotation = operation
        .finally(() => { this.rotation = null; });
    }
    return this.rotation!;
  }

  validAccessToken(minValidityMs = 30_000): Promise<string | null> {
    const current = this.tokens();
    if (!current) return this.rotate();
    const expiresAt = Date.parse(current.accessTokenExpiresAtUtc);
    return Number.isFinite(expiresAt) && expiresAt - Date.now() > minValidityMs
      ? Promise.resolve(current.accessToken)
      : this.rotate();
  }

  hasRole(role: string): boolean { return this.roles().includes(role); }

  csrfToken(): string | null {
    return this.readCookie('__Host-escp-browser-csrf') ?? this.readCookie('escp-browser-csrf');
  }

  private async refreshCookieSession(sessionEpoch: number): Promise<string | null> {
    if (sessionEpoch !== this.sessionEpoch) return null;
    const csrf = this.csrfToken();
    if (!csrf) return null;
    try {
      const response = await firstValueFrom(browserRefresh(this.rawHttp, environment.apiUrl, { 'X-CSRF-Token': csrf }));
      if (sessionEpoch !== this.sessionEpoch) return null;
      await this.set(response.body);
      return this.accessToken() === response.body.accessToken ? response.body.accessToken : null;
    } catch {
      if (sessionEpoch === this.sessionEpoch) await this.clear();
      return null;
    }
  }

  private readCookie(name: string): string | null {
    try {
      const prefix = `${encodeURIComponent(name)}=`;
      const item = this.document.cookie.split(';').map(value => value.trim()).find(value => value.startsWith(prefix));
      return item ? decodeURIComponent(item.slice(prefix.length)) : null;
    } catch { return null; }
  }

  private readRoles(accessToken: string | null): string[] {
    const role = this.readClaim(accessToken, 'role');
    return Array.isArray(role) ? role.filter((value): value is string => typeof value === 'string')
      : typeof role === 'string' ? [role] : [];
  }

  private readSubject(accessToken: string | null): string {
    const subject = this.readClaim(accessToken, 'sub');
    return typeof subject === 'string' ? subject : '';
  }

  private readClaim(accessToken: string | null, claim: string): unknown {
    if (!accessToken) return null;
    try {
      const payload = accessToken.split('.')[1];
      if (!payload) return null;
      const normalized = payload.replace(/-/g, '+').replace(/_/g, '/');
      return (JSON.parse(atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, '='))) as Record<string, unknown>)[claim];
    } catch { return null; }
  }

  private async notifyBeforeSessionChange(accessToken: string | null): Promise<void> {
    if (!accessToken || !this.beforeSessionChange.size) return;
    await Promise.allSettled([...this.beforeSessionChange].map(callback => Promise.resolve(callback(accessToken))));
  }
}
