<template>
  <div class="page stats-page">
    <section class="stats-hero panel-glass n-watermark">
      <div class="hero-main">
        <label>Total Nova Balance</label>
        <h1>₹{{ stats.amount || '0.00' }}</h1>
        <span class="trend-chip">{{ commissionRateLabel }} Commission</span>
      </div>
      <button class="deposit-btn" @click="$router.push('/deposit')">USDT Trading</button>
    </section>

    <section class="bento-grid">
      <article class="bento-card bento-wide panel-glass n-watermark">
        <div class="bento-icon-wrap"><img src="/statistics/sell.png" class="bento-icon" /></div>
        <div>
          <h3>₹ {{ stats.sellAmount || '0.00' }}</h3>
          <p>Total Assets Sold</p>
        </div>
      </article>

      <article class="bento-card panel-glass n-watermark n-watermark-soft">
        <div class="bento-icon-wrap"><img src="/statistics/commission.png" class="bento-icon" /></div>
        <div>
          <h3>₹ {{ stats.commissionAmount || '0.00' }}</h3>
          <p>Net Commission</p>
        </div>
      </article>

      <article class="bento-card panel-glass n-watermark n-watermark-soft">
        <div class="bento-icon-wrap"><img src="/statistics/wallet.png" class="bento-icon" /></div>
        <div>
          <h3>₹ {{ stats.frozenAmount || '0.00' }}</h3>
          <p>In Process</p>
        </div>
      </article>
    </section>

    <section class="exchange-panel panel-glass n-watermark">
      <div class="section-title-row">
        <h3>Real Time Exchange</h3>
        <span>INR / USDT</span>
      </div>

      <div class="exchange-row panel-glass">
        <div>
          <p class="row-title">INR Market Rate</p>
          <p class="row-sub">Global Spot Price</p>
        </div>
        <div class="row-value">{{ baseParam.buyUsdtRate || 103 }} INR</div>
      </div>

      <div class="exchange-row panel-glass">
        <div>
          <p class="row-title">Process Orders</p>
          <p class="row-sub">Current Open Volume</p>
        </div>
        <div class="row-value">{{ stats.processOrderNum || 0 }}</div>
      </div>

      <div class="exchange-row panel-glass">
        <div>
          <p class="row-title">Estimated Income</p>
          <p class="row-sub">Current Projection</p>
        </div>
        <div class="row-value">₹ {{ stats.estimateIncome || '0.00' }}</div>
      </div>
    </section>

    <section class="activity-panel panel-glass n-watermark">
      <h3>System Controls</h3>
      <button class="btn-primary" :disabled="isSellSubmitting" @click="toggleSell">
        {{ isSelling ? 'Stop Selling' : 'Start Selling' }}
      </button>
      <button class="ghost-btn" @click="$router.push({ path: '/orders', query: { tab: 'sell' } })">View Sell Orders</button>
    </section>
  </div>
</template>

<script>
import { toast } from '../utils/toast'

