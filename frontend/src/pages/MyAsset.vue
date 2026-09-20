<template>
  <div class="page my-page">
    <section class="profile-hero panel-glass n-watermark">
      <p class="hero-label">Total Asset Balance</p>
      <h1 class="hero-value">₹{{ user.total_amount_inr || user.amount || user.availableBalance || 0 }}</h1>
      <div class="hero-chip">
        <span class="chip-dot"></span>
        <span>Deposit Balance ₹{{ user.rechargeAmount || user.depositAmount || 0 }}</span>
      </div>
    </section>

    <section class="quick-actions">
      <button class="quick-action primary" @click="$router.push('/deposit')">
        <span>USDT</span>
      </button>
      <button class="quick-action" @click="$router.push('/wallet')">
        <span>Wallet</span>
      </button>
    </section>

    <section class="finance-list panel-glass n-watermark">
      <article class="finance-row panel-glass">
        <div class="finance-left">
          <img src="/statistics/deposit.png" class="fi-icon" />
          <div>
            <p class="fi-title">USDT Traded</p>
            <p class="fi-note">Total USDT earnings</p>
          </div>
        </div>
        <p class="fi-value"><img src="/icons/usdt.png" class="usdt-icon-inline" /> {{ Number(user.totalUSDTTraded || 0).toFixed(2) }}</p>
      </article>

      <article class="finance-row panel-glass">
        <div class="finance-left">
          <img src="/statistics/sell.png" class="fi-icon" />
          <div>
            <p class="fi-title">Withdraw</p>
            <p class="fi-note">Completed payout amount</p>
          </div>
        </div>
        <p class="fi-value">₹ {{ user.cashbackAmount || user.withdrawAmount || 0 }}</p>
      </article>

      <article class="finance-row panel-glass">
        <div class="finance-left">
          <img src="/statistics/commission.png" class="fi-icon" />
          <div>
            <p class="fi-title">Commission</p>
            <p class="fi-note">Reward earnings</p>
          </div>
        </div>
        <p class="fi-value">₹ {{ user.totalReward || user.commissionAmount || 0 }}</p>
      </article>
    </section>

    <section class="menu-grid-wrap panel-glass n-watermark">
      <div class="menu-grid">
        <button class="menu-item panel-glass" @click="$router.push('/wallet')">
          <div class="menu-icon-wrap menu-wallet"><img src="/statistics/wallet.png" class="menu-icon" /></div>
          <span>Wallet</span>
        </button>
        <button class="menu-item panel-glass" @click="$router.push('/score')">
          <div class="menu-icon-wrap menu-integral"><img src="/statistics/statistics.png" class="menu-icon" /></div>
          <span>Score</span>
        </button>
        <button class="menu-item panel-glass" @click="$router.push('/service')">
          <div class="menu-icon-wrap menu-service"><img src="/icons/phone-line.png" class="menu-icon" /></div>
          <span>Service</span>
        </button>
        <button class="menu-item panel-glass" @click="$router.push('/message')">
          <div class="menu-icon-wrap menu-message"><img src="/icons/mail-line.png" class="menu-icon" /></div>
          <span>Message</span>
        </button>
        <button class="menu-item panel-glass" @click="$router.push('/pin-code')">
          <div class="menu-icon-wrap menu-pin"><img src="/icons/lock-line.png" class="menu-icon" /></div>
          <span>Pin</span>
        </button>
        <button class="menu-item panel-glass" @click="$router.push('/payment-history')">
          <div class="menu-icon-wrap menu-history"><img src="/statistics/history.png" class="menu-icon icon-large" /></div>
          <span>Transactions</span>
        </button>
      </div>
    </section>

    <div class="logout-wrap">
      <button class="btn-primary" @click="handleLogout">Logout</button>
    </div>
  </div>
</template>

<script>
import { auth } from '../api/auth'
import { toast } from '../utils/toast'

export default {
  name: 'MyAssetPage',
  data() {
    return {
      user: {}
    }
  },
  methods: {
    async fetchPerson() {
      try {
        const res = await this.$api.myApi.person();
        if (res.data) this.user = res.data;
      } catch (e) {}
    },
    async handleLogout() {
      try {
        await this.$api.userApi.appLogout();
      } catch (e) {}

      auth.clearAuth();
      toast.show({ title: 'Logged out successfully' });
      this.$router.push('/login');
    }
  },
  mounted() {
    this.fetchPerson();
  }
}
</script>

<style scoped>
.my-page {
  --my-accent: #4f8cff;
  --my-accent-soft: rgba(79, 140, 255, 0.18);
  --my-accent-faint: rgba(79, 140, 255, 0.1);
  --my-glass: rgba(255, 255, 255, 0.04);
  --my-glass-strong: rgba(255, 255, 255, 0.06);
  --my-border: rgba(255, 255, 255, 0.1);
  --my-shadow: 0 16px 34px rgba(0, 0, 0, 0.3);
  position: relative;
  padding-top: 8px;
}

.my-page::before {
  content: '';
  position: absolute;
  inset: 0 0 auto;
  height: 290px;
  background:
    radial-gradient(62% 42% at 82% 2%, rgba(79, 140, 255, 0.13) 0%, rgba(79, 140, 255, 0) 74%),
    radial-gradient(44% 26% at 14% 14%, rgba(105, 200, 155, 0.08) 0%, rgba(105, 200, 155, 0) 76%);
  z-index: 0;
  pointer-events: none;
}

