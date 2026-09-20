<template>
  <div class="page payment-page">
    <section class="trade-hero panel-glass n-watermark">
      <div class="hero-top-row">
        <div>
          <p class="hero-overline">Total Performance</p>
          <h1 class="hero-rate" v-if="!isCommissionLoading">{{ commissionRateLabel }}</h1>
          <div v-else class="rate-skeleton payment-rate-skeleton"></div>
        </div>
        <div class="signal-bars">
          <span v-for="(h, i) in [20, 34, 58, 38, 66, 30]" :key="i" :style="{ height: h + '%' }"></span>
        </div>
      </div>

      <div class="hero-balance-card panel-glass">
        <div>
          <p class="metric-label">Available Balance</p>
          <p class="metric-value">₹{{ summaryData.balance || 0 }}</p>
        </div>
        <span class="metric-badge">Live Market</span>
      </div>

      <div class="hero-mini-cards">
        <div class="mini-card panel-glass">
          <span class="mini-label">Rewards</span>
          <span class="mini-value">₹{{ summaryData.commission || 0 }}</span>
        </div>
        <div class="mini-card panel-glass">
          <span class="mini-label">Pending</span>
          <span class="mini-value">₹{{ summaryData.frozenAmount || 0 }}</span>
        </div>
      </div>
    </section>

    <div class="warning-card panel-glass ">
      <span class="warning-icon">!</span>
      <p>Please use Nova Vault authorized wallets for fastest settlements.</p>
    </div>

    <div v-if="nightBonusActive" class="night-bonus-banner panel-glass n-watermark n-watermark-soft">
      <span class="bonus-dot"></span>
      <span>Night bonus is active. Orders may carry extra reward during this period.</span>
    </div>

    <section class="pool-section">
      <div class="pool-header">
        <h3>Active Pools</h3>
        <div class="range-pills">
          <button
            v-for="tab in rangeTabs"
            :key="tab.value"
            class="range-pill"
            :class="{ active: activeRange === tab.value }"
            @click="activeRange = tab.value"
          >
            {{ tab.label }} ({{ orderCounts[tab.value] || 0 }})
          </button>
        </div>
      </div>

      <div class="order-list" v-if="filteredOrders.length">
        <article class="order-card panel-glass n-watermark n-watermark-soft" v-for="(order, i) in filteredOrders" :key="i">
          <div class="order-left">
            <div class="order-token">₹</div>
            <div>
              <div class="order-amount">{{ order.amount || 0 }}</div>
              <div class="order-meta">CODE: {{ order.code }} · INC: +{{ order.income || 0 }}</div>
            </div>
          </div>
          <button class="claim-btn" @click="claimOrder(order)">Buy</button>
        </article>
      </div>

      <div v-else class="no-data-hint panel-glass n-watermark n-watermark-soft">No matching orders available right now.</div>
    </section>

    <div v-if="showWalletPicker" class="wallet-picker-overlay" @click.self="closeWalletPicker">
      <div class="wallet-picker">
        <div class="wallet-picker-title">Select payout account</div>
        <div class="wallet-picker-list">
          <label v-for="w in payoutWallets" :key="walletKey(w)" class="wallet-picker-item">
            <div class="wallet-picker-left">
              <img :src="walletIcon(w)" class="wallet-picker-icon" />
              <div>
                <div class="wallet-picker-name">{{ w.provider || w.walletTypeName || 'UPI' }}</div>
                <div class="wallet-picker-upi">{{ w.account || w.upi || w.upiId || '--' }}</div>
              </div>
            </div>
            <input type="radio" name="walletSelect" :value="walletKey(w)" v-model="selectedWalletId" />
          </label>
        </div>
        <div class="wallet-picker-actions">
          <button class="wallet-picker-cancel" @click="closeWalletPicker">Cancel</button>
          <button class="wallet-picker-confirm" @click="confirmWalletAndClaim">Confirm</button>
        </div>
      </div>
    </div>
  </div>
</template>

<script>
import { usePolling } from '../composables/usePolling'
import { wsClient, connectWS, disconnectWS } from '../api/ws'
import { toast } from '../utils/toast'
import { showConfirm } from '../components/ConfirmDialog.vue'
import { calcNextPollDelayMs, countOrdersByRanges, filterOrdersByRange, mapBuyOrder } from '../utils/helpers'

