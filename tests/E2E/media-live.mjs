import { registerVerifyAndLogin } from './identity-helper.mjs';

const baseUrl = process.env.API_URL ?? 'http://127.0.0.1:5087';
const suffix = crypto.randomUUID().replaceAll('-', '').slice(0, 10);

async function json(path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) }
  });
  const body = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${init.method ?? 'GET'} ${path} -> ${response.status}: ${JSON.stringify(body)}`);
  return body;
}

const username = `media${suffix}`;
const { login } = await registerVerifyAndLogin(json, username, 'media-e2e');
const authorization = `Bearer ${login.tokens.accessToken}`;
const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+A8AAQUBAScY42YAAAAASUVORK5CYII=', 'base64');
const initiated = await json('/api/v1/media/', {
  method: 'POST', headers: { authorization },
  body: JSON.stringify({ fileName: '../avatar.png', contentType: 'image/png', size: png.length, visibility: 'Public' })
});
const uploadedResponse = await fetch(`${baseUrl}${initiated.uploadUrl}`, {
  method: 'PUT', headers: { authorization, 'content-type': 'image/png' }, body: png
});
const uploaded = await uploadedResponse.json();
if (!uploadedResponse.ok) throw new Error(`upload -> ${uploadedResponse.status}: ${JSON.stringify(uploaded)}`);
const original = await fetch(`${baseUrl}${uploaded.urls.original}`);
const variant = await fetch(`${baseUrl}${uploaded.urls['w320.webp']}`);
const originalBytes = new Uint8Array(await original.arrayBuffer());
const variantBytes = new Uint8Array(await variant.arrayBuffer());
const deleted = await fetch(`${baseUrl}/api/v1/media/${uploaded.id}`, { method: 'DELETE', headers: { authorization } });
const afterDelete = await fetch(`${baseUrl}${uploaded.urls.original}`);
const result = {
  id: uploaded.id,
  normalizedFileName: uploaded.fileName,
  status: uploaded.status,
  originalStatus: original.status,
  variantStatus: variant.status,
  originalBytes: originalBytes.length,
  variantBytes: variantBytes.length,
  deleteStatus: deleted.status,
  afterDeleteStatus: afterDelete.status
};
if (result.normalizedFileName !== 'avatar.png' || result.status !== 'Ready' || result.originalStatus !== 200 ||
    result.variantStatus !== 200 || result.originalBytes < 1 || result.variantBytes < 1 ||
    result.deleteStatus !== 204 || result.afterDeleteStatus !== 404)
  throw new Error(`Media E2E failed: ${JSON.stringify(result)}`);
console.log(JSON.stringify(result));
