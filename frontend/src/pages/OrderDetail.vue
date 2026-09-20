<template>
  <div class="page-no-tab">
    <div class="nav-bar">
      <button class="back-btn" @click="$router.back()"><img src="/icons/back.png" /></button>
      <span class="nav-title">Order Detail</span>
    </div>

    <div class="card" v-if="order">
      <div class="detail-amount">INR {{ formatMoney(order.amount) }}</div>
      <div v-if="showExpireTimer" class="lock-timer">Expire {{ remainText }}</div>
      <div class="od-row"><span class="od-label">PayeeAccount</span><span class="od-value">{{ order.payeeAccount || '--' }}</span></div>
      <div class="od-row"><span class="od-label">PayeeName</span><span class="od-value">{{ order.payeeName || '--' }}</span></div>
      <div class="od-row" v-if="!isUpi"><span class="od-label">IFSC</span><span class="od-value">{{ order.ifsc || '--' }}</span></div>
      <div class="od-row"><span class="od-label">Code</span><span class="od-value">{{ order.code || '--' }}</span></div>
      <div class="od-row"><span class="od-label">Type</span><span class="od-value">{{ order.paymentType || '--' }}</span></div>
      <div class="od-row"><span class="od-label">Payout Wallet</span><span class="od-value">{{ order.payoutWallet || '--' }}</span></div>
      <div class="od-row"><span class="od-label">Payout Account</span><span class="od-value">{{ order.payoutAccount || '--' }}</span></div>
      <div class="od-row"><span class="od-label">Payout UPI</span><span class="od-value">{{ order.payoutUPI || '--' }}</span></div>
      <div class="od-row">
        <span class="od-label">Status</span>
        <span class="od-value">{{ displayStatus }}</span>
      </div>
      <div class="od-row"><span class="od-label">Reference No</span><span class="od-value">{{ order.longNo || order.referenceNo || order.orderNo || '--' }}</span></div>
      <div class="od-row"><span class="od-label">UTR</span><span class="od-value">{{ order.utr || '--' }}</span></div>

      <div v-if="showUpiQr" class="upi-qr-card">
        <img :src="upiQrUrl" class="upi-qr-image" />
        <div class="upi-qr-text">Scan to pay ₹{{ formatMoney(order.amount) }}</div>
      </div>

      <div v-if="isSubmittable" class="utr-actions">
        <label class="utr-label" for="utr-input">Enter UTR after payment</label>
        <input
          id="utr-input"
          class="utr-input"
          v-model.trim="utrValue"
          maxlength="30"
          placeholder="Enter UTR number"
          @input="sanitizeUtr"
        />
        <div v-if="utrValue && !isValidUtr" class="utr-error">UTR must be alphanumeric and minimum 12 characters.</div>
        <button class="btn-primary btn-submit" :disabled="!isValidUtr" @click="handleSubmit">Submit UTR</button>
      </div>
    </div>

  </div>
</template>

<script>
import { usePolling } from '../composables/usePolling'
import { useCountdown } from '../composables/useCountdown'
import { calcNextPollDelayMs, formatDate, formatMoney, simplifyUserStatus } from '../utils/helpers'
import { toast } from '../utils/toast'

const normalizeOrderId = (value) => {
  const raw = String(value == null ? '' : value).trim();
  if (!raw) return '';
  const lowered = raw.toLowerCase();
  if (lowered === 'undefined' || lowered === 'null' || lowered === 'nan') return '';
  return raw;
};

