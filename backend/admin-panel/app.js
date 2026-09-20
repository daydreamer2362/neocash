// ═══════════════════════════════════════════════════════
//  Main App — NeoCash Admin (UPI, Tasks, Users + Router)
// ═══════════════════════════════════════════════════════

// ─── UPI ACCOUNTS PAGE ──────────────────────────────
window.renderUPIAccounts = async function (page = 1) {
  const el = document.getElementById('page-content');
  el.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
  window._paginate = (p) => renderUPIAccounts(p);
  try {
    const d = await api.upiList({ page, size: 15 });
    el.innerHTML = `<div class="table-card">
      <div class="table-header"><div class="table-title">UPI Accounts</div>
        <div class="table-actions"><button class="btn btn-primary btn-sm" onclick="showCreateUPIModal()">+ Add UPI</button></div></div>
      <div class="data-table-wrap"><table class="data-table"><thead><tr>
        <th>#</th><th>Login No</th><th>Name</th><th>Wallet</th><th>UPI ID</th><th>Status</th><th>Success Rate</th><th>Limit</th><th>Created</th><th>Actions</th>
      </tr></thead><tbody>${d.records.length ? d.records.map((r, i) => `<tr>
        <td>${(page - 1) * 15 + i + 1}</td><td>${r.loginNumber}</td><td>${r.accountName}</td>
        <td>${r.walletType}</td><td>${r.upiId || '—'}</td>
        <td>${r.isOnline ? '<span class="badge badge-online">Online</span>' : '<span class="badge badge-offline">Offline</span>'}</td>
        <td>${r.successRate}</td><td>${fmtMoney(r.minAmount)}–${fmtMoney(r.maxAmount)}</td>
        <td>${fmtDate(r.createdAt)}</td>
        <td>
          <button class="btn btn-sm ${r.isOnline ? 'btn-warning' : 'btn-success'}" onclick="doToggleUPI('${r.id}')">${r.isOnline ? 'Off' : 'On'}</button>
          <button class="btn btn-sm btn-outline" onclick="showEditUPIModal('${r.id}','${r.loginNumber}','${r.accountName}','${r.walletType}','${r.upiId || ''}','${r.dailyLimit}','${r.minAmount}','${r.maxAmount}')">Edit</button>
          <button class="btn btn-sm btn-danger" onclick="doDeleteUPI('${r.id}')">Del</button>
        </td></tr>`).join('') : '<tr><td colspan="10"><div class="empty-state"><p>No UPI accounts</p></div></td></tr>'}</tbody></table></div>
      ${paginationHTML(d.page, d.total, 15)}</div>`;
  } catch (e) { el.innerHTML = `<div class="empty-state"><p>${e.message}</p></div>`; }
};
window.doToggleUPI = async function (id) {
  try { await api.toggleUPI(id); toast('UPI status toggled'); renderUPIAccounts(); } catch (e) { toast(e.message, 'error'); }
};
window.doDeleteUPI = async function (id) {
  if (!confirm('Delete this UPI account?')) return;
  try { await api.deleteUPI(id); toast('UPI deleted'); renderUPIAccounts(); } catch (e) { toast(e.message, 'error'); }
};
window.showCreateUPIModal = function () {
  modal('Add UPI Account', `<div class="form-grid">
    <div class="form-group"><label>Login Number</label><input id="upi-login"></div>
    <div class="form-group"><label>Account Name</label><input id="upi-name"></div>
    <div class="form-group"><label>Wallet Type</label><select id="upi-wtype"><option>Paytm</option><option>Mobikwik</option><option>PhonePe</option><option>GooglePay</option><option>BankTransfer</option></select></div>
    <div class="form-group"><label>UPI ID</label><input id="upi-id" placeholder="user@paytm"></div>
    <div class="form-group"><label>Daily Limit</label><input type="number" id="upi-limit" value="100000"></div>
    <div class="form-group"><label>Min Amount</label><input type="number" id="upi-min" value="100"></div>
    <div class="form-group"><label>Max Amount</label><input type="number" id="upi-max" value="100000"></div>
  </div>`, `<button class="btn btn-outline" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="submitCreateUPI()">Create</button>`);
};
window.submitCreateUPI = async function () {
  try {
    await api.createUPI({
      loginNumber: document.getElementById('upi-login').value, accountName: document.getElementById('upi-name').value,
      walletType: document.getElementById('upi-wtype').value, upiId: document.getElementById('upi-id').value,
      dailyLimit: document.getElementById('upi-limit').value, minAmount: document.getElementById('upi-min').value,
      maxAmount: document.getElementById('upi-max').value
    });
    closeModal(); toast('UPI account created'); renderUPIAccounts();
  } catch (e) { toast(e.message, 'error'); }
};
window.showEditUPIModal = function (id, login, name, wtype, upiId, limit, min, max) {
  modal('Edit UPI Account', `<div class="form-grid">
    <div class="form-group"><label>Login Number</label><input id="eupi-login" value="${login}"></div>
    <div class="form-group"><label>Account Name</label><input id="eupi-name" value="${name}"></div>
    <div class="form-group"><label>Wallet Type</label><input id="eupi-wtype" value="${wtype}"></div>
    <div class="form-group"><label>UPI ID</label><input id="eupi-id" value="${upiId}"></div>
    <div class="form-group"><label>Daily Limit</label><input type="number" id="eupi-limit" value="${limit}"></div>
    <div class="form-group"><label>Min Amount</label><input type="number" id="eupi-min" value="${min}"></div>
    <div class="form-group"><label>Max Amount</label><input type="number" id="eupi-max" value="${max}"></div>
  </div>`, `<button class="btn btn-outline" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="submitEditUPI('${id}')">Save</button>`);
};
window.submitEditUPI = async function (id) {
  try {
    await api.editUPI(id, {
      loginNumber: document.getElementById('eupi-login').value, accountName: document.getElementById('eupi-name').value,
      walletType: document.getElementById('eupi-wtype').value, upiId: document.getElementById('eupi-id').value,
      dailyLimit: document.getElementById('eupi-limit').value, minAmount: document.getElementById('eupi-min').value,
      maxAmount: document.getElementById('eupi-max').value
    });
    closeModal(); toast('UPI account updated'); renderUPIAccounts();
  } catch (e) { toast(e.message, 'error'); }
};

