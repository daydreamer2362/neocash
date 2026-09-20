<template>
  <div class="page-no-tab add-wallet-page">
    <div class="nav-bar">
      <button class="back-btn" @click="$router.back()"><img src="/icons/back.png" /></button>
      <span class="nav-title">Add Wallet</span>
    </div>

    <div class="form-wrap panel-glass n-watermark">
      <div class="form-group">
        <label class="form-label">Wallet Type</label>
        <select class="form-select" v-model="walletType">
          <option value="upi">UPI</option>
        </select>
      </div>

      <div class="form-group">
        <label class="form-label">Provider</label>
        <div class="provider-grid">
          <div class="provider-item" v-for="p in providers" :key="p.name"
               :class="{ active: selectedProvider === p.name }"
               @click="selectedProvider = p.name">
            <img :src="'/wallet/' + p.icon" class="provider-logo" />
            <span>{{ p.name }}</span>
          </div>
        </div>
      </div>

      <div class="form-group">
        <label class="form-label">Holder Name</label>
        <input type="text" class="form-input" placeholder="Enter account holder name" v-model="holderName" />
      </div>

      <div class="form-group">
        <label class="form-label">Registered Mobile</label>
        <input type="text" class="form-input" :value="registeredMobile || '--'" readonly />
      </div>

      <div class="form-group">
        <label class="form-label">UPI ID / Account</label>
        <input type="text" class="form-input" placeholder="Enter UPI ID" v-model="upiId" />
      </div>


      <button class="submit-btn" @click="handleAdd">Add Wallet</button>
    </div>
  </div>
</template>

<script>
import { verifyPinAndGetTicket } from '../components/PinModal.vue'
import { toast } from '../utils/toast'

export default {
  name: 'AddWalletPage',
  data() {
    return {
      walletType: 'upi',
      selectedProvider: 'Paytm',
      holderName: '',
      upiId: '',
      registeredMobile: '',
      providers: [],
    }
  },
  methods: {
    async ensurePinCreated() {
      try {
        const res = await this.$api.myApi.personV2();
        const hasPin = res?.data?.hasPin;
        if (hasPin === false) {
          toast.show({ title: 'Please create PIN first' });
          this.$router.push('/pin-code');
          return false;
        }
      } catch (e) {}
      return true;
    },
    async fetchWalletTypes() {
      try {
        const res = await this.$api.ctTypeApi.listEnabledCtTypes();
        const providers = Array.isArray(res?.data) ? res.data : (res?.data?.records || []);
        this.providers = providers.map((item) => ({
          name: item.ctName || item.name,
          icon: item.icon || 'paytm.png',
          id: item.id
        }));
        if (this.providers.length > 0) {
          this.selectedProvider = this.providers[0].name;
        }
      } catch (e) {
        this.providers = [
          { name: 'Paytm', icon: 'paytm.png' },
          { name: 'PhonePe', icon: 'phonepe.png' },
          { name: 'Mobikwik', icon: 'mobikwik.png' },
          { name: 'Freecharge', icon: 'freecharge.png' },
          { name: 'Airtel Payments Bank', icon: 'airtel.png' },
          { name: 'Jio Payments Bank', icon: 'box.png' }
        ];
      }
    },
    async fetchRegisteredMobile() {
      try {
        const res = await this.$api.myApi.person();
        const phone = res?.data?.phone || res?.data?.mobile || res?.data?.account || '';
        this.registeredMobile = phone ? String(phone) : '';
      } catch (e) {}
    },
    async handleAdd() {
      if (!this.upiId) {
        toast.show({ title: 'Please enter UPI ID / Account' });
        return;
      }
      if (!this.holderName) {
        toast.show({ title: 'Please enter holder name' });
        return;
      }
      try {
        const pinCreated = await this.ensurePinCreated();
        if (!pinCreated) return;
        const verified = await verifyPinAndGetTicket();
        if (!verified) return;

        const selectedProvider = this.providers.find((item) => item.name === this.selectedProvider);
        await this.$api.walletApi.submit({
          upiId: this.upiId,
          holderName: this.holderName,
          bankName: selectedProvider?.name || this.selectedProvider,
          ctName: selectedProvider?.name || this.selectedProvider,
          ctTypeId: selectedProvider?.id
        });
        toast.show({ title: 'Wallet added successfully', icon: 'success' });
        this.$router.back();
      } catch (e) {}
    }
  },
  mounted() {
    this.fetchWalletTypes();
    this.fetchRegisteredMobile();
  }
}
</script>