export default {
  name: 'PaymentPage',
  setup() {
    const { startPolling, stopPolling, scheduleNextPoll } = usePolling(null, 5000);
    return { startPolling, stopPolling, scheduleNextPoll };
  },
  data() {
    return {
      activeRange: 'all',
      rawOrders: [],
      orders: [],
      nightBonusActive: false,
      pollAttempt: 0,
      showWalletPicker: false,
      payoutWallets: [],
      selectedWalletId: '',
      pendingOrder: null,
      summaryData: {
        balance: 0,
        commission: 0,
        frozenAmount: 0
      },
      baseParam: {},
      isCommissionLoading: true
    }
  },
  computed: {
    rangeTabs() {
      return [
        { label: 'All', value: 'all' },
        { label: '100-300', value: '100-300' },
        { label: '301-500', value: '301-500' },
        { label: '501+', value: '501+' }
      ];
    },
    orderCounts() {
      return countOrdersByRanges(this.rawOrders);
    },
    filteredOrders() {
      return filterOrdersByRange(this.rawOrders, this.activeRange);
    },
    commissionRateValue() {
      const raw = this.baseParam?.commissionRate ?? this.baseParam?.ORDER_INCOME_PERCENT;
      const rate = Number(raw);
      return Number.isFinite(rate) ? rate : null;
    },
    commissionRateLabel() {
      return this.commissionRateValue == null ? '--' : `${this.commissionRateValue}%`;
    }
  },
  methods: {
    isValidOrderId(value) {
      const raw = String(value == null ? '' : value).trim().toLowerCase();
      return Boolean(raw) && raw !== 'undefined' && raw !== 'null' && raw !== 'nan';
    },
    async fetchSummary() {
      try {
        const res = await this.$api.orderApi.summary();
        if (res.data) this.summaryData = res.data;
      } catch (e) {}
    },
    async fetchNightBonusStatus() {
      try {
        const res = await this.$api.orderApi.nightBonusStatus();
        this.nightBonusActive = Boolean(res?.data?.enabled ?? res?.data?.status ?? false);
      } catch (e) {
        this.nightBonusActive = false;
      }
    },
    async fetchBaseParam() {
      try {
        const res = await this.$api.homeApi.baseParam();
        this.baseParam = res?.data || {};
      } catch (e) {
        this.baseParam = {};
      } finally {
        this.isCommissionLoading = false;
      }
    },
    async fetchHangSales() {
      try {
        const res = await this.$api.orderApi.hangSales();
        const rawOrders = Array.isArray(res.data) ? res.data : (res.data?.records || []);
        this.rawOrders = rawOrders.map(mapBuyOrder);
        this.orders = this.rawOrders;
        this.pollAttempt = 0;
      } catch (e) {
        this.pollAttempt += 1;
        this.schedulePoll();
      }
    },
    schedulePoll() {
      const delay = calcNextPollDelayMs(this.pollAttempt);
      this.scheduleNextPoll(this.fetchHangSales.bind(this), delay);
    },
    async claimOrder(order) {
      if (!order) return;

      try {
        await this.ensureWalletsLoaded();
        if (!this.payoutWallets.length) {
          showConfirm({
            title: 'Bind Wallet',
            content: 'Please bind your payout wallet first',
            onConfirm: () => this.$router.push('/add-wallet')
          });
          return;
        }
        this.pendingOrder = order;
        this.selectedWalletId = this.walletKey(this.payoutWallets[0]);
        this.showWalletPicker = true;
      } catch (e) {
        if (e && (e.code === 601 || e.code === 2004)) {
          showConfirm({
            title: 'Warning',
            content: 'Please bind your payout wallet first',
            onConfirm: () => this.$router.push('/wallet')
          });
        }
      }
    },
    walletKey(wallet) {
      return String(wallet?.id || wallet?.walletId || wallet?.account || wallet?.upi || wallet?.upiId || '');
    },
    walletIcon(wallet) {
      const name = String(wallet?.provider || wallet?.walletTypeName || '').toLowerCase();
      if (name.includes('mobikwik')) return '/wallet/mobikwik.png';
      if (name.includes('freecharge')) return '/wallet/freecharge.png';
      if (name.includes('phonepe')) return '/wallet/phonepe.png';
      if (name.includes('paytm')) return '/wallet/paytm.png';
      if (name.includes('airtel')) return '/wallet/airtel.png';
      return '/wallet/box.png';
    },
    closeWalletPicker() {
      this.showWalletPicker = false;
      this.pendingOrder = null;
    },
    async ensureWalletsLoaded() {
      if (this.payoutWallets.length) return;
      const res = await this.$api.walletApi.getPayoutWalletList({ page: 1, size: 50 });
      this.payoutWallets = Array.isArray(res?.data) ? res.data : (res?.data?.records || []);
    },
    async confirmWalletAndClaim() {
      if (!this.pendingOrder) return;
      const wallet = this.payoutWallets.find(w => this.walletKey(w) === this.selectedWalletId) || this.payoutWallets[0];
      if (!wallet) return;
      const payload = {
        orderId: this.pendingOrder.id || this.pendingOrder.orderId,
        orderNo: this.pendingOrder.orderNo || this.pendingOrder.code,
        payoutUpiId: wallet.id || wallet.walletId,
        payoutUPI: wallet.upi || wallet.upiId || wallet.account
      };
      if (this.pendingOrder.ctTypeId != null) {
        payload.ctTypeId = this.pendingOrder.ctTypeId;
      }
      try {
        const res = await this.$api.orderApi.createOrder(payload);
        toast.show({ title: 'Order claimed successfully', icon: 'success' });
        const orderId = res.data?.buyId || res.data?.id || res.data?.orderNo || payload.orderNo;
        if (!this.isValidOrderId(orderId)) {
          toast.show({ title: 'Order created but order id is missing', icon: 'error' });
          this.closeWalletPicker();
          await this.fetchSummary();
          await this.fetchHangSales();
          return;
        }
        this.closeWalletPicker();
        this.$router.push(`/order-detail/${orderId}`);
      } catch (e) {
        this.closeWalletPicker();
      }
    },
    onWsMessage(data) {
      const type = String(data?.type || data?.messageType || '').toLowerCase();
      const hasOrderSignal = Boolean(data?.orderCode || data?.orderNo || type.includes('order'));
      if (hasOrderSignal) {
        this.fetchSummary();
        this.fetchHangSales();
      }
    }
  },
  watch: {
    activeRange() {
      this.orders = this.filteredOrders;
    }
  },
  mounted() {
    this.fetchSummary();
    this.fetchHangSales();
    this.fetchNightBonusStatus();
    this.fetchBaseParam();

    this.startPolling(this.fetchHangSales.bind(this), 5000);

    connectWS();
    wsClient.on('message', this.onWsMessage);
  },
  unmounted() {
    this.stopPolling();
    wsClient.off('message', this.onWsMessage);
    disconnectWS();
  }
}
</script>

