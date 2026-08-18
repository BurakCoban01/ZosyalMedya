import { registerVerifyAndLogin } from './identity-helper.mjs';

const baseUrl = process.env.API_URL ?? 'http://127.0.0.1:5088';
const suffix = crypto.randomUUID().replaceAll('-', '').slice(0, 10);
async function request(path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, { ...init, headers: { 'content-type': 'application/json', ...(init.headers ?? {}) } });
  const body = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${init.method ?? 'GET'} ${path} -> ${response.status}: ${JSON.stringify(body)}`);
  return body;
}
const username = `search${suffix}`;
const { registered, login } = await registerVerifyAndLogin(request, username, 'search-e2e');
const headers = { authorization: `Bearer ${login.tokens.accessToken}` };
await request('/api/v1/profiles/me', { method: 'PUT', headers, body: JSON.stringify({ handle: username, displayName: `Arama Mimari ${suffix}`, biography: 'Modüler sistemler üzerine notlar', location: null, organization: 'Mimari Atölyesi', websiteUrl: null, profileMediaId: null, coverMediaId: null, isPrivate: false, theme: 'System', language: 'Turkish', reduceMotion: false }) });
const post = await request('/api/v1/content/', { method: 'POST', headers, body: JSON.stringify({ text: `Dikey dilim mimarisi ${suffix} #mimari`, mediaIds: [], visibility: 'Public', shareKind: 'Original', originalPostId: null, linkUrl: null, contentWarning: null, isSensitive: false, isDraft: false, publishAtUtc: null }) });
const community = await request('/api/v1/communities/', { method: 'POST', headers, body: JSON.stringify({ slug: `mimari-${suffix}`, name: `Mimari Topluluğu ${suffix}`, description: 'Bounded context çalışma grubu', visibility: 'Public' }) });
const query = await request(`/api/v1/search/?q=${encodeURIComponent(suffix)}&limit=20`, { headers });
const typo = await request('/api/v1/search/?q=mimary&limit=20');
const recent = await request('/api/v1/search/recent', { headers });
const trending = await request('/api/v1/search/trending');
const types = new Set(query.items.map(item => item.type));
const result = { userId: registered.userId, postId: post.id, communityId: community.id, types: [...types], typoCount: typo.items.length, recent, trendingHasMimari: trending.some(item => item.tag === 'mimari') };
if (!types.has('Profile') || !types.has('Content') || !types.has('Community') || !recent.includes(suffix)) throw new Error(`Search E2E failed: ${JSON.stringify(result)}`);
console.log(JSON.stringify(result));
