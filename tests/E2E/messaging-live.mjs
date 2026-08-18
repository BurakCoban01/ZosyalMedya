import { HubConnectionBuilder } from '@microsoft/signalr';
import { registerVerifyAndLogin } from './identity-helper.mjs';

const baseUrl = process.env.API_URL ?? 'http://127.0.0.1:5084';
const provider = process.env.PERSISTENCE_PROVIDER ?? 'configured';
const suffix = crypto.randomUUID().replaceAll('-', '').slice(0, 10);

async function request(path, init = {}) {
  const response = await fetch(`${baseUrl}${path}`, {
    ...init,
    headers: { 'content-type': 'application/json', ...(init.headers ?? {}) }
  });
  const body = response.status === 204 ? null : await response.json().catch(() => null);
  if (!response.ok) throw new Error(`${init.method ?? 'GET'} ${path} -> ${response.status}: ${JSON.stringify(body)}`);
  return body;
}

async function createUser(prefix) {
  const username = `${prefix}${suffix}`;
  const { registered, login } = await registerVerifyAndLogin(request, username, 'messaging-e2e');
  const headers = { authorization: `Bearer ${login.tokens.accessToken}` };
  await request('/api/v1/profiles/me', {
    method: 'PUT', headers, body: JSON.stringify({
      handle: username, displayName: prefix, biography: null, location: null, organization: null,
      websiteUrl: null, profileMediaId: null, coverMediaId: null, isPrivate: false,
      theme: 'System', language: 'Turkish', reduceMotion: false
    })
  });
  return { ...registered, token: login.tokens.accessToken, headers };
}

const alice = await createUser('alice');
const bob = await createUser('bob');
const outsider = await createUser('outsider');
const conversation = await request('/api/v1/messaging/conversations', {
  method: 'POST', headers: alice.headers, body: JSON.stringify({ memberIds: [bob.userId], title: null })
});

const hub = new HubConnectionBuilder()
  .withUrl(`${baseUrl}/hubs/messaging`, { accessTokenFactory: () => bob.token })
  .withAutomaticReconnect()
  .build();
const liveNotice = new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error('SignalR messageReceived timeout')), 8000);
  hub.on('messageReceived', notice => { clearTimeout(timeout); resolve(notice); });
});
const liveNotification = new Promise((resolve, reject) => {
  const timeout = setTimeout(() => reject(new Error('SignalR notificationReceived timeout')), 8000);
  hub.on('notificationReceived', notification => { clearTimeout(timeout); resolve(notification); });
});
await hub.start();
await hub.invoke('JoinConversation', conversation.id);

const sent = await request(`/api/v1/messaging/conversations/${conversation.id}/messages`, {
  method: 'POST', headers: alice.headers,
  body: JSON.stringify({ text: 'Canlı ve kalıcı mesaj', mediaIds: [], replyToId: null })
});
const notice = await liveNotice;
const notificationNotice = await liveNotification;
await request(`/api/v1/messaging/conversations/${conversation.id}/messages`, {
  method: 'POST', headers: alice.headers,
  body: JSON.stringify({ text: 'Birleştirilecek ikinci mesaj', mediaIds: [], replyToId: null })
});
const bobPage = await request(`/api/v1/messaging/conversations/${conversation.id}/messages?limit=20`, { headers: bob.headers });
let messageNotification;
for (let attempt = 0; attempt < 30; attempt++) {
  const notificationPage = await request('/api/v1/notifications/?limit=20', { headers: bob.headers });
  messageNotification = notificationPage.items.find(item => item.type === 'Message' && item.deepLink.includes(conversation.id));
  if (messageNotification?.count === 2) break;
  await new Promise(resolve => setTimeout(resolve, 250));
}
if (!messageNotification) throw new Error('Mesaj bildirimi teslim edilmedi.');
const readNotification = await request(`/api/v1/notifications/${messageNotification.id}/read`, { method: 'PATCH', headers: bob.headers });
const outsiderResponse = await fetch(`${baseUrl}/api/v1/messaging/conversations/${conversation.id}/messages`, { headers: outsider.headers });
await hub.stop();

const result = {
  provider,
  conversationId: conversation.id,
  messageId: sent.id,
  liveDelivered: notice.messageId === sent.id,
  notificationLiveDelivered: notificationNotice.entityId === sent.id,
  notificationAggregated: messageNotification.count === 2,
  notificationRead: readNotification.isRead === true,
  persisted: bobPage.items.some(item => item.id === sent.id && item.text === 'Canlı ve kalıcı mesaj'),
  outsiderStatus: outsiderResponse.status,
  memberCount: conversation.members.length
};
if (!result.liveDelivered || !result.notificationLiveDelivered || !result.notificationAggregated || !result.notificationRead || !result.persisted || result.outsiderStatus !== 403 || result.memberCount !== 2)
  throw new Error(`Messaging E2E failed: ${JSON.stringify(result)}`);
console.log(JSON.stringify(result));
