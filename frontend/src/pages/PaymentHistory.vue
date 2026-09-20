<template>
  <div class="page-no-tab payment-history-page">
    <div class="nav-bar">
      <button class="back-btn" @click="$router.back()"><img src="/icons/back.png" /></button>
      <span class="nav-title">Payment History</span>
    </div>

    <div class="filter-tabs history-tabs panel-glass">
      <button class="filter-tab" :class="{ active: activeTab === 'receive' }" @click="activeTab = 'receive'">Receive</button>
      <button class="filter-tab" :class="{ active: activeTab === 'purchase' }" @click="activeTab = 'purchase'">Purchase</button>
    </div>

    <div v-if="activeTab === 'purchase'" class="purchase-header">
      <div class="ph-card panel-glass n-watermark">
        <div class="ph-left">
          <span class="ph-label">Balance:</span>
          <span class="ph-value">₹{{ formatMoney(summary.balance || 0) }}</span>
        </div>
        <div class="ph-right">
          <div><span class="ph-label">Reward:</span> <span class="ph-value text-green">₹{{ formatMoney(summary.commission || 0) }}</span></div>
          <div><span class="ph-label">Pending:</span> <span class="ph-value">₹{{ formatMoney(summary.frozenAmount || 0) }}</span></div>
        </div>
      </div>
    </div>

    <div class="order-list" v-if="list.length > 0">
      <div class="order-item panel-glass n-watermark" v-for="(o, i) in list" :key="i">
        <div class="oi-top">
          <span class="oi-amount" :class="amountClass(o)">
            {{ amountPrefix(o) }}₹{{ formatMoney(o.amount || o.price || 0) }}
          </span>
          <span class="status-pill" :class="'status-' + statusClass(o)">
            {{ normalizeStatus(o) }}
          </span>
        </div>
        <div class="oi-bottom" v-if="activeTab === 'purchase'">
          <span class="oi-reward">Reward: <span class="text-green">+₹{{ formatMoney(o.reward || o.bonus || 0) }}</span></span>
          <span class="oi-time">{{ formatDate(o.createTime || o.createdAt) }}</span>
        </div>
        <div class="oi-bottom" v-else>
          <span class="oi-reward" style="color: rgba(255, 255, 255, 0.72); font-size: 11px; text-transform: capitalize;">{{ (o.title || o.description || 'Transaction').toLowerCase() }}</span>
          <span class="oi-time">{{ formatDate(o.createTime || o.createdAt) }}</span>
        </div>
      </div>
      <div class="load-more" @click="loadMoreAction" v-if="!finished">{{ loading ? 'Loading...' : 'Load More' }}</div>
    </div>
    <div class="no-data panel-glass n-watermark n-watermark-soft" v-else>{{ loading ? 'Loading...' : 'No records found' }}</div>
  </div>
</template>

<script>
import { formatDate, formatMoney, simplifyUserStatus, userStatusClass } from '../utils/helpers'

export default {
  name: 'PaymentHistoryPage',
  data() {
    return {
      activeTab: 'receive',
      summary: {
        balance: 0,
        commission: 0,
        frozenAmount: 0
      },
      list: [],
      page: 1,
      size: 20,
      total: 0,
      loading: false,
      finished: false
    }
  },
  methods: {
    formatDate,
    formatMoney,
    normalizeStatus(item) {
      return simplifyUserStatus(item?.statusName || item?.status);
    },
    statusClass(item) {
      return userStatusClass(item?.statusName || item?.status);
    },
    amountPrefix(item) {
      return this.activeTab === 'receive' ? '+' : '+';
    },
    amountClass(item) {
      const cls = userStatusClass(item?.status || item?.statusName);
      if (this.activeTab === 'receive') return 'text-green';
      if (cls === 'failed' || cls === 'timeout') return 'text-red';
      return 'text-green';
    },
    async fetchSummary() {
      if (this.activeTab !== 'purchase') return;
      try {
        const res = await this.$api.orderApi.summary();
        if (res?.data) this.summary = res.data;
      } catch (e) {}
    },
    async fetchHistory(isRefresh = false) {
      if (this.loading) return;
      if (!isRefresh && this.finished) return;

      if (isRefresh) {
        this.page = 1;
        this.finished = false;
      }

      this.loading = true;
      try {
        const param = { page: this.page, size: this.size };
        let res;
        if (this.activeTab === 'purchase') {
          res = await this.$api.orderApi.buyHistory(param);
        } else {
          param.excludePurchase = true;
          res = await this.$api.pointHistoryApi.page(param);
        }
        const items = Array.isArray(res?.data) ? res.data : (res?.data?.records || []);
        this.list = isRefresh ? items : [...this.list, ...items];
        this.total = Number(res?.data?.total || 0);

        if (items.length < this.size || this.list.length >= this.total) {
          this.finished = true;
        } else {
          this.page += 1;
        }
      } catch (e) {
        this.finished = true;
      } finally {
        this.loading = false;
      }
    },
    refreshAction() {
      this.fetchHistory(true);
    },
    loadMoreAction() {
      this.fetchHistory(false);
    }
  },
  watch: {
    activeTab() {
      this.fetchSummary();
      this.refreshAction();
    }
  },
  mounted() {
    this.fetchSummary();
    this.refreshAction();
  }
}
</script>

