const STORAGE_KEY = '__BASEURL_PREF__';

function getStorageMap() {
  if (typeof window === 'undefined') return {};
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch (e) {
    return {};
  }
}

function setStorageMap(value) {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(STORAGE_KEY, JSON.stringify(value || {}));
  } catch (e) {}
}

export function normalizeHttpUrl(url) {
  const trimmed = String(url || '').trim();
  if (!trimmed) return '';
  if (!/^https?:\/\//i.test(trimmed)) return '';
  return trimmed.replace(/\/+$/, '');
}

export function getStoredBaseUrl(env) {
  const map = getStorageMap();
  return normalizeHttpUrl(map?.[env] || '');
}

export function setStoredBaseUrl(env, url) {
  const normalized = normalizeHttpUrl(url);
  if (!normalized || !env) return;
  const map = getStorageMap();
  map[env] = normalized;
  setStorageMap(map);
}

export function clearStoredBaseUrl(env) {
  if (!env) return;
  const map = getStorageMap();
  if (!map || typeof map !== 'object') return;
  if (!map[env]) return;
  delete map[env];
  setStorageMap(map);
}

export function buildUrl(base, path) {
  const cleanPath = String(path || '');
  if (/^https?:\/\//i.test(cleanPath)) return cleanPath;
  if (!base) return cleanPath;
  const b = String(base).replace(/\/+$/, '');
  const p = cleanPath.startsWith('/') ? cleanPath : `/${cleanPath}`;
  return `${b}${p}`;
}

export function getCandidateBaseUrls(env, configuredCandidates = [], opts = {}) {
  const includeOrigin = Boolean(opts.includeOrigin);
  const strictStoredOnly = Boolean(opts.strictStoredOnly);
  const deduped = [];
  const seen = new Set();

  const add = (url) => {
    const normalized = normalizeHttpUrl(url);
    if (!normalized || seen.has(normalized)) return;
    seen.add(normalized);
    deduped.push(normalized);
  };

  let stored = getStoredBaseUrl(env);
  // A cached "last working" URL is only trustworthy if it's still one of the
  // URLs this build is actually configured to talk to. Otherwise it's left
  // over from a previous deployment pointing at a different backend (e.g.
  // after moving the API to a new host) - trying it first just wastes a
  // round trip against a host that will reject us (often via CORS, since it
  // has no reason to allowlist this origin).
  const configuredSet = new Set((configuredCandidates || []).map(normalizeHttpUrl).filter(Boolean));
  if (stored && configuredSet.size && !configuredSet.has(stored)) {
    clearStoredBaseUrl(env);
    stored = '';
  }

  if (strictStoredOnly && stored) {
    add(stored);
    return deduped;
  }

  add(stored);
  (configuredCandidates || []).forEach(add);
  if (includeOrigin && typeof window !== 'undefined') add(window.location.origin);

  return deduped;
}
