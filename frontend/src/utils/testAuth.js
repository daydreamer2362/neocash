import { auth } from '../api/auth';

const TEST_USERS_KEY = '__TEST_USERS__';

export function isTestAuthEnabled() {
  return false;
}


function loadUsers() {
  try {
    const raw = localStorage.getItem(TEST_USERS_KEY);
    const parsed = raw ? JSON.parse(raw) : {};
    return parsed && typeof parsed === 'object' ? parsed : {};
  } catch (e) {
    return {};
  }
}

function saveUsers(users) {
  localStorage.setItem(TEST_USERS_KEY, JSON.stringify(users));
}

export function registerTestUser({ phone, username, password }) {
  const users = loadUsers();
  users[phone] = {
    phone,
    username: username || phone,
    password
  };
  saveUsers(users);
}

export function verifyTestLogin({ phone, password }) {
  const users = loadUsers();
  const user = users[phone];
  if (!user) return null;
  return user.password === password ? user : null;
}

export function resetTestPassword({ phone, password }) {
  const users = loadUsers();
  const user = users[phone];
  if (!user) return false;
  user.password = password;
  users[phone] = user;
  saveUsers(users);
  return true;
}

export function createTestSession({ phone, username }) {
  auth.onLoginSuccess({
    token: `test-token-${phone}`,
    username: username || phone,
    userId: `test-${phone}`,
    inviteCode: 'TEST'
  });
}

export function isTestSessionToken(token) {
  return String(token || '').startsWith('test-token-');
}
