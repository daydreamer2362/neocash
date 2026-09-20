<template>
  <div class="page-no-tab">
    <div class="nav-bar">
      <button class="back-btn" @click="$router.back()">
        <img src="/icons/back.png" />
      </button>
      <span class="nav-title">Forget Password</span>
    </div>

    <div class="form-wrap">
      <div class="input-group">
        <img src="/icons/phone-line.png" class="input-icon" />
        <span class="input-prefix">+91</span>
        <span class="input-divider"></span>
        <input type="tel" placeholder="Phone" v-model="phone" />
      </div>


      <div class="input-group">
        <img src="/icons/lock-line.png" class="input-icon" />
        <input type="password" placeholder="New Password" v-model="newPassword" />
      </div>

      <div class="input-group">
        <img src="/icons/lock-line.png" class="input-icon" />
        <input type="password" placeholder="Confirm Password" v-model="confirmPassword" />
      </div>

      <button class="btn-primary" style="margin-top: 16px;" @click="handleReset">Reset Password</button>
    </div>
  </div>
</template>

<script>
import { toast } from '../utils/toast'
import { isTestAuthEnabled, resetTestPassword } from '../utils/testAuth'

export default {
  name: 'ForgotPasswordPage',
  data() {
    return { phone: '', newPassword: '', confirmPassword: '' }
  },
  methods: {
    normalizePhone(value) {
      const digits = String(value || '').replace(/\D/g, '');
      return digits.length >= 10 ? digits.slice(-10) : digits;
    },

    async handleReset() {
      const phone = this.normalizePhone(this.phone);
      if (!this.newPassword || this.newPassword !== this.confirmPassword) {
        toast.show({ title: 'Passwords do not match' });
        return;
      }
      if (phone.length !== 10) {
        toast.show({ title: 'Please enter a valid 10-digit phone number' });
        return;
      }

      if (isTestAuthEnabled()) {
        const updated = resetTestPassword({ phone, password: this.newPassword });
        toast.show({ title: updated ? 'Test password reset successful' : 'No test user found for this phone', icon: updated ? 'success' : 'error' });
        if (updated) {
          this.$router.push('/login');
        }
        return;
      }
      try {
        await this.$api.userApi.forgot({
          phone,
          mobile: phone,

          password: this.newPassword,
          confirmPassword: this.confirmPassword
        });
        toast.show({ title: 'Password reset successful', icon: 'success' });
        this.$router.push('/login');
      } catch (e) {}
    }
  }
}
</script>

<style scoped>
.form-wrap { padding: 20px 32px; }
</style>
