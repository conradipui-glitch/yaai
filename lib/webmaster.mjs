const API_BASE = 'https://api.webmaster.yandex.net/v4';

export function webmasterOAuthToken(env = process.env) {
  return String(env.YANDEX_WEBMASTER_OAUTH_TOKEN || env.YANDEX_WEBMASTER_TOKEN || env.YANDEX_OAUTH_TOKEN || '').trim();
}

export function createWebmasterClient({ token = webmasterOAuthToken(), fetchImpl = fetch } = {}) {
  if (!token) throw new Error('Webmaster OAuth token is missing. Wordstat YANDEX_API_KEY is a different credential; set YANDEX_WEBMASTER_OAUTH_TOKEN.');

  async function request(method, endpoint, body) {
    const response = await fetchImpl(`${API_BASE}${endpoint}`, {
      method,
      headers: {
        Authorization: `OAuth ${token}`,
        Accept: 'application/json',
        ...(body === undefined ? {} : { 'Content-Type': 'application/json' }),
      },
      ...(body === undefined ? {} : { body: JSON.stringify(body) }),
    });
    const text = await response.text();
    let data;
    try { data = text ? JSON.parse(text) : {}; } catch { data = { message: 'Non-JSON API response' }; }
    if (!response.ok) {
      const reason = data?.error_code || data?.code || data?.error?.message || data?.message || `HTTP ${response.status}`;
      throw new Error(`Webmaster ${method} ${endpoint}: HTTP ${response.status}: ${reason}`);
    }
    return data;
  }

  const scope = (userId, hostId) => `/user/${encodeURIComponent(userId)}/hosts/${encodeURIComponent(hostId)}`;
  return {
    user: () => request('GET', '/user'),
    hosts: (userId) => request('GET', `/user/${encodeURIComponent(userId)}/hosts`),
    limits: (userId, hostId) => request('GET', `${scope(userId, hostId)}/pro/limits`),
    dates: (userId, hostId) => request('GET', `${scope(userId, hostId)}/pro/serp/dates`),
    regions: (userId, hostId) => request('GET', `${scope(userId, hostId)}/pro/regions`),
    start: (userId, hostId, { dates, paths, regionIds = [], useProTariff = false }) => {
      if (!Array.isArray(dates) || !dates.length || !dates.every((date) => /^\d{4}-\d{2}-\d{2}$/.test(date))) {
        throw new Error('Provide one or more dates in YYYY-MM-DD format.');
      }
      if (!Array.isArray(paths) || !paths.length || !paths.every((item) => typeof item === 'string' && item.startsWith('/') && !item.startsWith('//'))) {
        throw new Error('Provide URL paths starting with a single slash.');
      }
      if (dates.length + paths.length > 100) throw new Error('Webmaster export allows at most 100 dates + paths per task. Split the request.');
      return request('POST', `${scope(userId, hostId)}/pro/serp/queries/download/`, {
        dates,
        paths,
        region_ids: regionIds,
        use_pro_tariff: String(Boolean(useProTariff)),
      });
    },
    status: (userId, hostId, taskId) => {
      if (!/^[a-z0-9-]{10,80}$/i.test(String(taskId))) throw new Error('Invalid export task ID.');
      return request('GET', `${scope(userId, hostId)}/pro/serp/queries/download/${encodeURIComponent(taskId)}`);
    },
  };
}

export function matchVerifiedHost(hosts, siteUrl) {
  const expected = new URL(siteUrl);
  const candidates = (hosts || []).filter((host) => host.verified === true && host.ascii_host_url);
  const matched = candidates.filter((host) => {
    const found = new URL(host.ascii_host_url);
    return found.protocol === expected.protocol && found.host === expected.host;
  });
  if (matched.length !== 1) throw new Error(`Expected one verified Webmaster host for ${expected.origin}; found ${matched.length}.`);
  return matched[0];
}