export default {
  name: 'OrderDetailPage',
  data() {
    return {
      orderId: normalizeOrderId(this.$route.params.id),
      order: null,
      utrValue: '',
      pollAttempt: 0
    }
  },
  computed: {
    isSubmittable() {
      return ['PENDING'].includes(String(this.order?.status || ''));
    },
    sanitizedUtr() {
      return String(this.utrValue || '').replace(/[^a-zA-Z0-9]/g, '').toUpperCase();
    },
    isValidUtr() {
      return /^[A-Z0-9]{12,}$/.test(this.sanitizedUtr);
    },
    isUpi() {
      return String(this.order?.paymentType || '').toUpperCase() === 'UPI';
    },
    displayStatus() {
      return simplifyUserStatus(this.order?.status);
    },
    showExpireTimer() {
      return String(this.order?.status || '') === 'PENDING' && Boolean(this.remainText);
    },
    showUpiQr() {
      return String(this.order?.paymentType || '').toUpperCase() === 'UPI' && this.order?.payeeAccount;
    },
    upiQrUrl() {
      const pa = encodeURIComponent(this.order?.payeeAccount || '');
      const pn = encodeURIComponent(this.order?.payeeName || '');
      const am = encodeURIComponent(String(this.order?.amount || ''));
      const upi = `upi://pay?pa=${pa}&pn=${pn}&am=${am}&cu=INR`;
      return `https://api.qrserver.com/v1/create-qr-code/?size=240x240&data=${encodeURIComponent(upi)}`;
    }
  },
  setup() {
    const { startPolling, stopPolling, scheduleNextPoll } = usePolling(null, 5000);
    const { remainText, startTimer, stopTimer, initExpireByServer } = useCountdown();
    return { startPolling, stopPolling, scheduleNextPoll, remainText, startTimer, stopTimer, initExpireByServer };
  },
  methods: {
    formatDate,
    formatMoney,
    sanitizeUtr() {
      this.utrValue = this.sanitizedUtr;
    },
    async fetchDetail() {
      if (!this.orderId) {
        this.stopPolling();
        this.stopTimer();
        return;
      }
      try {
        const res = await this.$api.orderApi.orderInfo({ buyId: this.orderId, id: this.orderId });
        if (res.data) {
          this.order = res.data;
          if (!this.utrValue && this.order.utr) this.utrValue = this.order.utr;
          const status = String(this.order.status || '');
          if (status === 'PENDING') {
            this.initExpireByServer(this.order.expireTime || this.order.expiresAt, Date.now());
            this.startTimer();
          } else {
            this.stopTimer();
            this.remainText = '';
          }
          this.pollAttempt = 0;

          if (['SUCCESS', 'FAILED', 'CANCELLED', 'TIMEOUT', 'COMPLETED'].includes(status)) {
            this.stopPolling();
            this.stopTimer();
          } else {
            this.scheduleNextPoll(this.fetchDetail.bind(this), calcNextPollDelayMs(this.pollAttempt));
          }
        }
      } catch (e) {
        const code = Number(e?.code || e?.data?.code || 0);
        const msg = String(e?.msg || e?.message || '').toLowerCase();
        const isFatal = code === 5404 || msg.includes('order not found') || msg.includes('invalid') || msg.includes('undefined');
        if (isFatal) {
          this.stopPolling();
          this.stopTimer();
          if (!this.order) {
            toast.show({ title: 'Order not found', icon: 'error' });
            this.$router.replace('/sell-orders');
          }
          return;
        }
        this.pollAttempt += 1;
        this.scheduleNextPoll(this.fetchDetail.bind(this), calcNextPollDelayMs(this.pollAttempt));
      }
    },
    async handleSubmit() {
      if (!this.order || !this.isValidUtr) {
        toast.show({ title: 'Enter valid UTR (alphanumeric, minimum 12 characters)' });
        return;
      }

      try {
        this.stopTimer();
        this.remainText = '';

        await this.$api.orderApi.orderSubmit({
          buyId: this.order.buyId || this.order.id,
          utr: this.sanitizedUtr
        });

        toast.show({ title: 'UTR submitted successfully', icon: 'success' });
        this.$router.push('/buy-orders');
      } catch (e) {}
    },
  },
  mounted() {
    this.orderId = normalizeOrderId(this.$route.params.id);
    if (!this.orderId) {
      toast.show({ title: 'Invalid order id', icon: 'error' });
      this.$router.replace('/sell-orders');
      return;
    }
    this.fetchDetail();
  },
  unmounted() {
    this.stopPolling();
    this.stopTimer();
  }
}
</script>

<style scoped>
.detail-amount {
  font-size: 28px;
  font-weight: 800;
  color: var(--primary);
  margin-bottom: 16px;
}
.lock-timer {
  text-align: center;
  font-size: 13px;
  color: var(--text-red);
  font-weight: 700;
  margin-bottom: 10px;
}
.od-row {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 12px 0;
  border-bottom: 1px solid var(--border-light);
}
.od-row:last-child {
  border-bottom: none;
}
.od-label {
  font-size: 14px;
  color: var(--text-secondary);
}
.od-value {
  font-size: 14px;
  font-weight: 600;
  text-align: right;
  max-width: 60%;
  word-break: break-word;
}
.utr-actions {
  margin-top: 16px;
  display: flex;
  flex-direction: column;
  gap: 10px;
}
.utr-label {
  font-size: 13px;
  color: var(--text-secondary);
  font-weight: 600;
}
.utr-input {
  width: 100%;
  padding: 12px;
  border: 1px solid var(--border-light);
  border-radius: var(--radius-sm);
  font-size: 14px;
}
.utr-input:focus {
  outline: none;
  border-color: var(--primary);
}
.utr-error {
  font-size: 12px;
  color: var(--text-red);
}
.btn-submit {
  background: var(--primary);
  color: var(--secondary-color);
  font-weight: 700;
  text-transform: none;
}
.upi-qr-card {
  margin-top: 16px;
  border: 1.5px dashed var(--border-light);
  border-radius: var(--radius-sm);
  padding: 12px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}
.upi-qr-image {
  width: 180px;
  height: 180px;
}
.upi-qr-text {
  font-size: 13px;
  color: var(--text-secondary);
}

</style>
