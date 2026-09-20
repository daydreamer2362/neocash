<template>
  <div class="page wallet-page">
    <section class="wallet-head">
      <div>
        <p class="wallet-overline">Vault</p>
        <h1 class="wallet-title">Wallet Control</h1>
      </div>
      <button class="wallet-add-btn" @click="goAddWallet">+</button>
    </section>

    <div class="wallet-mode-tabs panel-glass">
      <button class="wallet-mode-tab" :class="{ active: mode === 'collection' }" @click="mode = 'collection'">Collection</button>
      <button class="wallet-mode-tab" :class="{ active: mode === 'payout' }" @click="mode = 'payout'">Payout</button>
    </div>

    <div v-if="mode === 'payout'" class="payout-config-card panel-glass n-watermark">
      <div class="wallet-section-title">Payout Rules</div>
      <div class="payout-config-grid">
        <div class="payout-config-item panel-glass">
          <span class="cfg-label">Minimum</span>
          <span class="cfg-value">₹ {{ payoutConfig.minAmountText }}</span>
        </div>
        <div class="payout-config-item panel-glass">
          <span class="cfg-label">Maximum</span>
          <span class="cfg-value">₹ {{ payoutConfig.maxAmountText }}</span>
        </div>
        <div class="payout-config-item panel-glass">
          <span class="cfg-label">Fee Rate</span>
          <span class="cfg-value">{{ payoutConfig.feeRateText }}</span>
        </div>
      </div>
    </div>

    <div class="wallet-list">
      <div v-if="!currentWallets.length" class="wallet-add-card panel-glass n-watermark" @click="goAddWallet">
        <span class="wallet-add-plus">+</span>
        <span class="wallet-add-text">Add Wallet</span>
      </div>

      <article
        class="wallet-card panel-glass n-watermark"
        v-for="(w, i) in currentWallets"
        :key="i"
        :class="{ selected: selectedWalletId === walletKey(w), 'wallet-failed': w.status === 'Failed' }"
        @click="handleCardTap(w)"
      >
        <div class="wallet-top">
          <div>
            <p class="wallet-kind">{{ walletModeLabel }}</p>
            <h3 class="wallet-account">{{ w.account || w.upi || w.walletNo || '--' }}</h3>
          </div>
          <span class="wallet-status-pill" :class="walletStatusPillClass(w)">{{ walletStatusLabel(w) }}</span>
        </div>

        <div class="wallet-meta-row panel-glass ">
          <span>Limit: {{ formatLimitAmount(w.minLimit || payoutConfig.minAmount || 100) }} ~ {{ formatLimitAmount(w.maxLimit || payoutConfig.maxAmount || 100000) }}</span>
          <span>{{ w.provider || w.walletTypeName || 'UPI' }}</span>
        </div>

        <div class="wallet-actions">
          <template v-if="mode === 'collection'">
            <button class="btn-inline" :class="{ 'btn-default': w.isDefault }" :disabled="w.isDefault" @click.stop="toggleWalletStatus(w)">
              {{ w.isDefault ? 'Default' : 'Set Default' }}
            </button>
            <button class="btn-inline danger" @click.stop="removeWallet(w)">Remove</button>
          </template>
          <button v-else class="btn-inline primary" @click.stop="confirmPayoutWallet(w)">Use For Payout</button>
        </div>
      </article>

      <div v-if="!currentWallets.length" class="no-data-hint panel-glass n-watermark n-watermark-soft">No {{ mode }} wallets found. Please add one first.</div>
    </div>
  </div>
</template>

<script>
import { showConfirm } from '../components/ConfirmDialog.vue'
import { verifyPinAndGetTicket } from '../components/PinModal.vue'
import { normalizeWalletStatus, mapPayoutConfig, formatLimitAmount } from '../utils/helpers'
import { toast } from '../utils/toast'

