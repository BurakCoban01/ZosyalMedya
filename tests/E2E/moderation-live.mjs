import { registerVerifyAndLogin } from './identity-helper.mjs';

const baseUrl = process.env.API_URL ?? 'http://127.0.0.1:5089';
const administratorLogin = process.env.E2E_ADMIN_LOGIN;
const administratorPassword = process.env.E2E_ADMIN_PASSWORD;
if (!administratorLogin || !administratorPassword) throw new Error('E2E_ADMIN_LOGIN ve E2E_ADMIN_PASSWORD zorunludur.');
const suffix = crypto.randomUUID().replaceAll('-', '').slice(0, 10);
async function request(path, init = {}, allowError = false) {
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers: { 'content-type': 'application/json', ...(init.headers ?? {}) } });
  const body = response.status === 204 ? null : await response.json().catch(() => null);
  if (!allowError && !response.ok) throw new Error(`${init.method ?? 'GET'} ${path} -> ${response.status}: ${JSON.stringify(body)}`);
  return allowError ? { status: response.status, body } : body;
}
async function createUser(prefix) {
  const username = `${prefix}${suffix}`;
  const { registered, login } = await registerVerifyAndLogin(request, username, 'moderation-e2e');
  return { ...registered, headers: { authorization: `Bearer ${login.tokens.accessToken}` } };
}
const reporter = await createUser('reporter');
const target = await createUser('target');
const adminLogin = await request('/api/v1/identity/login', { method: 'POST', body: JSON.stringify({ login: administratorLogin, password: administratorPassword, deviceId: crypto.randomUUID(), deviceName: 'moderation-admin-e2e' }) });
const adminHeaders = { authorization: `Bearer ${adminLogin.tokens.accessToken}` };
const subjectId = crypto.randomUUID();
const report = await request('/api/v1/moderation/reports', { method: 'POST', headers: reporter.headers, body: JSON.stringify({ subjectType: 'Content', subjectId, reason: 'Harassment', details: 'Tekrarlanan taciz içeriği için açıklamalı rapor.', evidenceReferences: ['media:evidence-1'] }) });
const item = await request(`/api/v1/moderation/reports/${report.id}/triage`, { method: 'POST', headers: adminHeaders, body: JSON.stringify({ targetUserId: target.userId }) });
const expiresAtUtc = new Date(Date.now() + 86400000).toISOString();
await request(`/api/v1/moderation/cases/${item.id}`, { method: 'PATCH', headers: adminHeaders, body: JSON.stringify({ change: 'ApplyAction', assigneeId: null, reason: 'İnceleme sonucunda geçici yayın kısıtlaması.', enforcement: 'TemporaryPublishRestriction', expiresAtUtc, appealAccepted: null }) });
const blocked = await request('/api/v1/content/', { method: 'POST', headers: target.headers, body: JSON.stringify({ text: 'Kısıtlı gönderi denemesi', mediaIds: [], visibility: 'Public', shareKind: 'Original', originalPostId: null, linkUrl: null, contentWarning: null, isSensitive: false, isDraft: false, publishAtUtc: null }) }, true);
await request(`/api/v1/moderation/cases/${item.id}/appeal`, { method: 'POST', headers: target.headers, body: JSON.stringify({ text: 'Karara yeni kanıtlarla itiraz ediyorum.' }) });
await request(`/api/v1/moderation/cases/${item.id}`, { method: 'PATCH', headers: adminHeaders, body: JSON.stringify({ change: 'DecideAppeal', assigneeId: null, reason: 'Yeni kanıtlar itirazı doğruladı.', enforcement: null, expiresAtUtc: null, appealAccepted: true }) });
const allowed = await request('/api/v1/content/', { method: 'POST', headers: target.headers, body: JSON.stringify({ text: `İtiraz sonrası izinli gönderi ${suffix}`, mediaIds: [], visibility: 'Public', shareKind: 'Original', originalPostId: null, linkUrl: null, contentWarning: null, isSensitive: false, isDraft: false, publishAtUtc: null }) }, true);
const audit = await request(`/api/v1/administration/audit/?targetType=ModerationCase&limit=20`, { headers: adminHeaders });
const result = { reportId: report.id, caseId: item.id, blockedStatus: blocked.status, allowedStatus: allowed.status, auditCount: audit.length };
if (blocked.status !== 403 || allowed.status !== 201 || audit.length < 3) throw new Error(`Moderation E2E failed: ${JSON.stringify(result)}`);
console.log(JSON.stringify(result));