// ─── TASK MANAGEMENT PAGE ───────────────────────────
window.renderTasks = async function (page = 1, search = '') {
  const el = document.getElementById('page-content');
  el.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
  window._paginate = (p) => renderTasks(p, search);
  try {
    const d = await api.taskList({ page, size: 15, search });
    el.innerHTML = `<div class="table-card">
      <div class="table-header"><div class="table-title">Task Management</div>
        <div class="table-actions">
          <input placeholder="Search task..." value="${search}" onkeyup="if(event.key==='Enter')renderTasks(1,this.value)">
          <button class="btn btn-primary btn-sm" onclick="showCreateTaskModal()">+ Add Task</button></div></div>
      <div class="data-table-wrap"><table class="data-table"><thead><tr>
        <th>#</th><th>Task Number</th><th>Task Name</th><th>Type</th><th>Description</th><th>Reward (₹)</th><th>Target</th><th>Status</th><th>Actions</th>
      </tr></thead><tbody>${d.records.length ? d.records.map((r, i) => `<tr>
        <td>${(page - 1) * 15 + i + 1}</td><td>${r.taskNumber || '—'}</td><td>${r.title}</td>
        <td>${taskTypeBadge(r.taskType)}</td>
        <td style="max-width:250px;white-space:normal;font-size:12px">${r.description || '—'}</td>
        <td>${r.rewardValue}</td><td>${r.targetValue}</td>
        <td>${r.isActive ? '<span class="badge badge-online">Enabled</span>' : '<span class="badge badge-offline">Disabled</span>'}</td>
        <td>
          <button class="btn btn-sm ${r.isActive ? 'btn-warning' : 'btn-success'}" onclick="doToggleTask('${r.id}')">${r.isActive ? 'Disable' : 'Enable'}</button>
          <button class="btn btn-sm btn-outline" onclick="showEditTaskModal('${r.id}','${r.taskNumber || ''}','${r.title}','${r.type}','${r.taskType}','${r.rewardValue}','${r.targetValue}','${(r.description || '').replace(/'/g, "\\'")}')">Edit</button>
          <button class="btn btn-sm btn-danger" onclick="doDeleteTask('${r.id}')">Delete</button>
        </td></tr>`).join('') : '<tr><td colspan="9"><div class="empty-state"><p>No tasks</p></div></td></tr>'}</tbody></table></div>
      ${paginationHTML(d.page, d.total, 15)}</div>`;
  } catch (e) { el.innerHTML = `<div class="empty-state"><p>${e.message}</p></div>`; }
};
window.doToggleTask = async function (id) {
  try { await api.toggleTask(id); toast('Task toggled'); renderTasks(); } catch (e) { toast(e.message, 'error'); }
};
window.doDeleteTask = async function (id) {
  if (!confirm('Delete this task?')) return;
  try { await api.deleteTask(id); toast('Task deleted'); renderTasks(); } catch (e) { toast(e.message, 'error'); }
};
window.showCreateTaskModal = function () {
  modal('Add New Task', `<div class="form-grid">
    <div class="form-group"><label>Task Number</label><input id="tk-num" placeholder="newbie_task"></div>
    <div class="form-group"><label>Task Name</label><input id="tk-title" placeholder="Newbie Task"></div>
    <div class="form-group"><label>Type</label><select id="tk-type"><option value="FIRST_ORDER">First Order</option><option value="DAILY">Daily</option><option value="VOLUME">Volume</option></select></div>
    <div class="form-group"><label>Task Type</label><select id="tk-ttype"><option value="newbie_tasks">Newbie Tasks</option><option value="daily_tasks">Daily Tasks</option><option value="invite_tasks">Invite Tasks</option></select></div>
    <div class="form-group"><label>Reward (₹)</label><input type="number" id="tk-reward" value="200"></div>
    <div class="form-group"><label>Target Value</label><input type="number" id="tk-target" value="30000"></div>
    <div class="form-group full-width"><label>Description</label><textarea id="tk-desc" rows="3"></textarea></div>
  </div>`, `<button class="btn btn-outline" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="submitCreateTask()">Create</button>`);
};
window.submitCreateTask = async function () {
  try {
    await api.createTask({
      taskNumber: document.getElementById('tk-num').value, title: document.getElementById('tk-title').value,
      type: document.getElementById('tk-type').value, taskType: document.getElementById('tk-ttype').value,
      rewardValue: document.getElementById('tk-reward').value, targetValue: document.getElementById('tk-target').value,
      description: document.getElementById('tk-desc').value
    });
    closeModal(); toast('Task created'); renderTasks();
  } catch (e) { toast(e.message, 'error'); }
};
window.showEditTaskModal = function (id, num, title, type, ttype, reward, target, desc) {
  modal('Edit Task', `<div class="form-grid">
    <div class="form-group"><label>Task Number</label><input id="etk-num" value="${num}"></div>
    <div class="form-group"><label>Task Name</label><input id="etk-title" value="${title}"></div>
    <div class="form-group"><label>Reward (₹)</label><input type="number" id="etk-reward" value="${reward}"></div>
    <div class="form-group"><label>Target Value</label><input type="number" id="etk-target" value="${target}"></div>
    <div class="form-group full-width"><label>Description</label><textarea id="etk-desc" rows="3">${desc}</textarea></div>
  </div>`, `<button class="btn btn-outline" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="submitEditTask('${id}')">Save</button>`);
};
window.submitEditTask = async function (id) {
  try {
    await api.editTask(id, {
      taskNumber: document.getElementById('etk-num').value, title: document.getElementById('etk-title').value,
      rewardValue: document.getElementById('etk-reward').value, targetValue: document.getElementById('etk-target').value,
      description: document.getElementById('etk-desc').value
    });
    closeModal(); toast('Task updated'); renderTasks();
  } catch (e) { toast(e.message, 'error'); }
};

// ─── USERS PAGE ─────────────────────────────────────
window.renderUsers = async function (page = 1, search = '') {
  const el = document.getElementById('page-content');
  el.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
  window._paginate = (p) => renderUsers(p, search);
  try {
    const d = await api.userList({ page, size: 15, search });
    el.innerHTML = `<div class="table-card">
      <div class="table-header"><div class="table-title">Member List</div>
        <div class="table-actions"><input placeholder="Search username, phone, or user ID..." value="${search}" onkeyup="if(event.key==='Enter')renderUsers(1,this.value)"></div></div>
      <div class="data-table-wrap"><table class="data-table"><thead><tr>
        <th>#</th><th>Username</th><th>Phone</th><th>User ID</th><th>Available</th><th>Withdrawal</th><th>Total Reward</th><th>Orders</th><th>Team</th><th>Role</th><th>Joined</th><th>Actions</th>
      </tr></thead><tbody>${d.records.length ? d.records.map((r, i) => `<tr>
        <td>${(page - 1) * 15 + i + 1}</td><td><strong>${r.userName}</strong></td><td>${r.phone}</td>
        <td><code>${r.userId || r.referralCode}</code></td><td>${fmtMoney(r.availableBalance)}</td>
        <td>${fmtMoney(r.withdrawalBalance)}</td><td>${fmtMoney(r.totalReward)}</td>
        <td>${r._count?.orders || 0}</td><td>${r._count?.invitees || 0}</td>
        <td>${r.role === 'ADMIN' ? '<span class="badge badge-claimed">Admin</span>' : '<span class="badge badge-ready">User</span>'}</td>
        <td>${fmtDate(r.createdAt)}</td>
        <td>
          <button class="btn btn-sm btn-outline" onclick="showBalanceModal('${r.id}','${r.userName}')">Balance</button>
          <button class="btn btn-sm ${r.isActive ? 'btn-warning' : 'btn-success'}" onclick="doToggleUser('${r.id}')">${r.isActive ? 'Disable' : 'Enable'}</button>
        </td></tr>`).join('') : '<tr><td colspan="12"><div class="empty-state"><p>No users</p></div></td></tr>'}</tbody></table></div>
      ${paginationHTML(d.page, d.total, 15)}</div>`;
  } catch (e) { el.innerHTML = `<div class="empty-state"><p>${e.message}</p></div>`; }
};
window.doToggleUser = async function (id) {
  try { await api.toggleUser(id); toast('User toggled'); renderUsers(); } catch (e) { toast(e.message, 'error'); }
};
window.showBalanceModal = function (id, name) {
  modal(`Adjust Balance — ${name}`, `<div class="form-grid">
    <div class="form-group"><label>Amount (₹)</label><input type="number" id="bal-amt"></div>
    <div class="form-group"><label>Action</label><select id="bal-type"><option value="add">Add</option><option value="deduct">Deduct</option></select></div>
  </div>`, `<button class="btn btn-outline" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="submitBalance('${id}')">Apply</button>`);
};
window.submitBalance = async function (id) {
  try {
    await api.updateBalance({ userId: id, amount: document.getElementById('bal-amt').value, type: document.getElementById('bal-type').value });
    closeModal(); toast('Balance updated'); renderUsers();
  } catch (e) { toast(e.message, 'error'); }
};

// ─── READY TO SELL PAGE ─────────────────────────────
window._readySellState = { page: 1, search: '' };
window._readySellBalanceHistoryCache = {};

window.escapeMonitorHtml = function (value) {
  return String(value == null ? '' : value)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
};

window.renderIpUsersCell = function (users) {
  const rows = Array.isArray(users) ? users : [];
  if (!rows.length) return '—';
  return `<div style="display:flex;flex-direction:column;gap:4px">
    ${rows.slice(0, 3).map((row) => `
      <div style="border:1px solid #e5e7eb;border-radius:6px;padding:4px 6px;background:#f8fafc">
        <div style="font-size:12px;font-weight:700">${window.escapeMonitorHtml(row.mail || row.userName || row.userId || 'Unknown')}</div>
        <div style="font-size:11px;color:#64748b">${window.escapeMonitorHtml(row.phone || 'No phone')}</div>
      </div>
    `).join('')}
  </div>`;
};

