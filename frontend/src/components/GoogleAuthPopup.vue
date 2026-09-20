<template>
  <teleport to="body">
    <div class="gauth-overlay" @click.self="$emit('close')">
      <div class="gauth-popup">
        <div class="gauth-header">
          <div class="gauth-icon-wrap">
            <svg class="gauth-icon" viewBox="0 0 24 24" width="28" height="28">
              <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"/>
              <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
              <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
              <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
            </svg>
          </div>
          <h3 class="gauth-title">Complete Your Profile</h3>
          <p class="gauth-subtitle">
            <template v-if="email">Signed in as <strong>{{ email }}</strong></template>
            <template v-else>Just a few more details to get started</template>
          </p>
        </div>

        <div class="gauth-body">
          <div class="input-group">
            <img src="/icons/phone-line.png" class="input-icon" />
            <span class="input-prefix">+91</span>
            <span class="input-divider"></span>
            <input
              type="tel"
              placeholder="Phone Number"
              v-model="phone"
              maxlength="10"
              @input="phone = phone.replace(/\D/g, '')"
            />
          </div>

          <div class="input-group">
            <img src="/icons/link-line.png" class="input-icon" />
            <input
              type="text"
              placeholder="Invite Code (optional)"
              v-model="inviteCode"
            />
          </div>
        </div>

        <div class="gauth-actions">
          <button class="btn-primary gauth-btn-continue" @click="handleContinue" :disabled="loading">
            <span v-if="loading" class="gauth-spinner"></span>
            <span v-else>Continue</span>
          </button>
          <button class="gauth-btn-skip" @click="handleSkip" :disabled="loading">
            Skip Invite Code
          </button>
        </div>
      </div>
    </div>
  </teleport>
</template>

<script>
import { toast } from '../utils/toast'

export default {
  name: 'GoogleAuthPopup',
  props: {
    email: { type: String, default: '' },
    displayName: { type: String, default: '' },
  },
  emits: ['submit', 'close'],
  data() {
    return {
      phone: '',
      inviteCode: '',
      loading: false,
    }
  },
  methods: {
    normalizePhone(value) {
      const digits = String(value || '').replace(/\D/g, '');
      return digits.length >= 10 ? digits.slice(-10) : digits;
    },
    validate() {
      const phone = this.normalizePhone(this.phone);
      if (!phone || phone.length !== 10) {
        toast.show({ title: 'Please enter a valid 10-digit phone number' });
        return false;
      }
      return true;
    },
    handleContinue() {
      if (!this.validate()) return;
      const inviteCode = String(this.inviteCode || '').replace(/[^a-zA-Z0-9]/g, '').trim();
      if (inviteCode && inviteCode.length < 3) {
        toast.show({ title: 'Invite code must be at least 3 characters' });
        return;
      }
      this.loading = true;
      this.$emit('submit', {
        phone: this.normalizePhone(this.phone),
        inviteCode,
      });
    },
    handleSkip() {
      if (!this.validate()) return;
      this.loading = true;
      this.$emit('submit', {
        phone: this.normalizePhone(this.phone),
        inviteCode: '',
      });
    },
  },
}
</script>

<style scoped>
.gauth-overlay {
  position: fixed;
  inset: 0;
  z-index: 9999;
  background: rgba(0, 0, 0, 0.65);
  backdrop-filter: blur(8px);
  -webkit-backdrop-filter: blur(8px);
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
  animation: gauthFadeIn 0.25s ease;
}

@keyframes gauthFadeIn {
  from { opacity: 0; }
  to { opacity: 1; }
}

@keyframes gauthSlideUp {
  from { opacity: 0; transform: translateY(24px) scale(0.97); }
  to { opacity: 1; transform: translateY(0) scale(1); }
}

.gauth-popup {
  width: 100%;
  max-width: 380px;
  background: rgba(26, 27, 29, 0.92);
  border: 1px solid rgba(255, 255, 255, 0.1);
  border-radius: 22px;
  padding: 28px 24px 24px;
  box-shadow: 0 24px 64px rgba(0, 0, 0, 0.45), 0 0 0 1px rgba(255,255,255,0.04) inset;
  backdrop-filter: blur(24px);
  -webkit-backdrop-filter: blur(24px);
  animation: gauthSlideUp 0.3s ease;
}

.gauth-header {
  text-align: center;
  margin-bottom: 22px;
}

.gauth-icon-wrap {
  width: 52px;
  height: 52px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.08);
  display: flex;
  align-items: center;
  justify-content: center;
  margin: 0 auto 14px;
}

.gauth-title {
  font-size: 20px;
  font-weight: 800;
  color: rgba(243, 255, 202, 0.96);
  letter-spacing: 0.01em;
  margin: 0 0 6px;
}

.gauth-subtitle {
  font-size: 12.5px;
  color: rgba(196, 204, 174, 0.72);
  margin: 0;
  line-height: 1.4;
}

.gauth-subtitle strong {
  color: rgba(215, 228, 170, 0.94);
  font-weight: 600;
}

.gauth-body {
  display: flex;
  flex-direction: column;
  gap: 12px;
  margin-bottom: 20px;
}

.gauth-actions {
  display: flex;
  flex-direction: column;
  gap: 10px;
}

.gauth-btn-continue {
  font-size: 15px;
  font-weight: 800;
  letter-spacing: 0.01em;
  background: linear-gradient(135deg, #4f8cff 0%, #2e6ae6 100%);
  color: #d0e4ff;
  box-shadow: 0 10px 22px rgba(79, 140, 255, 0.24);
}

.gauth-btn-continue:disabled {
  opacity: 0.6;
  cursor: not-allowed;
}

.gauth-btn-skip {
  width: 100%;
  background: transparent;
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: rgba(215, 228, 170, 0.82);
  font-size: 13.5px;
  font-weight: 600;
  padding: 12px;
  border-radius: 14px;
  cursor: pointer;
  transition: all 0.2s ease;
}

.gauth-btn-skip:hover {
  background: rgba(255, 255, 255, 0.04);
  border-color: rgba(255, 255, 255, 0.16);
}

.gauth-btn-skip:disabled {
  opacity: 0.5;
  cursor: not-allowed;
}

.gauth-spinner {
  display: inline-block;
  width: 18px;
  height: 18px;
  border: 2px solid rgba(18, 23, 10, 0.3);
  border-top-color: #d0e4ff;
  border-radius: 50%;
  animation: gauthSpin 0.6s linear infinite;
}

@keyframes gauthSpin {
  to { transform: rotate(360deg); }
}
</style>
