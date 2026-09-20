<template>
  <div class="page-no-tab deposit-page">
    <div class="nav-bar">
      <button class="back-btn" @click="$router.back()"><img src="/icons/back.png" /></button>
      <span class="nav-title">USDT</span>
    </div>

    <div class="card instructions">
      <div class="deposit-balance-row">
        <span class="deposit-balance-label">Available USDT Balance (Without Profit)</span>
        <span class="deposit-balance-value"><img src="/icons/usdt.png" class="usdt-icon-inline" /> {{ depositPrincipalLabel }}</span>
      </div>
      <div class="deposit-balance-note">Updates only after order is completed and admin payment verification is approved.</div>
      <ol>
        <li><span class="step-num">1.</span> Enter the amount of USDT you want to add.</li>
        <li><span class="step-num">2.</span> Tap the <strong>Add USDT</strong> button below.</li>
        <li><span class="step-num">3.</span> Follow the payment instructions on the order page to complete the payment.</li>
      </ol>
    </div>

    <div class="card calc-card">
      <div class="calc-header">
        <span class="calc-label">Calculator</span>
        <span class="calc-ratio text-green">Ratio: 1 USDT={{ baseParam.buyUsdtRate || 0 }} INR</span>
      </div>
      <div class="calc-input-row">
        <span class="calc-tag">USDT</span>
        <input type="number" placeholder="Enter USDT amount" v-model="amount" class="calc-input" />
      </div>
      <div class="calc-results">
        <div class="calc-result-box">
          <div class="calc-result-label">Estimated bonus:</div>
          <div class="calc-result-value text-green">₹{{ bonus }}</div>
        </div>
        <div class="calc-result-box">
          <div class="calc-result-label">You will receive:</div>
          <div class="calc-result-value text-green">₹{{ receive }}</div>
        </div>
      </div>
    </div>

    <div class="warning-text">
      <span>⚠</span> After the recharge is completed, please wait 3-5 minutes for the USDT to arrive.
    </div>

    <!-- History / Transactions replacing Address -->
    <div class="card history-card" v-if="history.length">
      <div class="history-header">USDT Transaction History</div>
      <div class="history-list">
        <div v-for="item in history" :key="item.id" class="history-item" @click="$router.push(`/usdt-order/${item.id}`)">
          <div class="history-item-top">
            <span class="history-ref">{{ item.referenceNo }}</span>
            <span :class="['history-status', `status-${item.status.toLowerCase()}`]">{{ item.status }}</span>
          </div>
          <div class="history-item-bottom">
            <span class="history-amount">{{ item.amount }} USDT</span>
            <span class="history-date">{{ formatDate(item.createdAt) }}</span>
          </div>
        </div>
      </div>
    </div>

    <div class="px-16" style="margin-bottom: 24px;">
      <button class="btn-primary deposit-submit-btn" @click="handleDeposit">Add USDT</button>
    </div>
  </div>
</template>

<script>
import { toast } from '../utils/toast'

