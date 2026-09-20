<template>
  <div class="page-no-tab usdt-order-page">
    <div class="nav-bar">
      <button class="back-btn" @click="handleBack"><img src="/icons/back.png" /></button>
      <span class="nav-title">Order</span>
    </div>

    <div class="order-content">
      <div class="glass-card amount-card">
        <div class="amount-kicker">Recharge Amount</div>
        <h1 class="order-amount">
          USDT {{ amountLabel }}
        </h1>
      </div>

      <div class="glass-card details-card">
        <div class="detail-item" @click="copyText(walletAddress)">
          <div class="detail-left">
            <span class="detail-label">Address</span>
            <span class="detail-value address-text">{{ walletAddress || '...' }}</span>
          </div>
          <img src="/icons/copy.png" class="detail-copy-icon" />
        </div>

        <div class="detail-item" @click="copyText(typeLabel)">
          <div class="detail-left">
            <span class="detail-label">Type</span>
            <span class="detail-value highlight">{{ typeLabel }}</span>
          </div>
          <img src="/icons/copy.png" class="detail-copy-icon" />
        </div>

        <div class="detail-item" @click="copyText(statusLabel)">
          <div class="detail-left">
            <span class="detail-label">Status</span>
            <span :class="['detail-value', 'status-text', `status-${statusLabel.toLowerCase()}`]">{{ statusLabel }}</span>
          </div>
          <img src="/icons/copy.png" class="detail-copy-icon" />
        </div>

        <div class="detail-item" @click="copyText(createdAtLabel)">
          <div class="detail-left">
            <span class="detail-label">CreatedAt</span>
            <span class="detail-value">{{ createdAtLabel }}</span>
          </div>
          <img src="/icons/copy.png" class="detail-copy-icon" />
        </div>

        <div class="detail-item last" @click="copyText(referenceLabel)">
          <div class="detail-left">
            <span class="detail-label">NO</span>
            <span class="detail-value ref-text">{{ referenceLabel }}</span>
          </div>
          <img src="/icons/copy.png" class="detail-copy-icon" />
        </div>
      </div>

      <div class="warning-box glass-card">
        <div class="warning-title">Payment Instructions</div>
        <div class="warning-item">1. Copy the USDT address above.</div>
        <div class="warning-item">2. Transfer the exact amount of USDT (TRC20).</div>
        <div class="warning-item">3. Order will be approved after blockchain verification.</div>
      </div>
    </div>
  </div>
</template>

<script>
import { toast } from '../utils/toast'

export default {
  name: 'UsdtOrderPage',
  data() {
    return {
      order: {},
      usdtSettings: {}
    }
  },
  computed: {
    walletAddress() {
      return this.order?.walletAddress || this.usdtSettings?.usdtWalletAddress || '';
    },
    statusLabel() {
      return String(this.order?.status || 'PENDING').toUpperCase();
    },
    typeLabel() {
      return this.order?.type || 'Bank-USDT';
    },
    amountLabel() {
      return Number(this.order?.amount || 0).toFixed(2);
    },
    createdAtLabel() {
      return this.formatDate(this.order?.createdAt);
    },
    referenceLabel() {
      return this.order?.referenceNo || '...';
    }
  },
  methods: {
    handleBack() {
      // Use browser history first so we don't create a deposit<->order loop.
      const hasBackHistory = typeof window !== 'undefined' && window.history.length > 1;
      if (hasBackHistory) {
        this.$router.back();
        return;
      }
      this.$router.replace('/deposit');
    },
    async fetchOrder() {
      const id = this.$route.params.id;
      if (!id) return;
      try {
        const res = await this.$api.orderApi.usdtOrderDetail(id);
        const found = res?.data || null;
        if (found) {
          this.order = found;
          return;
        }
      } catch (e) {
      }

      // Backward-compatible fallback
      try {
        const res = await this.$api.orderApi.usdtHistory();
        const list = Array.isArray(res?.data) ? res.data : [];
        const found = list.find((o) => String(o?.id) === String(id) || String(o?.referenceNo) === String(id));
        if (found) {
          this.order = found;
        }
      } catch (e) {}
    },
    async fetchSettings() {
      try {
        const res = await this.$api.orderApi.usdtInfo();
        if (res.data) this.usdtSettings = res.data;
      } catch (e) {}
    },
    formatDate(d) {
      if (!d) return '...';
      const date = new Date(d);
      if (Number.isNaN(date.getTime())) return '...';
      const y = date.getFullYear();
      const m = String(date.getMonth() + 1).padStart(2, '0');
      const day = String(date.getDate()).padStart(2, '0');
      const h = String(date.getHours()).padStart(2, '0');
      const min = String(date.getMinutes()).padStart(2, '0');
      const s = String(date.getSeconds()).padStart(2, '0');
      return `${y}-${m}-${day} ${h}:${min}:${s}`;
    },
    async copyText(text) {
      if (!text) return;
      try {
        await navigator.clipboard.writeText(String(text));
        toast.show({ title: 'Copied successfully', icon: 'success' });
      } catch (e) {}
    }
  },
  mounted() {
    this.fetchOrder();
    this.fetchSettings();
  },
  watch: {
    '$route.params.id'() {
      this.fetchOrder();
    }
  }
}
</script>

