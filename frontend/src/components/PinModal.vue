<template>
  <div v-if="visible" class="pin-overlay" :class="{ 'pin-overlay-android': isAndroidView }" @click.self="handleCancel">
    <div class="pin-box" :class="{ 'pin-box-android': isAndroidView }">
      <div class="pin-header">
        <div class="pin-title">Security Verification</div>
        <div class="pin-close" @click="handleCancel">✕</div>
      </div>
      <div class="pin-content">
        <div class="pin-desc">Please enter your 6-digit payment PIN</div>
        
        <div class="pin-dots" @click="focusInput">
          <div class="pin-dot" v-for="i in 6" :key="i" :class="{ filled: pinCode.length >= i }"></div>
        </div>
        
        <input 
          ref="hiddenInput"
          type="tel" 
          maxlength="6" 
          v-model="pinCode" 
          class="hidden-input"
          @input="onPinInput"
          inputmode="numeric"
        />
        
        <button class="forgot-pin" @click="goForgotPin">Forgot PIN?</button>
      </div>
    </div>
  </div>
</template>

<script>
import { reactive, toRefs, ref, nextTick, watch } from 'vue';
import { useRouter } from 'vue-router';
import { userApi } from '../api';
import { toast } from '../utils/toast';

const state = reactive({
  visible: false,
  resolvePromise: null,
  rejectPromise: null
});

// Programmatic API to open the modal and wait for ticket
export const verifyPinAndGetTicket = () => {
  return new Promise((resolve, reject) => {
    state.resolvePromise = resolve;
    state.rejectPromise = reject;
    state.visible = true;
  });
};

export default {
  name: 'PinModal',
  setup() {
    const router = useRouter();
    const pinCode = ref('');
    const hiddenInput = ref(null);
    const isAndroidView = ref(typeof navigator !== 'undefined' && /android/i.test(String(navigator.userAgent || '')));

    const focusInput = () => {
      if (hiddenInput.value) hiddenInput.value.focus();
    };

    const handleCancel = () => {
      state.visible = false;
      pinCode.value = '';
      if (state.resolvePromise) state.resolvePromise(null); // Return empty on cancel
    };

    const verifyPin = async () => {
      try {
        const res = await userApi.verifyPin({ pin: pinCode.value });
        const verified = Boolean(res?.data?.verified);
        if (!verified) {
          throw new Error('Invalid PIN');
        }
        state.visible = false;
        pinCode.value = '';
        if (state.resolvePromise) state.resolvePromise(true);
      } catch (err) {
        const errMsg = String(err?.msg || err?.message || '').toLowerCase();
        if (errMsg.includes('pin not set')) {
          toast.show({ title: 'Please create PIN first' });
          state.visible = false;
          pinCode.value = '';
          if (state.resolvePromise) state.resolvePromise(null);
          router.push('/pin-code');
          return;
        }
        pinCode.value = '';
        focusInput();
      }
    };

    const onPinInput = () => {
      pinCode.value = pinCode.value.replace(/\D/g, ''); // Keep only numbers
      if (pinCode.value.length === 6) {
        verifyPin();
      }
    };

    const goForgotPin = () => {
      state.visible = false;
      pinCode.value = '';
      if (state.resolvePromise) state.resolvePromise(null);
      // router param or path for pin reset
      router.push('/pin-code'); 
    };

    watch(
      () => state.visible,
      (visible) => {
        if (visible) {
          nextTick(() => { focusInput(); });
        }
      }
    );

    return {
      ...toRefs(state),
      pinCode,
      hiddenInput,
      isAndroidView,
      focusInput,
      onPinInput,
      handleCancel,
      goForgotPin
    };
  }
}
</script>

<style scoped>
.pin-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--overlay-dark);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 10010;
  padding: 16px;
  animation: fadeIn 0.2s ease;
}
.pin-overlay-android { align-items: flex-end; }
.pin-box {
  background: linear-gradient(165deg, rgba(255, 255, 255, 0.07) 0%, rgba(255, 255, 255, 0.04) 76%, rgba(255, 255, 255, 0.02) 100%);
  border: 1px solid rgba(255, 255, 255, 0.12);
  width: min(420px, calc(100% - 24px));
  border-radius: 22px;
  box-shadow: 0 16px 34px rgba(0, 0, 0, 0.36);
  animation: slideUp 0.3s cubic-bezier(0.16, 1, 0.3, 1) forwards;
  padding-bottom: 0;
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
}
.pin-box-android {
  width: 100%;
  border-radius: 24px 24px 0 0;
  padding-bottom: env(safe-area-inset-bottom);
}
.pin-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  padding: 14px 16px;
  border-bottom: 1px solid rgba(255, 255, 255, 0.1);
}
.pin-title {
  font-size: 16px;
  font-family: var(--font-brand);
  font-weight: 700;
  color: rgba(255, 255, 255, 0.94);
}
.pin-close {
  font-size: 18px;
  color: rgba(255, 255, 255, 0.58);
  cursor: pointer;
  padding: 4px;
}
.pin-content {
  padding: 24px 18px 30px;
  text-align: center;
}
.pin-desc {
  font-size: 13px;
  color: rgba(255, 255, 255, 0.74);
  margin-bottom: 20px;
}
.pin-dots {
  display: flex;
  justify-content: center;
  gap: 14px;
  margin-bottom: 20px;
}
.pin-dot {
  width: 14px;
  height: 14px;
  border-radius: 50%;
  background: rgba(255, 255, 255, 0.08);
  border: 1px solid rgba(79, 140, 255, 0.26);
  transition: all 0.2s;
}
.pin-dot.filled {
  background: linear-gradient(145deg, #4f8cff 0%, #2e6ae6 100%);
  transform: scale(1.1);
  border-color: transparent;
  box-shadow: 0 0 10px rgba(79, 140, 255, 0.26);
}
.hidden-input {
  position: absolute;
  left: -9999px;
  opacity: 0;
}
.forgot-pin {
  background: none;
  border: none;
  color: rgba(203, 219, 158, 0.95);
  font-size: 12px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-family: var(--font-label);
  font-weight: 600;
  cursor: pointer;
  box-shadow: none;
}
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes slideUp { from { transform: translateY(100%); } to { transform: translateY(0); } }
</style>
