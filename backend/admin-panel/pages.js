// ═══════════════════════════════════════════════════════
//  Page Renderers — NeoCash Admin
// ═══════════════════════════════════════════════════════

// Utility functions
function badge(status) {
  const s = (status || '').toUpperCase();
  const cls = {
    SUCCESS: 'badge-success', PENDING: 'badge-pending', FAILED: 'badge-failed',
    READY: 'badge-ready', CLAIMED: 'badge-claimed', SUBMITTED: 'badge-submitted',
    CANCELLED: 'badge-cancelled', PROCESSING: 'badge-processing',
    APPROVED: 'badge-success', REJECTED: 'badge-failed',
    TIMEOUT: 'badge-failed', EXPIRED: 'badge-cancelled'
  }[s] || 'badge-pending';
  return `<span class="badge ${cls}">${s}</span>`;
}
function taskTypeBadge(t) {
  const cls = { newbie_tasks: 'badge-type-newbie', daily_tasks: 'badge-type-daily', invite_tasks: 'badge-type-invite' }[t] || 'badge-pending';
  return `<span class="badge ${cls}">${t || 'N/A'}</span>`;
}
function onlineBadge(v) { return v ? '<span class="badge badge-online">Online</span>' : '<span class="badge badge-offline">Offline</span>'; }
function fmtDate(d) { return d ? new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' }) : '—'; }
function fmtMoney(v) { return '₹' + Number(v || 0).toLocaleString('en-IN'); }
function truncate(s, n = 20) { s = s || '—'; return s.length > n ? s.slice(0, n) + '…' : s; }

function paginationHTML(page, total, size) {
  const pages = Math.ceil(total / size) || 1;
  let h = `<div class="pagination"><div class="pagination-info">Showing ${((page - 1) * size) + 1}–${Math.min(page * size, total)} of ${total}</div><div class="pagination-buttons">`;
  h += `<button onclick="window._paginate(${page - 1})" ${page <= 1 ? 'disabled' : ''}>‹</button>`;
  for (let i = 1; i <= Math.min(pages, 5); i++)
    h += `<button onclick="window._paginate(${i})" class="${i === page ? 'active' : ''}">${i}</button>`;
  if (pages > 5) h += `<button disabled>...</button><button onclick="window._paginate(${pages})">${pages}</button>`;
  h += `<button onclick="window._paginate(${page + 1})" ${page >= pages ? 'disabled' : ''}>›</button></div></div>`;
  return h;
}

function modal(title, bodyHTML, footerHTML = '') {
  document.getElementById('page-content').insertAdjacentHTML('beforeend',
    `<div class="modal-overlay" id="modal-overlay" onclick="if(event.target===this)closeModal()">
      <div class="modal-content"><div class="modal-header"><h3>${title}</h3>
      <button class="modal-close" onclick="closeModal()">✕</button></div>
      <div class="modal-body">${bodyHTML}</div>
      ${footerHTML ? `<div class="modal-footer">${footerHTML}</div>` : ''}</div></div>`);
}
window.closeModal = () => { const m = document.getElementById('modal-overlay'); if (m) m.remove(); };

function toast(msg, type = 'success') {
  let c = document.querySelector('.toast-container');
  if (!c) { c = document.createElement('div'); c.className = 'toast-container'; document.body.appendChild(c); }
  const t = document.createElement('div'); t.className = `toast toast-${type}`; t.textContent = msg; c.appendChild(t);
  setTimeout(() => t.remove(), 3000);
}
window.toast = toast;

window.viewVoucher = function (encodedUrl) {
  if (!encodedUrl) return;
  const url = decodeURIComponent(encodedUrl);
  modal('Voucher', `<div style="text-align:center">
    <img src="${url}" style="max-width:100%;border-radius:8px;border:1px solid #eee"
      onerror="this.style.display='none';this.nextElementSibling.style.display='block'"/>
    <div style="display:none;color:#dc2626;font-size:13px;margin-top:8px">Image failed to load. Check URL/access: ${url}</div>
  </div>`, `<button class="btn btn-outline" onclick="closeModal()">Close</button>`);
};

window.showTransferModal = function (buyId, amount, reward, upiId, upiName) {
  modal('Transfer Order', `<div class="form-grid">
    <div class="form-group"><label>Amount (₹)</label><input value="${amount}" disabled></div>
    <div class="form-group"><label>Reward (₹)</label><input value="${reward}" disabled></div>
    <div class="form-group"><label>Payment Type</label><input value="UPI" disabled></div>
    <div class="form-group"><label>User UPI ID</label><input value="${upiId || ''}" disabled></div>
    <div class="form-group"><label>User UPI Name</label><input value="${upiName || ''}" disabled></div>
  </div>`, `<button class="btn btn-outline" onclick="closeModal()">Cancel</button>
  <button class="btn btn-primary" onclick="doTransfer('${buyId}')">Create</button>`);
};

window.doTransfer = async function (buyId) {
  try { await api.transferOrder(buyId); closeModal(); toast('Transfer order created'); renderPurchaseOrders(); }
  catch (e) { toast(e.message, 'error'); }
};

// ═══════════════════════════════════════════════════════
//  DASHBOARD PAGE
// ═══════════════════════════════════════════════════════
function toInputDate(d) {
  const dt = new Date(d);
  const tzOffset = dt.getTimezoneOffset() * 60000;
  return new Date(dt.getTime() - tzOffset).toISOString().slice(0, 10);
}
function pct(n, t) { return t > 0 ? (Number(n || 0) / Number(t || 1)) * 100 : 0; }
function growth(cur, prev) {
  const c = Number(cur || 0), p = Number(prev || 0);
  if (p <= 0) return c > 0 ? 100 : 0;
  return ((c - p) / p) * 100;
}
function growthBadge(value) {
  const v = Number(value || 0);
  const cls = v > 0 ? 'up' : v < 0 ? 'down' : 'flat';
  const sign = v > 0 ? '+' : '';
  return `<span class="delta-badge ${cls}">${sign}${v.toFixed(1)}%</span>`;
}
function sparkline(series, stroke = '#3b82f6') {
  const values = (series || []).map(v => Number(v || 0));
  if (!values.length) return '';
  const w = 360, h = 96, pad = 8;
  const max = Math.max(...values, 1);
  const min = Math.min(...values, 0);
  const range = Math.max(max - min, 1);
  const pts = values.map((v, i) => {
    const x = pad + (i * (w - pad * 2)) / Math.max(values.length - 1, 1);
    const y = h - pad - ((v - min) / range) * (h - pad * 2);
    return [x, y];
  });
  const line = pts.map(p => `${p[0]},${p[1]}`).join(' ');
  const area = `M ${pts[0][0]} ${h - pad} L ${line.replace(/,/g, ' ')} L ${pts[pts.length - 1][0]} ${h - pad} Z`;
  return `<svg viewBox="0 0 ${w} ${h}" class="sparkline" preserveAspectRatio="none">
    <defs><linearGradient id="spark-fill" x1="0" x2="0" y1="0" y2="1">
      <stop offset="0%" stop-color="${stroke}" stop-opacity="0.35"></stop>
      <stop offset="100%" stop-color="${stroke}" stop-opacity="0.02"></stop>
    </linearGradient></defs>
    <path d="${area}" fill="url(#spark-fill)"></path>
    <polyline points="${line}" fill="none" stroke="${stroke}" stroke-width="3" stroke-linecap="round"></polyline>
  </svg>`;
}

window.setDashboardPreset = function (days) {
  const end = new Date();
  const start = new Date();
  start.setDate(end.getDate() - Number(days || 30) + 1);
  renderDashboard(toInputDate(start), toInputDate(end));
};

window.applyDashboardRange = function () {
  const s = document.getElementById('dash-start')?.value;
  const e = document.getElementById('dash-end')?.value;
  renderDashboard(s, e);
};

window.renderDashboard = async function () {
  const el = document.getElementById('page-content');
  el.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
  try {
    const now = new Date();
    const endDate = arguments[1] || toInputDate(now);
    const startFallback = new Date(now);
    startFallback.setDate(startFallback.getDate() - 29);
    const startDate = arguments[0] || toInputDate(startFallback);

    const sDate = new Date(`${startDate}T00:00:00`);
    const eDate = new Date(`${endDate}T23:59:59`);
    const rangeDays = Math.max(1, Math.floor((eDate - sDate) / 86400000) + 1);
    const prevEnd = new Date(sDate); prevEnd.setDate(prevEnd.getDate() - 1);
    const prevStart = new Date(prevEnd); prevStart.setDate(prevStart.getDate() - (rangeDays - 1));

    const [d, stats, prevStats] = await Promise.all([
      api.dashboard(),
      api.statistics(startDate, endDate),
      api.statistics(toInputDate(prevStart), toInputDate(prevEnd)),
    ]);

    const successRate = pct(d.successOrders, d.totalOrders);
    const failureRate = pct(d.failedOrders + d.cancelledOrders, d.totalOrders);
    const pendingRate = pct(d.pendingOrders, d.totalOrders);
    const upiUptime = pct(d.onlineUPIAccounts, d.totalUPIAccounts);

    const avgOrderValue = d.successOrders ? Number(d.totalRevenue || 0) / Number(d.successOrders) : 0;
    const payoutLoad = pct(d.pendingPayouts, d.totalPayoutOrders || 1);
    const userToOrder = d.totalUsers ? Number(d.totalOrders || 0) / Number(d.totalUsers || 1) : 0;

    const orderGrowth = growth(stats.ordersInRange, prevStats.ordersInRange);
    const revenueGrowth = growth(stats.revenueInRange, prevStats.revenueInRange);
    const payoutGrowth = growth(stats.payoutsInRange, prevStats.payoutsInRange);
    const userGrowth = growth(stats.newUsers, prevStats.newUsers);

    // Process actual daily data from API instead of fake distributions
    const revenueLabels = (stats.dailyRevenue || []).map(r => r.date);
    const revenueData = (stats.dailyRevenue || []).map(r => r.total);

    const payoutLabels = (stats.dailyPayouts || []).map(r => r.date);
    const payoutData = (stats.dailyPayouts || []).map(r => r.total);

    const orderMix = [
      { label: 'Success', value: d.successOrders, color: '#22c55e' },
      { label: 'Pending', value: d.pendingOrders, color: '#f59e0b' },
      { label: 'Failed', value: d.failedOrders, color: '#ef4444' },
      { label: 'Cancelled', value: d.cancelledOrders, color: '#94a3b8' },
    ];
    const totalMix = orderMix.reduce((a, b) => a + Number(b.value || 0), 0) || 1;

    const insights = [
      `Revenue per successful order is ${fmtMoney(avgOrderValue)}.`,
      `Payout queue load is ${payoutLoad.toFixed(1)}% of total payout orders.`,
      `Each member generated ${userToOrder.toFixed(2)} orders on average.`,
      `UPI availability stands at ${upiUptime.toFixed(1)}% (${d.onlineUPIAccounts}/${d.totalUPIAccounts}).`,
    ];

    const mixRows = orderMix.map(m => {
      const w = pct(m.value, totalMix);
      return `<div class="mix-row">
        <div class="mix-row-label"><span class="dot" style="background:${m.color}"></span>${m.label}</div>
        <div class="mix-row-bar"><span style="width:${w.toFixed(1)}%;background:${m.color}"></span></div>
        <div class="mix-row-value">${m.value} <small>(${w.toFixed(1)}%)</small></div>
      </div>`;
    }).join('');

    const funnelMax = Math.max(d.totalOrders, d.activeOrders, d.pendingOrders, d.successOrders, d.failedOrders, 1);
    const funnel = [
      ['Total Orders', d.totalOrders, '#3b82f6'],
      ['Active Ready', d.activeOrders, '#06b6d4'],
      ['Pending Review', d.pendingOrders, '#f59e0b'],
      ['Success', d.successOrders, '#22c55e'],
      ['Failed', d.failedOrders, '#ef4444'],
      ['Cancelled', d.cancelledOrders, '#94a3b8'],
    ].map(([label, val, color]) => {
      const width = pct(val, funnelMax).toFixed(1);
      return `<div class="funnel-row">
        <div class="funnel-label">${label}</div>
        <div class="funnel-track"><div class="funnel-fill" style="width:${width}%;background:${color}"></div></div>
        <div class="funnel-value">${val}</div>
      </div>`;
    }).join('');

    el.innerHTML = `
      <div class="analytics-shell">
        <div class="analytics-toolbar">
          <div class="toolbar-title-wrap">
            <h2>Advanced Analytics</h2>
            <p>Operational intelligence across orders, payouts, users and UPI channels</p>
          </div>
          <div class="toolbar-controls">
            <button class="btn btn-outline btn-sm" onclick="setDashboardPreset(7)">7D</button>
            <button class="btn btn-outline btn-sm" onclick="setDashboardPreset(30)">30D</button>
            <button class="btn btn-outline btn-sm" onclick="setDashboardPreset(90)">90D</button>
            <input type="date" id="dash-start" value="${startDate}">
            <input type="date" id="dash-end" value="${endDate}">
            <button class="btn btn-primary btn-sm" onclick="applyDashboardRange()">Apply</button>
          </div>
        </div>

        <div class="kpi-grid">
          <div class="kpi-card">
            <div class="kpi-label">Orders In Range</div>
            <div class="kpi-value">${stats.ordersInRange}</div>
            ${growthBadge(orderGrowth)}
          </div>
          <div class="kpi-card">
            <div class="kpi-label">Revenue In Range</div>
            <div class="kpi-value">${fmtMoney(stats.revenueInRange)}</div>
            ${growthBadge(revenueGrowth)}
          </div>
          <div class="kpi-card">
            <div class="kpi-label">Payouts In Range</div>
            <div class="kpi-value">${fmtMoney(stats.payoutsInRange)}</div>
            ${growthBadge(payoutGrowth)}
          </div>
          <div class="kpi-card">
            <div class="kpi-label">New Users</div>
            <div class="kpi-value">${stats.newUsers}</div>
            ${growthBadge(userGrowth)}
          </div>
          <div class="kpi-card">
            <div class="kpi-label">Success Rate</div>
            <div class="kpi-value">${successRate.toFixed(1)}%</div>
            <span class="delta-badge flat">${failureRate.toFixed(1)}% fail/cancel</span>
          </div>
          <div class="kpi-card">
            <div class="kpi-label">UPI Uptime</div>
            <div class="kpi-value">${upiUptime.toFixed(1)}%</div>
            <span class="delta-badge flat">${d.onlineUPIAccounts}/${d.totalUPIAccounts} online</span>
          </div>
        </div>

        <div class="analytics-panels">
          <div class="panel-card panel-wide">
            <div class="panel-head"><h3>Revenue Trend</h3><span>${rangeDays} day window</span></div>
            <div class="chart-container" style="position: relative; height:200px; width:100%; margin-bottom: 24px;">
              <canvas id="revenueChart"></canvas>
            </div>
            
            <div class="panel-head" style="margin-top:8px"><h3>Payout Trend</h3><span>operational outflow</span></div>
            <div class="chart-container" style="position: relative; height:200px; width:100%;">
              <canvas id="payoutChart"></canvas>
            </div>
          </div>

          <div class="panel-card">
            <div class="panel-head"><h3>Order Lifecycle Funnel</h3><span>live totals</span></div>
            <div class="funnel">${funnel}</div>
          </div>

          <div class="panel-card">
            <div class="panel-head"><h3>Order Composition</h3><span>distribution</span></div>
            <div class="mix-block">${mixRows}</div>
          </div>

          <div class="panel-card">
            <div class="panel-head"><h3>Operational Matrix</h3><span>key ratios</span></div>
            <table class="mini-matrix">
              <tr><td>Average Order Value</td><td>${fmtMoney(avgOrderValue)}</td></tr>
              <tr><td>Pending Rate</td><td>${pendingRate.toFixed(1)}%</td></tr>
              <tr><td>Payout Queue Load</td><td>${payoutLoad.toFixed(1)}%</td></tr>
              <tr><td>Orders per User</td><td>${userToOrder.toFixed(2)}</td></tr>
              <tr><td>Total Revenue</td><td>${fmtMoney(d.totalRevenue)}</td></tr>
              <tr><td>Pending Payouts</td><td>${d.pendingPayouts}</td></tr>
            </table>
          </div>
        </div>

        <div class="insight-card">
          <div class="panel-head"><h3>Insights</h3><span>auto-generated summary</span></div>
          <ul>${insights.map(x => `<li>${x}</li>`).join('')}</ul>
        </div>
      </div>`;

    // Render Real Charts with Chart.js
    const commonOptions = {
      responsive: true, maintainAspectRatio: false,
      plugins: { legend: { display: false }, tooltip: { mode: 'index', intersect: false } },
      scales: {
        x: { grid: { display: false }, ticks: { maxTicksLimit: 7 } },
        y: { beginAtZero: true, grid: { borderDash: [4, 4], color: '#e2e8f0' } }
      },
      interaction: { mode: 'nearest', axis: 'x', intersect: false }
    };

    if (window.revenueChartInst) window.revenueChartInst.destroy();
    if (window.payoutChartInst) window.payoutChartInst.destroy();

    const revCtx = document.getElementById('revenueChart');
    if (revCtx) {
      window.revenueChartInst = new Chart(revCtx, {
        type: 'line',
        data: {
          labels: revenueLabels.length ? revenueLabels : [startDate, endDate],
          datasets: [{
            label: 'Revenue (₹)',
            data: revenueData.length ? revenueData : [0, 0],
            borderColor: '#3b82f6', backgroundColor: 'rgba(59, 130, 246, 0.1)',
            borderWidth: 2, pointRadius: 3, pointBackgroundColor: '#fff', fill: true, tension: 0.4
          }]
        },
        options: commonOptions
      });
    }

    const payCtx = document.getElementById('payoutChart');
    if (payCtx) {
      window.payoutChartInst = new Chart(payCtx, {
        type: 'line',
        data: {
          labels: payoutLabels.length ? payoutLabels : [startDate, endDate],
          datasets: [{
            label: 'Payouts (₹)',
            data: payoutData.length ? payoutData : [0, 0],
            borderColor: '#8b5cf6', backgroundColor: 'rgba(139, 92, 246, 0.1)',
            borderWidth: 2, pointRadius: 3, pointBackgroundColor: '#fff', fill: true, tension: 0.4
          }]
        },
        options: commonOptions
      });
    }


  } catch (e) { el.innerHTML = `<div class="empty-state"><p>Failed to load: ${e.message}</p></div>`; }
};

// ═══════════════════════════════════════════════════════
//  PURCHASE ORDERS PAGE
// ═══════════════════════════════════════════════════════
window.renderPurchaseOrders = async function (page = 1, status = '', search = '') {
  const el = document.getElementById('page-content');
  el.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
  window._paginate = (p) => renderPurchaseOrders(p, status, search);
  try {
    const d = await api.purchasedOrders({ page, size: 15, status, search });
    el.innerHTML = `<div class="table-card">
      <div class="table-header"><div class="table-title">Purchase Orders</div>
        <div class="table-actions">
          <input type="text" placeholder="Search..." value="${search}" onkeyup="if(event.key==='Enter')renderPurchaseOrders(1,'${status}',this.value)" id="po-search">
          <select onchange="renderPurchaseOrders(1,this.value,document.getElementById('po-search').value)">
            <option value="">All Status</option><option value="PENDING" ${status === 'PENDING' ? 'selected' : ''}>Pending</option>
            <option value="SUBMITTED" ${status === 'SUBMITTED' ? 'selected' : ''}>Submitted</option>
            <option value="COMPLETED" ${status === 'COMPLETED' ? 'selected' : ''}>Completed</option>
            <option value="SUCCESS" ${status === 'SUCCESS' ? 'selected' : ''}>Success</option>
            <option value="FAILED" ${status === 'FAILED' ? 'selected' : ''}>Failed</option></select>
        </div></div>
      <div class="data-table-wrap"><table class="data-table"><thead><tr>
        <th>#</th><th>Member</th><th>Code</th><th>Amount</th><th>Reward</th><th>Wallet</th><th>Account</th><th>UPI</th><th>Paid To UPI</th><th>UTR</th><th>Status</th><th>Created</th><th>Actions</th>
      </tr></thead><tbody>${d.records.length ? d.records.map((r, i) => `<tr>
        <td>${(page - 1) * 15 + i + 1}</td><td><strong>${r.userName}</strong><br><small>${r.phone}</small></td>
        <td><code>${r.code}</code>${r.isTransfer ? `<br><small style="color:#0ea5e9">Transfer Ref: ${r.transferSourceBuyId || r.buyId}</small>` : ''}</td><td>${fmtMoney(r.amount)}</td><td>${fmtMoney(r.reward)}</td>
        <td>${r.payoutWallet || '—'}</td><td>${r.payoutAccount || '—'}</td><td>${truncate(r.payoutUPI)}</td><td>${r.paidToUpi ? `${truncate(r.paidToUpi)}${r.paidToName ? `<br><small>${r.paidToName}</small>` : ''}` : '—'}</td><td>${r.utr || '—'}</td>
        <td>${badge(r.displayStatus || r.status)} ${r.status === 'COMPLETED' ? '<span class="badge badge-processing">READY_TO_SELL</span>' : ''} ${r.isTransfer ? '<span class="badge badge-processing">TRANSFER</span>' : ''}</td>
        <td>${fmtDate(r.createdAt)}</td>
        <td>${r.status === 'COMPLETED' ?
        `<button class="btn btn-success btn-sm" onclick="doMarkSold('${r.buyId}')">Sell</button>
           <button class="btn btn-danger btn-sm" onclick="doMarkFailed('${r.buyId}')">Reject</button>
           ${!r.isTransfer ? `<button class="btn btn-outline btn-sm" onclick="showTransferModal('${r.buyId}','${r.amount}','${r.reward}','${r.payoutUPI || ''}','${r.payoutAccountName || ''}')">Transfer</button>` : ''}`
        : '—'}</td></tr>`).join('') : '<tr><td colspan="13"><div class="empty-state"><p>No purchase orders</p></div></td></tr>'}</tbody></table></div>
      ${paginationHTML(d.page, d.total, 15)}</div>`;
  } catch (e) { el.innerHTML = `<div class="empty-state"><p>${e.message}</p></div>`; }
};

window.doMarkSold = async function (buyId) {
  if (!confirm('Mark this order as SOLD/SUCCESS?')) return;
  try { await api.markSold(buyId); toast('Order marked as sold!'); renderPurchaseOrders(); } catch (e) { toast(e.message, 'error'); }
};
window.doMarkFailed = async function (buyId) {
  if (!confirm('Mark this order as FAILED?')) return;
  try { await api.markFailed(buyId, 'Rejected by admin'); toast('Order marked as failed'); renderPurchaseOrders(); } catch (e) { toast(e.message, 'error'); }
};

// ═══════════════════════════════════════════════════════
//  ORDER POOL PAGE (Admin-Created Orders)
// ═══════════════════════════════════════════════════════
window.renderOrderPool = async function (page = 1, status = '', search = '') {
  const el = document.getElementById('page-content');
  el.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
  window._paginate = (p) => renderOrderPool(p, status, search);
  try {
    const d = await api.listOrders({ page, size: 15, status, search });
    el.innerHTML = `<div class="table-card">
      <div class="table-header"><div class="table-title">Order Pool</div>
        <div class="table-actions">
          <input type="text" placeholder="Search code/payee/ref..." value="${search}" onkeyup="if(event.key==='Enter')renderOrderPool(1,'${status}',this.value)" id="op-search">
          <select onchange="renderOrderPool(1,this.value,document.getElementById('op-search').value)">
            <option value="">All Status</option><option value="READY" ${status === 'READY' ? 'selected' : ''}>Ready</option>
            <option value="CANCELLED" ${status === 'CANCELLED' ? 'selected' : ''}>Cancelled</option></select>
          <button class="btn btn-primary btn-sm" onclick="showCreateOrderModal()">+ Create Order</button>
        </div></div>
      <div class="data-table-wrap"><table class="data-table"><thead><tr>
        <th>#</th><th>Code</th><th>Amount</th><th>Reward</th><th>Payee</th><th>Account</th><th>IFSC</th>
        <th>Type</th><th>Reference</th><th>Claims</th><th>Status</th><th>Created</th><th>Actions</th>
      </tr></thead><tbody>${d.records.length ? d.records.map((r, i) => `<tr>
        <td>${(page - 1) * 15 + i + 1}</td><td><code>${r.code}</code>${String(r.payoutWallet || '').startsWith('TRANSFER:') ? `<br><small style="color:#0ea5e9">Transfer Ref: ${String(r.payoutWallet).replace('TRANSFER:', '')}</small>` : ''}</td><td>${fmtMoney(r.amount)}</td><td>${fmtMoney(r.reward)}</td>
        <td>${r.payeeName || '—'}</td><td>${r.payeeAccount || '—'}</td><td>${r.ifscCode || '—'}</td>
        <td>${r.paymentType || '—'}</td><td>${r.referenceNo || '—'}</td><td>${r._count?.userOrders || 0}</td>
        <td>${badge(r.status)} ${String(r.payoutWallet || '').startsWith('TRANSFER:') ? '<span class="badge badge-processing">TRANSFER</span>' : ''}</td><td>${fmtDate(r.createdAt)}</td>
        <td><button class="btn btn-danger btn-sm" onclick="doDeleteOrder('${r.id}')">Delete</button></td>
      </tr>`).join('') : '<tr><td colspan="13"><div class="empty-state"><p>No orders in pool</p></div></td></tr>'}</tbody></table></div>
      ${paginationHTML(d.page, d.total, 15)}</div>`;
  } catch (e) { el.innerHTML = `<div class="empty-state"><p>${e.message}</p></div>`; }
};

window.doDeleteOrder = async function (id) {
  if (!confirm('Delete this order? Claimed orders will be marked cancelled.')) return;
  try { await api.deleteOrder(id); toast('Order deleted'); renderOrderPool(); } catch (e) { toast(e.message, 'error'); }
};
window.showCreateOrderModal = async function () {
  let upiOptions = '<option value="">Select UPI account</option>';
  try {
    const upiList = await api.upiList({ page: 1, size: 100, isOnline: true });
    const records = upiList?.records || upiList?.data?.records || upiList?.records || [];
    upiOptions += records.map(r => `<option value="${r.id}">${r.walletType} - ${r.accountName} (${r.upiId || 'no upi'})</option>`).join('');
  } catch (e) { }

  modal('Create New Order', `<div class="form-grid">
    <div class="form-group"><label>Amount (₹)</label><input type="number" id="co-amount" placeholder="200"></div>
    <div class="form-group"><label>Reward (₹)</label><input type="number" id="co-reward" placeholder="8"></div>
    <div class="form-group"><label>Income %</label><input type="number" id="co-percent" placeholder="4"></div>
    <div class="form-group"><label>Count</label><input type="number" id="co-count" value="1"></div>
    <div class="form-group" data-imps-only><label>Payee Account</label><input id="co-payee"></div>
    <div class="form-group" data-imps-only><label>Payee Name</label><input id="co-pname"></div>
    <div class="form-group" data-imps-only><label>IFSC</label><input id="co-ifsc"></div>
    <div class="form-group"><label>Payment Type</label><select id="co-ptype">
      <option>IMPS</option><option>UPI</option><option>NEFT</option>
    </select></div>
    <div class="form-group" data-upi-only><label>Admin UPI Account</label><select id="co-upi">${upiOptions}</select></div>
    <div class="form-group" data-upi-only><label>Custom UPI ID</label><input id="co-upi-id" placeholder="example@upi"></div>
    <div class="form-group" data-upi-only><label>Custom UPI Name</label><input id="co-upi-name" placeholder="Account Name"></div>
    <div class="form-group"><label>Reference No</label><input id="co-ref" placeholder="R2026031921303819592574"></div>
  </div>`, `<button class="btn btn-outline" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="submitCreateOrder()">Create</button>`);

  const togglePaymentFields = () => {
    const type = (document.getElementById('co-ptype')?.value || 'IMPS').toUpperCase();
    document.querySelectorAll('[data-imps-only]').forEach(el => {
      el.style.display = type === 'UPI' ? 'none' : '';
    });
    document.querySelectorAll('[data-upi-only]').forEach(el => {
      el.style.display = type === 'UPI' ? '' : 'none';
    });
  };
  document.getElementById('co-ptype')?.addEventListener('change', togglePaymentFields);
  togglePaymentFields();
};
window.submitCreateOrder = async function () {
  try {
    const paymentType = document.getElementById('co-ptype').value;
    const isUpi = String(paymentType).toUpperCase() === 'UPI';
    const customUpiId = document.getElementById('co-upi-id').value || undefined;
    const customUpiName = document.getElementById('co-upi-name').value || undefined;
    await api.generateOrders({
      amount: document.getElementById('co-amount').value,
      reward: document.getElementById('co-reward').value,
      incomePercent: document.getElementById('co-percent').value || undefined,
      count: document.getElementById('co-count').value || 1,
      payeeAccount: isUpi ? (customUpiId || undefined) : (document.getElementById('co-payee').value || undefined),
      payeeName: isUpi ? (customUpiName || undefined) : (document.getElementById('co-pname').value || undefined),
      ifscCode: isUpi ? undefined : (document.getElementById('co-ifsc').value || undefined),
      paymentType,
      adminUPIAccountId: isUpi ? (document.getElementById('co-upi').value || undefined) : undefined,
      referenceNo: document.getElementById('co-ref').value || undefined,
    });
    closeModal(); toast('Order(s) created!'); renderPurchaseOrders();
  } catch (e) { toast(e.message, 'error'); }
};

// ═══════════════════════════════════════════════════════
//  COLLECTION ORDERS PAGE
// ═══════════════════════════════════════════════════════
window.renderCollectionOrders = async function (page = 1, status = '') {
  const el = document.getElementById('page-content');
  el.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
  window._paginate = (p) => renderCollectionOrders(p, status);
  try {
    const d = await api.collectionList({ page, size: 15, status });
    const sum = d.summary || {};
    el.innerHTML = `<div class="table-card">
      <div class="table-header"><div class="table-title">Collection Orders</div>
        <div class="table-actions">
          <select onchange="renderCollectionOrders(1,this.value)">
            <option value="">All</option><option value="SUBMITTED" ${status === 'SUBMITTED' ? 'selected' : ''}>Submitted</option>
            <option value="APPROVED" ${status === 'APPROVED' ? 'selected' : ''}>Approved</option>
            <option value="REJECTED" ${status === 'REJECTED' ? 'selected' : ''}>Rejected</option></select></div></div>
      <div class="summary-bar">
        <div class="summary-item"><span class="summary-dot orange"></span>Pending: ${sum.totalPending || 0}</div>
        <div class="summary-item"><span class="summary-dot green"></span>Approved: ${sum.totalSuccess || 0}</div>
        <div class="summary-item"><span class="summary-dot red"></span>Rejected: ${sum.totalFailed || 0}</div></div>
      <div class="data-table-wrap"><table class="data-table"><thead><tr>
        <th>#</th><th>Member</th><th>Code</th><th>Amount</th><th>Wallet</th><th>Account</th><th>UPI</th><th>Paid To UPI</th><th>UTR</th><th>Status</th><th>Created</th><th>Actions</th>
      </tr></thead><tbody>${d.records.length ? d.records.map((r, i) => `<tr>
        <td>${(page - 1) * 15 + i + 1}</td><td><strong>${r.userName}</strong><br><small>${r.memberCode}</small></td>
        <td><code>${r.code}</code>${r.isTransfer ? `<br><small style="color:#0ea5e9">Transfer Ref: ${r.transferSourceBuyId || '—'}</small>` : ''}</td><td>${fmtMoney(r.amount)}</td>
        <td>${r.payoutWallet || '—'}</td><td>${r.payoutAccount || '—'}</td><td>${truncate(r.payoutUPI)}</td><td>${r.paidToUpi ? `${truncate(r.paidToUpi)}${r.paidToName ? `<br><small>${r.paidToName}</small>` : ''}` : '—'}</td><td>${r.utr || '—'}</td>
        <td>${badge(r.status)} ${r.isTransfer ? '<span class="badge badge-processing">TRANSFER</span>' : ''}</td><td>${fmtDate(r.createdAt)}</td>
        <td>${r.status === 'SUBMITTED' ?
        `<button class="btn btn-success btn-sm" onclick="doVerify('${r.id}','approve')">Approve</button>
           <button class="btn btn-danger btn-sm" onclick="doVerify('${r.id}','reject')">Reject</button>` : '—'}</td>
      </tr>`).join('') : '<tr><td colspan="12"><div class="empty-state"><p>No collection orders</p></div></td></tr>'}</tbody></table></div>
      ${paginationHTML(d.page, d.total, 15)}</div>`;
  } catch (e) { el.innerHTML = `<div class="empty-state"><p>${e.message}</p></div>`; }
};
window.doVerify = async function (id, action) {
  if (!confirm(`${action === 'approve' ? 'Approve' : 'Reject'} this collection?`)) return;
  try { await api.verifyCollection(id, action); toast(`Collection ${action}d!`); renderCollectionOrders(); } catch (e) { toast(e.message, 'error'); }
};

// ═══════════════════════════════════════════════════════
//  PAYMENT ORDERS PAGE
// ═══════════════════════════════════════════════════════
window.renderPaymentOrders = async function (page = 1, status = '') {
  const el = document.getElementById('page-content');
  el.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
  window._paginate = (p) => renderPaymentOrders(p, status);
  try {
    const d = await api.paymentOrdersList({ page, size: 15, status });
    el.innerHTML = `<div class="table-card">
      <div class="table-header"><div class="table-title">Payment Orders (Payouts)</div>
        <div class="table-actions">
          <select onchange="renderPaymentOrders(1,this.value)">
            <option value="">All</option><option value="PENDING" ${status === 'PENDING' ? 'selected' : ''}>Pending</option>
            <option value="SUCCESS" ${status === 'SUCCESS' ? 'selected' : ''}>Success</option>
            <option value="FAILED" ${status === 'FAILED' ? 'selected' : ''}>Failed</option></select>
          <button class="btn btn-primary btn-sm" onclick="showCreatePayoutModal()">+ Create Payout</button></div></div>
      <div class="data-table-wrap"><table class="data-table"><thead><tr>
        <th>#</th><th>Member</th><th>Amount</th><th>UPI</th><th>Wallet</th><th>Status</th><th>Settlement</th><th>Created</th><th>Actions</th>
      </tr></thead><tbody>${d.records.length ? d.records.map((r, i) => `<tr>
        <td>${(page - 1) * 15 + i + 1}</td><td><strong>${r.user?.userName || '—'}</strong><br><small>${r.memberCode || ''}</small></td>
        <td>${fmtMoney(r.amount)}</td><td>${r.upiId || '—'}</td><td>${r.walletType || '—'}</td>
        <td>${badge(r.status)}</td><td>${fmtDate(r.settlementTime)}</td><td>${fmtDate(r.createdAt)}</td>
        <td>${r.status === 'PENDING' ?
        `<button class="btn btn-success btn-sm" onclick="doPayoutStatus('${r.id}','SUCCESS')">✓</button>
           <button class="btn btn-danger btn-sm" onclick="doPayoutStatus('${r.id}','FAILED')">✕</button>` : '—'}</td>
      </tr>`).join('') : '<tr><td colspan="9"><div class="empty-state"><p>No payment orders</p></div></td></tr>'}</tbody></table></div>
      ${paginationHTML(d.page, d.total, 15)}</div>`;
  } catch (e) { el.innerHTML = `<div class="empty-state"><p>${e.message}</p></div>`; }
};
window.doPayoutStatus = async function (id, status) {
  try { await api.updatePaymentStatus(id, status); toast('Payout updated'); renderPaymentOrders(); } catch (e) { toast(e.message, 'error'); }
};
window.showCreatePayoutModal = function () {
  modal('Create Payout', `<div class="form-grid">
    <div class="form-group full-width"><label>User ID</label><input id="cp-uid"></div>
    <div class="form-group"><label>Amount</label><input type="number" id="cp-amt"></div>
    <div class="form-group"><label>UPI ID</label><input id="cp-upi"></div>
    <div class="form-group"><label>Wallet Type</label><input id="cp-wallet" placeholder="Paytm"></div>
    <div class="form-group"><label>Remark</label><input id="cp-remark"></div>
  </div>`, `<button class="btn btn-outline" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="submitPayout()">Create</button>`);
};
window.submitPayout = async function () {
  try {
    await api.createPaymentOrder({
      userId: document.getElementById('cp-uid').value, amount: document.getElementById('cp-amt').value,
      upiId: document.getElementById('cp-upi').value, walletType: document.getElementById('cp-wallet').value, remark: document.getElementById('cp-remark').value
    });
    closeModal(); toast('Payout created'); renderPaymentOrders();
  } catch (e) { toast(e.message, 'error'); }
};

// ═══════════════════════════════════════════════════════
//  HISTORY
// ═══════════════════════════════════════════════════════
window.renderHistory = async function (page = 1, type = '', search = '') {
  const el = document.getElementById('page-content');
  el.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
  window._paginate = (p) => renderHistory(p, type, search);
  try {
    const d = await api.historyList({ page, size: 20, type, search });
    el.innerHTML = `<div class="table-card">
      <div class="table-header"><div class="table-title">History</div>
        <div class="table-actions">
          <input type="text" placeholder="Search history..." value="${search}" onkeyup="if(event.key==='Enter')renderHistory(1,'${type}',this.value)" id="hs-search">
          <select onchange="renderHistory(1,this.value,document.getElementById('hs-search').value)">
            <option value="">All Events</option>
            <option value="ORDER_CREATED" ${type === 'ORDER_CREATED' ? 'selected' : ''}>Order Created</option>
            <option value="ORDER_DELETED" ${type === 'ORDER_DELETED' ? 'selected' : ''}>Order Deleted</option>
            <option value="ORDER_ON_SELL" ${type === 'ORDER_ON_SELL' ? 'selected' : ''}>Order On Sell</option>
            <option value="PAYMENT_SUBMITTED" ${type === 'PAYMENT_SUBMITTED' ? 'selected' : ''}>Paid</option>
            <option value="PAYMENT_NOT_PAID" ${type === 'PAYMENT_NOT_PAID' ? 'selected' : ''}>Not Paid</option>
            <option value="ORDER_SOLD" ${type === 'ORDER_SOLD' ? 'selected' : ''}>Order Sold</option>
            <option value="PAYOUT_CREATED" ${type === 'PAYOUT_CREATED' ? 'selected' : ''}>Payout Created</option>
            <option value="PAYOUT_SUCCESS" ${type === 'PAYOUT_SUCCESS' ? 'selected' : ''}>Payout Success</option>
            <option value="PAYOUT_FAILED" ${type === 'PAYOUT_FAILED' ? 'selected' : ''}>Payout Failed</option>
          </select>
        </div></div>
      <div class="data-table-wrap"><table class="data-table"><thead><tr>
        <th>#</th><th>Time</th><th>Event</th><th>Code</th><th>Member</th><th>Amount</th><th>Status</th><th>Detail</th>
      </tr></thead><tbody>${d.records.length ? d.records.map((r, i) => `<tr>
        <td>${(page - 1) * 20 + i + 1}</td>
        <td>${fmtDate(r.eventTime)}</td>
        <td><code>${r.eventType}</code></td>
        <td>${r.code || '—'}</td>
        <td>${r.member || '—'}</td>
        <td>${fmtMoney(r.amount)}</td>
        <td>${badge(r.status)}</td>
        <td>${r.detail || '—'}</td>
      </tr>`).join('') : '<tr><td colspan="8"><div class="empty-state"><p>No history records</p></div></td></tr>'}</tbody></table></div>
      ${paginationHTML(d.page, d.total, 20)}</div>`;
  } catch (e) { el.innerHTML = `<div class="empty-state"><p>${e.message}</p></div>`; }
};

// ═══════════════════════════════════════════════════════
//  USDT ORDERS PAGE
// ═══════════════════════════════════════════════════════
window.renderUsdtOrders = async function (status = '') {
  const el = document.getElementById('page-content');
  el.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
  try {
    const orders = await api.usdtOrders({ status });
    el.innerHTML = `<div class="table-card">
      <div class="table-header"><div class="table-title">USDT Orders</div>
        <div class="table-actions">
          <select onchange="renderUsdtOrders(this.value)">
            <option value="">All Status</option>
            <option value="PENDING" ${status === 'PENDING' ? 'selected' : ''}>Pending</option>
            <option value="APPROVED" ${status === 'APPROVED' ? 'selected' : ''}>Approved</option>
            <option value="REJECTED" ${status === 'REJECTED' ? 'selected' : ''}>Rejected</option>
          </select>
          <button class="btn btn-primary btn-sm" onclick="renderUsdtSettings()">USDT Settings</button>
        </div></div>
      <div class="data-table-wrap"><table class="data-table"><thead><tr>
        <th>Ref No</th><th>Member</th><th>USDT Amount</th><th>Rate (INR)</th><th>Bonus (INR)</th><th>Total Receive (INR)</th><th>Wallet Address</th><th>Status</th><th>Created At</th><th>Actions</th>
      </tr></thead><tbody>${orders.length ? orders.map(r => `<tr>
        <td><code>${r.referenceNo}</code></td>
        <td><strong>${r.user?.userName || '—'}</strong><br><small>${r.user?.phone || '—'}</small></td>
        <td>${Number(r.amount).toFixed(2)} USDT</td>
        <td>${Number(r.rate).toFixed(2)}</td>
        <td>${Number(r.bonus).toFixed(2)}</td>
        <td>${fmtMoney(r.totalReceive)}</td>
        <td><small>${r.walletAddress}</small></td>
        <td>${badge(r.status)}</td>
        <td>${fmtDate(r.createdAt)}</td>
        <td>${r.status === 'PENDING' ?
        `<button class="btn btn-success btn-sm" onclick="doApproveUsdt('${r.id}')">Approve</button>
           <button class="btn btn-danger btn-sm" onclick="showRejectUsdtModal('${r.id}')">Reject</button>` : '—'}
        </td>
      </tr>`).join('') : '<tr><td colspan="10"><div class="empty-state"><p>No USDT orders found</p></div></td></tr>'}</tbody></table></div></div>`;
  } catch (e) { el.innerHTML = `<div class="empty-state"><p>${e.message}</p></div>`; }
};

window.doApproveUsdt = async function (id) {
  if (!confirm('Approve this USDT order? The amount will be credited to the user balance.')) return;
  try { await api.approveUsdtOrder(id); toast('Order approved successfully'); renderUsdtOrders(); }
  catch (e) { toast(e.message, 'error'); }
};

window.showRejectUsdtModal = function (id) {
  modal('Reject USDT Order', `<div class="form-group">
    <label>Reason for Rejection</label>
    <textarea id="reject-reason" class="form-control" rows="3" placeholder="Invalid transaction hash, etc."></textarea>
  </div>`, `<button class="btn btn-outline" onclick="closeModal()">Cancel</button>
  <button class="btn btn-danger" onclick="doRejectUsdt('${id}')">Reject Order</button>`);
};

window.doRejectUsdt = async function (id) {
  const reason = document.getElementById('reject-reason').value;
  try { await api.rejectUsdtOrder(id, reason); closeModal(); toast('Order rejected'); renderUsdtOrders(); }
  catch (e) { toast(e.message, 'error'); }
};

// ═══════════════════════════════════════════════════════
//  USDT SETTINGS PAGE
// ═══════════════════════════════════════════════════════
window.renderUsdtSettings = async function () {
  const el = document.getElementById('page-content');
  el.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
  try {
    const s = await api.usdtSettings();
    el.innerHTML = `<div class="table-card" style="max-width:600px;margin:20px auto">
      <div class="table-header"><div class="table-title">USDT Configuration</div></div>
      <div style="padding:24px">
        <div class="form-group"><label>USDT to INR Conversion Rate</label>
          <input type="number" id="usdt-rate" value="${s.usdtInInr}" step="0.01"></div>
        <div class="form-group"><label>Bonus per USDT (in INR)</label>
          <input type="number" id="usdt-bonus" value="${s.usdtBonus}" step="0.01"></div>
        <div class="form-group"><label>Admin USDT Wallet Address</label>
          <input type="text" id="usdt-wallet" value="${s.usdtWalletAddress || ''}" placeholder="T... address"></div>
        <div style="margin-top:24px">
          <button class="btn btn-primary" style="width:100%" onclick="submitUsdtSettings()">Save Settings</button>
          <button class="btn btn-outline" style="width:100%;margin-top:10px" onclick="renderUsdtOrders()">Back to Orders</button>
        </div>
      </div></div>`;
  } catch (e) { el.innerHTML = `<div class="empty-state"><p>${e.message}</p></div>`; }
};

window.submitUsdtSettings = async function () {
  const data = {
    usdtInInr: Number(document.getElementById('usdt-rate').value),
    usdtBonus: Number(document.getElementById('usdt-bonus').value),
    usdtWalletAddress: document.getElementById('usdt-wallet').value.trim()
  };
  try { await api.updateUsdtSettings(data); toast('Settings updated'); renderUsdtSettings(); }
  catch (e) { toast(e.message, 'error'); }
};

// ═══════════════════════════════════════════════════════
//  MANAGE CAROUSEL PAGE
// ═══════════════════════════════════════════════════════
window.renderManageCarousel = async function () {
  const el = document.getElementById('page-content');
  el.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
  try {
    const cfg = await api.carouselConfig();
    const enabled = Boolean(cfg.enabled);
    const orders = cfg.orders || [];
    const readyOrders = orders.filter(o => o.status === 'READY');

    // Preview cards HTML
    const previewCards = readyOrders.slice(0, 6).map(o => `
      <div style="flex-shrink:0;width:170px;height:220px;border-radius:12px;overflow:hidden;position:relative;background:#151515;box-shadow:0 4px 16px rgba(0,0,0,0.3)">
        <div style="position:absolute;width:100%;height:100%">
          <div style="width:90px;height:90px;border-radius:50%;background:#ffbb66;filter:blur(15px);position:absolute;top:20px;left:10px"></div>
          <div style="width:30px;height:30px;border-radius:50%;background:#ff2233;filter:blur(15px);position:absolute;top:10px;left:130px"></div>
          <div style="width:100px;height:100px;border-radius:50%;background:#ff8866;filter:blur(15px);position:absolute;bottom:40px;left:60px"></div>
        </div>
        <div style="position:relative;width:100%;height:100%;padding:10px;display:flex;flex-direction:column;justify-content:space-between;z-index:1">
          <span style="background:rgba(0,0,0,0.35);padding:2px 10px;border-radius:10px;backdrop-filter:blur(2px);width:fit-content;color:#fff;font-size:11px">${o.code}</span>
          <div style="box-shadow:0 0 10px 5px rgba(0,0,0,0.5);width:100%;padding:10px;background:rgba(0,0,0,0.6);backdrop-filter:blur(5px);border-radius:5px">
            <div style="display:flex;justify-content:space-between;align-items:center">
              <strong style="color:#fff;font-size:14px">₹${Number(o.amount).toLocaleString('en-IN')}</strong>
              <span style="color:#20c997;font-size:11px">+₹${Number(o.reward).toLocaleString('en-IN')}</span>
            </div>
            <div style="margin-top:6px">
              <button style="width:100%;padding:6px 0;border:none;border-radius:6px;background:linear-gradient(145deg,#a8c452,#98b645);color:#1a1f14;font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:0.08em;cursor:default">Buy Now</button>
            </div>
          </div>
        </div>
      </div>
    `).join('');

    el.innerHTML = `<div class="table-card">
      <div class="table-header"><div class="table-title">Manage Carousel</div>
        <div class="table-actions">
          <button class="btn ${enabled ? 'btn-warning' : 'btn-success'} btn-sm" onclick="doToggleCarousel(${!enabled})">${enabled ? 'Disable Carousel' : 'Enable Carousel'}</button>
          <button class="btn btn-primary btn-sm" onclick="showCreateCarouselOrderModal()">+ Create Carousel Order</button>
          <button class="btn btn-outline btn-sm" onclick="showAddExistingToCarouselModal()">+ Tag Existing Order</button>
        </div>
      </div>

      <div style="padding:16px">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
          <span style="font-size:13px;color:#64748b">Status:</span>
          ${enabled ? '<span class="badge badge-online">Enabled</span>' : '<span class="badge badge-offline">Disabled</span>'}
          <span style="font-size:13px;color:#64748b;margin-left:8px">Ready Orders: <strong>${readyOrders.length}</strong></span>
          <span style="font-size:13px;color:#64748b">Total Tagged: <strong>${orders.length}</strong></span>
        </div>

        ${readyOrders.length ? `<div style="margin-bottom:20px">
          <h4 style="margin-bottom:10px;font-size:14px;color:#334155">Carousel Preview</h4>
          <div style="display:flex;gap:12px;overflow-x:auto;padding:8px 0;scrollbar-width:none">${previewCards}</div>
        </div>` : '<div style="padding:14px;text-align:center;color:#64748b;background:#f8fafc;border-radius:8px;margin-bottom:16px">No READY carousel orders. The carousel will be hidden on the home page.</div>'}
      </div>

      <div class="data-table-wrap"><table class="data-table"><thead><tr>
        <th>#</th><th>Code</th><th>Amount</th><th>Reward</th><th>Income %</th><th>Status</th><th>Claims</th><th>Type</th><th>Created</th><th>Actions</th>
      </tr></thead><tbody>${orders.length ? orders.map((r, i) => `<tr>
        <td>${i + 1}</td><td><code>${r.code}</code></td><td>${fmtMoney(r.amount)}</td><td>${fmtMoney(r.reward)}</td>
        <td>${r.incomePercent}%</td><td>${badge(r.status)}</td><td>${r.claims}</td><td>${r.paymentType || '—'}</td>
        <td>${fmtDate(r.createdAt)}</td>
        <td><button class="btn btn-danger btn-sm" onclick="doRemoveFromCarousel('${r.id}')">Remove</button></td>
      </tr>`).join('') : '<tr><td colspan="10"><div class="empty-state"><p>No carousel orders</p></div></td></tr>'}</tbody></table></div>
    </div>`;
  } catch (e) { el.innerHTML = `<div class="empty-state"><p>${e.message}</p></div>`; }
};

window.doToggleCarousel = async function (enabled) {
  try { await api.updateCarouselConfig({ enabled }); toast(`Carousel ${enabled ? 'enabled' : 'disabled'}`); renderManageCarousel(); }
  catch (e) { toast(e.message, 'error'); }
};

window.doRemoveFromCarousel = async function (orderId) {
  if (!confirm('Remove this order from carousel?')) return;
  try { await api.removeCarouselOrder({ orderId }); toast('Order removed from carousel'); renderManageCarousel(); }
  catch (e) { toast(e.message, 'error'); }
};

window.showCreateCarouselOrderModal = async function () {
  let upiOptions = '<option value="">Select UPI account</option>';
  try {
    const upiList = await api.upiList({ page: 1, size: 100, isOnline: true });
    const records = upiList?.records || upiList?.data?.records || upiList?.records || [];
    upiOptions += records.map(r => `<option value="${r.id}">${r.walletType} - ${r.accountName} (${r.upiId || 'no upi'})</option>`).join('');
  } catch (e) { }

  modal('Create Carousel Order', `<div class="form-grid">
    <div class="form-group"><label>Amount (₹)</label><input type="number" id="cc-amount" placeholder="200"></div>
    <div class="form-group"><label>Reward (₹)</label><input type="number" id="cc-reward" placeholder="8"></div>
    <div class="form-group"><label>Income %</label><input type="number" id="cc-percent" placeholder="4"></div>
    <div class="form-group"><label>Count</label><input type="number" id="cc-count" value="1"></div>
    <div class="form-group" data-imps-only><label>Payee Account</label><input id="cc-payee"></div>
    <div class="form-group" data-imps-only><label>Payee Name</label><input id="cc-pname"></div>
    <div class="form-group" data-imps-only><label>IFSC</label><input id="cc-ifsc"></div>
    <div class="form-group"><label>Payment Type</label><select id="cc-ptype">
      <option>IMPS</option><option>UPI</option><option>NEFT</option>
    </select></div>
    <div class="form-group" data-upi-only><label>Admin UPI Account</label><select id="cc-upi">${upiOptions}</select></div>
    <div class="form-group" data-upi-only><label>Custom UPI ID</label><input id="cc-upi-id" placeholder="example@upi"></div>
    <div class="form-group" data-upi-only><label>Custom UPI Name</label><input id="cc-upi-name" placeholder="Account Name"></div>
  </div>`, `<button class="btn btn-outline" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="submitCreateCarouselOrder()">Create</button>`);

  const togglePaymentFields = () => {
    const type = (document.getElementById('cc-ptype')?.value || 'IMPS').toUpperCase();
    document.querySelectorAll('[data-imps-only]').forEach(el => {
      el.style.display = type === 'UPI' ? 'none' : '';
    });
    document.querySelectorAll('[data-upi-only]').forEach(el => {
      el.style.display = type === 'UPI' ? '' : 'none';
    });
  };
  document.getElementById('cc-ptype')?.addEventListener('change', togglePaymentFields);
  togglePaymentFields();
};

window.submitCreateCarouselOrder = async function () {
  const type = (document.getElementById('cc-ptype')?.value || 'IMPS').toUpperCase();
  const payload = {
    amount: document.getElementById('cc-amount').value,
    reward: document.getElementById('cc-reward').value,
    incomePercent: document.getElementById('cc-percent').value || undefined,
    count: document.getElementById('cc-count').value || 1,
    paymentType: type
  };

  if (type === 'UPI') {
    payload.adminUPIAccountId = document.getElementById('cc-upi')?.value || undefined;
    const cid = document.getElementById('cc-upi-id')?.value;
    const cname = document.getElementById('cc-upi-name')?.value;
    if (!payload.adminUPIAccountId && cid && cname) {
      payload.payeeAccount = cid;
      payload.payeeName = cname;
    }
  } else {
    payload.payeeAccount = document.getElementById('cc-payee').value || undefined;
    payload.payeeName = document.getElementById('cc-pname').value || undefined;
    payload.ifscCode = document.getElementById('cc-ifsc').value || undefined;
  }

  try {
    await api.createCarouselOrder(payload);
    closeModal(); toast('Carousel order(s) created!'); renderManageCarousel();
  } catch (e) { toast(e.message, 'error'); }
};

window.showAddExistingToCarouselModal = function () {
  modal('Tag Existing Order', `<div class="form-grid">
    <div class="form-group full-width"><label>Order Code or Order ID</label><input id="tag-order-id" placeholder="Paste order code (e.g. 1234567890) or UUID"></div>
  </div>`, `<button class="btn btn-outline" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="submitTagExistingOrder()">Add to Carousel</button>`);
};

window.submitTagExistingOrder = async function () {
  const orderId = document.getElementById('tag-order-id').value.trim();
  if (!orderId) { toast('Please enter an order code or order ID', 'error'); return; }
  try { await api.addCarouselOrder({ orderId }); closeModal(); toast('Order tagged for carousel'); renderManageCarousel(); }
  catch (e) { toast(e.message, 'error'); }
};

// ═══════════════════════════════════════════════════════
//  HERO CAROUSEL PAGE
// ═══════════════════════════════════════════════════════
window.renderHeroCarousel = async function () {
  const el = document.getElementById('page-content');
  el.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
  try {
    const cfg = await api.heroCarouselList();
    const enabled = Boolean(cfg.enabled);
    const slides = cfg.slides || [];

    const previewSlides = slides.filter(s => s.isActive);
    const previewHTML = previewSlides.length ? previewSlides.map(s => {
      if (String(s.type).toUpperCase() === 'VIDEO') {
        return `<div style="flex-shrink:0;width:280px;height:158px;border-radius:12px;overflow:hidden;background:#000;box-shadow:0 4px 20px rgba(0,0,0,0.4)">
          <video src="${s.mediaUrl}" style="width:100%;height:100%;object-fit:cover" muted autoplay loop playsinline></video>
        </div>`;
      }
      return `<div style="flex-shrink:0;width:280px;height:158px;border-radius:12px;overflow:hidden;background:#111;box-shadow:0 4px 20px rgba(0,0,0,0.4)">
        <img src="${s.mediaUrl}" style="width:100%;height:100%;object-fit:cover" onerror="this.style.display='none'" />
      </div>`;
    }).join('') : '<div style="padding:20px;text-align:center;color:#64748b;background:#f8fafc;border-radius:8px;width:100%">No active slides. Add slides below.</div>';

    const slideRows = slides.length ? slides.map((s, i) => `<tr>
      <td>${i + 1}</td>
      <td><code>${String(s.type).toUpperCase()}</code></td>
      <td style="max-width:220px;word-break:break-all"><a href="${s.mediaUrl}" target="_blank" style="color:#3b82f6;text-decoration:underline">${truncate(s.mediaUrl, 40)}</a></td>
      <td>${s.linkUrl ? `<a href="${s.linkUrl}" target="_blank" style="color:#3b82f6">${truncate(s.linkUrl, 30)}</a>` : '—'}</td>
      <td>${s.title || '—'}</td>
      <td>${s.isActive ? '<span class="badge badge-online">Active</span>' : '<span class="badge badge-offline">Inactive</span>'}</td>
      <td>${s.sortOrder}</td>
      <td>${fmtDate(s.createdAt)}</td>
      <td>
        <button class="btn btn-outline btn-sm" onclick="showEditHeroSlide('${s.id}','${String(s.type).toUpperCase()}','${encodeURIComponent(s.mediaUrl)}','${s.linkUrl ? encodeURIComponent(s.linkUrl) : ''}','${s.title || ''}',${s.isActive},${s.sortOrder})">Edit</button>
        <button class="btn btn-danger btn-sm" onclick="deleteHeroSlide('${s.id}')">Delete</button>
      </td>
    </tr>`).join('') : '<tr><td colspan="9"><div class="empty-state"><p>No slides added yet</p></div></td></tr>';

    el.innerHTML = `<div class="table-card">
      <div class="table-header"><div class="table-title">Hero Carousel</div>
        <div class="table-actions">
          <button class="btn ${enabled ? 'btn-warning' : 'btn-success'} btn-sm" onclick="toggleHeroCarousel(${!enabled})">${enabled ? 'Disable' : 'Enable'} Carousel</button>
          <button class="btn btn-primary btn-sm" onclick="showAddHeroSlide()">+ Add Slide</button>
        </div>
      </div>
      <div style="padding:16px">
        <div style="display:flex;align-items:center;gap:10px;margin-bottom:16px">
          <span style="font-size:13px;color:#64748b">Global Status:</span>
          ${enabled ? '<span class="badge badge-online">Enabled</span>' : '<span class="badge badge-offline">Disabled</span>'}
          <span style="font-size:13px;color:#64748b;margin-left:8px">Active Slides: <strong>${previewSlides.length}</strong></span>
          <span style="font-size:13px;color:#64748b">Total: <strong>${slides.length}</strong></span>
        </div>
        <div style="margin-bottom:20px">
          <h4 style="margin-bottom:10px;font-size:14px;color:#334155">Live Preview</h4>
          <div style="display:flex;gap:12px;overflow-x:auto;padding:8px 0;scrollbar-width:none">${previewHTML}</div>
        </div>
      </div>
      <div class="data-table-wrap"><table class="data-table"><thead><tr>
        <th>#</th><th>Type</th><th>Media URL</th><th>Link URL</th><th>Title</th><th>Status</th><th>Order</th><th>Created</th><th>Actions</th>
      </tr></thead><tbody>${slideRows}</tbody></table></div>
    </div>`;
  } catch (e) { el.innerHTML = `<div class="empty-state"><p>${e.message}</p></div>`; }
};

window.toggleHeroCarousel = async function (enabled) {
  try { await api.heroCarouselToggle(enabled); toast(`Hero carousel ${enabled ? 'enabled' : 'disabled'}`); renderHeroCarousel(); }
  catch (e) { toast(e.message, 'error'); }
};

window.showAddHeroSlide = function () {
  modal('Add Hero Slide', `<div class="form-grid">
    <div class="form-group"><label>Type</label><select id="hc-type"><option value="IMAGE">Image</option><option value="VIDEO">Video</option></select></div>
    <div class="form-group"><label>Sort Order</label><input type="number" id="hc-order" value="0"></div>
    <div class="form-group full-width"><label>Media URL</label><input type="text" id="hc-url" placeholder="https://example.com/banner.jpg"></div>
    <div class="form-group full-width"><label>Link URL (optional)</label><input type="text" id="hc-link" placeholder="https://example.com/promo"></div>
    <div class="form-group full-width"><label>Title (optional)</label><input type="text" id="hc-title" placeholder="Summer Sale"></div>
    <div class="form-group"><label>Active</label><select id="hc-active"><option value="true">Yes</option><option value="false">No</option></select></div>
  </div>`, `<button class="btn btn-outline" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="submitHeroSlide()">Save</button>`);
};

window.showEditHeroSlide = function (id, type, encodedUrl, encodedLink, title, isActive, sortOrder) {
  const url = decodeURIComponent(encodedUrl);
  const link = encodedLink ? decodeURIComponent(encodedLink) : '';
  modal('Edit Hero Slide', `<div class="form-grid">
    <input type="hidden" id="hc-id" value="${id}">
    <div class="form-group"><label>Type</label><select id="hc-type"><option value="IMAGE" ${type === 'IMAGE' ? 'selected' : ''}>Image</option><option value="VIDEO" ${type === 'VIDEO' ? 'selected' : ''}>Video</option></select></div>
    <div class="form-group"><label>Sort Order</label><input type="number" id="hc-order" value="${sortOrder}"></div>
    <div class="form-group full-width"><label>Media URL</label><input type="text" id="hc-url" value="${url}"></div>
    <div class="form-group full-width"><label>Link URL (optional)</label><input type="text" id="hc-link" value="${link}"></div>
    <div class="form-group full-width"><label>Title (optional)</label><input type="text" id="hc-title" value="${title}"></div>
    <div class="form-group"><label>Active</label><select id="hc-active"><option value="true" ${isActive ? 'selected' : ''}>Yes</option><option value="false" ${!isActive ? 'selected' : ''}>No</option></select></div>
  </div>`, `<button class="btn btn-outline" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="submitHeroSlide()">Save</button>`);
};

window.submitHeroSlide = async function () {
  const idEl = document.getElementById('hc-id');
  const payload = {
    type: document.getElementById('hc-type').value,
    mediaUrl: document.getElementById('hc-url').value.trim(),
    linkUrl: document.getElementById('hc-link').value.trim() || null,
    title: document.getElementById('hc-title').value.trim() || null,
    isActive: document.getElementById('hc-active').value === 'true',
    sortOrder: Number(document.getElementById('hc-order').value || 0),
  };
  if (idEl && idEl.value) payload.id = idEl.value;
  if (!payload.mediaUrl) { toast('Media URL is required', 'error'); return; }
  try { await api.heroCarouselSave(payload); closeModal(); toast('Slide saved'); renderHeroCarousel(); }
  catch (e) { toast(e.message, 'error'); }
};

window.deleteHeroSlide = async function (id) {
  if (!confirm('Delete this slide permanently?')) return;
  try { await api.heroCarouselDelete(id); toast('Slide deleted'); renderHeroCarousel(); }
  catch (e) { toast(e.message, 'error'); }
};
