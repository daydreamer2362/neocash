// ═══════════════════════════════════════════════════════
//  API Client — NeoCash Admin
// ═══════════════════════════════════════════════════════
const configuredBase = String(window.__ADMIN_API_BASE__ || '').trim().replace(/\/+$/, '');
const API_BASE = configuredBase || window.location.origin;

class AdminAPI {
  constructor() { this.token = localStorage.getItem('admin_token') || ''; }

  setToken(t) { this.token = t; localStorage.setItem('admin_token', t); }
  clearToken() { this.token = ''; localStorage.removeItem('admin_token'); }

  async request(method, path, body = null) {
    const opts = {
      method,
      headers: { 'Content-Type': 'application/json' },
    };
    if (this.token) opts.headers['Authorization'] = `Bearer ${this.token}`;
    if (body) opts.body = JSON.stringify(body);
    const res = await fetch(`${API_BASE}${path}`, opts);
    const data = await res.json();
    if (!res.ok || data.code !== 1000) throw new Error(data.msg || 'Request failed');
    return data.data;
  }

  get(p, q = {}) {
    const qs = new URLSearchParams(Object.entries(q).filter(([, v]) => v !== undefined && v !== '')).toString();
    return this.request('GET', qs ? `${p}?${qs}` : p);
  }
  post(p, b) { return this.request('POST', p, b); }
  put(p, b) { return this.request('PUT', p, b); }
  del(p) { return this.request('DELETE', p); }

  // Auth
  login(phone, password) { return this.post('/admin/login', { phone, password }); }
  createAdminAccount(payload) { return this.post('/admin/register', payload); }
  // Dashboard
  dashboard() { return this.get('/admin/dashboard'); }
  statistics(s, e) { return this.get('/admin/statistics', { startDate: s, endDate: e }); }
  referralSettings() { return this.get('/admin/referral/settings'); }
  updateReferralSettings(d) { return this.post('/admin/referral/settings', d); }
  systemSettings() { return this.get('/admin/system/settings'); }
  updateSystemSettings(d) { return this.post('/admin/system/settings', d); }
  // Orders
  generateOrders(d) { return this.post('/admin/orders/generate', d); }
  listOrders(q) { return this.get('/admin/orders/list', q); }
  editOrder(id, d) { return this.put(`/admin/orders/${id}`, d); }
  deleteOrder(id) { return this.del(`/admin/orders/${id}`); }
  purchasedOrders(q) { return this.get('/admin/orders/purchased', q); }
  markSold(buyId) { return this.post('/admin/orders/mark-sold', { buyId }); }
  markFailed(buyId, reason) { return this.post('/admin/orders/mark-failed', { buyId, reason }); }
  transferOrder(buyId) { return this.post('/admin/orders/transfer', { buyId }); }
  // Collection
  collectionList(q) { return this.get('/admin/collection/list', q); }
  verifyCollection(id, action, reason) { return this.post(`/admin/collection/${id}/verify`, { action, reason }); }
  // Payment Orders
  paymentOrdersList(q) { return this.get('/admin/payment-orders/list', q); }
  createPaymentOrder(d) { return this.post('/admin/payment-orders/create', d); }
  updatePaymentStatus(id, status, merchantId) { return this.put(`/admin/payment-orders/${id}/status`, { status, merchantId }); }
  // History
  historyList(q) { return this.get('/admin/history/list', q); }
  // Security
  securityEvents(q) { return this.get('/admin/security/events', q); }
  securityStats() { return this.get('/admin/security/stats'); }
  resolveSecurity(id) { return this.post(`/admin/security/${id}/resolve`, {}); }
  securityConfig() { return this.get('/admin/security-control/config'); }
  updateSecurityConfig(d) { return this.post('/admin/security-control/config', d); }
  testSecurityAlert(d) { return this.post('/admin/security-control/test-alert', d); }
  networkOverview() { return this.get('/admin/security-control/network/overview'); }
  networkTop(q) { return this.get('/admin/security-control/network/top', q || {}); }
  networkErrors(q) { return this.get('/admin/security-control/network/errors', q || {}); }
  networkPathHealth(q) { return this.get('/admin/security-control/network/path-health', q || {}); }
  networkFailureTimeline(q) { return this.get('/admin/security-control/network/failure-timeline', q || {}); }
  networkReliability(q) { return this.get('/admin/security-control/network/reliability', q || {}); }
  networkFailures(q) { return this.get('/admin/security-control/network/failures', q || {}); }
  storageStatus() { return this.get('/admin/security-control/storage/status'); }
  // Offline
  offlineList(q) { return this.get('/admin/offline/list', q); }
  createOffline(d) { return this.post('/admin/offline/create', d); }
  updateOfflineStatus(id, status) { return this.put(`/admin/offline/${id}/status`, { status }); }
  // UPI Accounts
  upiList(q) { return this.get('/admin/upi-accounts/list', q); }
  createUPI(d) { return this.post('/admin/upi-accounts/create', d); }
  editUPI(id, d) { return this.put(`/admin/upi-accounts/${id}`, d); }
  deleteUPI(id) { return this.del(`/admin/upi-accounts/${id}`); }
  toggleUPI(id) { return this.post(`/admin/upi-accounts/${id}/toggle`); }
  // Tasks
  taskList(q) { return this.get('/admin/tasks/list', q); }
  createTask(d) { return this.post('/admin/tasks/create', d); }
  editTask(id, d) { return this.put(`/admin/tasks/${id}`, d); }
  deleteTask(id) { return this.del(`/admin/tasks/${id}`); }
  toggleTask(id) { return this.post(`/admin/tasks/${id}/toggle`); }
  // Users
  userList(q) { return this.get('/admin/users', q); }
  updateBalance(d) { return this.post('/admin/users/update-balance', d); }
  toggleUser(id) { return this.post(`/admin/users/${id}/toggle-active`); }
  // Ready To Sell
  readyToSellList(q) { return this.get('/admin/ready-to-sell', q); }
  readyToSellBalanceHistory(userId, q = {}) { return this.get(`/admin/ready-to-sell/${userId}/balance-history`, q); }
  createReadyToSellOrder(d) { return this.post('/admin/ready-to-sell/create-order', d); }
  // USDT
  usdtSettings() { return this.get('/admin/usdt/settings'); }
  updateUsdtSettings(d) { return this.post('/admin/usdt/settings', d); }
  usdtOrders(q) { return this.get('/admin/usdt/orders', q); }
  approveUsdtOrder(id) { return this.post(`/admin/usdt/orders/${id}/approve`, {}); }
  rejectUsdtOrder(id, rejectReason) { return this.post(`/admin/usdt/orders/${id}/reject`, { rejectReason }); }
  // Carousel
  carouselConfig() { return this.get('/admin/carousel/config'); }
  updateCarouselConfig(d) { return this.post('/admin/carousel/config', d); }
  addCarouselOrder(d) { return this.post('/admin/carousel/orders/add', d); }
  removeCarouselOrder(d) { return this.post('/admin/carousel/orders/remove', d); }
  createCarouselOrder(d) { return this.post('/admin/carousel/orders/create', d); }
  // Hero Carousel
  heroCarouselList() { return this.get('/admin/carousel/hero'); }
  heroCarouselSave(d) { return this.post('/admin/carousel/hero', d); }
  heroCarouselDelete(id) { return this.post('/admin/carousel/hero/delete', { id }); }
  heroCarouselToggle(enabled) { return this.post('/admin/carousel/hero/toggle', { enabled }); }
}

window.api = new AdminAPI();
