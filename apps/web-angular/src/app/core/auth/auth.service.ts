import { Injectable } from '@angular/core';
import { Api, browserLogin, browserLogout, confirmEmailVerification, confirmPasswordReset, getPublicDemoStatus, PublicDemoMailboxMessage, PublicDemoStatus, readPublicDemoMailbox, register, requestEmailVerification, requestPasswordReset } from '@platform/api';
import { TokenVault } from './token-vault.service';

@Injectable({ providedIn: 'root' })
export class AuthService {
  constructor(private readonly api: Api, private readonly vault: TokenVault) {}

  async login(loginValue: string, password: string, mfaCode?: string): Promise<void> {
    const result = await this.api.invoke(browserLogin, { body: { login: loginValue, password, deviceId: this.deviceId(), deviceName: 'Web tarayıcısı', mfaCode: mfaCode || null } });
    await this.vault.set(result);
  }

  async register(username: string, email: string, password: string): Promise<void> {
    await this.api.invoke(register, { body: { username, email, password } });
  }

  async getPublicDemoStatus(): Promise<PublicDemoStatus> { return this.api.invoke(getPublicDemoStatus); }
  async listPublicDemoMailbox(email: string): Promise<PublicDemoMailboxMessage[]> {
    return this.api.invoke(readPublicDemoMailbox, { body: { email } });
  }

  async requestVerification(email: string): Promise<void> { await this.api.invoke(requestEmailVerification, { body: { email } }); }
  async verifyEmail(token: string): Promise<void> { await this.api.invoke(confirmEmailVerification, { body: { token } }); }
  async requestPasswordReset(email: string): Promise<void> { await this.api.invoke(requestPasswordReset, { body: { email } }); }
  async resetPassword(token: string, newPassword: string): Promise<void> { await this.api.invoke(confirmPasswordReset, { body: { token, newPassword } }); }

  async logout(): Promise<void> {
    const csrf = this.vault.csrfToken();
    if (csrf) await this.api.invoke(browserLogout, { 'X-CSRF-Token': csrf }).catch(() => undefined);
    await this.vault.clear();
  }

  private deviceId(): string {
    const key = 'escp-device-id';
    const existing = sessionStorage.getItem(key);
    if (existing) return existing;
    const value = crypto.randomUUID();
    sessionStorage.setItem(key, value);
    return value;
  }
}
