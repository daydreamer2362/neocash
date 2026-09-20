<template>
  <div class="page-no-tab">
    <div class="nav-bar">
      <button class="back-btn" @click="$router.back()"><img src="/icons/back.png" /></button>
      <span class="nav-title">Pin Code</span>
    </div>

    <div class="pin-content">
      <div class="pin-gear">
        <img src="/user/gear.png" class="gear-icon" />
      </div>
      <h2 class="pin-heading">Enter Your Pin</h2>

      <div v-if="hasExistingPin" class="pin-section">
        <label class="pin-label text-green">Old Pin</label>
        <div class="pin-boxes">
          <input type="password" maxlength="6" class="pin-box-full" v-model="oldPin" placeholder="******" />
        </div>
      </div>

      <div class="pin-section">
        <label class="pin-label text-green">New Pin</label>
        <div class="pin-boxes">
          <input type="password" maxlength="6" class="pin-box-full" v-model="newPin" placeholder="******" />
        </div>
      </div>

      <div class="pin-section">
        <label class="pin-label text-green">Confirm New Pin</label>
        <div class="pin-boxes">
          <input type="password" maxlength="6" class="pin-box-full" v-model="confirmPin" placeholder="******" />
        </div>
      </div>

      <div class="pin-actions">
        <button class="btn-cancel" @click="$router.back()">Cancel</button>
        <button class="btn-confirm" @click="handleConfirm">Confirm</button>
      </div>
    </div>
  </div>
</template>

<script>
import { toast } from '../utils/toast'

export default {
  name: 'PinCodePage',
  data() {
    return { oldPin: '', newPin: '', confirmPin: '', hasExistingPin: false }
  },
  methods: {
    async loadPinStatus() {
      try {
        const res = await this.$api.myApi.personV2();
        this.hasExistingPin = Boolean(res?.data?.hasPin);
      } catch (e) {}
    },
    async handleConfirm() {
      const oldPin = String(this.oldPin || '').trim();
      const pin = String(this.newPin || '').trim();
      const confirm = String(this.confirmPin || '').trim();
      if (this.hasExistingPin && !/^\d{6}$/.test(oldPin)) {
        toast.show({ title: 'Please enter your old 6-digit PIN' });
        return;
      }
      if (!/^\d{6}$/.test(pin)) {
        toast.show({ title: 'PIN must be 6 digits' });
        return;
      }
      if (pin !== confirm) {
        toast.show({ title: 'New PINs do not match' });
        return;
      }
      try {
        if (this.hasExistingPin) {
          const verifyRes = await this.$api.userApi.verifyPin({ pin: oldPin });
          if (!verifyRes?.data?.verified) {
            toast.show({ title: 'Old PIN is incorrect' });
            return;
          }
        }
        await this.$api.userApi.updatePin({ pin });
        toast.show({ title: 'Pin updated successfully', icon: 'success' });
        this.$router.back();
      } catch (e) {}
    }
  },
  mounted() {
    this.loadPinStatus();
  }
}
</script>

<style scoped>
.pin-content { padding: 0 32px; text-align: center; }
.pin-gear { margin: 24px 0 20px; }
.gear-icon { width: 80px; height: 80px; }
.pin-heading { font-size: 22px; font-weight: 800; margin-bottom: 24px; }
.pin-section { margin-bottom: 20px; text-align: left; }
.pin-label { font-size: 15px; font-weight: 600; margin-bottom: 8px; display: block; }
.pin-boxes { display: flex; gap: 8px; }
.pin-box {
  width: 48px; height: 48px;
  border: 2px solid var(--border-input);
  border-radius: var(--radius-sm);
  text-align: center; font-size: 20px;
  outline: none; font-family: inherit;
  background: var(--bg-white);
}
.pin-box:focus, .pin-box-full:focus { border-color: var(--primary); }
.pin-box-full {
  width: 100%; height: 48px;
  border: 2px solid var(--border-input);
  border-radius: var(--radius-sm);
  text-align: center; font-size: 20px;
  outline: none; font-family: inherit;
  background: var(--bg-white); letter-spacing: 8px;
}
.pin-actions { display: flex; gap: 12px; margin-top: 32px; }
.btn-cancel {
  flex: 1; padding: 14px;
  background: var(--surface-glass); color: var(--text-secondary);
  border: none; border-radius: var(--radius-full);
  font-size: 16px; font-weight: 600; cursor: pointer;
}
.btn-confirm {
  flex: 1; padding: 14px;
  background: var(--primary); color: var(--secondary-color);
  border: none; border-radius: var(--radius-full);
  font-size: 16px; font-weight: 600; cursor: pointer;
  opacity: 0.7;
}
</style>