<style scoped>
.usdt-order-page {
  --order-accent: #4f8cff;
  --glass-bg: rgba(255, 255, 255, 0.035);
  --glass-bg-strong: rgba(255, 255, 255, 0.052);
  --glass-border: rgba(255, 255, 255, 0.11);
  --glass-shadow: 0 16px 36px rgba(0, 0, 0, 0.32);
  position: relative;
  min-height: 100vh;
}

.usdt-order-page::before {
  content: '';
  position: absolute;
  inset: 0 0 auto;
  height: 300px;
  background:
    radial-gradient(56% 42% at 84% 8%, rgba(79, 140, 255, 0.14) 0%, rgba(79, 140, 255, 0) 72%),
    radial-gradient(46% 30% at 12% 10%, rgba(46, 106, 230, 0.06) 0%, rgba(46, 106, 230, 0) 74%);
  pointer-events: none;
  z-index: 0;
}

.order-content {
  position: relative;
  z-index: 1;
  padding: 16px;
}

.glass-card {
  border-radius: 20px;
  border: 1px solid var(--glass-border);
  background: linear-gradient(165deg, var(--glass-bg-strong) 0%, var(--glass-bg) 68%, rgba(255, 255, 255, 0.02) 100%);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  box-shadow: var(--glass-shadow);
  margin-bottom: 20px;
}

.amount-card {
  padding: 30px 16px;
  text-align: center;
}

.amount-kicker {
  font-size: 11px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.5);
  font-family: var(--font-label);
  margin-bottom: 8px;
}

.order-amount {
  font-size: 42px;
  font-weight: 800;
  color: #fff;
  margin: 0;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 12px;
  font-family: var(--font-brand);
}

.usdt-icon-large {
  width: 32px;
  height: 32px;
}

.details-card {
  padding: 8px 0;
}

.detail-item {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.05);
  cursor: pointer;
}

.detail-item:active {
  background: rgba(255, 255, 255, 0.02);
}

.detail-item.last {
  border-bottom: none;
}

.detail-left {
  display: flex;
  flex-direction: column;
  gap: 4px;
}

.detail-label {
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.4);
  font-family: var(--font-label);
}

.detail-value {
  font-size: 14px;
  font-weight: 600;
  color: #fff;
  word-break: break-all;
}

.highlight {
  color: var(--order-accent);
}

.status-text {
  text-transform: capitalize;
}

.status-pending { color: #f59e0b; }
.status-approved { color: #22c55e; }
.status-rejected { color: #ef4444; }

.address-text {
  font-family: monospace;
  font-size: 13px;
  color: rgba(255, 255, 255, 0.85);
}

.ref-text {
  font-family: monospace;
  color: rgba(255, 255, 255, 0.7);
}

.detail-copy-icon {
  width: 16px;
  height: 16px;
  opacity: 0.4;
}

.warning-box {
  padding: 16px;
}

.warning-title {
  font-size: 12px;
  font-weight: 800;
  color: var(--order-accent);
  margin-bottom: 10px;
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.warning-item {
  font-size: 12.5px;
  color: rgba(255, 255, 255, 0.7);
  line-height: 1.5;
  margin-bottom: 6px;
}
</style>
