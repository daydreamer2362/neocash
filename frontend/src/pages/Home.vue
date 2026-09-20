<template>
  <div class="page home-page">
    <header class="home-header">
      <div class="home-user">
        <div class="avatar avatar-badge">{{ userBadgeChars }}</div>
        <div>
          <h1 class="username">{{ userInfo.username || 'Nova User' }}</h1>
          <button class="user-id-row" @click="copyId" type="button">
            <span>ID: {{ shortUserId(userInfo.userId) }}</span>
            <img src="/icons/copy.png" class="copy-icon" />
          </button>
        </div>
      </div>
      <button class="header-icon-btn" type="button" @click="$router.push('/message')" aria-label="Open messages">
        <img src="/icons/mail-line.png" class="header-icon" />
      </button>
    </header>

    <!-- Hero Carousel (replaces balance card when active) -->
    <section v-if="heroEnabled && heroSlides.length" class="hero-carousel-wrap">
      <div class="hero-carousel" ref="heroScroller" @scroll="onHeroScroll" @touchstart="pauseHeroAuto" @touchend="resumeHeroAuto">
        <div v-for="(slide, i) in heroSlides" :key="slide.id || i" class="hero-slide" @click="onHeroSlideClick(slide)">
          <video v-if="slide.type === 'VIDEO'" :src="slide.mediaUrl" class="hero-media" muted autoplay loop playsinline></video>
          <img v-else :src="slide.mediaUrl" class="hero-media" alt="" />
        </div>
      </div>
      <div class="hero-dots" v-if="heroSlides.length > 1">
        <span v-for="(s, i) in heroSlides" :key="i" class="hero-dot" :class="{ active: heroActiveIdx === i }" @click="scrollToHeroSlide(i)"></span>
      </div>
    </section>

    <!-- Default Balance Card (shown when Hero Carousel disabled) -->
    <section v-else class="balance-card glass-card">
      <p class="card-kicker">
        Available Balance
        <span class="kicker-dot"></span>
      </p>
      <span class="balance-live-chip">Live</span>
      <h2 class="balance-value">₹{{ formatMoney(userInfo.total_amount_inr || 0) }}</h2>
      <button class="detail-btn" type="button" @click="$router.push('/score')">
        <span class="detail-label">Detail</span>
        <span class="detail-arrow" aria-hidden="true">→</span>
      </button>
    </section>

    <section class="quick-stats">
      <div class="stat-card glass-card">
        <span class="stat-label">Deposit</span>
        <span class="stat-value">₹{{ formatMoney(userInfo.rechargeAmount || userInfo.depositAmount || 0) }}</span>
      </div>
      <div class="stat-card glass-card">
        <span class="stat-label">Withdrawal</span>
        <span class="stat-value">₹{{ formatMoney(userInfo.cashbackAmount || userInfo.cashback_amount || userInfo.withdrawAmount || 0) }}</span>
      </div>
    </section>

    <section class="section-head section-head-tight" v-if="showCarousel && carouselOrders.length">
      <h3>Quick Orders</h3>
    </section>

    <section class="quick-orders-scroll" v-if="showCarousel && carouselOrders.length">
      <div v-for="order in visibleCarouselOrders" :key="order.id" class="carousel-card">
        <div class="carousel-card-bg">
          <img src="/logo/logo.jpg" class="cc-bg-img" alt="" />
          <div class="cc-gradient-overlay"></div>
        </div>
        <div class="carousel-card-content">
          <div class="cc-header">
            <span class="cc-badge">{{ order.code }}</span>
            <span class="cc-percentage" v-if="order.incomePercent">{{ Number(order.incomePercent) }}%</span>
          </div>
          
          <div class="cc-info-box">
            <div class="cc-info-main">
              <span class="cc-label">Pay Amount</span>
              <strong class="cc-amount">₹{{ Number(order.amount).toLocaleString('en-IN') }}</strong>
            </div>
            <div class="cc-info-secondary">
              <span class="cc-label">Reward</span>
              <span class="cc-reward">+₹{{ Number(order.reward).toLocaleString('en-IN') }}</span>
            </div>
            
            <div class="cc-btn-wrap">
              <button class="cc-buy-btn" @click="claimOrder(order)" type="button">Buy Now</button>
            </div>
          </div>
        </div>
      </div>
      <button class="carousel-card carousel-see-more" @click="$router.push('/payment')" type="button">
        <div class="carousel-card-bg">
          <img src="/logo/logo.jpg" class="cc-bg-img" alt="" />
          <div class="cc-gradient-overlay"></div>
        </div>
        <div class="carousel-see-more-content">
          <span class="see-more-icon">→</span>
          <span>See More Orders</span>
          <small>Open all orders</small>
        </div>
      </button>
    </section>

    <section class="section-head">
      <h3>Main Services</h3>
    </section>

    <section class="service-grid">
      <button class="service-tile glass-card" @click="$router.push('/deposit')">
        <span class="service-icon-wrap service-deposit">
          <img src="/statistics/deposit.png" class="service-icon" />
        </span>
        <span class="service-label">USDT Trading</span>
      </button>
      <button class="service-tile glass-card" @click="$router.push('/task-rewards')">
        <span class="service-icon-wrap service-task">
          <img src="/statistics/pay-icon.png" class="service-icon" />
        </span>
        <span class="service-label">Task</span>
      </button>
      <button class="service-tile glass-card" @click="$router.push('/team')">
        <span class="service-icon-wrap service-team">
          <img src="/statistics/commission.png" class="service-icon" />
        </span>
        <span class="service-label">Team</span>
      </button>
      <button class="service-tile glass-card" @click="$router.push('/orders?tab=buy')">
        <span class="service-icon-wrap service-order">
          <img src="/statistics/sell.png" class="service-icon" />
        </span>
        <span class="service-label">Order</span>
      </button>
    </section>

    <section class="section-head section-head-tight">
      <h3>Transactions</h3>
      <button class="section-link" @click="$router.push('/payment-history')" type="button">See all</button>
    </section>

    <section class="tx-list" v-if="transactions.length">
      <div class="tx-item glass-card" v-for="(tx, i) in transactions" :key="i">
        <div class="tx-left">
          <div class="tx-icon-wrap" :class="tx.iconClass">
            <img :src="tx.icon" class="tx-icon-img" />
          </div>
          <div>
            <div class="tx-type">{{ tx.type }}</div>
            <div class="tx-date">{{ tx.date || '--' }}</div>
          </div>
        </div>
        <div class="tx-right">
          <div class="tx-amount" :class="tx.amountClass">{{ tx.amountSign }}₹{{ tx.amount }}</div>
          <span class="tx-status">{{ tx.status }}</span>
        </div>
      </div>
    </section>

    <section v-else class="no-data-hint glass-card">No transactions available yet.</section>

    <section class="insight-card glass-card">
      <p class="insight-kicker">Live Market Pulse</p>
      <h4>Investment potential in digital assets is rising.</h4>
    </section>

    <!-- Wallet Picker Overlay for Quick Orders -->
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
import { formatMoney, simplifyUserStatus } from '../utils/helpers'
import { toast } from '../utils/toast'