export default {
  name: 'WalletPage',
  data() {
    return {
      mode: this.$route.query.mode === 'payout' ? 'payout' : 'collection',
      wallets: [],
      payoutWallets: [],
      payoutConfig: mapPayoutConfig(),
      selectedWalletId: '',
    }
  },
  computed: {
    currentWallets() {
      return this.mode === 'payout' ? this.payoutWallets : this.wallets;
    },
    walletModeLabel() {
      return this.mode === 'payout' ? 'PAYOUT' : 'UPI';
    }
  },
  methods: {
    formatLimitAmount,
    walletKey(wallet) {
      return String(wallet?.id || wallet?.walletId || wallet?.collectionId || wallet?.account || wallet?.upi || '');
    },
    walletStatus(wallet) {
      return normalizeWalletStatus(wallet?.status);
    },
    walletStatusPillClass(wallet) {
      const classes = [`ws-${this.walletStatus(wallet)}`];
      if (wallet?.isDefault) classes.push('ws-default');
      return classes;
    },
    walletStatusLabel(wallet) {
      if (wallet?.isDefault) return 'Default';
      const status = this.walletStatus(wallet);
      if (status === 'online') return 'Enabled';
      if (status === 'disabled') return 'Disabled';
      return 'Ready';
    },
    goAddWallet() {
      this.$router.push('/add-wallet');
    },
    async fetchWallets() {
      try {
        const [walletRes, payoutRes, configRes, baseParamRes] = await Promise.all([
          this.$api.walletApi.getWalletList({ page: 1, size: 50 }),
          this.$api.walletApi.getPayoutWalletList({ page: 1, size: 50 }),
          this.$api.ctTypeApi.payoutConfigCheck(),
          this.$api.pointApi.rechargeConfig()
        ]);
        this.wallets = Array.isArray(walletRes?.data) ? walletRes.data : (walletRes?.data?.records || []);
        this.payoutWallets = Array.isArray(payoutRes?.data) ? payoutRes.data : (payoutRes?.data?.records || []);
        const mergedConfig = {
          ...(baseParamRes?.data || {}),
          ...(configRes?.data || {})
        };
        this.payoutConfig = mapPayoutConfig(mergedConfig);
      } catch (e) {}
    },
    handleCardTap(wallet) {
      this.selectedWalletId = this.walletKey(wallet);
      if (this.mode === 'collection') return;
      this.confirmPayoutWallet(wallet);
    },
    async toggleWalletStatus(wallet) {
      const walletId = wallet?.id || wallet?.walletId;
      if (!walletId || wallet?.isDefault) return;
      showConfirm({
        title: 'Set Default Wallet',
        content: 'Use this payout account as the default wallet for future sell orders?',
        onConfirm: async () => {
          try {
            await this.$api.walletApi.changeStatus(walletId, { status: 1 });
            toast.show({ title: 'Default wallet updated', icon: 'success' });
            this.fetchWallets();
          } catch (e) {}
        }
      });
    },
    removeWallet(wallet) {
      const walletId = wallet?.id || wallet?.walletId;
      if (!walletId) return;
      showConfirm({
        title: 'Remove Wallet',
        content: 'Remove this payout wallet from your account?',
        onConfirm: async () => {
          try {
            await this.$api.walletApi.offSell(walletId);
            toast.show({ title: 'Wallet removed', icon: 'success' });
            this.fetchWallets();
          } catch (e) {}
        }
      });
    },
    confirmPayoutWallet(wallet) {
      const walletText = wallet?.account || wallet?.upi || wallet?.walletNo || '--';
      showConfirm({
        title: 'Confirm Payout Wallet',
        content: `Use ${walletText} for payout within the configured limits?`,
        onConfirm: async () => {
          const ticket = await verifyPinAndGetTicket();
          if (!ticket) return;
          await this.$api.walletApi.changeStatus(wallet?.id || wallet?.walletId, { status: 1 });
          this.selectedWalletId = this.walletKey(wallet);
          toast.show({ title: 'Payout wallet selected', icon: 'success' });
          this.fetchWallets();
        }
      });
    }
  },
  watch: {
    '$route.query.mode'(nextMode) {
      this.mode = nextMode === 'payout' ? 'payout' : 'collection';
    }
  },
  mounted() {
    this.fetchWallets();
  }
}
</script>

<style scoped>
.wallet-page {
  --wallet-accent: #4f8cff;
  --wallet-accent-soft: rgba(79, 140, 255, 0.17);
  --wallet-accent-faint: rgba(79, 140, 255, 0.1);
  --wallet-glass: rgba(255, 255, 255, 0.04);
  --wallet-glass-strong: rgba(255, 255, 255, 0.06);
  --wallet-border: rgba(255, 255, 255, 0.1);
  --wallet-shadow: 0 16px 34px rgba(0, 0, 0, 0.3);
  position: relative;
  padding-top: 8px;
}

.wallet-page::before {
  content: '';
  position: absolute;
  inset: 0 0 auto;
  height: 280px;
  background:
    radial-gradient(62% 42% at 84% 6%, rgba(79, 140, 255, 0.14) 0%, rgba(79, 140, 255, 0) 72%),
    radial-gradient(42% 26% at 12% 16%, rgba(105, 200, 155, 0.08) 0%, rgba(105, 200, 155, 0) 78%);
  pointer-events: none;
  z-index: 0;
}

