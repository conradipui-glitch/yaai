import { randomBytes, timingSafeEqual } from 'node:crypto';

function error(status, message) { return { status, error: message }; }
function hostIsLocal(host, port) {
  return host === '127.0.0.1:' + port || host === 'localhost:' + port;
}

export function createLocalHttpGuard({ port, maxPaidRequests = 100, token = randomBytes(32).toString('hex') } = {}) {
  if (!Number.isInteger(port) || port < 1 || port > 65535) throw new Error('Invalid local server port');
  if (!Number.isInteger(maxPaidRequests) || maxPaidRequests < 1 || maxPaidRequests > 1000) {
    throw new Error('maxPaidRequests must be 1–1000');
  }
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('Invalid local request token');
  let paidAttempts = 0;

  function check(req) {
    const host = String(req.headers.host || '').toLowerCase();
    if (!hostIsLocal(host, port)) return error(403, 'Request Host is not the local yaai server');
    const origin = req.headers.origin;
    if (origin != null && origin !== 'http://' + host) return error(403, 'Cross-origin request denied');
    const fetchSite = req.headers['sec-fetch-site'];
    if (fetchSite && !['same-origin', 'none'].includes(fetchSite)) {
      return error(403, 'Cross-site request denied');
    }
    if (req.method !== 'POST') return null;
    if (!/^application\/json(?:\s*;|$)/i.test(String(req.headers['content-type'] || ''))) {
      return error(415, 'Only application/json POST is allowed');
    }
    const received = String(req.headers['x-yaai-local-token'] || '');
    const a = Buffer.from(received), b = Buffer.from(token);
    if (a.length !== b.length || !timingSafeEqual(a, b)) {
      return error(403, 'Missing or invalid local request token');
    }
    return null;
  }

  function reservePaidRequest() {
    if (paidAttempts >= maxPaidRequests) {
      const ex = new Error('Local Yandex API request budget exhausted; restart only after reviewing costs');
      ex.status = 429;
      throw ex;
    }
    paidAttempts++;
    // This is a hard cap on attempts from this local server process, not a currency budget.
    return { paidAttempts, paidRequestsRemaining: maxPaidRequests - paidAttempts };
  }

  return {
    check,
    reservePaidRequest,
    token,
    stats: () => ({ paidAttempts, maxPaidRequests, paidRequestsRemaining: maxPaidRequests - paidAttempts }),
  };
}