export default {
  name: 'HomePage',
  data() {
    return {
      userInfo: {},
      transactions: [],
      // Carousel state
      showCarousel: false,
      carouselOrders: [],
      carouselInterval: null,
      // Hero Carousel state
      heroEnabled: false,
      heroSlides: [],
      heroActiveIdx: 0,
      heroAutoTimer: null,
      // Wallet Picker State for Carousel
      showWalletPicker: false,
      payoutWallets: [],
      selectedWalletId: '',
      pendingOrder: null
    }
  },
  computed: {
    userBadgeChars() {
      const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
      const seed = String(this.userInfo.userId || this.userInfo.username || 'USER');
      let hash = 0;
      for (let i = 0; i < seed.length; i++) {
        hash = ((hash << 5) - hash) + seed.charCodeAt(i);
        hash |= 0;
      }
      const x = Math.abs(hash || 17);
      const first = chars[x % chars.length];
      const second = chars[(x * 11 + 7) % chars.length];
      return `${first}${second}`;
    },
    visibleCarouselOrders() {
      return Array.isArray(this.carouselOrders) ? this.carouselOrders.slice(0, 6) : [];
    }
  },
  methods: {
    formatMoney,
    isSuccessResponse(res) {
      const code = Number(res?.code);
      return code === 1000 || code === 200;
    },
    shortUserId(value) {
      if (!value) return '--';
      return String(value).slice(0, 6);
    },
    copyId() {
      if (!this.userInfo.userId) return;
      navigator.clipboard.writeText(String(this.userInfo.userId));
      toast.show({ title: 'Copied successfully', icon: 'success' });
    },
    // Wallet / Claim Flow
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
    async claimOrder(order) {
      if (!order) return;
      try {
        await this.ensureWalletsLoaded();
        if (!this.payoutWallets.length) {
          toast.show({ title: 'Please bind your payout wallet first', icon: 'fail' });
          this.$router.push('/add-wallet');
          return;
        }
        this.pendingOrder = order;
        this.selectedWalletId = this.walletKey(this.payoutWallets[0]);
        this.showWalletPicker = true;
      } catch (e) {
        if (e && (e.code === 601 || e.code === 2004)) {
          toast.show({ title: 'Please bind your payout wallet first', icon: 'fail' });
          this.$router.push('/wallet');
        }
      }
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
        
        // Remove claimed order from carousel queue
        this.carouselOrders = this.carouselOrders.filter(o => o.id !== this.pendingOrder.id);
        this.fetchCarousel();
        
        const orderId = res.data?.buyId || res.data?.id || res.data?.orderNo || payload.orderNo;
        if (!orderId) {
          toast.show({ title: 'Order created but order id is missing', icon: 'error' });
          this.closeWalletPicker();
          return;
        }
        this.closeWalletPicker();
        this.$router.push(`/order-detail/${orderId}`);
      } catch (e) {
        this.closeWalletPicker();
        this.fetchCarousel();
      }
    },
    async fetchCarousel() {
      try {
        const res = await this.$api.orderApi.carouselOrders();
        if (this.isSuccessResponse(res) && res?.data) {
          this.showCarousel = res.data.enabled;
          this.carouselOrders = res.data.orders || [];
        }
      } catch (e) {
        console.error('Failed to fetch carousel', e);
      }
    },
    // ─── Hero Carousel ─────────────────────────────
    async fetchHeroCarousel() {
      try {
        // Add a timeout check for slow API response
        const timeoutPromise = new Promise((_, reject) => 
          setTimeout(() => reject(new Error('TIMEOUT')), 3000)
        );
        const res = await Promise.race([
          this.$api.orderApi.heroCarousel(),
          timeoutPromise
        ]);

        if (this.isSuccessResponse(res) && res?.data) {
          this.heroEnabled = !!res.data.enabled;
          this.heroSlides = res.data.slides || [];
          if (this.heroEnabled && this.heroSlides.length > 1) this.startHeroAuto();
        }
      } catch (e) {
        this.heroEnabled = false;
        console.warn('Hero carousel fetch failed or timed out', e);
      }
    },
    onHeroScroll() {
      const el = this.$refs.heroScroller;
      if (!el) return;
      const idx = Math.round(el.scrollLeft / el.clientWidth);
      this.heroActiveIdx = idx;
    },
    scrollToHeroSlide(i) {
      const el = this.$refs.heroScroller;
      if (!el) return;
      el.scrollTo({ left: i * el.clientWidth, behavior: 'smooth' });
    },
    startHeroAuto() {
      this.stopHeroAuto();
      this.heroAutoTimer = setInterval(() => {
        if (!this.heroSlides.length) return;
        const next = (this.heroActiveIdx + 1) % this.heroSlides.length;
        this.scrollToHeroSlide(next);
      }, 4000);
    },
    stopHeroAuto() {
      if (this.heroAutoTimer) { clearInterval(this.heroAutoTimer); this.heroAutoTimer = null; }
    },
    pauseHeroAuto() { this.stopHeroAuto(); },
    resumeHeroAuto() {
      if (this.heroSlides.length > 1) this.startHeroAuto();
    },
    onHeroSlideClick(slide) {
      if (slide.linkUrl) window.open(slide.linkUrl, '_blank');
    },
    async fetchDashboardInfo() {
      try {
        const [personRes, historyRes] = await Promise.all([
          this.$api.myApi.personV2(),
          this.$api.orderApi.buyHistory({ page: 1, size: 5 })
        ]);

        if (personRes.data) {
          this.userInfo = personRes.data;
        }

        const rawHistory = Array.isArray(historyRes?.data) ? historyRes.data : (historyRes?.data?.records || []);
        this.transactions = rawHistory.map((tx) => ({
          type: tx.typeName || tx.title || (tx.orderType === 2 ? 'Sell Order' : 'Buy Order'),
          date: tx.createTime || tx.createdAt,
          amount: formatMoney(Math.abs(Number(tx.amount || tx.price || 0))),
          amountSign: tx.orderType === 2 ? '-' : '+',
          amountClass: tx.orderType === 2 ? 'amount-debit' : 'amount-credit',
          status: simplifyUserStatus(tx.statusName || tx.status),
          icon: tx.orderType === 2 ? '/icons/withdraw.png' : '/icons/deposit.png',
          iconClass: tx.orderType === 2 ? 'icon-withdraw' : 'icon-deposit'
        }));
      } catch (e) {
        console.error('Failed to fetch home data', e);
      }
    }
  },
  mounted() {
    this.fetchDashboardInfo();
    this.fetchCarousel();
    this.fetchHeroCarousel();
    this.carouselInterval = setInterval(this.fetchCarousel, 10000);
  },
  unmounted() {
    if (this.carouselInterval) clearInterval(this.carouselInterval);
    this.stopHeroAuto();
  }
}
</script>

