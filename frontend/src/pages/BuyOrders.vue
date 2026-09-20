<template>
  <div class="page-no-tab">
    <div class="nav-bar">
      <button class="back-btn" @click="$router.back()"><img src="/icons/back.png" /></button>
      <span class="nav-title">Buy Orders</span>
    </div>
    <div class="filters">
      <select class="filter-select" v-model="dateRange">
        <option value="30">30 Days ▾</option>
        <option value="7">7 Days</option>
        <option value="90">90 Days</option>
      </select>
      <select class="filter-select" v-model="statusFilter">
        <option value="all">All statuses ▾</option>
        <option value="PENDING">Pending</option>
        <option value="SUCCESS">Success</option>
        <option value="FAILED">Failed</option>
      </select>
    </div>
    <div class="order-list" v-if="list.length > 0">
      <div v-for="(order, i) in list" :key="i" class="list-item" @click="openOrderDetail(order)">
        <div class="item-row">
          <span>Amount: ₹{{ formatMoney(order.amount) }}</span>
          <span :class="mapStatusClass(order.status)">{{ mapStatusLabel(order.status) }}</span>
        </div>
        <div class="item-date">{{ formatDate(order.createTime || order.createdAt) }}</div>
      </div>
      <div class="load-more" @click="loadMoreAction" v-if="!finished">
        {{ loading ? 'Loading...' : 'Load More' }}
      </div>
      <div class="no-data-hint" v-else>No more data</div>
    </div>
    <div class="no-data" v-else>{{ loading ? 'Loading...' : 'No data, pull down to refresh.' }}</div>
  </div>
</template>

<script>
import { formatMoney, formatDate, simplifyUserStatus, userStatusClass } from '../utils/helpers'

export default {
  name: 'BuyOrdersPage',
  data() {
    return {
      dateRange: '30',
      statusFilter: 'all',
      list: [],
      page: 1,
      size: 20,
      total: 0,
      loading: false,
      finished: false
    }
  },
  methods: {
    formatMoney,
    formatDate,
    isValidOrderId(value) {
      const raw = String(value == null ? '' : value).trim().toLowerCase();
      return Boolean(raw) && raw !== 'undefined' && raw !== 'null' && raw !== 'nan';
    },
    openOrderDetail(order) {
      const orderId = order?.buyId || order?.id || order?.orderNo || order?.code;
      if (!this.isValidOrderId(orderId)) return;
      this.$router.push(`/order-detail/${orderId}`);
    },
    mapStatusLabel(status) {
      return simplifyUserStatus(status);
    },
    mapStatusClass(status) {
      const cls = userStatusClass(status);
      if (cls === 'succeed') return 'text-green';
      if (cls === 'completed') return 'text-blue';
      if (cls === 'failed' || cls === 'timeout') return 'text-red';
      return 'text-orange';
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
        const res = await this.$api.orderApi.buyHistory({
          page: this.page,
          size: this.size,
          status: this.statusFilter === 'all' ? undefined : this.statusFilter
        });
        const records = Array.isArray(res?.data) ? res.data : (res?.data?.records || []);
        this.list = isRefresh ? records : [...this.list, ...records];
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
    dateRange() {
      this.refreshAction();
    },
    statusFilter() {
      this.refreshAction();
    }
  },
  mounted() {
    this.refreshAction();
  }
}
</script>

<style scoped>
.filters { display: flex; gap: 12px; padding: 0 16px; margin-bottom: 16px; }
.filter-select {
  flex: 1; padding: 12px 16px; border-radius: var(--radius-sm);
  border: 1.5px solid var(--border-light); background: var(--bg-white);
  font-size: 14px; font-family: inherit; color: var(--text-primary);
  appearance: none; cursor: pointer; text-align: center;
}
.order-list { padding: 0 16px; }
.list-item {
  background: var(--panel-gradient);
  border: 1px solid var(--border-light);
  border-radius: 12px; padding: 16px; margin-bottom: 12px;
  box-shadow: var(--shadow-card); cursor: pointer;
}
.item-row { display: flex; justify-content: space-between; font-size: 15px; margin-bottom: 6px; }
.item-date { font-size: 12px; color: var(--text-muted); }
.text-green { color: var(--primary); font-weight: 600; }
.text-orange { color: var(--accent-gold-dark); font-weight: 600; }
.text-red { color: var(--text-red); font-weight: 600; }
.text-blue { color: var(--accent-gold); font-weight: 600; }
.load-more { text-align: center; padding: 16px; color: var(--primary); cursor: pointer; }
.no-data-hint { text-align: center; padding: 16px; color: var(--text-muted); font-size: 13px; }
</style>