window.renderReadySellBalanceHistory = function (payload) {
  const data = payload || {};
  const summary = data.summary || {};
  const sourceTotals = Array.isArray(summary.sourceTotals) ? summary.sourceTotals : [];
  const records = Array.isArray(data.records) ? data.records : [];

  const sourceHtml = sourceTotals.length
    ? `<div style="display:flex;flex-direction:column;gap:4px;margin-top:6px">
        ${sourceTotals.slice(0, 8).map((row) => {
      const sign = row.direction === 'DEBIT' ? '-' : '+';
      const color = row.direction === 'DEBIT' ? '#dc2626' : '#15803d';
      return `<div style="display:flex;justify-content:space-between;gap:8px;font-size:12px">
            <span>${window.escapeMonitorHtml(row.label || row.type || 'Source')} (${Number(row.count || 0)})</span>
            <span style="color:${color};font-weight:700">${sign}${fmtMoney(row.amount || 0)}</span>
          </div>`;
    }).join('')}
      </div>`
    : '<small style="color:#64748b">No source totals yet</small>';

  const recordHtml = records.length
    ? `<div style="display:flex;flex-direction:column;gap:6px;margin-top:8px">
        ${records.slice(0, 12).map((row) => {
      const sign = row.direction === 'DEBIT' ? '-' : '+';
      const color = row.direction === 'DEBIT' ? '#dc2626' : '#15803d';
      const orderInfo = row.orderCode || row.orderRef
        ? `<div style="font-size:11px;color:#64748b">Order: ${window.escapeMonitorHtml(row.orderCode || row.orderRef || '')}</div>`
        : '';
      return `<div style="border:1px solid #e5e7eb;border-radius:8px;padding:6px 8px;background:#fff">
            <div style="display:flex;justify-content:space-between;gap:8px">
              <strong style="font-size:12px">${window.escapeMonitorHtml(row.label || row.type || 'Transaction')}</strong>
              <span style="font-size:12px;color:${color};font-weight:700">${sign}${fmtMoney(row.amount || 0)}</span>
            </div>
            ${orderInfo}
            <div style="font-size:11px;color:#64748b">${window.escapeMonitorHtml(row.description || '')}</div>
            <div style="font-size:11px;color:#94a3b8">${fmtDate(row.createdAt)}</div>
          </div>`;
    }).join('')}
      </div>`
    : '<small style="color:#64748b">No recent balance history</small>';

  return `<div style="margin-top:8px;max-width:360px">
    <div style="font-size:12px;color:#334155">Available: <strong>${fmtMoney(data.availableAmount || 0)}</strong></div>
    <div style="display:flex;gap:10px;font-size:12px;margin-top:4px">
      <span style="color:#15803d;font-weight:700">Credit: ${fmtMoney(summary.creditTotal || 0)}</span>
      <span style="color:#dc2626;font-weight:700">Debit: ${fmtMoney(summary.debitTotal || 0)}</span>
    </div>
    ${sourceHtml}
    ${recordHtml}
  </div>`;
};

window.toggleReadySellBalanceHistory = async function (detailsEl, userId) {
  if (!detailsEl?.open) return;
  const target = document.getElementById(`rts-balance-history-${userId}`);
  if (!target) return;

  if (!window._readySellBalanceHistoryCache[userId]) {
    target.innerHTML = '<small style="color:#64748b">Loading balance history...</small>';
    try {
      const data = await api.readyToSellBalanceHistory(userId, { limit: 30 });
      window._readySellBalanceHistoryCache[userId] = data;
    } catch (e) {
      target.innerHTML = `<small style="color:#dc2626">${window.escapeMonitorHtml(e.message || 'Failed to load')}</small>`;
      return;
    }
  }

  target.innerHTML = window.renderReadySellBalanceHistory(window._readySellBalanceHistoryCache[userId]);
};

window.readySellStatusBadge = function (status) {
  const value = String(status || '').toUpperCase();
  if (value === 'IN_POOL') return '<span class="badge badge-ready">IN_POOL</span>';
  if (value === 'CLAIMED') return '<span class="badge badge-pending">CLAIMED</span>';
  if (value === 'IN_COLLECTION') return '<span class="badge badge-processing">IN_COLLECTION</span>';
  if (value === 'APPROVED') return '<span class="badge badge-success">APPROVED</span>';
  if (value === 'SUCCESS') return '<span class="badge badge-success">SUCCESS</span>';
  if (value === 'FAILED' || value === 'TIMEOUT' || value === 'CANCELLED') return '<span class="badge badge-failed">' + value + '</span>';
  return `<span class="badge badge-pending">${value || 'UNKNOWN'}</span>`;
};

window.renderReadyToSell = async function (page = 1, search = '') {
  window._readySellState = { page, search };
  const el = document.getElementById('page-content');
  el.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
  window._paginate = (p) => renderReadyToSell(p, search);
  try {
    const d = await api.readyToSellList({ page, size: 15, search });
    el.innerHTML = `<div class="table-card">
      <div class="table-header"><div class="table-title">Ready To Sell</div>
        <div class="table-actions">
          <input placeholder="Search member..." value="${search}" onkeyup="if(event.key==='Enter')renderReadyToSell(1,this.value)">
        </div></div>
      <div class="data-table-wrap"><table class="data-table"><thead><tr>
        <th>#</th><th>Member</th><th>Available</th><th>Sellable</th><th>Default Payout UPI</th><th>Sell Start</th><th>Track Orders</th><th>Balance History</th><th>Actions</th>
      </tr></thead><tbody>${d.records.length ? d.records.map((r, i) => {
      const userNameEsc = String(r.userName || '').replace(/'/g, "\\'");
      const upiEsc = String(r.payoutUpi || '').replace(/'/g, "\\'");
      const sellOrders = Array.isArray(r.sellOrders) ? r.sellOrders : [];
      return `<tr>
          <td>${(page - 1) * 15 + i + 1}</td>
          <td><strong>${r.userName}</strong><br><small>${r.memberCode || r.phone || ''}</small></td>
          <td>${fmtMoney(r.availableAmount)}</td>
          <td>${fmtMoney(r.sellableAmount)}</td>
          <td>${r.payoutUpi ? `<code>${r.payoutUpi}</code><br><small>${r.payoutHolderName || ''}</small>` : '<span style="color:#dc2626">No default UPI</span>'}</td>
          <td>${fmtDate(r.sellStartedAt)}</td>
          <td>
            <details>
              <summary>Orders (${sellOrders.length})</summary>
              ${sellOrders.length ? `<div style="display:flex;flex-direction:column;gap:6px;margin-top:6px">${sellOrders.map((o) => `
                <div style="border:1px solid #e5e7eb;border-radius:8px;padding:6px 8px">
                  <div><code>${o.code}</code> ${window.readySellStatusBadge(o.flowStatus)}</div>
                  <div style="font-size:12px;color:#64748b">Amount: ${fmtMoney(o.amount)} ${o.buyId ? `| BuyID: ${o.buyId}` : ''}</div>
                </div>`).join('')}</div>` : '<small>—</small>'}
            </details>
          </td>
          <td>
            <details ontoggle="toggleReadySellBalanceHistory(this,'${r.userId}')">
              <summary>View breakdown</summary>
              <div id="rts-balance-history-${r.userId}" style="margin-top:6px"><small style="color:#64748b">Open to load balance history</small></div>
            </details>
          </td>
          <td>
            <button class="btn btn-sm btn-success" ${!r.payoutUpi || Number(r.sellableAmount || 0) <= 0 ? 'disabled' : ''}
              onclick="showReadySellModal('${r.userId}','${userNameEsc}','${upiEsc}','${Number(r.sellableAmount || 0)}')">Sell</button>
          </td>
        </tr>`;
    }).join('') : '<tr><td colspan="9"><div class="empty-state"><p>No users in ready-to-sell mode</p></div></td></tr>'}</tbody></table></div>
      ${paginationHTML(d.page, d.total, 15)}</div>`;
  } catch (e) {
    el.innerHTML = `<div class="empty-state"><p>${e.message}</p></div>`;
  }
};