<style scoped>
.home-page {
  --home-accent: #4f8cff;
  --home-accent-soft: rgba(79, 140, 255, 0.18);
  --home-accent-faint: rgba(79, 140, 255, 0.1);
  --glass-bg: rgba(255, 255, 255, 0.035);
  --glass-bg-strong: rgba(255, 255, 255, 0.05);
  --glass-border: rgba(255, 255, 255, 0.1);
  --glass-shadow: 0 16px 36px rgba(0, 0, 0, 0.32);
  position: relative;
  padding-top: 8px;
}

.usdt-icon-inline {
  height: 1.1em;
  width: auto;
  vertical-align: -0.15em;
  margin-right: 0.1em;
  filter: drop-shadow(0 0 2px rgba(255, 255, 255, 0.2));
}

.home-page::before {
  content: '';
  position: absolute;
  inset: 0 0 auto;
  height: 280px;
  background:
    radial-gradient(56% 42% at 84% 8%, rgba(79, 140, 255, 0.14) 0%, rgba(79, 140, 255, 0) 72%),
    radial-gradient(46% 30% at 12% 10%, rgba(46, 106, 230, 0.06) 0%, rgba(46, 106, 230, 0) 74%);
  pointer-events: none;
  z-index: 0;
}

.home-header,
.balance-card,
.quick-stats,
.section-head,
.service-grid,
.tx-list,
.no-data-hint,
.insight-card {
  position: relative;
  z-index: 1;
}