.profile-hero,
.quick-actions,
.finance-list,
.menu-grid-wrap,
.logout-wrap {
  position: relative;
  z-index: 1;
}

.panel-glass {
  background: linear-gradient(165deg, var(--my-glass-strong) 0%, var(--my-glass) 70%, rgba(255, 255, 255, 0.02) 100%);
  border: 1px solid var(--my-border);
  border-radius: 20px;
  box-shadow: var(--my-shadow);
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

.profile-hero {
  margin: 0 16px 12px;
  border-radius: 26px;
  padding: 16px;
}

.hero-label {
  font-size: 10px;
  letter-spacing: 0.14em;
  text-transform: uppercase;
  font-family: var(--font-label);
  color: rgba(255, 255, 255, 0.56);
}

.hero-value {
  margin-top: 3px;
  font-size: clamp(34px, 9vw, 48px);
  line-height: 1.06;
  letter-spacing: -0.02em;
  color: rgba(255, 255, 255, 0.95);
}

.hero-chip {
  margin-top: 10px;
  display: inline-flex;
  align-items: center;
  gap: 7px;
  padding: 6px 10px;
  border-radius: 999px;
  background: rgba(79, 140, 255, 0.12);
  border: 1px solid rgba(79, 140, 255, 0.32);
  color: rgba(203, 219, 158, 0.95);
  font-size: 10px;
  font-weight: 700;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-family: var(--font-label);
}

.chip-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: rgba(79, 140, 255, 0.95);
  box-shadow: 0 0 8px rgba(79, 140, 255, 0.4);
}

.quick-actions {
  margin: 0 16px 12px;
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 10px;
}

.quick-action {
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 999px;
  min-height: 42px;
  background: rgba(255, 255, 255, 0.04);
  color: rgba(255, 255, 255, 0.74);
  font-size: 11px;
  font-family: var(--font-label);
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  padding: 10px 10px;
}

.quick-action.primary {
  background: linear-gradient(145deg, #4f8cff 0%, #2e6ae6 100%);
  border-color: transparent;
  color: #d0e4ff;
  box-shadow: 0 10px 20px rgba(79, 140, 255, 0.2);
}

.quick-action:active {
  transform: scale(0.98);
}

.finance-list {
  margin: 0 16px 12px;
  padding: 14px;
  border-radius: 22px;
  display: flex;
  flex-direction: column;
  gap: 8px;
}

.finance-row {
  border-radius: 14px;
  padding: 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
  gap: 8px;
  box-shadow: none;
}

.finance-left {
  display: flex;
  align-items: center;
  gap: 10px;
}

.fi-icon {
  width: 20px;
  height: 20px;
}

.fi-title {
  font-size: 13px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.92);
}

.fi-note {
  margin-top: 2px;
  font-size: 10px;
  color: rgba(255, 255, 255, 0.52);
  text-transform: uppercase;
  letter-spacing: 0.07em;
  font-family: var(--font-label);
}

.fi-value {
  font-size: 15px;
  font-weight: 800;
  color: rgba(233, 241, 208, 0.95);
  white-space: nowrap;
}

.menu-grid-wrap {
  margin: 0 16px 12px;
  border-radius: 22px;
  padding: 14px;
}

.menu-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 12px;
}

.menu-item {
  border: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.04);
  border-radius: 16px;
  padding: 12px 8px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 9px;
  box-shadow: none;
}

.menu-item:active {
  transform: scale(0.98);
}

.menu-icon-wrap {
  width: 44px;
  height: 44px;
  border-radius: 12px;
  display: flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.09);
}

.menu-wallet {
  background: rgba(122, 193, 227, 0.16);
}

.menu-integral {
  background: rgba(224, 178, 103, 0.16);
}

.menu-service {
  background: rgba(109, 194, 144, 0.16);
}

.menu-message {
  background: rgba(105, 158, 224, 0.16);
}

.menu-pin {
  background: rgba(79, 140, 255, 0.16);
}

.menu-history {
  background: rgba(224, 105, 158, 0.16);
}

.menu-icon {
  width: 20px;
  height: 20px;
  object-fit: contain;
  filter: var(--icon-filter-tab-active);
}

.menu-icon.icon-large {
  width: 26px;
  height: 26px;
}

.menu-item span {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.8);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-family: var(--font-label);
  font-weight: 700;
}

.logout-wrap {
  padding: 0 16px;
}

.logout-wrap .btn-primary {
  min-height: 44px;
  border-radius: 999px;
  background: linear-gradient(145deg, #4f8cff 0%, #2e6ae6 100%);
  color: #d0e4ff;
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-size: 11px;
  font-family: var(--font-label);
  box-shadow: 0 10px 20px rgba(79, 140, 255, 0.2);
}

@media (max-width: 380px) {
  .profile-hero,
  .quick-actions,
  .finance-list,
  .menu-grid-wrap,
  .logout-wrap {
    margin-left: 12px;
    margin-right: 12px;
    padding-left: 12px;
    padding-right: 12px;
  }

  .logout-wrap {
    padding: 0;
  }

  .menu-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}
</style>
