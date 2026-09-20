<template>
  <div class="page-no-tab score-page">
    <div class="nav-bar">
      <button class="back-btn" @click="$router.back()"><img src="/icons/back.png" /></button>
      <span class="nav-title">Score</span>
    </div>

    <div class="score-cards">
      <div class="score-card panel-glass n-watermark">
        <img src="/integral/coin-dark.png" class="sc-icon" />
        <div>
          <div class="sc-label">Total Score</div>
          <div class="sc-value">{{ totalScore }}</div>
        </div>
      </div>
      <div class="score-card panel-glass n-watermark n-watermark-soft">
        <img src="/integral/coin-light.png" class="sc-icon" />
        <div>
          <div class="sc-label">Available</div>
          <div class="sc-value">{{ availableScore }}</div>
        </div>
      </div>
    </div>

    <div class="mindset-strip panel-glass">
      <span class="mindset-dot"></span>
      <span>Small consistent progress compounds. Keep going.</span>
    </div>

    <div class="history-section panel-glass n-watermark">
      <h3 class="section-title">History</h3>
      <div class="history-list" v-if="pageState.list.length > 0">
        <div class="history-item panel-glass" v-for="(h, i) in pageState.list" :key="i">
          <div class="hi-left">
            <div class="hi-title">{{ historyTitle(h) }}</div>
            <div class="hi-source">{{ historySource(h) }}</div>
            <div class="hi-meta">{{ formatDate(h.createTime || h.createdAt) }}</div>
          </div>
          <div class="hi-amount" :class="historyAmountClass(h)">{{ historyAmountText(h) }}</div>
        </div>
        <div class="load-more" @click="loadMoreAction" v-if="!pageState.finished">{{ pageState.loading ? 'Loading...' : 'Load More' }}</div>
      </div>
      <div class="no-data panel-glass n-watermark n-watermark-soft" v-else>No history records yet.</div>
    </div>
  </div>
</template>

<script>
import { usePagination } from '../composables/usePagination'
import { pointHistoryApi, myApi } from '../api'
import { formatDate, formatMoney } from '../utils/helpers'

export default {
  name: 'ScorePage',
  data() {
    return {
      totalScore: 0,
      availableScore: 0
    }
  },
  setup() {
    const fetchHistory = (p) => pointHistoryApi.page(p);
    const { state: pageState, refreshAction, loadMoreAction } = usePagination(fetchHistory);
    return { pageState, refreshAction, loadMoreAction, formatDate };
  },
  methods: {
    historyNumericAmount(item) {
      const raw = Number(item?.amount ?? item?.score ?? item?.integral ?? 0);
      let amount = Number.isFinite(raw) ? raw : 0;
      
      const sourceStr = [
        item?.source, item?.account, item?.title, item?.content, item?.desc, item?.remark, item?.typeName, item?.bizType
      ].filter(Boolean).join(' ').toLowerCase();
      
      if ((sourceStr.includes('sell') || sourceStr.includes('sold') || item?.type === 'PAYOUT') && amount > 0) {
        amount = -Math.abs(amount);
      }
      return amount;
    },
    historyTitle(item) {
      const amount = this.historyNumericAmount(item);
      const isSell = this.historySource(item) === 'Sell Order';
      if (isSell) return 'Score Deducted';
      if (amount > 0) return 'Score Added';
      if (amount < 0) return 'Score Deducted';
      return 'Score Update';
    },
    historySource(item) {
      const source = [
        item?.source,
        item?.account,
        item?.title,
        item?.content,
        item?.desc,
        item?.remark,
        item?.typeName,
        item?.bizType
      ].filter(Boolean).join(' ').toLowerCase();

      if (source.includes('welcome') || source.includes('new user')) return 'Welcome Bonus';
      if (source.includes('task') || source.includes('mission') || source.includes('checkin') || source.includes('check-in')) return 'Task Reward';
      if (source.includes('sell') || source.includes('sold') || item?.type === 'PAYOUT') return 'Sell Order';
      if (source.includes('buy') || source.includes('purchase') || source.includes('order')) return 'Buy Order';
      if (source.includes('referral') || source.includes('invite') || source.includes('team')) return 'Referral Reward';
      if (source.includes('commission') || source.includes('reward')) return 'Commission Reward';
      if (source.includes('deposit') || source.includes('recharge') || source.includes('topup') || source.includes('top up')) return 'USDT Bonus';
      if (source.includes('withdraw') || source.includes('payout') || source.includes('cashback')) return 'Withdrawal';
      return 'Account Activity';
    },
    historyAmountText(item) {
      const amount = this.historyNumericAmount(item);
      const sign = amount > 0 ? '+' : (amount < 0 ? '-' : '');
      return `${sign}${formatMoney(Math.abs(amount))}`;
    },
    historyAmountClass(item) {
      const amount = this.historyNumericAmount(item);
      if (amount > 0) return 'amount-positive';
      if (amount < 0) return 'amount-negative';
      return 'amount-neutral';
    },
    async fetchUser() {
      try {
        const res = await myApi.person();
        if (res.data) {
          const data = res.data;
          this.availableScore = Number(
            data.integralScore ?? data.availableScore ?? data.commissionAmount ?? data.amount ?? 0
          );
          this.totalScore = Number(
            data.totalReward ?? data.totalScore ?? data.totalCommissionAmount ?? this.availableScore
          );
        }
      } catch (e) {}
    }
  },
  mounted() {
    this.fetchUser();
    this.refreshAction();
  }
}
</script>