export default {
  name: 'DepositPage',
  data() { 
    return { 
      amount: '',
      baseParam: { buyUsdtRate: 0, buyUsdtRebatePercent: 0 },
      usdtInfo: null,
      depositPrincipal: 0,
      history: []
    } 
  },
  computed: {
    baseAmount() {
      return (Number(this.amount) || 0) * (Number(this.baseParam.buyUsdtRate) || 0);
    },
    bonus() { 
      // Bonus is fixed amount per USDT in our new system, but let's keep it flexible
      // If we treat buyUsdtRebatePercent as "Fixed Bonus amount per USDT"
      return (Number(this.amount || 0) * (Number(this.baseParam.buyUsdtRebatePercent) || 0)).toFixed(2);
    },
    receive() { 
      return (this.baseAmount + Number(this.bonus)).toFixed(2);
    },
    depositAddress() {
      return this.usdtInfo?.usdtWalletAddress || this.usdtInfo?.address || '';
    },
    depositPrincipalLabel() {
      return Number(this.depositPrincipal || 0).toFixed(2);
    }
  },
  methods: {
    isValidOrderId(value) {
      const raw = String(value == null ? '' : value).trim().toLowerCase();
      return Boolean(raw) && raw !== 'undefined' && raw !== 'null' && raw !== 'nan';
    },
    async fetchBaseParam() {
      try {
        const res = await this.$api.homeApi.baseParam();
        if (res.data) {
          this.baseParam.buyUsdtRate = res.data.buyUsdtRate || this.baseParam.buyUsdtRate;
          this.baseParam.buyUsdtRebatePercent = res.data.buyUsdtRebatePercent || this.baseParam.buyUsdtRebatePercent;
        }
      } catch (e) {}
    },
    async fetchUsdtInfo() {
      try {
        const res = await this.$api.orderApi.usdtInfo();
        if (res.data) {
          this.usdtInfo = res.data;
          // Sync with baseParam for calculator
          this.baseParam.buyUsdtRate = res.data.usdtInInr || 103;
          this.baseParam.buyUsdtRebatePercent = res.data.usdtBonus || 0;
        }
      } catch (e) {
        this.usdtInfo = null;
      }
    },
    async fetchUsdtHistory() {
      try {
        const res = await this.$api.orderApi.usdtHistory();
        if (res.data) this.history = res.data;
      } catch (e) {}
    },
    async fetchDepositPrincipal() {
      try {
        const res = await this.$api.myApi.personV2();
        const data = res?.data || {};
        this.depositPrincipal = Number(
          data.totalUSDTTraded ?? data.depositPrincipal ?? data.totalPayment ?? 0
        ) || 0;
      } catch (e) {
        this.depositPrincipal = 0;
      }
    },
    formatDate(d) {
      return new Date(d).toLocaleString('en-IN', { dateStyle: 'medium', timeStyle: 'short' });
    },
    async copyAddress() {
      if (!this.depositAddress) return;
      await navigator.clipboard.writeText(this.depositAddress);
      toast.show({ title: 'Address copied', icon: 'success' });
    },
    async handleDeposit() { 
      if (!this.amount || this.amount <= 0) {
        toast.show({ title: 'Please enter a valid amount' });
        return;
      }
      try {
        const res = await this.$api.orderApi.createUsdt({ amount: this.amount });
        toast.show({ title: 'USDT order created', icon: 'success' });
        const id = res.data?.id || res.data?.referenceNo;
        this.amount = '';
        if (id) {
           this.$router.push(`/usdt-order/${id}`);
        } else {
           this.fetchUsdtHistory();
        }
      } catch (e) {
        toast.show({ title: e.message || 'Failed to create order' });
      }
    }
  },
  mounted() {
    this.fetchUsdtInfo();
    this.fetchUsdtHistory();
    this.fetchDepositPrincipal();
  }
}
</script>

<style scoped>
.deposit-page {
  --dep-accent: #4f8cff;
  --dep-accent-soft: rgba(79, 140, 255, 0.18);
  --dep-accent-faint: rgba(79, 140, 255, 0.1);
  --dep-glass: rgba(255, 255, 255, 0.035);
  --dep-glass-strong: rgba(255, 255, 255, 0.052);
  --dep-border: rgba(255, 255, 255, 0.11);
  --dep-shadow: 0 16px 34px rgba(0, 0, 0, 0.32);
  position: relative;
  padding-top: 2px;
  min-height: 100vh;
  padding-bottom: 40px;
}