<style scoped>
.payment-page {
  --pay-accent: #4f8cff;
  --pay-accent-soft: rgba(79, 140, 255, 0.18);
  --pay-accent-faint: rgba(79, 140, 255, 0.11);
  --pay-accent-text: #c8d9a0;
  --pay-glass: rgba(255, 255, 255, 0.04);
  --pay-glass-strong: rgba(255, 255, 255, 0.06);
  --pay-border: rgba(255, 255, 255, 0.1);
  --pay-shadow: 0 16px 34px rgba(0, 0, 0, 0.3);
  position: relative;
  padding-top: 8px;
}

.payment-page::before {
  content: '';
  position: absolute;
  inset: 0 0 auto;
  height: 300px;
  background:
    radial-gradient(62% 42% at 82% 2%, rgba(79, 140, 255, 0.13) 0%, rgba(79, 140, 255, 0) 74%),
    radial-gradient(44% 26% at 14% 14%, rgba(105, 200, 155, 0.08) 0%, rgba(105, 200, 155, 0) 76%);
  z-index: 0;
  pointer-events: none;
}

.trade-hero,
.warning-card,
.night-bonus-banner,
.pool-section {
  position: relative;
  z-index: 1;
}

.panel-glass {
  background: linear-gradient(165deg, var(--pay-glass-strong) 0%, var(--pay-glass) 70%, rgba(255, 255, 255, 0.02) 100%);
  border: 1px solid var(--pay-border);
  border-radius: 20px;
  box-shadow: var(--pay-shadow);
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

.trade-hero {
  margin: 0 16px 12px;
  border-radius: 26px;
  padding: 16px;
}

.hero-top-row {
  display: flex;
  align-items: flex-end;
  justify-content: space-between;
  gap: 14px;
  margin-bottom: 12px;
}

.hero-overline {
  font-size: 10px;
  font-family: var(--font-label);
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.56);
}

