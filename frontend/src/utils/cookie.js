export function setCookie(name, value, ttlMs = 0) {
  if (typeof document === 'undefined' || !name) return;
  const encodedName = encodeURIComponent(String(name));
  const encodedValue = encodeURIComponent(String(value || ''));
  let cookie = `${encodedName}=${encodedValue}; path=/; SameSite=Lax`;
  if (ttlMs > 0) {
    const expires = new Date(Date.now() + ttlMs).toUTCString();
    cookie += `; expires=${expires}`;
  }
  if (typeof window !== 'undefined' && window.location?.protocol === 'https:') {
    cookie += '; Secure';
  }
  document.cookie = cookie;
}

export function getCookie(name) {
  if (typeof document === 'undefined' || !name) return '';
  const encodedName = encodeURIComponent(String(name)) + '=';
  const parts = String(document.cookie || '').split(';');
  for (const part of parts) {
    const item = part.trim();
    if (item.startsWith(encodedName)) {
      return decodeURIComponent(item.slice(encodedName.length));
    }
  }
  return '';
}

export function removeCookie(name) {
  if (typeof document === 'undefined' || !name) return;
  const encodedName = encodeURIComponent(String(name));
  document.cookie = `${encodedName}=; expires=Thu, 01 Jan 1970 00:00:00 GMT; path=/; SameSite=Lax`;
}