.home-header {
  margin: 0 16px 14px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.home-user {
  display: flex;
  align-items: center;
  gap: 11px;
}

.glass-card {
  position: relative;
  overflow: hidden;
  border-radius: 20px;
  border: 1px solid var(--glass-border);
  background: linear-gradient(165deg, var(--glass-bg-strong) 0%, var(--glass-bg) 68%, rgba(255, 255, 255, 0.02) 100%);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  box-shadow: var(--glass-shadow);
}

.glass-card::after {
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

.avatar {
  width: 42px;
  height: 42px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.22);
  display: inline-flex;
  align-items: center;
  justify-content: center;
}

.avatar-badge {
  background:
    radial-gradient(90% 90% at 30% 20%, rgba(79, 140, 255, 0.38) 0%, rgba(79, 140, 255, 0.04) 72%),
    linear-gradient(145deg, rgba(255, 255, 255, 0.08) 0%, rgba(255, 255, 255, 0.03) 100%);
  color: rgba(241, 248, 219, 0.95);
  font-size: 13px;
  font-weight: 800;
  letter-spacing: 0.06em;
  font-family: var(--font-label);
  text-transform: uppercase;
  box-shadow: inset 0 1px 0 rgba(255, 255, 255, 0.18);
}

.username {
  font-size: 18px;
  line-height: 1.15;
  font-weight: 700;
  font-family: var(--font-brand);
  color: rgba(255, 255, 255, 0.96);
}

.user-id-row {
  border: none;
  background: transparent;
  padding: 0;
  margin-top: 3px;
  display: flex;
  align-items: center;
  gap: 6px;
  font-size: 11px;
  font-weight: 500;
  letter-spacing: 0.05em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.6);
  font-family: var(--font-label);
  cursor: pointer;
}

