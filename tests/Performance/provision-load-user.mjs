import { registerVerifyAndLogin } from '../E2E/identity-helper.mjs';

const baseUrl = process.env.API_URL ?? 'http://127.0.0.1:5084';
const username = `load${Date.now()}`;

async function request(path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) }
  });
  const body = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${init.method ?? 'GET'} ${path} -> ${response.status}: ${JSON.stringify(body)}`);
  return body;
}

const { login } = await registerVerifyAndLogin(request, username, 'k6-load');
process.stdout.write(login.tokens.accessToken);
