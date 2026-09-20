<template>
  <div class="page-no-tab orders-page">
    <div class="nav-bar">
      <button class="back-btn" @click="$router.back()"><img src="/icons/back.png" /></button>
      <span class="nav-title">Orders</span>
    </div>

    <div class="filter-tabs orders-tabs panel-glass">
      <button class="filter-tab" :class="{ active: activeTab === 'sell' }" @click="activeTab = 'sell'">Sell Orders</button>
      <button class="filter-tab" :class="{ active: activeTab === 'buy' }" @click="activeTab = 'buy'">Buy Orders</button>
    </div>

    <div class="order-list" v-if="list.length > 0">
      <div class="order-item panel-glass n-watermark" :class="{ clickable: activeTab === 'buy' }" v-for="(o, i) in list" :key="i" @click="openOrderDetail(o)">
        <div class="oi-top">
          <span class="oi-amount" :class="amountClass(o)">
            ₹{{ formatMoney(o.amount || o.price || 0) }}
          </span>
          <span class="status-pill" :class="'status-' + statusClass(o)">
            {{ normalizeStatus(o) }}
          </span>
        </div>
        <div class="oi-bottom">
          <span class="oi-type">{{ orderTypeLabel(o) }}</span>
          <span class="oi-time">{{ formatDate(o.createTime || o.createdAt) }}</span>
        </div>
      </div>
      <div class="load-more" @click="loadMoreAction" v-if="!finished">{{ loading ? 'Loading...' : 'Load More' }}</div>
    </div>
    <div class="no-data panel-glass n-watermark n-watermark-soft" v-else>{{ noDataText }}</div>
  </div>
</template>

<script>
import { formatDate, formatMoney, simplifyUserStatus, userStatusClass } from '../utils/helpers'

export default {
  name: 'OrdersPage',
  data() {
    return {
      activeTab: 'sell',
      list: [],
      page: 1,
      size: 20,
      total: 0,
      loading: false,
      finished: false
    }
  },
  computed: {
    noDataText() {
      if (this.loading) return 'Loading...';
      return this.activeTab === 'sell' ? 'No ready-to-sell tracking orders found.' : 'No approved buy orders found.';
    }
  },
  methods: {
    formatDate,
    formatMoney,
    applyTabFromRoute() {
      const tab = String(this.$route?.query?.tab || '').toLowerCase();
      if (tab === 'buy' || tab === 'sell') {
        this.activeTab = tab;
      }
    },
    isValidOrderId(value) {
      const raw = String(value == null ? '' : value).trim().toLowerCase();
      return Boolean(raw) && raw !== 'undefined' && raw !== 'null' && raw !== 'nan';
    },
    openOrderDetail(order) {
      if (this.activeTab !== 'buy') return;
      const orderId = order?.buyId || order?.id || order?.orderNo || order?.code;
      if (!this.isValidOrderId(orderId)) return;
      this.$router.push(`/order-detail/${orderId}`);
    },
    normalizeSellStatus(status) {
      const normalized = String(status || '').toUpperCase();
      if (normalized === 'IN_POOL' || normalized === 'READY') return 'PENDING';
      if (normalized === 'CLAIMED' || normalized === 'PENDING') return 'PENDING';
      if (normalized === 'IN_COLLECTION' || normalized === 'SUBMITTED') return 'PENDING';
      if (normalized === 'APPROVED' || normalized === 'COMPLETED' || normalized === 'SUCCESS') return 'SUCCESS';
      return 'IN_POOL';
    },
    orderTypeLabel(item) {
      if (this.activeTab === 'sell') {
        const code = item?.orderNo || item?.code || '';
        return code ? `Pool: ${code}` : 'Sell Pool';
      }
      return 'Buy Order';
    },
    normalizeStatus(item) {
      if (this.activeTab === 'sell') return this.normalizeSellStatus(item?.flowStatus || item?.statusName || item?.status);
      return simplifyUserStatus(item?.statusName || item?.status);
    },
    statusClass(item) {
      if (this.activeTab === 'sell') {
        const flow = this.normalizeSellStatus(item?.flowStatus || item?.statusName || item?.status);
        if (flow === 'APPROVED') return 'completed';
        if (flow === 'IN_COLLECTION') return 'submitted';
        return 'pending';
      }
      return userStatusClass(item?.statusName || item?.status);
    },
    amountClass(item) {
      const cls = this.statusClass(item);
      if (cls === 'failed' || cls === 'timeout') return 'text-red';
      return 'text-green';
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
        const apiCall = this.activeTab === 'buy' ? this.$api.orderApi.buyHistory : this.$api.orderApi.readySellTrack;
        const res = await apiCall(this.activeTab === 'buy'
          ? { page: this.page, size: this.size }
          : { page: this.page, size: this.size });
        const data = res?.data || {};
        const rawRecords = Array.isArray(data) ? data : (data.records || []);
        const records = this.activeTab === 'buy'
          ? rawRecords.filter((record) => {
              const status = String(record?.status || record?.statusName || '').toUpperCase();
              return status === 'COMPLETED' || status === 'SUCCESS';
            })
          : rawRecords;

        this.list = isRefresh ? records : [...this.list, ...records];
        this.total = Number(data.total || 0);

        if (rawRecords.length < this.size || (this.total > 0 && (this.page * this.size) >= this.total)) {
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
      this.refreshAction();
    },
    '$route.query.tab'() {
      this.applyTabFromRoute();
    }
  },
  mounted() {
    this.applyTabFromRoute();
    this.refreshAction();
  }
}
</script>

<style scoped>
.orders-page {
  --or-accent: #4f8cff;
  --or-glass: rgba(255, 255, 255, 0.04);
  --or-glass-strong: rgba(255, 255, 255, 0.06);
  --or-border: rgba(255, 255, 255, 0.1);
  --or-shadow: 0 16px 34px rgba(0, 0, 0, 0.3);
  position: relative;
}

.orders-page::before {
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
.orders-tabs,
.order-list,
.no-data {
  position: relative;
  z-index: 1;
}

.panel-glass {
  background: linear-gradient(165deg, var(--or-glass-strong) 0%, var(--or-glass) 70%, rgba(255, 255, 255, 0.02) 100%);
  border: 1px solid var(--or-border);
  border-radius: 20px;
  box-shadow: var(--or-shadow);
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

.orders-tabs {
  margin: 0 16px 12px;
  padding: 6px;
}

.orders-tabs .filter-tab {
  color: rgba(255, 255, 255, 0.64);
  font-size: 10px;
  letter-spacing: 0.08em;
}

.orders-tabs .filter-tab.active {
  background: linear-gradient(145deg, #4f8cff 0%, #2e6ae6 100%);
  color: #d0e4ff;
}

.order-list {
  padding: 10px 16px 20px;
}

.order-item {
  margin-bottom: 10px;
  border-radius: 16px;
  padding: 12px;
}

.order-item.clickable {
  cursor: pointer;
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

.oi-type {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.72);
}

.oi-time {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.54);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-family: var(--font-label);
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

.text-green { color: var(--primary); }
.text-red { color: var(--text-red); }

@media (max-width: 380px) {
  .orders-tabs,
  .order-list,
  .no-data {
    margin-left: 12px;
    margin-right: 12px;
  }

  .order-list {
    padding-left: 0;
    padding-right: 0;
  }

  .order-item {
    padding: 10px;
  }
}
</style>
    applyTabFromRoute() {
      const tab = String(this.$route?.query?.tab || '').toLowerCase();
      if (tab === 'buy' || tab === 'sell') {
        this.activeTab = tab;
      }
    },