export default {
  name: 'StatisticsPage',
  data() {
    return {
      stats: {},
      baseParam: {},
      isSelling: false,
      isCommissionLoading: true,
      isSellSubmitting: false
    }
  },
  computed: {
    commissionRateValue() {
      const raw = this.baseParam?.commissionRate ?? this.baseParam?.ORDER_INCOME_PERCENT;
      const parsed = Number(raw);
      return Number.isFinite(parsed) ? parsed : null;
    },
    commissionRateLabel() {
      return this.commissionRateValue == null ? '--' : `${this.commissionRateValue.toFixed(2)} %`;
    }
  },
  methods: {
    async fetchStats() {
      try {
        const [res, summaryRes, bRes] = await Promise.all([
          this.$api.myApi.personV2(),
          this.$api.orderApi.summary(),
          this.$api.homeApi.baseParam()
        ]);

        if (res.data) {
          const info = res.data;
          this.stats = {
            ...info,
            amount: info.amount ?? info.availableBalance ?? info.total_amount_inr ?? 0,
            sellAmount: info.sellAmount ?? info.withdrawalBalance ?? info.cashbackAmount ?? info.withdrawAmount ?? 0,
            rechargeAmount: info.rechargeAmount ?? info.depositAmount ?? info.integralScore ?? 0,
            commissionAmount: info.commissionAmount ?? info.totalReward ?? 0,
            estimateIncome: info.estimateIncome ?? info.totalReward ?? 0,
          };
          this.isSelling = info.sellStatus === 1 || info.isSell === true;
        }

        if (summaryRes?.data) {
          this.stats = {
            ...this.stats,
            frozenAmount: summaryRes.data.frozenAmount ?? this.stats.frozenAmount,
            processOrderNum: summaryRes.data.processOrderNum ?? this.stats.processOrderNum
          };
        }

        if (bRes.data) this.baseParam = bRes.data;
      } catch (e) {}
      finally { this.isCommissionLoading = false; }
    },
    async toggleSell() {
      if (this.isSellSubmitting) return;
      this.isSellSubmitting = true;
      try {
        if (this.isSelling) {
          await this.$api.userApi.offSell(0);
          this.isSelling = false;
        } else {
          await this.$api.userApi.onSell(0);
          this.isSelling = true;
        }
        toast.show({ title: 'Success', icon: 'success' });
        await this.fetchStats();
      } catch (e) {
      } finally {
        this.isSellSubmitting = false;
      }
    }
  },
  mounted() {
    this.fetchStats();
  }
}
</script>

<style scoped>
.stats-page {
  --stats-accent: #4f8cff;
  --stats-accent-soft: rgba(79, 140, 255, 0.18);
  --stats-accent-faint: rgba(79, 140, 255, 0.1);
  --stats-glass: rgba(255, 255, 255, 0.04);
  --stats-glass-strong: rgba(255, 255, 255, 0.06);
  --stats-border: rgba(255, 255, 255, 0.1);
  --stats-shadow: 0 16px 34px rgba(0, 0, 0, 0.3);
  position: relative;
  padding-top: 8px;
}

.stats-page::before {
  content: '';
  position: absolute;
  inset: 0 0 auto;
  height: 300px;
  background:
    radial-gradient(62% 42% at 82% 2%, rgba(79, 140, 255, 0.13) 0%, rgba(79, 140, 255, 0) 74%),
    radial-gradient(44% 26% at 14% 14%, rgba(105, 200, 155, 0.08) 0%, rgba(105, 200, 155, 0) 76%);
  pointer-events: none;
  z-index: 0;
}

.stats-hero,
.bento-grid,
.exchange-panel,
.activity-panel {
  position: relative;
  z-index: 1;
}

.panel-glass {
  background: linear-gradient(165deg, var(--stats-glass-strong) 0%, var(--stats-glass) 70%, rgba(255, 255, 255, 0.02) 100%);
  border: 1px solid var(--stats-border);
  border-radius: 20px;
  box-shadow: var(--stats-shadow);
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

.stats-hero {
  margin: 0 16px 12px;
  border-radius: 26px;
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}

.hero-main label {
  font-size: 10px;
  letter-spacing: 0.13em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.56);
  font-family: var(--font-label);
}

.hero-main h1 {
  margin-top: 4px;
  font-size: clamp(34px, 9vw, 48px);
  line-height: 1.04;
  letter-spacing: -0.02em;
  color: rgba(255, 255, 255, 0.95);
}

.trend-chip {
  display: inline-flex;
  margin-top: 8px;
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(79, 140, 255, 0.12);
  border: 1px solid rgba(79, 140, 255, 0.3);
  color: rgba(203, 219, 158, 0.95);
  font-size: 10px;
  font-family: var(--font-label);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-weight: 700;
}

