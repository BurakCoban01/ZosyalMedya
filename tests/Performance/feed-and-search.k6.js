import http from 'k6/http';
import { check, sleep } from 'k6';

export const options = {
  scenarios: { read_path: { executor: 'ramping-vus', startVUs: 1, stages: [{ duration: '20s', target: 20 }, { duration: '40s', target: 20 }, { duration: '10s', target: 0 }] } },
  thresholds: { http_req_failed: ['rate<0.01'], http_req_duration: ['p(95)<400'], checks: ['rate>0.99'] }
};
const baseUrl = __ENV.API_URL || 'http://127.0.0.1:5084';
export function setup() {
  if (!__ENV.ACCESS_TOKEN) throw new Error('ACCESS_TOKEN zorunludur; provision-load-user.mjs ile üretin.');
  return { token: __ENV.ACCESS_TOKEN };
}
export default function(data) {
  const headers = { authorization: `Bearer ${data.token}` };
  const feed = http.get(`${baseUrl}/api/v1/feed/Discovery?limit=20`, { headers });
  const search = http.get(`${baseUrl}/api/v1/search/?q=mimari&limit=20`, { headers });
  check(feed, { 'feed 200': response => response.status === 200 });
  check(search, { 'search 200': response => response.status === 200 });
  sleep(0.5);
}