.copy-icon {
  width: 13px;
  height: 13px;
  opacity: 0.8;
}

.header-icon-btn {
  width: 36px;
  height: 36px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 12px;
  background: rgba(255, 255, 255, 0.05);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  backdrop-filter: blur(14px);
  -webkit-backdrop-filter: blur(14px);
}

.header-icon-btn:active {
  transform: scale(0.96);
}

.header-icon {
  width: 17px;
  height: 17px;
  opacity: 0.78;
  filter: var(--icon-filter-tab);
}

.balance-card {
  margin: 0 16px 12px;
  padding: 16px;
  overflow: hidden;
}

.balance-card::after {
  content: 'N';
  position: absolute;
  right: -14px;
  bottom: -24px;
  font-size: 92px;
  font-weight: 800;
  line-height: 1;
  letter-spacing: -0.02em;
  font-family: var(--font-brand);
  color: rgba(79, 140, 255, 0.09);
  transform: rotate(-14deg);
  transform-origin: bottom right;
  background: none;
}

.card-kicker {
  display: inline-flex;
  align-items: center;
  gap: 7px;
  font-size: 10px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.58);
  font-family: var(--font-label);
}

.balance-live-chip {
  position: absolute;
  top: 14px;
  right: 14px;
  height: 22px;
  padding: 0 10px;
  border-radius: 999px;
  border: 1px solid rgba(79, 140, 255, 0.35);
  background: rgba(79, 140, 255, 0.1);
  color: rgba(208, 228, 255, 0.9);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-family: var(--font-label);
  display: inline-flex;
  align-items: center;
  justify-content: center;
  z-index: 1;
}

.kicker-dot {
  width: 6px;
  height: 6px;
  border-radius: 50%;
  background: var(--home-accent);
  box-shadow: 0 0 8px rgba(79, 140, 255, 0.42);
}

.balance-value {
  margin-top: 5px;
  font-size: clamp(36px, 9.5vw, 48px);
  font-weight: 800;
  line-height: 1.04;
  letter-spacing: -0.02em;
  font-family: var(--font-brand);
  position: relative;
  z-index: 1;
}

.detail-btn {
  margin-top: 14px;
  width: 100%;
  border: 1px solid rgba(233, 246, 177, 0.35);
  border-radius: 999px;
  min-height: 46px;
  background: linear-gradient(140deg, #4f8cff 0%, #3b79f0 58%, #2e6ae6 100%);
  color: #121c2d;
  display: flex;
  align-items: center;
  justify-content: space-between;
  padding: 0 15px 0 18px;
  font-size: 12.5px;
  font-weight: 800;
  font-family: var(--font-label);
  text-transform: uppercase;
  letter-spacing: 0.11em;
  position: relative;
  overflow: hidden;
  z-index: 1;
  box-shadow:
    0 12px 24px rgba(46, 106, 230, 0.24),
    inset 0 1px 0 rgba(255, 255, 255, 0.38);
  transition: transform 0.2s ease, box-shadow 0.2s ease, filter 0.2s ease;
}

.detail-btn::before {
  content: '';
  position: absolute;
  inset: 0;
  background: linear-gradient(120deg, rgba(255, 255, 255, 0.18) 0%, rgba(255, 255, 255, 0) 46%);
  pointer-events: none;
}

.detail-label {
  position: relative;
  z-index: 1;
}

/* Quick Orders Carousel */
.quick-orders-scroll {
  display: flex;
  gap: 12px;
  overflow-x: auto;
  padding: 0 16px 14px;
  scrollbar-width: none; /* Firefox */
  margin-top: -4px;
  -webkit-overflow-scrolling: touch;
}
.quick-orders-scroll::-webkit-scrollbar {
  display: none;
}

.carousel-card {
  flex-shrink: 0;
  width: 155px; /* Mobile size */
  height: 200px;
  border-radius: 16px;
  overflow: hidden;
  position: relative;
  background: #151515;
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.35);
  border: 1px solid rgba(255,255,255,0.05);
}