.deposit-btn {
  width: 100%;
  border: none;
  border-radius: 999px;
  min-height: 44px;
  padding: 12px 14px;
  background: linear-gradient(145deg, #4f8cff 0%, #2e6ae6 100%);
  color: #d0e4ff;
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-family: var(--font-label);
  box-shadow: 0 10px 20px rgba(79, 140, 255, 0.2);
}

.deposit-btn:active {
  transform: scale(0.98);
}

.bento-grid {
  margin: 0 16px 12px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.bento-card {
  border-radius: 18px;
  padding: 13px;
}

.bento-wide {
  grid-column: span 2;
}

.bento-icon-wrap {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.06);
  display: flex;
  align-items: center;
  justify-content: center;
  margin-bottom: 10px;
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.bento-grid .bento-card:nth-child(1) .bento-icon-wrap {
  background: rgba(224, 178, 103, 0.16);
}

.bento-grid .bento-card:nth-child(2) .bento-icon-wrap {
  background: rgba(109, 194, 144, 0.16);
}

.bento-grid .bento-card:nth-child(3) .bento-icon-wrap {
  background: rgba(122, 193, 227, 0.16);
}

.bento-icon {
  width: 20px;
  height: 20px;
}

.bento-card h3 {
  font-size: clamp(20px, 5.4vw, 24px);
  line-height: 1.08;
  letter-spacing: -0.01em;
  color: rgba(255, 255, 255, 0.94);
}

.bento-card p {
  margin-top: 3px;
  font-size: 11px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  color: rgba(255, 255, 255, 0.56);
  font-family: var(--font-label);
}

.exchange-panel {
  margin: 0 16px 12px;
  border-radius: 22px;
  padding: 14px;
}

.section-title-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 8px;
}

.section-title-row h3 {
  font-size: 18px;
  line-height: 1.1;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.94);
  font-family: var(--font-brand);
}

.section-title-row span {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.56);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  font-family: var(--font-label);
}

.exchange-row {
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 10px;
  border-radius: 14px;
  padding: 10px;
  margin-bottom: 8px;
  box-shadow: none;
}

.exchange-row:last-child {
  margin-bottom: 0;
}

.row-title {
  font-size: 13px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.92);
}

.row-sub {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.52);
  margin-top: 2px;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  font-family: var(--font-label);
}

.row-value {
  font-size: 15px;
  font-weight: 800;
  color: rgba(233, 241, 208, 0.95);
  white-space: nowrap;
}

.activity-panel {
  margin: 0 16px;
  border-radius: 22px;
  padding: 14px;
}

.activity-panel h3 {
  margin-bottom: 10px;
  font-size: 17px;
  color: rgba(255, 255, 255, 0.93);
  font-family: var(--font-brand);
}

.activity-panel .btn-primary {
  min-height: 44px;
  border-radius: 999px;
  background: linear-gradient(145deg, #4f8cff 0%, #2e6ae6 100%);
  color: #d0e4ff;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-size: 11px;
  font-family: var(--font-label);
  box-shadow: 0 10px 20px rgba(79, 140, 255, 0.2);
}

.activity-panel .btn-primary:disabled {
  opacity: 0.6;
  box-shadow: none;
}

.ghost-btn {
  width: 100%;
  margin-top: 10px;
  min-height: 44px;
  border: 1px solid rgba(79, 140, 255, 0.28);
  border-radius: 999px;
  background: rgba(255, 255, 255, 0.035);
  color: rgba(203, 219, 158, 0.95);
  font-size: 11px;
  font-family: var(--font-label);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-weight: 700;
}

.ghost-btn:active {
  transform: scale(0.98);
}

@media (max-width: 420px) {
  .bento-card h3 {
    font-size: clamp(18px, 5vw, 22px);
  }
}

@media (max-width: 380px) {
  .stats-hero,
  .bento-grid,
  .exchange-panel,
  .activity-panel {
    margin-left: 12px;
    margin-right: 12px;
  }

  .stats-hero {
    padding: 14px;
  }

  .exchange-panel,
  .activity-panel {
    padding: 12px;
  }
}
</style>