.wallet-head,
.wallet-mode-tabs,
.payout-config-card,
.wallet-list {
  position: relative;
  z-index: 1;
}

.panel-glass {
  background: linear-gradient(165deg, var(--wallet-glass-strong) 0%, var(--wallet-glass) 70%, rgba(255, 255, 255, 0.02) 100%);
  border: 1px solid var(--wallet-border);
  border-radius: 20px;
  box-shadow: var(--wallet-shadow);
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

.wallet-head {
  margin: 0 16px 12px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.wallet-overline {
  font-size: 10px;
  font-family: var(--font-label);
  letter-spacing: 0.14em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.56);
}

.wallet-title {
  margin-top: 2px;
  font-size: clamp(28px, 8vw, 34px);
  line-height: 1.04;
  font-family: var(--font-brand);
  color: rgba(255, 255, 255, 0.94);
}

.wallet-add-btn {
  width: 38px;
  height: 38px;
  border-radius: 12px;
  border: 1px solid rgba(79, 140, 255, 0.32);
  background: linear-gradient(145deg, #4f8cff 0%, #2e6ae6 100%);
  color: #d0e4ff;
  font-size: 23px;
  line-height: 1;
  box-shadow: 0 10px 18px rgba(79, 140, 255, 0.2);
}

.wallet-add-btn:active {
  transform: scale(0.97);
}

.wallet-mode-tabs {
  margin: 0 16px 12px;
  display: flex;
  gap: 8px;
  padding: 7px;
  border-radius: 999px;
}

.wallet-mode-tab {
  flex: 1;
  border: 1px solid transparent;
  border-radius: 999px;
  background: transparent;
  color: rgba(255, 255, 255, 0.64);
  padding: 10px 12px 9px;
  font-size: 11px;
  font-family: var(--font-label);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-weight: 700;
}

.wallet-mode-tab.active {
  background: linear-gradient(145deg, #4f8cff 0%, #2e6ae6 100%);
  color: #d0e4ff;
  box-shadow: 0 8px 16px rgba(79, 140, 255, 0.2);
}

.payout-config-card {
  margin: 0 16px 12px;
  border-radius: 22px;
  padding: 14px;
}

.wallet-section-title {
  font-size: 17px;
  line-height: 1.1;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.92);
  margin-bottom: 10px;
}

.payout-config-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 8px;
}

.payout-config-item {
  border-radius: 12px;
  padding: 10px;
  text-align: center;
  box-shadow: none;
}

.cfg-label {
  display: block;
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  color: rgba(255, 255, 255, 0.56);
  font-family: var(--font-label);
}

.cfg-value {
  display: block;
  margin-top: 5px;
  font-size: 15px;
  letter-spacing: -0.01em;
  font-weight: 800;
  color: rgba(255, 255, 255, 0.94);
}

.wallet-list {
  padding: 0 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.wallet-add-card {
  border: 1px dashed rgba(79, 140, 255, 0.34);
  border-radius: 20px;
  padding: 16px;
  display: flex;
  align-items: center;
  gap: 8px;
  justify-content: center;
  color: rgba(210, 224, 173, 0.88);
}

.wallet-add-plus {
  font-size: 22px;
  font-weight: 800;
}

.wallet-add-text {
  font-size: 13px;
  text-transform: uppercase;
  letter-spacing: 0.1em;
  font-family: var(--font-label);
  font-weight: 700;
}

.wallet-card {
  border-radius: 22px;
  padding: 14px;
}

.wallet-card.wallet-failed {
  background:
    linear-gradient(150deg, rgba(43, 29, 24, 0.92) 0%, rgba(34, 23, 20, 0.94) 100%),
    linear-gradient(165deg, rgba(255, 115, 81, 0.18) 0%, rgba(255, 115, 81, 0.06) 100%);
  border-color: rgba(255, 115, 81, 0.24);
}

.wallet-card.selected {
  border-color: rgba(79, 140, 255, 0.56);
  box-shadow: 0 0 0 1px rgba(79, 140, 255, 0.16) inset;
}

.wallet-top {
  display: flex;
  justify-content: space-between;
  gap: 10px;
}

.wallet-kind {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.56);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  font-family: var(--font-label);
}

.wallet-account {
  margin-top: 3px;
  font-size: clamp(16px, 4.6vw, 20px);
  line-height: 1.18;
  color: rgba(255, 255, 255, 0.95);
  max-width: 230px;
  word-break: break-word;
}

.wallet-status-pill {
  min-height: 24px;
  min-width: 78px;
  padding: 5px 12px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 10px;
  line-height: 1;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  font-family: var(--font-label);
  text-align: center;
  white-space: nowrap;
}

.ws-online {
  background: rgba(110, 194, 144, 0.2);
  color: #8ac89d;
}

.ws-offline {
  background: rgba(216, 136, 114, 0.2);
  color: #d88872;
}

.ws-disabled {
  background: rgba(143, 147, 152, 0.28);
  color: rgba(215, 219, 223, 0.82);
}

.ws-default {
  min-width: 68px;
  height: 20px !important;
  min-height: 20px !important;
  padding: 0 8px !important;
  font-size: 9px;
  line-height: 1;
  letter-spacing: 0.09em;
  background: linear-gradient(145deg, rgba(188, 205, 116, 0.34) 0%, rgba(157, 179, 86, 0.3) 55%, rgba(145, 167, 78, 0.28) 100%);
  border: 1px solid rgba(196, 214, 126, 0.42);
  color: rgba(238, 246, 210, 0.98);
  text-shadow: 0 1px 0 rgba(30, 36, 18, 0.35);
  box-shadow:
    inset 0 1px 0 rgba(255, 255, 255, 0.2),
    inset 0 0 0 1px rgba(196, 214, 126, 0.1),
    0 4px 10px rgba(79, 140, 255, 0.18);
}

.wallet-meta-row {
  margin-top: 10px;
  border-radius: 12px;
  padding: 9px 10px;
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  font-size: 11px;
  line-height: 1.25;
  color: rgba(255, 255, 255, 0.72);
  box-shadow: none;
}

.wallet-meta-row span:first-child {
  min-width: 0;
  overflow-wrap: anywhere;
}

.wallet-meta-row span:last-child {
  white-space: nowrap;
  color: rgba(255, 255, 255, 0.56);
  text-transform: uppercase;
  letter-spacing: 0.06em;
  font-family: var(--font-label);
  font-size: 10px;
}

.wallet-actions {
  margin-top: 10px;
  display: flex;
  justify-content: flex-end;
  flex-wrap: wrap;
  gap: 8px;
}

.btn-inline {
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.14);
  background: rgba(255, 255, 255, 0.05);
  color: rgba(255, 255, 255, 0.9);
  border-radius: 999px;
  padding: 7px 12px;
  min-height: 32px;
  font-size: 10px;
  line-height: 1;
  font-family: var(--font-label);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-weight: 700;
}