window.showReadySellModal = function (userId, userName, payoutUpi, sellableAmount) {
  const maxAmount = Number(sellableAmount || 0);
  const safeUserName = String(userName || '').replace(/"/g, '&quot;');
  const safeUpi = String(payoutUpi || '').replace(/"/g, '&quot;');
  modal('Create Ready Sell Order', `<div class="form-grid">
    <div class="form-group"><label>Member</label><input value="${safeUserName}" disabled></div>
    <div class="form-group"><label>Payout UPI</label><input value="${safeUpi || '—'}" disabled></div>
    <div class="form-group"><label>Sellable Amount (₹)</label><input value="${maxAmount}" disabled></div>
    <div class="form-group"><label>Amount (₹)</label><input type="number" id="rts-amount" min="0.01" step="0.01" value="${maxAmount}"></div>
  </div>`, `<button class="btn btn-outline" onclick="closeModal()">Cancel</button><button class="btn btn-primary" onclick="submitReadySellOrder('${userId}','${maxAmount}')">Sell</button>`);
};

window.submitReadySellOrder = async function (userId, sellableAmount) {
  try {
    const amount = Number(document.getElementById('rts-amount').value || 0);
    const maxAmount = Number(sellableAmount || 0);
    if (!Number.isFinite(amount) || amount <= 0) {
      toast('Enter a valid amount', 'error');
      return;
    }
    if (amount > maxAmount) {
      toast('Amount exceeds sellable balance', 'error');
      return;
    }
    await api.createReadyToSellOrder({ userId, amount });
    closeModal();
    toast('Ready-to-sell order created');
    renderReadyToSell(window._readySellState.page || 1, window._readySellState.search || '');
  } catch (e) {
    toast(e.message, 'error');
  }
};

// ─── REFERRAL SETTINGS PAGE ─────────────────────────
window.renderReferralSettings = async function () {
  const el = document.getElementById('page-content');
  el.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
  try {
    const [referral, system] = await Promise.all([api.referralSettings(), api.systemSettings()]);
    const bPercent = Number(referral.levelBPercent || 3);
    const cPercent = Number(referral.levelCPercent || 1.5);
    const welcomeBonus = Number(system.welcomeBonus || 146.84);
    const orderIncomePercent = Number(system.orderIncomePercent || 4);
    const orderLockMinutes = Number(system.orderLockMinutes || 30);
    const payoutFeeRate = Number(system.payoutFeeRate || 0);
    const messageWelcomeTitle = String(system.messageWelcomeTitle || 'Welcome to NeoCash');
    const messageWelcomeBody = String(system.messageWelcomeBody || 'Start claiming orders to earn 6.5% cashback rewards!');
    const appVersion = String(system.appVersion || '1.1.1');
    const appForceUpdate = Boolean(system.appForceUpdate);
    const appDownloadUrl = String(system.appDownloadUrl || '');
    const supportTelegramUrl = String(system.supportTelegramUrl || 'https://t.me/neocash_official');
    el.innerHTML = `<div class="table-card">
      <div class="table-header"><div class="table-title">Referral & System Settings</div></div>
      <div class="form-grid" style="padding:16px">
        <div class="form-group">
          <label>Team B Commission (%)</label>
          <input type="number" step="0.01" min="0" max="100" id="rf-level-b" value="${bPercent}">
          <small>Direct referrals (Team B) commission on each order.</small>
        </div>
        <div class="form-group">
          <label>Team C Commission (%)</label>
          <input type="number" step="0.01" min="0" max="100" id="rf-level-c" value="${cPercent}">
          <small>Second-level referrals (Team C) commission on each order.</small>
        </div>
        <div class="form-group">
          <label>Welcome Bonus (₹)</label>
          <input type="number" step="0.01" min="0" id="sys-welcome-bonus" value="${welcomeBonus}">
          <small>Credited to user at signup.</small>
        </div>
        <div class="form-group">
          <label>Order Commission Rate (%)</label>
          <input type="number" step="0.01" min="0" id="sys-order-income" value="${orderIncomePercent}">
          <small>Default user return per order when not manually overridden.</small>
        </div>
        <div class="form-group">
          <label>Order Lock Duration (min)</label>
          <input type="number" step="1" min="1" id="sys-order-lock" value="${orderLockMinutes}">
          <small>Lock window for claimed orders before auto-timeout.</small>
        </div>
        <div class="form-group">
          <label>Payout Fee Rate (%)</label>
          <input type="number" step="0.01" min="0" id="sys-payout-fee" value="${payoutFeeRate}">
          <small>Applied in payout config checks.</small>
        </div>
        <div class="form-group">
          <label>Message Title</label>
          <input type="text" id="sys-message-title" value="${messageWelcomeTitle}">
          <small>Shown in app Message page welcome notice.</small>
        </div>
        <div class="form-group">
          <label>Message Body</label>
          <input type="text" id="sys-message-body" value="${messageWelcomeBody}">
          <small>Use <code>{rate}</code> to inject current commission rate.</small>
        </div>
        <div class="form-group">
          <label>Latest App Version</label>
          <input type="text" id="sys-app-version" value="${appVersion}">
          <small>For update comparison (example: 1.2.0).</small>
        </div>
        <div class="form-group">
          <label>Force Update</label>
          <select id="sys-force-update">
            <option value="false" ${!appForceUpdate ? 'selected' : ''}>Disabled</option>
            <option value="true" ${appForceUpdate ? 'selected' : ''}>Enabled</option>
          </select>
          <small>If enabled and app is older than latest version, usage is blocked.</small>
        </div>
        <div class="form-group">
          <label>Update Download URL</label>
          <input type="text" id="sys-download-url" value="${appDownloadUrl}">
          <small>Play Store / APK URL opened from force-update popup.</small>
        </div>
        <div class="form-group">
          <label>Backend API URL (Micro Update)</label>
          <input type="text" id="sys-api-base-url" value="${String(system.apiBaseUrl || '')}">
          <small>Example: https://api.new-domain.com . App will pick this from base param and switch backend dynamically.</small>
        </div>
        <div class="form-group">
          <label>Telegram Support URL</label>
          <input type="text" id="sys-telegram-url" value="${supportTelegramUrl}">
          <small>Used in app Service page. Example: https://t.me/your_support_channel</small>
        </div>
      </div>
      <div class="table-actions" style="padding:0 16px 16px">
        <button class="btn btn-primary" onclick="submitReferralSettings()">Save Settings</button>
      </div>
    </div>`;
  } catch (e) {
    el.innerHTML = `<div class="empty-state"><p>${e.message}</p></div>`;
  }
};

window.submitReferralSettings = async function () {
  try {
    const levelBPercent = Number(document.getElementById('rf-level-b').value || 0);
    const levelCPercent = Number(document.getElementById('rf-level-c').value || 0);
    const welcomeBonus = Number(document.getElementById('sys-welcome-bonus').value || 0);
    const orderIncomePercent = Number(document.getElementById('sys-order-income').value || 0);
    const orderLockMinutes = Number(document.getElementById('sys-order-lock').value || 30);
    const payoutFeeRate = Number(document.getElementById('sys-payout-fee').value || 0);
    const messageWelcomeTitle = String(document.getElementById('sys-message-title').value || '').trim();
    const messageWelcomeBody = String(document.getElementById('sys-message-body').value || '').trim();
    const appVersion = String(document.getElementById('sys-app-version').value || '').trim();
    const appForceUpdate = document.getElementById('sys-force-update').value === 'true';
    const appDownloadUrl = String(document.getElementById('sys-download-url').value || '').trim();
    const apiBaseUrl = String(document.getElementById('sys-api-base-url').value || '').trim();
    const supportTelegramUrl = String(document.getElementById('sys-telegram-url').value || '').trim();
    await Promise.all([
      api.updateReferralSettings({ levelBPercent, levelCPercent }),
      api.updateSystemSettings({ welcomeBonus, orderIncomePercent, payoutFeeRate, orderLockMinutes, messageWelcomeTitle, messageWelcomeBody, appVersion, appForceUpdate, appDownloadUrl, apiBaseUrl, supportTelegramUrl }),
    ]);
    toast('Referral settings updated');
    renderReferralSettings();
  } catch (e) {
    toast(e.message, 'error');
  }
};

// ─── SECURITY MONITOR PAGE ─────────────────────────
window._securityPollTimer = null;
window._networkPollTimer = null;

window.stopSecurityMonitorPolling = function () {
  if (window._securityPollTimer) {
    clearInterval(window._securityPollTimer);
    window._securityPollTimer = null;
  }
};

window.stopNetworkMonitorPolling = function () {
  if (window._networkPollTimer) {
    clearInterval(window._networkPollTimer);
    window._networkPollTimer = null;
  }
};

window.resolveSecurityEvent = async function (id) {
  try {
    await api.resolveSecurity(id);
    toast('Security event marked resolved');
    renderSecurityMonitor();
  } catch (e) {
    toast(e.message, 'error');
  }
};

window.renderSecurityMonitor = async function (isPolling = false) {
  const el = document.getElementById('page-content');

  if (!isPolling) {
    el.innerHTML = `<div class="table-card" id="security-monitor-shell">
      <div class="table-header">
        <div class="table-title">Security Monitor</div>
        <div class="table-actions">
          <button class="btn btn-outline btn-sm" onclick="renderSecurityMonitor()">Refresh</button>
        </div>
      </div>
      <div class="kpi-grid" style="padding:16px">
        <div class="kpi-card"><div class="kpi-label">Unresolved Alerts</div><div class="kpi-value" id="sm-kpi-unresolved">—</div></div>
        <div class="kpi-card"><div class="kpi-label">Critical</div><div class="kpi-value" id="sm-kpi-critical">—</div></div>
        <div class="kpi-card"><div class="kpi-label">High</div><div class="kpi-value" id="sm-kpi-high">—</div></div>
        <div class="kpi-card"><div class="kpi-label">Medium</div><div class="kpi-value" id="sm-kpi-medium">—</div></div>
      </div>
      <div class="data-table-wrap"><table class="data-table">
        <thead><tr>
          <th>Time</th><th>Severity</th><th>Type</th><th>IP</th><th>User</th><th>Method</th><th>Path</th><th>Message</th><th>Details</th><th>Action</th>
        </tr></thead>
        <tbody id="sm-events-body">
          <tr><td colspan="10"><div class="loading-spinner"><div class="spinner"></div></div></td></tr>
        </tbody>
      </table></div>
    </div>`;
  }

  try {
    const [stats, events] = await Promise.all([
      api.securityStats(),
      api.securityEvents({ limit: 300, unresolvedOnly: false }),
    ]);

    const severityBadge = (sev) => {
      const s = String(sev || '').toLowerCase();
      if (s === 'critical') return '<span class="badge badge-failed">CRITICAL</span>';
      if (s === 'high') return '<span class="badge badge-cancelled">HIGH</span>';
      if (s === 'medium') return '<span class="badge badge-pending">MEDIUM</span>';
      return '<span class="badge badge-ready">LOW</span>';
    };

    const unresolvedEl = document.getElementById('sm-kpi-unresolved');
    if (unresolvedEl) unresolvedEl.textContent = stats.unresolved || 0;

    const criticalEl = document.getElementById('sm-kpi-critical');
    if (criticalEl) criticalEl.textContent = stats.bySeverity?.critical || 0;

    const highEl = document.getElementById('sm-kpi-high');
    if (highEl) highEl.textContent = stats.bySeverity?.high || 0;

    const mediumEl = document.getElementById('sm-kpi-medium');
    if (mediumEl) mediumEl.textContent = stats.bySeverity?.medium || 0;

    const bodyHtml = (events || []).length ? events.map((item) => {
      let meta = null;
      if (item && item.meta && typeof item.meta === 'object') {
        meta = item.meta;
      } else if (typeof item?.meta === 'string') {
        try { meta = JSON.parse(item.meta); } catch (e) { meta = { raw: String(item.meta).slice(0, 1000) }; }
      }
      const metaText = meta ? JSON.stringify(meta, null, 2) : '';
      const shortMeta = meta ? (meta.baseHost || meta.status || meta.code || meta.name || 'view') : '—';
      return `<tr>
      <td>${fmtDate(item.createdAt)}</td>
      <td>${severityBadge(item.severity)}</td>
      <td><code>${item.type}</code></td>
      <td>${item.ip || '—'}</td>
      <td style="max-width:220px;white-space:normal">${window.renderIpUsersCell(item.users)}</td>
      <td>${item.method || '—'}</td>
      <td style="max-width:260px;word-break:break-all">${item.path || '—'}</td>
      <td style="max-width:360px;white-space:normal">${item.message || '—'}</td>
      <td style="max-width:320px;white-space:normal">
        ${meta ? `<details><summary>${window.escapeMonitorHtml(shortMeta)}</summary><pre style="white-space:pre-wrap;margin:8px 0 0 0;font-size:11px;line-height:1.35">${window.escapeMonitorHtml(metaText)}</pre></details>` : '—'}
      </td>
      <td>${item.resolvedAt ? '<span class="badge badge-success">Resolved</span>' : `<button class="btn btn-sm btn-primary" onclick="resolveSecurityEvent('${item.id}')">Resolve</button>`}</td>
    </tr>`;
    }).join('') : '<tr><td colspan="10"><div class="empty-state"><p>No active security alerts</p></div></td></tr>';

    const tbody = document.getElementById('sm-events-body');
    if (tbody) tbody.innerHTML = bodyHtml;

    stopSecurityMonitorPolling();
    if (currentPage === 'security-monitor') {
      window._securityPollTimer = setInterval(() => {
        if (currentPage === 'security-monitor') renderSecurityMonitor(true);
      }, 3000);
    }
  } catch (e) {
    if (!isPolling) {
      el.innerHTML = `<div class="empty-state"><p>${e.message}</p></div>`;
    } else {
      toast(e.message, 'error');
    }
  }
};

window.renderSecurityIntegrations = async function () {
  const el = document.getElementById('page-content');
  el.innerHTML = '<div class="loading-spinner"><div class="spinner"></div></div>';
  try {
    const cfg = await api.securityConfig();
    el.innerHTML = `<div class="table-card">
      <div class="table-header">
        <div class="table-title">Security Integrations</div>
        <div class="table-actions">
          <button class="btn btn-outline btn-sm" onclick="renderSecurityIntegrations()">Refresh</button>
        </div>
      </div>
      <div class="form-grid" style="padding:16px">
        <div class="form-group">
          <label>Encryption for Secrets</label>
          <input disabled value="${cfg.encryptionEnabled ? 'Enabled' : 'Disabled (set SECURITY_SETTINGS_ENCRYPTION_KEY)'}">
        </div>
        <div class="form-group">
          <label>Security Ingest Key</label>
          <input type="text" id="sec-ingest-key" placeholder="leave empty to keep existing">
          <small>${cfg.securityIngestKeySet ? `Saved: ${cfg.securityIngestKey}` : 'Not configured'}</small>
        </div>
        <div class="form-group">
          <label>Wazuh Ingest</label>
          <select id="sec-wazuh-enabled">
            <option value="true" ${cfg.wazuhEnabled ? 'selected' : ''}>Enabled</option>
            <option value="false" ${!cfg.wazuhEnabled ? 'selected' : ''}>Disabled</option>
          </select>
        </div>
        <div class="form-group">
          <label>Prometheus Metrics (/metrics)</label>
          <select id="sec-prom-enabled">
            <option value="true" ${cfg.prometheusEnabled ? 'selected' : ''}>Enabled</option>
            <option value="false" ${!cfg.prometheusEnabled ? 'selected' : ''}>Disabled</option>
          </select>
        </div>
        <div class="form-group">
          <label>Telegram Alerts</label>
          <select id="sec-telegram-enabled">
            <option value="true" ${cfg.telegramEnabled ? 'selected' : ''}>Enabled</option>
            <option value="false" ${!cfg.telegramEnabled ? 'selected' : ''}>Disabled</option>
          </select>
        </div>
        <div class="form-group">
          <label>Telegram Bot Token</label>
          <input type="text" id="sec-telegram-token" placeholder="leave empty to keep existing">
          <small>${cfg.telegramBotTokenSet ? `Saved: ${cfg.telegramBotToken}` : 'Not configured'}</small>
        </div>
        <div class="form-group">
          <label>Telegram Chat ID</label>
          <input type="text" id="sec-telegram-chat" placeholder="leave empty to keep existing">
          <small>${cfg.telegramChatIdSet ? `Saved: ${cfg.telegramChatId}` : 'Not configured'}</small>
        </div>
        <div class="form-group">
          <label>Telegram Thread ID (optional)</label>
          <input type="text" id="sec-telegram-thread" value="${cfg.telegramThreadId || ''}">
        </div>
        <div class="form-group">
          <label>Telegram Min Severity</label>
          <select id="sec-telegram-sev">
            <option value="low" ${cfg.telegramMinSeverity === 'low' ? 'selected' : ''}>low</option>
            <option value="medium" ${cfg.telegramMinSeverity === 'medium' ? 'selected' : ''}>medium</option>
            <option value="high" ${cfg.telegramMinSeverity === 'high' ? 'selected' : ''}>high</option>
            <option value="critical" ${cfg.telegramMinSeverity === 'critical' ? 'selected' : ''}>critical</option>
          </select>
        </div>
        <div class="form-group">
          <label>Slack Alerts</label>
          <select id="sec-slack-enabled">
            <option value="true" ${cfg.slackEnabled ? 'selected' : ''}>Enabled</option>
            <option value="false" ${!cfg.slackEnabled ? 'selected' : ''}>Disabled</option>
          </select>
        </div>
        <div class="form-group">
          <label>Slack Webhook URL</label>
          <input type="text" id="sec-slack-url" placeholder="leave empty to keep existing">
          <small>${cfg.slackWebhookUrlSet ? `Saved: ${cfg.slackWebhookUrl}` : 'Not configured'}</small>
        </div>
        <div class="form-group">
          <label>Cloudflare Zone ID</label>
          <input type="text" id="sec-cf-zone" value="${cfg.cloudflareZoneId || ''}">
        </div>
        <div class="form-group">
          <label>Cloudflare API Token</label>
          <input type="text" id="sec-cf-token" placeholder="leave empty to keep existing">
          <small>${cfg.cloudflareApiTokenSet ? `Saved: ${cfg.cloudflareApiToken}` : 'Not configured'}</small>
        </div>
      </div>
      <div class="table-actions" style="padding:0 16px 16px">
        <button class="btn btn-primary" onclick="saveSecurityIntegrations()">Save Integrations</button>
        <button class="btn btn-warning" onclick="sendSecurityTestAlert()">Send Test Alert</button>
      </div>
    </div>`;
  } catch (e) {
    el.innerHTML = `<div class="empty-state"><p>${e.message}</p></div>`;
  }
};

window.saveSecurityIntegrations = async function () {
  const payload = {
    securityIngestKey: String(document.getElementById('sec-ingest-key').value || '').trim(),
    wazuhEnabled: document.getElementById('sec-wazuh-enabled').value === 'true',
    prometheusEnabled: document.getElementById('sec-prom-enabled').value === 'true',
    telegramEnabled: document.getElementById('sec-telegram-enabled').value === 'true',
    telegramBotToken: String(document.getElementById('sec-telegram-token').value || '').trim(),
    telegramChatId: String(document.getElementById('sec-telegram-chat').value || '').trim(),
    telegramThreadId: String(document.getElementById('sec-telegram-thread').value || '').trim(),
    telegramMinSeverity: String(document.getElementById('sec-telegram-sev').value || 'medium'),
    slackEnabled: document.getElementById('sec-slack-enabled').value === 'true',
    slackWebhookUrl: String(document.getElementById('sec-slack-url').value || '').trim(),
    cloudflareZoneId: String(document.getElementById('sec-cf-zone').value || '').trim(),
    cloudflareApiToken: String(document.getElementById('sec-cf-token').value || '').trim(),
  };
  if (!payload.securityIngestKey) delete payload.securityIngestKey;
  if (!payload.telegramBotToken) delete payload.telegramBotToken;
  if (!payload.telegramChatId) delete payload.telegramChatId;
  if (!payload.slackWebhookUrl) delete payload.slackWebhookUrl;
  if (!payload.cloudflareApiToken) delete payload.cloudflareApiToken;
  try {
    await api.updateSecurityConfig(payload);
    toast('Security integrations updated');
    renderSecurityIntegrations();
  } catch (e) {
    toast(e.message, 'error');
  }
};

window.sendSecurityTestAlert = async function () {
  try {
    await api.testSecurityAlert({ severity: 'high', message: 'Admin panel test alert' });
    toast('Test alert sent');
  } catch (e) {
    toast(e.message, 'error');
  }
};

window._networkFailureState = {
  page: 1,
  size: 100,
  sinceHours: 24,
  minStatus: 0,
  type: '',
  path: '',
  search: '',
};

window.networkFailureSeverityBadge = function (sev) {
  const s = String(sev || '').toLowerCase();
  if (s === 'critical') return '<span class="badge badge-failed">CRITICAL</span>';
  if (s === 'high') return '<span class="badge badge-cancelled">HIGH</span>';
  if (s === 'medium') return '<span class="badge badge-pending">MEDIUM</span>';
  return '<span class="badge badge-ready">LOW</span>';
};

window.applyNetworkFailureFilters = function () {
  window._networkFailureState.page = 1;
  window._networkFailureState.sinceHours = Number(document.getElementById('nm-f-since')?.value || 24) || 24;
  window._networkFailureState.minStatus = Number(document.getElementById('nm-f-min-status')?.value || 0) || 0;
  window._networkFailureState.type = String(document.getElementById('nm-f-type')?.value || '').trim().toUpperCase();
  window._networkFailureState.path = String(document.getElementById('nm-f-path')?.value || '').trim();
  window._networkFailureState.search = String(document.getElementById('nm-f-search')?.value || '').trim();
  window.refreshNetworkMonitorValues();
};

window.gotoNetworkFailurePage = function (nextPage) {
  const p = Math.max(1, Number(nextPage || 1) || 1);
  window._networkFailureState.page = p;
  window.refreshNetworkMonitorValues();
};

window.refreshNetworkMonitorValues = async function () {
  const shell = document.getElementById('network-monitor-shell');
  if (!shell) return;

  try {
    const [overviewResp, top, recentErrors, failures] = await Promise.all([
      api.networkOverview(),
      api.networkTop({ limit: 8 }),
      api.networkErrors({ limit: 80, minStatus: 400 }),
      api.networkFailures({
        page: window._networkFailureState.page,
        size: window._networkFailureState.size,
        sinceHours: window._networkFailureState.sinceHours,
        minStatus: window._networkFailureState.minStatus,
        type: window._networkFailureState.type,
        path: window._networkFailureState.path,
        search: window._networkFailureState.search,
      }),
    ]);
    const net = overviewResp.overview || {};
    const sec = overviewResp.security || {};

    const setText = (id, value) => {
      const node = document.getElementById(id);
      if (node) node.textContent = value;
    };

    setText('nm-req-1m', String(Number(net.requestsLast1m || 0)));
    setText('nm-err-rate', `${Number(net.errorRateLast1m || 0).toFixed(2)}%`);
    setText('nm-avg-lat', `${Number(net.avgLatencyMs || 0).toFixed(1)} ms`);
    setText('nm-p95-lat', `${Number(net.p95LatencyMs || 0).toFixed(1)} ms`);
    setText('nm-active-ip', String(Number(net.activeIpsLast1h || 0)));
    setText('nm-unresolved', String(Number(sec.unresolved || 0)));
    setText('nm-critical', String(Number(sec.bySeverity?.critical || 0)));
    setText('nm-total-req', String(Number(net.totalRequests || 0)));

    const topIpRows = (top.byIp || []).map((r) => `<tr>
      <td>${window.escapeMonitorHtml(r.ip || '—')}</td>
      <td style="max-width:220px;white-space:normal">${window.renderIpUsersCell(r.users)}</td>
      <td>${Number(r.count || 0)}</td>
      <td>${Number(r.errors || 0)}</td>
    </tr>`).join('');
    const topPathRows = (top.byPath || []).map((r) => `<tr><td style="max-width:340px;word-break:break-all">${window.escapeMonitorHtml(r.path || '—')}</td><td>${r.count}</td><td>${r.errors}</td></tr>`).join('');
    const statusRows = (top.byStatus || []).map((r) => `<tr><td>${r.status}</td><td>${r.count}</td></tr>`).join('');
    const recentErrorRows = (recentErrors || []).map((r) => `<tr>
      <td>${fmtDate(r.ts)}</td>
      <td>${window.escapeMonitorHtml(r.ip || '—')}</td>
      <td style="max-width:220px;white-space:normal">${window.renderIpUsersCell(r.users)}</td>
      <td>${r.status}</td>
      <td>${window.escapeMonitorHtml(r.method || '—')}</td>
      <td style="max-width:340px;word-break:break-all">${window.escapeMonitorHtml(r.path || '—')}</td>
      <td>${Number(r.durationMs || 0).toFixed(1)} ms</td>
    </tr>`).join('');

    const topIpBody = document.getElementById('nm-top-ip-body');
    if (topIpBody) topIpBody.innerHTML = topIpRows || '<tr><td colspan="4"><div class="empty-state"><p>No data</p></div></td></tr>';
    const topPathBody = document.getElementById('nm-top-path-body');
    if (topPathBody) topPathBody.innerHTML = topPathRows || '<tr><td colspan="3"><div class="empty-state"><p>No data</p></div></td></tr>';
    const statusBody = document.getElementById('nm-status-body');
    if (statusBody) statusBody.innerHTML = statusRows || '<tr><td colspan="2"><div class="empty-state"><p>No data</p></div></td></tr>';
    const recentErrBody = document.getElementById('nm-recent-error-body');
    if (recentErrBody) recentErrBody.innerHTML = recentErrorRows || '<tr><td colspan="7"><div class="empty-state"><p>No recent errors</p></div></td></tr>';

    const failureRows = (failures?.records || []).map((r) => {
      const statusText = Number(r.status || 0) > 0 ? String(r.status) : '—';
      const reqRef = [r.requestId, r.serverRequestId].filter(Boolean).join(' / ');
      const fullMeta = (r && typeof r.meta === 'object' && r.meta)
        ? r.meta
        : {
          code: r.code || null,
          durationMs: r.durationMs || 0,
          retryAttempts: r.retryAttempts || 0,
          timeoutMs: r.timeoutMs || 0,
          baseHost: r.baseHost || '',
          attemptedHosts: Array.isArray(r.attemptedHosts) ? r.attemptedHosts : [],
          origin: r.origin || '',
        };
      return `<tr>
        <td>${fmtDate(r.ts)}</td>
        <td>${window.networkFailureSeverityBadge(r.severity)}</td>
        <td><code>${window.escapeMonitorHtml(r.type || '—')}</code></td>
        <td>${statusText}</td>
        <td>${window.escapeMonitorHtml(r.method || '—')}</td>
        <td style="max-width:320px;word-break:break-all">${window.escapeMonitorHtml(r.path || '—')}</td>
        <td>${window.escapeMonitorHtml(r.ip || '—')}</td>
        <td style="max-width:220px;white-space:normal">${window.renderIpUsersCell(r.users)}</td>
        <td style="max-width:220px;white-space:normal">${window.escapeMonitorHtml(reqRef || '—')}</td>
        <td style="max-width:300px;white-space:normal">${window.escapeMonitorHtml(r.message || '—')}</td>
        <td style="max-width:320px;white-space:normal">
          <details><summary>meta</summary><pre style="white-space:pre-wrap;margin:8px 0 0 0;font-size:11px;line-height:1.35">${window.escapeMonitorHtml(JSON.stringify(fullMeta, null, 2))}</pre></details>
        </td>
      </tr>`;
    }).join('');
    const failureBody = document.getElementById('nm-failure-body');
    if (failureBody) {
      failureBody.innerHTML = failureRows || '<tr><td colspan="11"><div class="empty-state"><p>No matching failures</p></div></td></tr>';
    }

    const failSummary = failures?.summary || {};
    setText('nm-f-total', String(Number(failures?.total || 0)));
    setText('nm-f-window', String(window._networkFailureState.sinceHours) + 'h');
    const topTypes = Array.isArray(failSummary.topTypes) ? failSummary.topTypes : [];
    setText('nm-f-top-types', topTypes.slice(0, 3).map((x) => `${x.type}:${x.count}`).join(' | ') || '—');

    const currentPage = Number(failures?.page || window._networkFailureState.page || 1);
    const size = Number(failures?.size || window._networkFailureState.size || 100);
    const total = Number(failures?.total || 0);
    const totalPages = Math.max(1, Math.ceil(total / Math.max(1, size)));
    const pager = document.getElementById('nm-failure-pagination');
    if (pager) {
      pager.innerHTML = `
        <div class="pagination" style="margin:0">
          <div class="pagination-info">Showing page ${currentPage} of ${totalPages} (${total} logs)</div>
          <div class="pagination-buttons">
            <button onclick="gotoNetworkFailurePage(${currentPage - 1})" ${currentPage <= 1 ? 'disabled' : ''}>‹</button>
            <button onclick="gotoNetworkFailurePage(${currentPage + 1})" ${currentPage >= totalPages ? 'disabled' : ''}>›</button>
          </div>
        </div>`;
    }

    const errNode = document.getElementById('network-monitor-error');
    if (errNode) errNode.textContent = '';
  } catch (e) {
    const errNode = document.getElementById('network-monitor-error');
    if (errNode) {
      errNode.textContent = e.message || 'Failed to refresh network monitor';
    } else {
      toast(e.message, 'error');
    }
  }
};

window.renderNetworkMonitor = async function () {
  const el = document.getElementById('page-content');
  el.innerHTML = `<div class="table-card" id="network-monitor-shell">
    <div class="table-header">
      <div class="table-title">Network Monitor</div>
      <div class="table-actions">
        <button class="btn btn-outline btn-sm" onclick="window.refreshNetworkMonitorValues()">Refresh</button>
      </div>
    </div>
    <div id="network-monitor-error" style="padding:0 16px;color:#dc2626;font-size:12px"></div>
    <div class="kpi-grid" style="padding:16px">
      <div class="kpi-card"><div class="kpi-label">Requests (1m)</div><div class="kpi-value" id="nm-req-1m">—</div></div>
      <div class="kpi-card"><div class="kpi-label">Error Rate (1m)</div><div class="kpi-value" id="nm-err-rate">—</div></div>
      <div class="kpi-card"><div class="kpi-label">Avg Latency</div><div class="kpi-value" id="nm-avg-lat">—</div></div>
      <div class="kpi-card"><div class="kpi-label">P95 Latency</div><div class="kpi-value" id="nm-p95-lat">—</div></div>
      <div class="kpi-card"><div class="kpi-label">Active IPs (1h)</div><div class="kpi-value" id="nm-active-ip">—</div></div>
      <div class="kpi-card"><div class="kpi-label">Unresolved Alerts</div><div class="kpi-value" id="nm-unresolved">—</div></div>
      <div class="kpi-card"><div class="kpi-label">Critical Alerts</div><div class="kpi-value" id="nm-critical">—</div></div>
      <div class="kpi-card"><div class="kpi-label">Total Requests</div><div class="kpi-value" id="nm-total-req">—</div></div>
    </div>

    <div class="table-header"><div class="table-title">Top Client IPs</div></div>
    <div class="data-table-wrap"><table class="data-table"><thead><tr><th>IP</th><th>User</th><th>Requests</th><th>Errors</th></tr></thead>
      <tbody id="nm-top-ip-body"><tr><td colspan="4"><div class="empty-state"><p>Loading...</p></div></td></tr></tbody></table></div>

    <div class="table-header"><div class="table-title">Top Paths</div></div>
    <div class="data-table-wrap"><table class="data-table"><thead><tr><th>Path</th><th>Requests</th><th>Errors</th></tr></thead>
      <tbody id="nm-top-path-body"><tr><td colspan="3"><div class="empty-state"><p>Loading...</p></div></td></tr></tbody></table></div>

    <div class="table-header"><div class="table-title">Status Distribution</div></div>
    <div class="data-table-wrap"><table class="data-table"><thead><tr><th>Status</th><th>Count</th></tr></thead>
      <tbody id="nm-status-body"><tr><td colspan="2"><div class="empty-state"><p>Loading...</p></div></td></tr></tbody></table></div>

    <div class="table-header"><div class="table-title">Recent Error Requests</div></div>
    <div class="data-table-wrap"><table class="data-table"><thead><tr>
      <th>Time</th><th>IP</th><th>User</th><th>Status</th><th>Method</th><th>Path</th><th>Latency</th>
    </tr></thead>
      <tbody id="nm-recent-error-body"><tr><td colspan="7"><div class="empty-state"><p>Loading...</p></div></td></tr></tbody></table></div>

    <div class="table-header"><div class="table-title">Persistent Failure Logs</div></div>
    <div style="padding:0 16px 12px;display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:8px">
      <input id="nm-f-search" placeholder="Search text / requestId" value="${window._networkFailureState.search || ''}">
      <input id="nm-f-path" placeholder="Path contains (e.g. /app/user/login)" value="${window._networkFailureState.path || ''}">
      <select id="nm-f-min-status">
        <option value="0" ${window._networkFailureState.minStatus === 0 ? 'selected' : ''}>Any status</option>
        <option value="400" ${window._networkFailureState.minStatus === 400 ? 'selected' : ''}>>= 400</option>
        <option value="500" ${window._networkFailureState.minStatus === 500 ? 'selected' : ''}>>= 500</option>
      </select>
      <select id="nm-f-since">
        <option value="1" ${window._networkFailureState.sinceHours === 1 ? 'selected' : ''}>Last 1h</option>
        <option value="6" ${window._networkFailureState.sinceHours === 6 ? 'selected' : ''}>Last 6h</option>
        <option value="24" ${window._networkFailureState.sinceHours === 24 ? 'selected' : ''}>Last 24h</option>
        <option value="72" ${window._networkFailureState.sinceHours === 72 ? 'selected' : ''}>Last 72h</option>
      </select>
      <input id="nm-f-type" placeholder="Type contains (CLIENT_NETWORK_ERROR)" value="${window._networkFailureState.type || ''}">
      <button class="btn btn-primary btn-sm" onclick="applyNetworkFailureFilters()">Apply Filters</button>
    </div>
    <div style="padding:0 16px 12px;display:flex;gap:12px;font-size:12px;color:#334155">
      <span>Total: <strong id="nm-f-total">—</strong></span>
      <span>Window: <strong id="nm-f-window">—</strong></span>
      <span>Top Types: <strong id="nm-f-top-types">—</strong></span>
    </div>
    <div class="data-table-wrap"><table class="data-table"><thead><tr>
      <th>Time</th><th>Severity</th><th>Type</th><th>Status</th><th>Method</th><th>Path</th><th>IP</th><th>User</th><th>Request IDs</th><th>Message</th><th>Meta</th>
    </tr></thead>
      <tbody id="nm-failure-body"><tr><td colspan="11"><div class="empty-state"><p>Loading...</p></div></td></tr></tbody></table></div>
    <div id="nm-failure-pagination" style="padding:12px 16px"></div>
  </div>`;

  await window.refreshNetworkMonitorValues();
  stopNetworkMonitorPolling();
  if (currentPage === 'network-monitor') {
    window._networkPollTimer = setInterval(() => {
      if (currentPage === 'network-monitor') window.refreshNetworkMonitorValues();
    }, 3000);
  }
};

// ═══════════════════════════════════════════════════════
//  ROUTER + APP INIT
// ═══════════════════════════════════════════════════════
const PAGES = {
  'dashboard': { title: 'Statistics', render: renderDashboard },
  'order-pool': { title: 'Order Pool', render: renderOrderPool },
  'purchase-orders': { title: 'Purchase Orders', render: renderPurchaseOrders },
  'collection-orders': { title: 'Collection Orders', render: renderCollectionOrders },
  'history': { title: 'History', render: renderHistory },
  'payment-orders': { title: 'Payment Orders', render: renderPaymentOrders },
  'users': { title: 'Member List', render: renderUsers },
  'ready-to-sell': { title: 'Ready To Sell', render: renderReadyToSell },
  'referral-settings': { title: 'System Settings', render: renderReferralSettings },
  'upi-accounts': { title: 'UPI Accounts', render: renderUPIAccounts },
  'tasks': { title: 'Task Management', render: renderTasks },
  'usdt-orders': { title: 'USDT Orders', render: renderUsdtOrders },
  'usdt-settings': { title: 'USDT Configuration', render: renderUsdtSettings },
  'security-monitor': { title: 'Security Monitor', render: renderSecurityMonitor },
  'security-integrations': { title: 'Security Integrations', render: renderSecurityIntegrations },
  'network-monitor': { title: 'Network Monitor', render: renderNetworkMonitor },
  'manage-carousel': { title: 'Manage Carousel', render: renderManageCarousel },
  'hero-carousel': { title: 'Hero Carousel', render: renderHeroCarousel },
};

let currentPage = 'dashboard';

function navigateTo(page) {
  if (currentPage === 'security-monitor' && page !== 'security-monitor') stopSecurityMonitorPolling();
  if (currentPage === 'network-monitor' && page !== 'network-monitor') stopNetworkMonitorPolling();
  currentPage = page;
  const info = PAGES[page];
  if (!info) return;
  // Update nav
  document.querySelectorAll('.nav-item').forEach(n => n.classList.toggle('active', n.dataset.page === page));
  document.getElementById('breadcrumb').textContent = info.title;
  info.render();
}

function updateClock() {
  const el = document.getElementById('topbar-time');
  if (el) el.textContent = new Date().toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
}

// Login + create-admin handlers
const loginForm = document.getElementById('login-form');
const createAdminForm = document.getElementById('create-admin-form');
const createAdminLink = document.getElementById('create-admin-link');
const createAdminCancel = document.getElementById('create-admin-cancel');

function setCreateAdminMode(enabled) {
  const loginError = document.getElementById('login-error');
  const createError = document.getElementById('create-admin-error');
  if (loginError) loginError.textContent = '';
  if (createError) createError.textContent = '';

  if (loginForm) loginForm.style.display = enabled ? 'none' : 'block';
  if (createAdminForm) createAdminForm.style.display = enabled ? 'block' : 'none';
  if (createAdminLink) createAdminLink.style.display = enabled ? 'none' : 'inline';
}

if (loginForm) {
  loginForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('login-error');
    errEl.textContent = '';
    try {
      const data = await api.login(
        document.getElementById('login-phone').value,
        document.getElementById('login-password').value
      );
      api.setToken(data.token);
      localStorage.setItem('admin_user', data.userName);
      showApp(data.userName);
    } catch (err) {
      errEl.textContent = err.message || 'Login failed';
    }
  });
}