.carousel-card-bg {
  position: absolute;
  width: 100%;
  height: 100%;
  top: 0;
  left: 0;
  z-index: 0;
  background: #111;
}

.cc-bg-img {
  width: 100%;
  height: 100%;
  object-fit: cover;
  opacity: 0.35;
  mix-blend-mode: color-dodge;
  filter: grayscale(80%) sepia(20%) hue-rotate(40deg);
}

.cc-gradient-overlay {
  position: absolute;
  inset: 0;
  background: linear-gradient(180deg, rgba(21, 21, 21, 0) 0%, #151515 85%);
  z-index: 1;
}

.carousel-card-content {
  position: relative;
  width: 100%;
  height: 100%;
  padding: 12px;
  display: flex;
  flex-direction: column;
  justify-content: space-between;
  z-index: 2;
}

.cc-header {
  display: flex;
  justify-content: space-between;
  align-items: flex-start;
}

.cc-badge {
  background: rgba(79, 140, 255, 0.15);
  padding: 4px 10px;
  border-radius: 8px;
  backdrop-filter: blur(6px);
  -webkit-backdrop-filter: blur(6px);
  color: #d0e4ff;
  font-size: 11px;
  font-family: var(--font-label);
  font-weight: 700;
  letter-spacing: 0.05em;
  border: 1px solid rgba(79, 140, 255, 0.3);
}

.cc-percentage {
  background: rgba(0, 0, 0, 0.5);
  padding: 3px 8px;
  border-radius: 6px;
  color: #fff;
  font-size: 10px;
  font-weight: 800;
  font-family: var(--font-label);
  border: 1px solid rgba(255, 255, 255, 0.1);
}

.cc-info-box {
  width: 100%;
  padding: 12px;
  background: rgba(0, 0, 0, 0.65);
  backdrop-filter: blur(12px);
  -webkit-backdrop-filter: blur(12px);
  border-radius: 12px;
  border: 1px solid rgba(255, 255, 255, 0.08);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.5);
}

.cc-info-main {
  display: flex;
  justify-content: space-between;
  align-items: baseline;
  margin-bottom: 2px;
}

.cc-label {
  font-size: 9px;
  color: rgba(255, 255, 255, 0.5);
  text-transform: uppercase;
  letter-spacing: 0.08em;
  font-family: var(--font-label);
}

.cc-amount {
  color: #fff;
  font-size: 18px;
  font-family: var(--font-brand);
  font-weight: 800;
  letter-spacing: -0.01em;
}

.cc-info-secondary {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 10px;
}

.cc-reward {
  color: var(--home-accent);
  font-size: 13px;
  font-weight: 700;
  font-family: var(--font-label);
}

.cc-meta {
  font-size: 9px;
  color: rgba(255, 255, 255, 0.4);
  background: rgba(255, 255, 255, 0.1);
  padding: 2px 6px;
  border-radius: 4px;
}

.cc-btn-wrap {
  width: 100%;
}

.cc-buy-btn {
  width: 100%;
  padding: 8px 0;
  border: none;
  border-radius: 8px;
  background: linear-gradient(145deg, #4f8cff, #3b79f0);
  color: #d0e4ff;
  font-size: 12px;
  font-weight: 800;
  font-family: var(--font-label);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  box-shadow: 0 4px 10px rgba(79, 140, 255, 0.3);
  transition: transform 0.1s;
}

.cc-buy-btn:active {
  transform: scale(0.96);
}

.carousel-see-more {
  border: 1px dashed rgba(79, 140, 255, 0.55);
  background: #111;
  padding: 0;
}

.carousel-see-more-content {
  position: relative;
  z-index: 2;
  display: flex;
  align-items: center;
  justify-content: center;
  flex-direction: column;
  color: #e7f0c8;
  gap: 8px;
  padding: 16px;
  text-align: center;
  width: 100%;
  height: 100%;
}

.carousel-see-more span {
  font-size: 12px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-family: var(--font-label);
}

.carousel-see-more small {
  font-size: 11px;
  color: rgba(228, 238, 196, 0.78);
  font-family: var(--font-body);
}

/* Wallet Picker Overlay */
.wallet-picker-overlay {
  position: fixed;
  inset: 0;
  background: rgba(0, 0, 0, 0.75);
  display: flex;
  align-items: center;
  justify-content: center;
  z-index: 10000;
  padding: 16px;
  animation: fade-in 0.25s ease-out;
}

.wallet-picker {
  width: min(100%, 360px);
  background: linear-gradient(165deg, var(--glass-bg-strong) 0%, var(--glass-bg) 72%, rgba(255, 255, 255, 0.02) 100%);
  border: 1px solid var(--glass-border);
  border-radius: 18px;
  overflow: hidden;
  box-shadow: var(--glass-shadow);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
  animation: slide-up 0.3s cubic-bezier(0.2, 0.8, 0.2, 1);
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
  color: var(--home-accent);
  font-weight: 700;
}

@keyframes fade-in {
  from { opacity: 0; }
  to { opacity: 1; }
}
@keyframes slide-up {
  from { transform: translateY(100%); }
  to { transform: translateY(0); }
}

.detail-arrow {
  position: relative;
  z-index: 1;
  width: 26px;
  height: 26px;
  border-radius: 999px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  font-size: 19px;
  line-height: 1;
  font-weight: 900;
  background: rgba(255, 255, 255, 0.2);
  box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.26);
}