.btn-inline.primary {
  background: linear-gradient(145deg, #4f8cff 0%, #2e6ae6 100%);
  color: #d0e4ff;
  border-color: transparent;
  box-shadow: 0 8px 16px rgba(79, 140, 255, 0.2);
}

.btn-inline.danger {
  color: #d88872;
  border-color: rgba(216, 136, 114, 0.4);
}

.btn-default {
  min-width: 74px;
  min-height: 26px;
  padding: 2px 10px;
  border-color: rgba(164, 192, 84, 0.34);
  background: rgba(164, 192, 84, 0.16);
  color: rgba(222, 236, 183, 0.96);
}

.btn-default:disabled {
  opacity: 1;
  cursor: default;
}

.btn-inline:disabled {
  opacity: 0.6;
}

.btn-inline:active {
  transform: scale(0.97);
}

.no-data-hint {
  border-radius: 16px;
  padding: 16px 14px;
  color: rgba(255, 255, 255, 0.62);
  font-size: 13px;
  text-align: center;
  line-height: 1.35;
}

@media (max-width: 420px) {
  .wallet-actions {
    justify-content: flex-start;
  }

  .btn-inline {
    flex: 1 1 auto;
    min-width: 118px;
    text-align: center;
  }

  .payout-config-grid {
    grid-template-columns: 1fr;
    gap: 7px;
  }
}

@media (max-width: 380px) {
  .wallet-head,
  .wallet-mode-tabs,
  .payout-config-card {
    margin-left: 12px;
    margin-right: 12px;
  }

  .wallet-list {
    padding-left: 12px;
    padding-right: 12px;
  }

  .wallet-account {
    font-size: 16px;
    max-width: 100%;
  }

  .wallet-title {
    font-size: clamp(24px, 7vw, 30px);
  }

  .wallet-add-btn {
    width: 36px;
    height: 36px;
  }
}

@media (max-width: 340px) {
  .wallet-meta-row {
    flex-direction: column;
    align-items: flex-start;
  }

  .wallet-meta-row span:last-child {
    white-space: normal;
  }
}
</style>
