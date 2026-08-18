import { HttpBackend, HttpClient, HttpHeaders } from '@angular/common/http';
import { Injectable, inject } from '@angular/core';
import { ApiConfiguration } from '@platform/api';
import { firstValueFrom, timeout } from 'rxjs';

/** Deletes confirmed-uncommitted media with the session that created it. */
@Injectable({ providedIn: 'root' })
export class SessionMediaCleanup {
  private readonly http = new HttpClient(inject(HttpBackend));
  private readonly configuration = inject(ApiConfiguration);

  async delete(ids: readonly string[], accessToken: string | null): Promise<boolean> {
    const unique = [...new Set(ids.filter(Boolean))];
    if (!unique.length) return true;
    if (!accessToken) return false;
    const headers = new HttpHeaders({ Authorization: `Bearer ${accessToken}` });
    const results = await Promise.allSettled(unique.map(id => firstValueFrom(this.http.delete(
      `${this.configuration.rootUrl}/api/v1/media/${encodeURIComponent(id)}`,
      { headers, observe: 'response' },
    ).pipe(timeout(5_000)))));
    return results.every(result => result.status === 'fulfilled');
  }
}