<style scoped>
.score-page {
  --score-accent: #4f8cff;
  --score-accent-soft: rgba(79, 140, 255, 0.18);
  --score-accent-faint: rgba(79, 140, 255, 0.1);
  --score-glass: rgba(255, 255, 255, 0.04);
  --score-glass-strong: rgba(255, 255, 255, 0.06);
  --score-border: rgba(255, 255, 255, 0.1);
  --score-shadow: 0 16px 34px rgba(0, 0, 0, 0.3);
  position: relative;
}

.score-page::before {
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
.score-cards,
.mindset-strip,
.history-section {
  position: relative;
  z-index: 1;
}

.panel-glass {
  background: linear-gradient(165deg, var(--score-glass-strong) 0%, var(--score-glass) 70%, rgba(255, 255, 255, 0.02) 100%);
  border: 1px solid var(--score-border);
  border-radius: 20px;
  box-shadow: var(--score-shadow);
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

.score-cards {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
  padding: 0 16px;
  margin-bottom: 12px;
}

.score-card {
  display: flex;
  align-items: center;
  gap: 10px;
  padding: 12px;
  border-radius: 16px;
}

.sc-icon {
  width: 32px;
  height: 32px;
}

.sc-label {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.56);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-family: var(--font-label);
}

.sc-value {
  margin-top: 2px;
  font-size: clamp(22px, 5.6vw, 26px);
  line-height: 1.06;
  letter-spacing: -0.01em;
  font-weight: 800;
  color: rgba(255, 255, 255, 0.94);
}

.mindset-strip {
  margin: 0 16px 12px;
  border-radius: 999px;
  min-height: 36px;
  padding: 8px 12px;
  display: flex;
  align-items: center;
  gap: 8px;
  color: rgba(214, 228, 182, 0.92);
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-family: var(--font-label);
  font-weight: 700;
}

.mindset-dot {
  width: 7px;
  height: 7px;
  border-radius: 50%;
  background: rgba(79, 140, 255, 0.95);
  box-shadow: 0 0 8px rgba(79, 140, 255, 0.42);
  flex-shrink: 0;
}

.history-section {
  margin: 0 16px;
  padding: 14px;
  border-radius: 22px;
}

.section-title {
  font-size: 18px;
  line-height: 1.1;
  font-weight: 700;
  margin-bottom: 10px;
  color: rgba(255, 255, 255, 0.94);
  font-family: var(--font-brand);
}

.history-list {
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.history-item {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
  gap: 8px;
  padding: 10px;
  border-radius: 14px;
  box-shadow: none;
}

.hi-left {
  flex: 1;
}

.hi-title {
  font-size: 13px;
  font-weight: 700;
  margin-bottom: 1px;
  color: rgba(255, 255, 255, 0.92);
}

.hi-source {
  font-size: 10px;
  color: rgba(203, 219, 158, 0.92);
  text-transform: uppercase;
  letter-spacing: 0.07em;
  font-family: var(--font-label);
  margin-bottom: 2px;
}

.hi-meta {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.52);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-family: var(--font-label);
}

.hi-amount {
  font-size: 16px;
  line-height: 1.08;
  font-weight: 800;
  letter-spacing: -0.01em;
}

.hi-amount.amount-positive {
  color: #8ac89d;
}

.hi-amount.amount-negative {
  color: #d88872;
}

.hi-amount.amount-neutral {
  color: rgba(255, 255, 255, 0.76);
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
  margin-top: 6px;
  text-align: center;
  padding: 18px 12px;
  color: rgba(255, 255, 255, 0.62);
  font-size: 13px;
  border-radius: 14px;
}

@media (max-width: 380px) {
  .score-cards,
  .mindset-strip,
  .history-section {
    margin-left: 12px;
    margin-right: 12px;
  }

  .score-cards {
    padding: 0;
    grid-template-columns: 1fr;
  }

  .history-section {
    padding: 12px;
  }
}
</style>