.detail-btn:hover {
  filter: brightness(1.03);
}

.detail-btn:active {
  transform: scale(0.98);
  box-shadow:
    0 7px 14px rgba(46, 106, 230, 0.2),
    inset 0 1px 0 rgba(255, 255, 255, 0.3);
}

.quick-stats {
  margin: 0 16px 16px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.stat-card {
  padding: 12px 12px 11px;
  border-radius: 16px;
}

.stat-label {
  display: block;
  font-size: 10px;
  color: rgba(255, 255, 255, 0.56);
  text-transform: uppercase;
  letter-spacing: 0.1em;
  font-family: var(--font-label);
}

.stat-value {
  display: block;
  margin-top: 5px;
  font-size: 28px;
  line-height: 1.05;
  font-weight: 700;
  letter-spacing: -0.01em;
}

.section-head {
  margin: 0 16px 10px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.section-head h3 {
  font-size: 19px;
  line-height: 1.1;
  font-weight: 700;
  font-family: var(--font-brand);
  color: rgba(255, 255, 255, 0.94);
}

.section-head-tight {
  margin-top: 2px;
  margin-bottom: 10px;
}

.section-link {
  border: none;
  background: transparent;
  color: rgba(79, 140, 255, 0.82);
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  font-family: var(--font-label);
}

.service-grid {
  margin: 0 16px 16px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.service-tile {
  border: none;
  border-radius: 16px;
  padding: 15px 12px 13px;
  display: flex;
  flex-direction: column;
  align-items: flex-start;
  gap: 12px;
  text-align: left;
}

.service-tile:active {
  transform: scale(0.98);
}

.service-icon-wrap {
  width: 40px;
  height: 40px;
  border-radius: 12px;
  display: inline-flex;
  align-items: center;
  justify-content: center;
  border: 1px solid rgba(255, 255, 255, 0.08);
}

.service-deposit {
  background: rgba(255, 223, 113, 0.14);
}

.service-task {
  background: rgba(128, 233, 255, 0.14);
}

.service-team {
  background: rgba(109, 246, 155, 0.14);
}

.service-order {
  background: rgba(255, 122, 90, 0.14);
}

.service-icon {
  width: 20px;
  height: 20px;
}

.service-label {
  color: rgba(255, 255, 255, 0.84);
  font-size: 12px;
  font-weight: 700;
  font-family: var(--font-label);
  letter-spacing: 0.08em;
  text-transform: uppercase;
}

.tx-list {
  margin: 0 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.tx-item {
  display: flex;
  align-items: flex-start;
  justify-content: space-between;
  border-radius: 16px;
  padding: 12px;
}

.tx-left {
  display: flex;
  align-items: flex-start;
  gap: 10px;
}

.tx-icon-wrap {
  width: 36px;
  height: 36px;
  border-radius: 11px;
  display: flex;
  align-items: center;
  justify-content: center;
  margin-top: 1px;
}

.tx-icon-wrap.icon-deposit {
  background: rgba(109, 246, 155, 0.16);
}

.tx-icon-wrap.icon-withdraw {
  background: rgba(255, 122, 90, 0.16);
}

.tx-icon-img {
  width: 18px;
  height: 18px;
}

.tx-type {
  font-size: 13px;
  line-height: 1.25;
  font-weight: 600;
  color: rgba(255, 255, 255, 0.94);
}

.tx-date {
  margin-top: 3px;
  font-size: 10px;
  font-family: var(--font-label);
  letter-spacing: 0.04em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.52);
}

.tx-right {
  text-align: right;
}

.tx-amount {
  font-size: 16px;
  line-height: 1.1;
  font-weight: 800;
  margin-bottom: 5px;
}

.tx-amount.amount-credit {
  color: #88b970;
}

.tx-amount.amount-debit {
  color: #d88872;
}

.tx-status {
  display: inline-block;
  font-size: 10px;
  font-family: var(--font-label);
  font-weight: 700;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.56);
}

.no-data-hint {
  margin: 0 16px;
  padding: 14px;
  color: rgba(255, 255, 255, 0.62);
  text-align: center;
  font-size: 13px;
}

.insight-card {
  margin: 14px 16px 0;
  padding: 14px 14px 16px;
  border-radius: 18px;
  background:
    linear-gradient(170deg, rgba(12, 22, 24, 0.72) 0%, rgba(13, 17, 19, 0.84) 100%),
    linear-gradient(145deg, rgba(109, 246, 155, 0.08) 0%, rgba(82, 198, 250, 0.08) 100%);
  border-color: rgba(109, 246, 155, 0.18);
}

.insight-kicker {
  font-size: 9px;
  font-family: var(--font-label);
  letter-spacing: 0.16em;
  text-transform: uppercase;
  color: #76c690;
}

.insight-card h4 {
  margin-top: 8px;
  font-size: 22px;
  line-height: 1.16;
  font-weight: 700;
  max-width: 95%;
}

@media (max-width: 380px) {
  .home-header,
  .balance-card,
  .quick-stats,
  .section-head,
  .service-grid,
  .tx-list,
  .no-data-hint,
  .insight-card {
    margin-left: 12px;
    margin-right: 12px;
  }

  .balance-value {
    font-size: clamp(32px, 9vw, 44px);
  }

  .stat-value {
    font-size: 24px;
  }

  .insight-card h4 {
    font-size: 20px;
  }
}

/* ═══════════════════════════════════════════════════════
   Hero Carousel
   ═══════════════════════════════════════════════════════ */
.hero-carousel-wrap {
  margin: 0 16px 12px;
  position: relative;
  z-index: 1;
  border-radius: 20px;
  overflow: hidden;
  box-shadow:
    0 16px 40px rgba(0, 0, 0, 0.35),
    0 2px 12px rgba(0, 0, 0, 0.2),
    inset 0 0 0 1px rgba(255, 255, 255, 0.06);
}

.hero-carousel {
  display: flex;
  overflow-x: auto;
  scroll-snap-type: x mandatory;
  -webkit-overflow-scrolling: touch;
  scrollbar-width: none;
}

.hero-carousel::-webkit-scrollbar {
  display: none;
}

.hero-slide {
  flex: 0 0 100%;
  scroll-snap-align: start;
  aspect-ratio: 16 / 7;
  position: relative;
  background: #0a0a0a;
  cursor: pointer;
  overflow: hidden;
}

.hero-media {
  width: 100%;
  height: 100%;
  object-fit: cover;
  display: block;
  transition: transform 0.4s ease;
}

.hero-slide:active .hero-media {
  transform: scale(1.02);
}

.hero-dots {
  position: absolute;
  bottom: 10px;
  left: 50%;
  transform: translateX(-50%);
  display: flex;
  gap: 6px;
  z-index: 3;
}

.hero-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.3);
  border: 1px solid rgba(255, 255, 255, 0.15);
  transition: all 0.3s ease;
  cursor: pointer;
}

.hero-dot.active {
  width: 22px;
  border-radius: 999px;
  background: linear-gradient(90deg, #4f8cff, #d0e4ff);
  border-color: rgba(79, 140, 255, 0.5);
  box-shadow: 0 0 10px rgba(79, 140, 255, 0.5);
}

@media (max-width: 380px) {
  .hero-carousel-wrap {
    margin-left: 12px;
    margin-right: 12px;
  }
}
</style>