.hero-rate {
  margin-top: 4px;
  font-size: clamp(34px, 9vw, 46px);
  line-height: 1;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: rgba(255, 255, 255, 0.95);
}

.signal-bars {
  height: 44px;
  display: flex;
  align-items: flex-end;
  gap: 4px;
  min-width: 46px;
}

.signal-bars span {
  width: 5px;
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.18);
}

.signal-bars span:nth-child(3),
.signal-bars span:nth-child(5) {
  background: rgba(79, 140, 255, 0.84);
  box-shadow: 0 0 8px rgba(79, 140, 255, 0.34);
}

.hero-balance-card {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  border-radius: 16px;
  padding: 12px;
  margin-bottom: 8px;
  box-shadow: none;
}

.metric-label {
  font-size: 10px;
  font-family: var(--font-label);
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.56);
}

.metric-value {
  margin-top: 3px;
  font-size: clamp(24px, 6.5vw, 30px);
  line-height: 1.08;
  font-weight: 800;
  letter-spacing: -0.02em;
  color: rgba(240, 245, 224, 0.95);
}

.metric-badge {
  padding: 6px 10px;
  border-radius: 999px;
  border: 1px solid rgba(79, 140, 255, 0.34);
  background: rgba(79, 140, 255, 0.12);
  color: rgba(200, 217, 160, 0.92);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-family: var(--font-label);
  font-weight: 700;
  white-space: nowrap;
}

.hero-mini-cards {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 8px;
}

.mini-card {
  border-radius: 14px;
  padding: 10px;
  box-shadow: none;
}

.mini-label {
  display: block;
  font-size: 10px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.54);
  font-family: var(--font-label);
}

.mini-value {
  display: block;
  margin-top: 5px;
  font-size: 22px;
  line-height: 1.05;
  font-weight: 700;
  letter-spacing: -0.01em;
  color: rgba(255, 255, 255, 0.92);
}

.warning-card {
  margin: 0 16px 10px;
  border-radius: 16px;
  padding: 10px 12px;
  display: flex;
  align-items: flex-start;
  gap: 8px;
  color: rgba(255, 255, 255, 0.78);
  border-color: rgba(224, 178, 103, 0.3);
  background: linear-gradient(155deg, rgba(224, 178, 103, 0.14) 0%, rgba(224, 178, 103, 0.04) 100%);
  font-size: 12px;
  line-height: 1.35;
}

.warning-icon {
  width: 18px;
  height: 18px;
  border-radius: 50%;
  flex-shrink: 0;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  background: rgba(224, 178, 103, 0.24);
  color: rgba(250, 213, 146, 0.95);
  font-size: 12px;
  font-weight: 800;
  margin-top: 1px;
}

.night-bonus-banner {
  margin: 0 16px 12px;
  padding: 10px 12px;
  border-radius: 14px;
  border-color: rgba(79, 140, 255, 0.26);
  color: rgba(214, 228, 182, 0.92);
  font-size: 12px;
  font-weight: 600;
  display: flex;
  align-items: center;
  gap: 8px;
}

.bonus-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: rgba(79, 140, 255, 0.95);
  box-shadow: 0 0 8px rgba(79, 140, 255, 0.42);
  flex-shrink: 0;
}

.pool-section {
  margin: 0 16px;
}

.pool-header {
  margin-bottom: 10px;
}

.pool-header h3 {
  margin-bottom: 10px;
  font-size: 20px;
  line-height: 1.1;
  font-weight: 700;
  font-family: var(--font-brand);
  color: rgba(255, 255, 255, 0.94);
}

.range-pills {
  display: flex;
  gap: 8px;
  overflow-x: auto;
  padding-bottom: 2px;
  scrollbar-width: none;
}

.range-pills::-webkit-scrollbar {
  display: none;
}

.range-pill {
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.64);
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  font-family: var(--font-label);
  padding: 7px 11px;
  white-space: nowrap;
}

