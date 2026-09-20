<template>
  <div v-if="visible" class="confirm-overlay" @click.self="handleCancel">
    <div class="confirm-box">
      <div v-if="title" class="confirm-title">{{ title }}</div>
      <div class="confirm-content">{{ content }}</div>
      <div class="confirm-actions">
        <button class="confirm-btn-cancel" @click="handleCancel">{{ cancelText }}</button>
        <button class="confirm-btn-confirm" @click="handleConfirm">{{ confirmText }}</button>
      </div>
    </div>
  </div>
</template>

<script>
// Singleton state for global usage without needing a store
import { reactive, toRefs } from 'vue';

const state = reactive({
  visible: false,
  title: '',
  content: '',
  confirmText: 'Confirm',
  cancelText: 'Cancel',
  onConfirm: null,
  onCancel: null
});

export const showConfirm = (options) => {
  state.title = options.title || '';
  state.content = options.content || '';
  state.confirmText = options.confirmText || 'Confirm';
  state.cancelText = options.cancelText || 'Cancel';
  state.onConfirm = options.onConfirm;
  state.onCancel = options.onCancel;
  state.visible = true;
};

export default {
  name: 'ConfirmDialog',
  setup() {
    const handleConfirm = () => {
      state.visible = false;
      if (state.onConfirm) state.onConfirm();
    };

    const handleCancel = () => {
      state.visible = false;
      if (state.onCancel) state.onCancel();
    };

    return {
      ...toRefs(state),
      handleConfirm,
      handleCancel
    };
  }
}
</script>

<style scoped>
.confirm-overlay {
  position: fixed;
  top: 0;
  left: 0;
  right: 0;
  bottom: 0;
  background: var(--overlay-dark);
  display: flex;
  justify-content: center;
  align-items: center;
  z-index: 10000;
  padding: 16px;
  animation: fadeIn 0.2s ease;
}
.confirm-box {
  width: min(100%, 340px);
  background: linear-gradient(165deg, rgba(255, 255, 255, 0.06) 0%, rgba(255, 255, 255, 0.04) 74%, rgba(255, 255, 255, 0.02) 100%);
  border: 1px solid rgba(255, 255, 255, 0.12);
  border-radius: 20px;
  overflow: hidden;
  box-shadow: 0 16px 32px rgba(0, 0, 0, 0.36);
  transform: scale(0.95);
  animation: scaleIn 0.2s ease forwards;
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
}
.confirm-title {
  padding: 16px 18px 4px;
  text-align: center;
  font-size: 18px;
  line-height: 1.2;
  font-family: var(--font-brand);
  font-weight: 700;
  color: rgba(255, 255, 255, 0.94);
}
.confirm-content {
  padding: 14px 18px 18px;
  text-align: center;
  font-size: 14px;
  color: rgba(255, 255, 255, 0.72);
  line-height: 1.45;
}
.confirm-actions {
  display: flex;
  border-top: 1px solid rgba(255, 255, 255, 0.1);
  background: rgba(255, 255, 255, 0.03);
}
.confirm-actions button {
  flex: 1;
  min-height: 48px;
  padding: 12px 10px;
  background: transparent;
  border: none;
  font-size: 14px;
  font-family: var(--font-label);
  letter-spacing: 0.05em;
  text-transform: uppercase;
  font-weight: 700;
  cursor: pointer;
  outline: none;
}
.confirm-btn-cancel {
  border-right: 1px solid rgba(255, 255, 255, 0.1) !important;
  color: rgba(255, 255, 255, 0.62);
}
.confirm-btn-confirm {
  color: rgba(203, 219, 158, 0.96);
  background: rgba(79, 140, 255, 0.14);
}
@keyframes fadeIn { from { opacity: 0; } to { opacity: 1; } }
@keyframes scaleIn { to { transform: scale(1); } }
</style>
