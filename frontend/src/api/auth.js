import { storage } from '../utils/storage';
import { getCookie, removeCookie, setCookie } from '../utils/cookie';

// 29 days for access token
const TOKEN_TTL = 2505600000;
// 60 days for refresh token
const REFRESH_TTL = 5184000000;
const COOKIE_TOKEN_KEY = 'gp_token';
const COOKIE_REFRESH_KEY = 'gp_refresh_token';

export const auth = {
  getToken() {
    return storage.get('token') || getCookie(COOKIE_TOKEN_KEY);
  },

  getRefreshToken() {
    return storage.get('refresh_token') || getCookie(COOKIE_REFRESH_KEY);
  },

  getUserId() {
    return storage.get('user_id');
  },
  
  getUsername() {
    return storage.get('username');
  },

  authHeader() {
    const token = this.getToken();
    if (!token) return {};
    return {
      'Authorization': `Bearer ${token}`,
      'token': token
    };
  },

  onLoginSuccess(data) {
    if (data.token) {
      storage.set('token', data.token, TOKEN_TTL);
      setCookie(COOKIE_TOKEN_KEY, data.token, TOKEN_TTL);
    }
    if (data.refreshToken) {
      storage.set('refresh_token', data.refreshToken, REFRESH_TTL);
      setCookie(COOKIE_REFRESH_KEY, data.refreshToken, REFRESH_TTL);
    }
    if (data.userName || data.username) storage.set('username', data.userName || data.username, TOKEN_TTL);
    if (data.userId || data.id) storage.set('user_id', data.userId || data.id, TOKEN_TTL);
    if (data.inviteCode) storage.set('invite_code', data.inviteCode, TOKEN_TTL);
    if (data.invite) storage.set('invite', data.invite, TOKEN_TTL);
  },

  renewTokenTTL() {
    storage.touch('token');
    storage.touch('username');
    storage.touch('user_id');
    storage.touch('invite_code');
    storage.touch('invite');
    const token = this.getToken();
    const refreshToken = this.getRefreshToken();
    if (token) setCookie(COOKIE_TOKEN_KEY, token, TOKEN_TTL);
    if (refreshToken) setCookie(COOKIE_REFRESH_KEY, refreshToken, REFRESH_TTL);
  },

  clearAuth() {
    storage.remove('token');
    storage.remove('refresh_token');
    removeCookie(COOKIE_TOKEN_KEY);
    removeCookie(COOKIE_REFRESH_KEY);
    storage.remove('username');
    storage.remove('user_id');
    storage.remove('invite_code');
    storage.remove('invite');
  }
};