.range-pill.active {
  background: linear-gradient(145deg, #4f8cff 0%, #2e6ae6 100%);
  border-color: transparent;
  color: #d0e4ff;
}

.order-list {
  display: flex;
  flex-direction: column;
  gap: 10px;
  margin-bottom: 10px;
}

.order-card {
  border-radius: 16px;
  padding: 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
}

.order-left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.order-token {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  background: rgba(79, 140, 255, 0.18);
  color: #b6d076;
  font-size: 20px;
  font-weight: 800;
  flex-shrink: 0;
}

.order-amount {
  font-size: 22px;
  line-height: 1.05;
  font-weight: 800;
  letter-spacing: -0.01em;
  color: rgba(255, 255, 255, 0.94);
}

.order-meta {
  margin-top: 3px;
  font-size: 10px;
  color: rgba(255, 255, 255, 0.56);
  font-family: var(--font-label);
  text-transform: uppercase;
  letter-spacing: 0.07em;
}

.claim-btn {
  border: none;
  border-radius: 999px;
  padding: 9px 14px;
  min-width: 88px;
  background: linear-gradient(145deg, #4f8cff 0%, #2e6ae6 100%);
  color: #d0e4ff;
  font-size: 11px;
  font-weight: 800;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-family: var(--font-label);
  box-shadow: 0 8px 16px rgba(79, 140, 255, 0.2);
}

.claim-btn:active {
  transform: scale(0.97);
}

.no-data-hint {
  border-radius: 16px;
  padding: 14px;
  text-align: center;
  color: rgba(255, 255, 255, 0.62);
  font-size: 13px;
}

.rate-skeleton {
  border-radius: 12px;
  background: linear-gradient(90deg, rgba(255, 255, 255, 0.06) 25%, rgba(79, 140, 255, 0.16) 50%, rgba(255, 255, 255, 0.06) 75%);
  background-size: 200% 100%;
  animation: rateShimmer 1.15s linear infinite;
}

.payment-rate-skeleton {
  width: 90px;
  height: 42px;
  margin-top: 4px;
}

@keyframes rateShimmer {
  0% {
    background-position: 200% 0;
  }
  100% {
    background-position: -200% 0;
  }
}

.wallet-picker-overlay {
  position: fixed;
  inset: 0;
  background: var(--overlay-dark);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  padding: 16px;
}

.wallet-picker {
  width: min(100%, 360px);
  background: linear-gradient(165deg, var(--pay-glass-strong) 0%, var(--pay-glass) 72%, rgba(255, 255, 255, 0.02) 100%);
  border: 1px solid var(--pay-border);
  border-radius: 18px;
  overflow: hidden;
  box-shadow: var(--shadow-card);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
}

.wallet-picker-title {
  font-size: 18px;
  font-weight: 700;
  text-align: center;
  padding: 16px 16px 8px;
  color: rgba(255, 255, 255, 0.96);
}

.wallet-picker-list {
  padding: 0 14px 12px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.wallet-picker-item {
  display: flex;
  align-items: center;
  justify-content: space-between;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.04);
  border-radius: 12px;
  padding: 10px 12px;
}

.wallet-picker-left {
  display: flex;
  align-items: center;
  gap: 10px;
  min-width: 0;
}

.wallet-picker-icon {
  width: 28px;
  height: 28px;
}

.wallet-picker-name {
  font-size: 14px;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.92);
}

.wallet-picker-upi {
  font-size: 12px;
  color: rgba(255, 255, 255, 0.62);
}

.wallet-picker-actions {
  display: flex;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
}

.wallet-picker-actions button {
  flex: 1;
  padding: 14px 10px;
  border: none;
  background: transparent;
  font-size: 15px;
  cursor: pointer;
}

.wallet-picker-cancel {
  color: rgba(255, 255, 255, 0.62);
  border-right: 1px solid rgba(255, 255, 255, 0.1);
}

.wallet-picker-confirm {
  color: var(--pay-accent-text);
  font-weight: 700;
}

@media (max-width: 420px) {
  .order-card {
    align-items: flex-start;
    gap: 12px;
  }

  .claim-btn {
    min-width: 80px;
    padding-left: 12px;
    padding-right: 12px;
  }
}

@media (max-width: 380px) {
  .trade-hero,
  .warning-card,
  .night-bonus-banner,
  .pool-section {
    margin-left: 12px;
    margin-right: 12px;
  }

  .hero-rate {
    font-size: clamp(30px, 8.8vw, 38px);
  }

  .metric-value {
    font-size: 24px;
  }

  .mini-value {
    font-size: 20px;
  }

  .range-pill {
    font-size: 9px;
    padding: 7px 10px;
  }
}

@media (max-width: 340px) {
  .order-card {
    flex-direction: column;
    align-items: stretch;
  }

  .claim-btn {
    width: 100%;
  }
}
</style>
