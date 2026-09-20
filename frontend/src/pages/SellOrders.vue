<template>
  <div class="page-no-tab">
    <div class="nav-bar">
      <button class="back-btn" @click="$router.back()"><img src="/icons/back.png" /></button>
      <span class="nav-title">Sell Orders</span>
    </div>
    <div class="pill-tabs">
      <button class="pill-tab" :class="{ active: activeStatus === s.value }" v-for="s in statuses" :key="s.value" @click="activeStatus = s.value">
        {{ s.label }}
      </button>
    </div>
    <div class="order-list" v-if="list.length > 0">
      <div class="card sell-card" v-for="(o, i) in list" :key="i" @click="openOrderDetail(o)">
        <div class="sell-header">
          <div class="sell-title">Sell Order</div>
          <span class="status-dot" :class="'dot-' + mapStatusClass(o.status)">•{{ mapStatus(o.status) }}</span>
        </div>
        <div class="sell-amount">₹ {{ formatMoney(o.amount) }}</div>
        <div class="sell-footer">
          <span class="sell-date">{{ formatDate(o.createTime || o.createdAt) }}</span>
          <button class="btn-small">{{ mapStatus(o.status) === 'Completed' ? 'Done' : 'Pending' }}</button>
        </div>
      </div>
      <div class="load-more" @click="loadMoreAction" v-if="!finished">
        {{ loading ? 'Loading...' : 'Load More' }}
      </div>
      <div class="no-data-hint" v-else>No more data</div>
    </div>
    <div class="no-data" v-else>{{ loading ? 'Loading sell orders...' : 'No sell orders found.' }}</div>
  </div>
</template>

<script>
import { formatMoney, formatDate } from '../utils/helpers'

export default {
  name: 'SellOrdersPage',
  data() {
    return {
      activeStatus: '',
      list: [],
      page: 1,
      size: 20,
      total: 0,
      loading: false,
      finished: false,
      statuses: [
        { label: 'All', value: '' },
        { label: 'Pending', value: 'PENDING' },
        { label: 'Completed', value: 'COMPLETED' }
      ]
    }
  },
  methods: {
    formatMoney,
    formatDate,
    normalizeSellStatus(value) {
      const normalized = String(value || '').toUpperCase();
      if (normalized === 'PENDING' || normalized === 'SUBMITTED') return 'PENDING';
      if (normalized === 'SUCCESS' || normalized === 'COMPLETED') return 'COMPLETED';
      return '';
    },
    isValidOrderId(value) {
      const raw = String(value == null ? '' : value).trim().toLowerCase();
      return Boolean(raw) && raw !== 'undefined' && raw !== 'null' && raw !== 'nan';
    },
    openOrderDetail(order) {
      const orderId = order?.buyId || order?.id || order?.orderNo || order?.code;
      if (!this.isValidOrderId(orderId)) return;
      this.$router.push(`/order-detail/${orderId}`);
    },
    mapStatus(val) {
      return this.normalizeSellStatus(val) === 'COMPLETED' ? 'Completed' : 'Pending';
    },
    mapStatusClass(val) {
      return this.normalizeSellStatus(val) === 'COMPLETED' ? 'success' : 'pending';
    },
    async fetchOrders(isRefresh = false) {
      if (this.loading) return;
      if (!isRefresh && this.finished) return;
      if (isRefresh) {
        this.page = 1;
        this.finished = false;
      }
      this.loading = true;
      try {
        const res = await this.$api.receiveApi.orderPage({
          page: this.page,
          size: this.size
        });
        const records = Array.isArray(res?.data) ? res.data : (res?.data?.records || []);
        const filtered = records.filter((record) => {
          const normalized = this.normalizeSellStatus(record?.status);
          if (!normalized) return false;
          if (!this.activeStatus) return true;
          return normalized === this.activeStatus;
        });

        this.list = isRefresh ? filtered : [...this.list, ...filtered];
        this.total = Number(res?.data?.total || 0);
        if (records.length < this.size || this.list.length >= this.total) {
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
      this.fetchOrders(true);
    },
    loadMoreAction() {
      this.fetchOrders(false);
    }
  },
  watch: {
    activeStatus() {
      this.refreshAction();
    }
  },
  mounted() {
    this.refreshAction();
  }
}
</script>

<style scoped>
.sell-card { margin-bottom: 10px; }
.sell-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.sell-title { font-size: 14px; color: var(--text-secondary); font-weight: 600; }
.status-dot { font-size: 14px; font-weight: 600; }
.dot-success { color: var(--primary); }
.dot-timeout,
.dot-failed,
.dot-cancelled { color: var(--text-red); }
.dot-pending { color: var(--accent-gold); }
.dot-submitted { color: var(--accent-gold-dark); }
.sell-amount {
  font-size: 20px;
  font-weight: 800;
  color: var(--text-red);
  background: var(--status-error-bg);
  padding: 8px 16px;
  border-radius: var(--radius-sm);
  margin-bottom: 10px;
  display: inline-block;
}
.sell-footer { display: flex; justify-content: space-between; align-items: center; }
.sell-date { font-size: 13px; color: var(--text-muted); }
</style>
