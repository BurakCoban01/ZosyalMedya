import { readdir, readFile } from 'node:fs/promises';
import { execFile } from 'node:child_process';
import path from 'node:path';
import { promisify } from 'node:util';

const password = 'Strong!Pass12345';
const runFile = promisify(execFile);
const containerPickupDirectory = '/app/.local/email-pickup';

function pickupDirectories() {
  if (process.env.EMAIL_PICKUP_DIR) return [path.resolve(process.env.EMAIL_PICKUP_DIR)];
  return [path.resolve('.local/email-pickup'), path.resolve('src/Host/Api/.local/email-pickup')];
}

async function currentPickupFiles() {
  const files = new Set();
  for (const directory of pickupDirectories()) {
    const names = await readdir(directory).catch(() => []);
    for (const name of names) files.add(path.join(directory, name));
  }
  for (const name of await containerFileNames()) files.add(`container:${name}`);
  return files;
}

async function containerFileNames() {
  const container = process.env.EMAIL_PICKUP_CONTAINER;
  if (!container) return [];
  const result = await runFile('docker', ['exec', container, 'ls', '-1', containerPickupDirectory]).catch(() => null);
  return result?.stdout.split(/\r?\n/).filter(Boolean) ?? [];
}

async function readContainerMessage(name) {
  const container = process.env.EMAIL_PICKUP_CONTAINER;
  if (!container || name.includes('/') || name.includes('\\')) return '';
  const result = await runFile('docker', ['exec', container, 'cat', `${containerPickupDirectory}/${name}`]).catch(() => null);
  return result?.stdout ?? '';
}

async function identityRequest(request, pathName, init) {
  try { return await request(pathName, init); }
  catch (error) {
    if (!(error instanceof Error) || !error.message.includes('-> 429')) throw error;
    // API'nin identity-write politikası IP başına bir dakikalık sabit penceredir.
    await new Promise(resolve => setTimeout(resolve, 61_000));
    return request(pathName, init);
  }
}

async function findVerificationToken(email, existingFiles) {
  const deadline = Date.now() + 10_000;
  while (Date.now() < deadline) {
    for (const directory of pickupDirectories()) {
      const names = await readdir(directory).catch(() => []);
      for (const name of names) {
        const fullName = path.join(directory, name);
        if (existingFiles.has(fullName)) continue;
        const message = await readFile(fullName, 'utf8').catch(() => '');
        if (!message.includes(`To: ${email}`)) continue;
        const match = message.match(/\/auth\/verify-email\?token=([^\s]+)/);
        if (match) return decodeURIComponent(match[1]);
      }
    }
    for (const name of await containerFileNames()) {
      if (existingFiles.has(`container:${name}`)) continue;
      const message = await readContainerMessage(name);
      if (!message.includes(`To: ${email}`)) continue;
      const match = message.match(/\/auth\/verify-email\?token=([^\s]+)/);
      if (match) return decodeURIComponent(match[1]);
    }
    await new Promise(resolve => setTimeout(resolve, 100));
  }
  throw new Error(`Doğrulama e-postası bulunamadı (${email}). EMAIL_PICKUP_DIR ile yerel pickup klasörünü belirtin.`);
}

export async function registerVerifyAndLogin(request, username, deviceName) {
  const email = `${username}@example.test`;
  const existingFiles = await currentPickupFiles();
  const registered = await identityRequest(request, '/api/v1/identity/register', {
    method: 'POST', body: JSON.stringify({ username, email, password })
  });
  const token = await findVerificationToken(email, existingFiles);
  await identityRequest(request, '/api/v1/identity/email-verification/confirm', {
    method: 'POST', body: JSON.stringify({ token })
  });
  const login = await identityRequest(request, '/api/v1/identity/login', {
    method: 'POST',
    body: JSON.stringify({ login: username, password, deviceId: crypto.randomUUID(), deviceName })
  });
  return { registered, login };
}