<style scoped>
.payment-history-page {
  --ph-accent: #4f8cff;
  --ph-accent-soft: rgba(79, 140, 255, 0.18);
  --ph-accent-faint: rgba(79, 140, 255, 0.1);
  --ph-glass: rgba(255, 255, 255, 0.04);
  --ph-glass-strong: rgba(255, 255, 255, 0.06);
  --ph-border: rgba(255, 255, 255, 0.1);
  --ph-shadow: 0 16px 34px rgba(0, 0, 0, 0.3);
  position: relative;
}

.payment-history-page::before {
  content: '';
  position: absolute;
  inset: 0 0 auto;
  height: 280px;
  background:
    radial-gradient(62% 42% at 84% 4%, rgba(79, 140, 255, 0.13) 0%, rgba(79, 140, 255, 0) 74%),
    radial-gradient(44% 26% at 14% 14%, rgba(105, 200, 155, 0.08) 0%, rgba(105, 200, 155, 0) 76%);
  pointer-events: none;
  z-index: 0;
}

.nav-bar,
.history-tabs,
.purchase-header,
.order-list,
.no-data {
  position: relative;
  z-index: 1;
}

.panel-glass {
  background: linear-gradient(165deg, var(--ph-glass-strong) 0%, var(--ph-glass) 70%, rgba(255, 255, 255, 0.02) 100%);
  border: 1px solid var(--ph-border);
  border-radius: 20px;
  box-shadow: var(--ph-shadow);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
}

.n-watermark {
  position: relative;
  overflow: hidden;
}

.n-watermark::after {
  content: 'N';
  position: absolute;
  right: -10px;
  bottom: -16px;
  font-size: 64px;
  font-weight: 800;
  line-height: 1;
  letter-spacing: -0.02em;
  font-family: var(--font-brand);
  color: rgba(79, 140, 255, 0.08);
  transform: rotate(-14deg);
  transform-origin: bottom right;
  pointer-events: none;
}

.n-watermark-soft::after {
  color: rgba(79, 140, 255, 0.06);
}

.history-tabs {
  margin: 0 16px 12px;
  padding: 6px;
}

.history-tabs .filter-tab {
  color: rgba(255, 255, 255, 0.64);
  font-size: 10px;
  letter-spacing: 0.08em;
}

.history-tabs .filter-tab.active {
  background: linear-gradient(145deg, #4f8cff 0%, #2e6ae6 100%);
  color: #d0e4ff;
}

.purchase-header {
  padding: 0 16px;
}

.ph-card {
  padding: 14px 14px;
  color: rgba(255, 255, 255, 0.94);
  display: flex;
  justify-content: space-between;
  gap: 10px;
  position: relative;
}

.ph-label {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: rgba(255, 255, 255, 0.56);
  font-family: var(--font-label);
}

.ph-value {
  font-size: clamp(20px, 5.6vw, 24px);
  font-weight: 800;
  line-height: 1.08;
  letter-spacing: -0.01em;
  display: block;
}

.ph-right { text-align: right; }
.ph-right div { margin-bottom: 4px; }
.ph-right .ph-value {
  font-size: 16px;
}

.order-list {
  padding: 10px 16px 20px;
}

.order-item {
  margin-bottom: 10px;
  border-radius: 16px;
  padding: 12px;
}

.oi-top {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 10px;
  margin-bottom: 8px;
}

.oi-amount {
  font-size: clamp(22px, 6.5vw, 28px);
  line-height: 1.05;
  font-weight: 800;
  letter-spacing: -0.01em;
}

.oi-bottom {
  display: flex;
  justify-content: space-between;
  align-items: flex-end;
  gap: 10px;
  margin-bottom: 2px;
}

.oi-reward {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.72);
}

.oi-time,
.oi-time-left {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.54);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-family: var(--font-label);
}

.oi-time {
  text-align: right;
}

.load-more {
  text-align: center;
  padding: 12px;
  color: rgba(203, 219, 158, 0.95);
  font-size: 11px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-family: var(--font-label);
  cursor: pointer;
}

.no-data {
  margin: 0 16px;
  text-align: center;
  padding: 22px 14px;
  color: rgba(255, 255, 255, 0.6);
  font-size: 13px;
  border-radius: 16px;
}

@media (max-width: 380px) {
  .history-tabs,
  .purchase-header,
  .order-list,
  .no-data {
    margin-left: 12px;
    margin-right: 12px;
  }

  .purchase-header,
  .order-list {
    padding-left: 0;
    padding-right: 0;
  }

  .order-item {
    padding: 10px;
  }
}
</style>