.history-card {
  margin: 20px 16px 0;
  border-radius: 20px;
  border: 1px solid var(--dep-border);
  background: var(--dep-glass);
  padding: 16px;
}
.history-header {
  font-size: 12px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.6);
  margin-bottom: 12px;
  text-transform: uppercase;
}
.history-list {
  max-height: 320px;
  overflow-y: auto;
  overscroll-behavior: contain;
  padding-right: 4px;
}
.history-item {
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  padding: 10px 0;
}
.history-item:last-child {
  border-bottom: none;
}
.history-item-top, .history-item-bottom {
  display: flex;
  justify-content: space-between;
  align-items: center;
}
.history-ref { font-size: 13px; color: #fff; font-family: monospace; }
.history-status { font-size: 10px; font-weight: 700; padding: 2px 6px; border-radius: 4px; }
.status-pending { background: rgba(245, 158, 11, 0.15); color: #f59e0b; }
.status-approved { background: rgba(34, 197, 94, 0.15); color: #22c55e; }
.status-rejected { background: rgba(239, 68, 68, 0.15); color: #ef4444; }
.history-amount { font-size: 15px; font-weight: 700; color: var(--dep-accent); }
.history-date { font-size: 11px; color: rgba(255, 255, 255, 0.4); }

.deposit-page::before {
  content: '';
  position: absolute;
  inset: 0 0 auto;
  height: 300px;
  pointer-events: none;
  background:
    radial-gradient(62% 44% at 88% 6%, rgba(79, 140, 255, 0.14) 0%, rgba(79, 140, 255, 0) 72%),
    radial-gradient(48% 38% at 10% 12%, rgba(115, 219, 155, 0.08) 0%, rgba(115, 219, 155, 0) 76%);
  z-index: 0;
}

.deposit-page .nav-bar,
.deposit-page .instructions,
.deposit-page .calc-card,
.deposit-page .warning-text,
.deposit-page .deposit-address-card,
.deposit-page .px-16 {
  position: relative;
  z-index: 1;
}

.instructions {
  margin: 4px 16px 0;
  border-radius: 20px;
  border: 1px solid var(--dep-border);
  background: linear-gradient(165deg, var(--dep-glass-strong) 0%, var(--dep-glass) 70%, rgba(255, 255, 255, 0.02) 100%);
  box-shadow: var(--dep-shadow);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  color: rgba(238, 242, 230, 0.93);
  padding: 16px;
  line-height: 1.55;
}

.instructions ol {
  list-style: none;
  padding: 0;
  margin-top: 10px;
  display: flex;
  flex-direction: column;
  gap: 6px;
}

.instructions li {
  margin-bottom: 0;
  font-size: 13px;
  color: rgba(229, 234, 216, 0.84);
}

.deposit-balance-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  margin-bottom: 6px;
}

.deposit-balance-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.09em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.62);
  font-family: var(--font-label);
}

.deposit-balance-value {
  font-size: 21px;
  font-weight: 800;
  color: rgba(234, 245, 194, 0.98);
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.deposit-balance-note {
  font-size: 11.5px;
  color: rgba(200, 205, 187, 0.8);
  margin-bottom: 8px;
  line-height: 1.45;
}

.step-num {
  color: rgba(204, 227, 118, 0.9);
  font-weight: 700;
  margin-right: 5px;
}

.calc-card {
  margin: 12px 16px 0;
  border-radius: 20px;
  border: 1px solid var(--dep-border);
  background: linear-gradient(165deg, var(--dep-glass-strong) 0%, var(--dep-glass) 70%, rgba(255, 255, 255, 0.02) 100%);
  box-shadow: var(--dep-shadow);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  padding: 16px;
}

.calc-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
  flex-wrap: wrap;
  margin-bottom: 12px;
}

.calc-label {
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.58);
  font-family: var(--font-label);
}

.calc-ratio {
  font-size: 12px;
  font-weight: 700;
  color: rgba(183, 214, 96, 0.92);
}

.calc-input-row {
  display: flex;
  align-items: center;
  gap: 12px;
  border: 1px solid rgba(175, 206, 84, 0.34);
  border-radius: 14px;
  padding: 10px 12px;
  background: rgba(255, 255, 255, 0.03);
  margin-bottom: 12px;
}

.calc-tag {
  background: rgba(79, 140, 255, 0.2);
  color: rgba(229, 240, 194, 0.95);
  padding: 5px 12px;
  border-radius: 10px;
  font-size: 11px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-family: var(--font-label);
}

.calc-input {
  flex: 1;
  border: none;
  outline: none;
  font-size: 16px;
  font-weight: 700;
  letter-spacing: 0.01em;
  font-family: inherit;
  color: var(--text-primary);
  background: transparent;
}

.calc-input::placeholder {
  color: rgba(171, 176, 161, 0.82);
  font-size: 13px;
  font-weight: 500;
}

.calc-results {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 12px;
}

.calc-result-box {
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.02);
  padding: 12px;
  text-align: center;
}

.calc-result-label {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.6);
  margin-bottom: 4px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-family: var(--font-label);
}

.calc-result-value {
  font-size: 19px;
  font-weight: 800;
}

.warning-text {
  margin: 12px 16px 0;
  color: rgba(228, 239, 196, 0.95);
  font-size: 12.5px;
  padding: 10px 12px;
  line-height: 1.5;
  border-radius: 14px;
  border: 1px solid rgba(79, 140, 255, 0.26);
  background: rgba(79, 140, 255, 0.08);
  display: flex;
  align-items: flex-start;
  gap: 8px;
}

.warning-text span {
  color: rgba(210, 230, 128, 0.96);
  margin-top: 1px;
}

.deposit-page .px-16 {
  margin-top: 14px;
}

.deposit-submit-btn {
  min-height: 50px;
  border-radius: 15px;
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  background: linear-gradient(140deg, #4f8cff 0%, #2e6ae6 100%);
  color: #d0e4ff;
  border: 1px solid rgba(236, 246, 194, 0.34);
  box-shadow:
    0 12px 24px rgba(46, 106, 230, 0.24),
    inset 0 1px 0 rgba(255, 255, 255, 0.34);
}

@media (max-width: 360px) {
  .calc-results {
    grid-template-columns: 1fr;
  }
}
</style>