<style scoped>
.add-wallet-page {
  --add-accent: #4f8cff;
  --add-accent-soft: rgba(79, 140, 255, 0.16);
  --add-accent-faint: rgba(79, 140, 255, 0.1);
  --add-glass: rgba(255, 255, 255, 0.04);
  --add-glass-strong: rgba(255, 255, 255, 0.06);
  --add-border: rgba(255, 255, 255, 0.1);
  position: relative;
}

.add-wallet-page::before {
  content: '';
  position: absolute;
  inset: 0 0 auto;
  height: 260px;
  background:
    radial-gradient(62% 42% at 86% 8%, rgba(79, 140, 255, 0.14) 0%, rgba(79, 140, 255, 0) 72%),
    radial-gradient(40% 24% at 10% 14%, rgba(105, 200, 155, 0.08) 0%, rgba(105, 200, 155, 0) 78%);
  pointer-events: none;
  z-index: 0;
}

.nav-bar,
.form-wrap {
  position: relative;
  z-index: 1;
}

.panel-glass {
  background: linear-gradient(165deg, var(--add-glass-strong) 0%, var(--add-glass) 72%, rgba(255, 255, 255, 0.02) 100%);
  border: 1px solid var(--add-border);
  border-radius: 22px;
  box-shadow: 0 16px 34px rgba(0, 0, 0, 0.3);
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

.nav-bar .nav-title {
  color: rgba(238, 244, 220, 0.94);
}

.form-wrap {
  margin: 6px 16px 0;
  padding: 16px;
}

.form-group {
  margin-bottom: 14px;
}

.form-label {
  display: block;
  font-size: 10px;
  font-weight: 700;
  letter-spacing: 0.1em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.58);
  font-family: var(--font-label);
  margin-bottom: 7px;
}

.form-select,
.form-input {
  width: 100%;
  min-height: 46px;
  padding: 12px 14px;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 14px;
  font-size: 14px;
  font-family: inherit;
  background: rgba(255, 255, 255, 0.045);
  color: rgba(255, 255, 255, 0.92);
  outline: none;
}

.form-input[readonly] {
  color: rgba(255, 255, 255, 0.66);
}

.form-select:focus,
.form-input:focus {
  border-color: rgba(79, 140, 255, 0.52);
  box-shadow: 0 0 0 3px rgba(79, 140, 255, 0.14);
}

.provider-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.provider-item {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: center;
  gap: 7px;
  min-height: 84px;
  padding: 10px 8px;
  border: 1px solid rgba(255, 255, 255, 0.12);
  background: rgba(255, 255, 255, 0.04);
  border-radius: 14px;
  cursor: pointer;
  transition: all 0.2s;
}

.provider-item.active {
  border-color: rgba(79, 140, 255, 0.58);
  background: rgba(79, 140, 255, 0.14);
  box-shadow: inset 0 0 0 1px rgba(79, 140, 255, 0.18);
}

.provider-logo {
  width: 30px;
  height: 30px;
  border-radius: 7px;
  object-fit: contain;
}

.provider-item span {
  font-size: 10px;
  font-weight: 700;
  text-align: center;
  line-height: 1.22;
  color: rgba(255, 255, 255, 0.84);
  letter-spacing: 0.03em;
}

.submit-btn {
  margin-top: 20px;
  width: 100%;
  border: none;
  min-height: 46px;
  border-radius: 999px;
  background: linear-gradient(145deg, #4f8cff 0%, #2e6ae6 100%);
  color: #d0e4ff;
  font-size: 12px;
  font-family: var(--font-label);
  letter-spacing: 0.1em;
  text-transform: uppercase;
  font-weight: 800;
  box-shadow: 0 10px 20px rgba(79, 140, 255, 0.2);
}

.submit-btn:active {
  transform: scale(0.98);
}

@media (max-width: 420px) {
  .provider-grid {
    grid-template-columns: repeat(2, minmax(0, 1fr));
  }
}

@media (max-width: 380px) {
  .form-wrap {
    margin-left: 12px;
    margin-right: 12px;
    padding: 14px;
  }

  .provider-item {
    min-height: 78px;
  }
}
</style>