if (createAdminLink) {
  createAdminLink.addEventListener('click', () => setCreateAdminMode(true));
}

if (createAdminCancel) {
  createAdminCancel.addEventListener('click', () => setCreateAdminMode(false));
}

if (createAdminForm) {
  createAdminForm.addEventListener('submit', async (e) => {
    e.preventDefault();
    const errEl = document.getElementById('create-admin-error');
    errEl.textContent = '';

    const phone = String(document.getElementById('create-admin-phone').value || '').trim();
    const userName = String(document.getElementById('create-admin-username').value || '').trim();
    const password = String(document.getElementById('create-admin-password').value || '');
    const creationPass = String(document.getElementById('create-admin-passcode').value || '');

    try {
      const created = await api.createAdminAccount({ phone, userName, password, creationPass });
      document.getElementById('create-admin-phone').value = '';
      document.getElementById('create-admin-username').value = '';
      document.getElementById('create-admin-password').value = '';
      document.getElementById('create-admin-passcode').value = '';

      setCreateAdminMode(false);
      document.getElementById('login-phone').value = created?.userName || created?.phone || '';
      if (typeof toast === 'function') {
        toast('Admin account created. You can sign in now.');
      }
    } catch (err) {
      errEl.textContent = err.message || 'Failed to create admin account';
    }
  });
}

function showApp(userName) {
  document.getElementById('login-screen').style.display = 'none';
  document.getElementById('app').style.display = 'flex';
  document.getElementById('topbar-user').textContent = userName || 'admin';
  navigateTo('dashboard');
}

// Nav clicks
document.querySelectorAll('.nav-item').forEach(item => {
  item.addEventListener('click', (e) => {
    e.preventDefault();
    navigateTo(item.dataset.page);
  });
});

// Logout
document.getElementById('btn-logout').addEventListener('click', () => {
  api.clearToken();
  localStorage.removeItem('admin_user');
  document.getElementById('app').style.display = 'none';
  document.getElementById('login-screen').style.display = 'flex';
});

// Sidebar toggle (mobile)
document.getElementById('sidebar-toggle').addEventListener('click', () => {
  document.getElementById('sidebar').classList.toggle('open');
});

// Auto-login if token exists
(function init() {
  updateClock();
  setInterval(updateClock, 30000);
  const token = localStorage.getItem('admin_token');
  const user = localStorage.getItem('admin_user');
  if (token) {
    api.setToken(token);
    showApp(user);
  }
})();
