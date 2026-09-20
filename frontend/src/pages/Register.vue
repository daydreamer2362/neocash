<template>
  <div class="page-no-tab">
    <div class="nav-bar">
      <button class="back-btn" @click="$router.back()">
        <img src="/icons/back.png" />
      </button>
      <span class="nav-title">Register</span>
    </div>

    <div class="register-form">
      <div class="input-group">
        <img src="/icons/user-line.png" class="input-icon" />
        <input type="text" placeholder="User Name" v-model="username" />
      </div>

      <div class="input-group">
        <img src="/icons/lock-line.png" class="input-icon" />
        <input type="password" placeholder="Password" v-model="password" />
      </div>

      <div class="input-group">
        <img src="/icons/lock-line.png" class="input-icon" />
        <input type="password" placeholder="Confirm Password" v-model="confirmPassword" />
      </div>

      <div class="input-group">
        <img src="/icons/phone-line.png" class="input-icon" />
        <span class="input-prefix">+91</span>
        <span class="input-divider"></span>
        <input type="tel" placeholder="Phone" v-model="phone" />
      </div>

      <div class="input-group">
        <img src="/icons/link-line.png" class="input-icon" />
        <input type="text" placeholder="Invite Code" v-model="inviteCode" />
      </div>
      <div class="invite-actions">
        <button class="btn-outline" @click="applyInviteCode">Apply Invite Code</button>
      </div>

      <button class="btn-primary" style="margin-top: 16px;" @click="handleRegister">Sign Up</button>

      <div class="gauth-divider">
        <span class="gauth-divider-line"></span>
        <span class="gauth-divider-text">or</span>
        <span class="gauth-divider-line"></span>
      </div>

      <button class="gauth-google-btn" @click="handleGoogleRegister" :disabled="googleLoading">
        <svg class="gauth-google-logo" viewBox="0 0 24 24" width="20" height="20">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
        <span>{{ googleLoading ? 'Signing up...' : 'Sign up with Google' }}</span>
      </button>

      <button class="btn-outline" style="margin-top: 0;" @click="$router.push('/login')">Already have an account? Login</button>
      <div class="login-cta-row">
        <span class="login-cta-muted">Already registered?</span>
        <button type="button" class="login-cta-link" @click="$router.push('/login')">Login here</button>
      </div>
    </div>

    <GoogleAuthPopup
      v-if="showGooglePopup"
      :email="googleEmail"
      :displayName="googleDisplayName"
      @submit="handleGoogleComplete"
      @close="showGooglePopup = false"
    />
  </div>
</template>

<script>
import { toast } from '../utils/toast'
import { isTestAuthEnabled, registerTestUser } from '../utils/testAuth'
import { auth } from '../api/auth'
import { signInWithGoogle, signOutFirebase } from '../utils/firebase'
import GoogleAuthPopup from '../components/GoogleAuthPopup.vue'

export default {
  name: 'RegisterPage',
  components: { GoogleAuthPopup },
  data() {
    return {
      username: '',
      password: '',
      confirmPassword: '',
      phone: '',
      inviteCode: '',
      googleLoading: false,
      showGooglePopup: false,
      googleIdToken: '',
      googleEmail: '',
      googleDisplayName: '',
    }
  },
  methods: {
    normalizeUsername(value) {
      return String(value || '').replace(/[^a-zA-Z0-9_]/g, '').trim();
    },
    normalizeInviteCode(value) {
      return String(value || '').replace(/[^a-zA-Z0-9]/g, '').trim();
    },
    normalizePhone(value) {
      const digits = String(value || '').replace(/\D/g, '');
      return digits.length >= 10 ? digits.slice(-10) : digits;
    },
    async prefillInvite() {
      try {
        const routeInvite = this.$route.params.inviteCode || this.$route.query.invite || this.$route.query.code;
        if (routeInvite) {
          this.inviteCode = String(routeInvite).trim();
          await this.$api.userApi.prefill({ code: this.inviteCode });
        }
      } catch (e) {}
    },
    async applyInviteCode() {
      const code = this.normalizeInviteCode(this.inviteCode);
      if (!code) {
        toast.show({ title: 'Please enter invite code first' });
        return;
      }
      if (code.length < 3) {
        toast.show({ title: 'Invite code must be at least 3 characters' });
        return;
      }
      try {
        const res = await this.$api.userApi.prefill({ code });
        const data = res?.data || {};
        this.inviteCode = String(data.inviteCode || data.invite || code).trim();
        toast.show({ title: 'Invite code applied', icon: 'success' });
      } catch (e) {}
    },
    async handleRegister() {
      const username = this.normalizeUsername(this.username);
      const phone = this.normalizePhone(this.phone);
      const inviteCode = this.normalizeInviteCode(this.inviteCode);
      if (!this.phone || !this.password) {
        toast.show({ title: 'Please fill all required fields' })
        return
      }
      if (!username || username.length < 5) {
        toast.show({ title: 'Username must be at least 5 characters' })
        return
      }
      if (phone.length !== 10) {
        toast.show({ title: 'Please enter a valid 10-digit phone number' })
        return
      }
      if (this.password.length < 6) {
        toast.show({ title: 'Password must be at least 6 characters' })
        return
      }
      if (this.password !== this.confirmPassword) {
        toast.show({ title: 'Passwords do not match' })
        return
      }
      if (inviteCode && inviteCode.length < 3) {
        toast.show({ title: 'Invite code must be at least 3 characters' })
        return
      }
      if (isTestAuthEnabled()) {
        registerTestUser({
          phone,
          username,
          password: this.password
        });
        toast.show({ title: 'Test registration successful', icon: 'success' });
        this.$router.push('/login');
        return;
      }
      try {
        await this.$api.userApi.register({
          userName: username,
          username,
          nickName: username,
          password: this.password,
          confirmPassword: this.confirmPassword,
          phone,
          mobile: phone,
          invite: inviteCode,
          inviteCode,
        });
        toast.show({ title: 'Registration successful', icon: 'success' });
        this.$router.push('/login');
      } catch (e) { }
    },

    async handleGoogleRegister() {
      this.googleLoading = true;
      try {
        const googleResult = await signInWithGoogle();
        this.googleIdToken = googleResult.idToken;
        this.googleEmail = googleResult.email;
        this.googleDisplayName = googleResult.displayName;

        const res = await this.$api.userApi.googleLogin({ idToken: googleResult.idToken });
        const data = res?.data || {};

        if (data.newUser) {
          // New user — show the phone + invite popup
          this.showGooglePopup = true;
        } else if (data.token) {
          // Already has account — log them in
          auth.onLoginSuccess(data);
          toast.show({ title: 'Login successful', icon: 'success' });
          this.$router.push('/home');
        }
      } catch (e) {
        await signOutFirebase();
        toast.show({ title: 'Google sign-up failed. Please try again.' });
      } finally {
        this.googleLoading = false;
      }
    },

    async handleGoogleComplete({ phone, inviteCode }) {
      try {
        const res = await this.$api.userApi.googleComplete({
          idToken: this.googleIdToken,
          phone,
          inviteCode,
        });
        const data = res?.data || {};
        if (data.token) {
          auth.onLoginSuccess(data);
          toast.show({ title: 'Account created successfully', icon: 'success' });
          this.showGooglePopup = false;
          this.$router.push('/home');
        }
      } catch (e) {
        this.showGooglePopup = false;
        await signOutFirebase();
      }
    },
  },
  mounted() {
    this.prefillInvite();
  }
}
</script>

<style scoped>
.register-form {
  padding: 20px 32px;
}
.invite-actions {
  margin-top: 4px;
}
.invite-actions .btn-outline {
  width: 100%;
}
.login-cta-row {
  margin-top: 12px;
  display: flex;
  justify-content: center;
  align-items: center;
  gap: 8px;
}
.login-cta-muted {
  font-size: 13px;
  color: var(--text-secondary);
}
.login-cta-link {
  border: none;
  background: transparent;
  color: var(--primary);
  font-size: 14px;
  font-weight: 700;
  text-decoration: underline;
  cursor: pointer;
}

.gauth-divider {
  display: flex;
  align-items: center;
  gap: 12px;
  margin: 14px 0;
}

.gauth-divider-line {
  flex: 1;
  height: 1px;
  background: rgba(255, 255, 255, 0.08);
}

.gauth-divider-text {
  font-size: 12px;
  font-weight: 600;
  color: rgba(180, 188, 160, 0.55);
  text-transform: uppercase;
  letter-spacing: 0.08em;
}

.gauth-google-btn {
  width: 100%;
  display: flex;
  align-items: center;
  justify-content: center;
  gap: 10px;
  padding: 13px 20px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.06);
  border: 1px solid rgba(255, 255, 255, 0.1);
  color: rgba(235, 240, 218, 0.94);
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
  margin-bottom: 10px;
}

.gauth-google-btn:hover {
  background: rgba(255, 255, 255, 0.1);
  border-color: rgba(255, 255, 255, 0.16);
  box-shadow: 0 4px 16px rgba(0, 0, 0, 0.2);
}

.gauth-google-btn:active {
  transform: scale(0.985);
}

.gauth-google-btn:disabled {
  opacity: 0.55;
  cursor: not-allowed;
}

.gauth-google-logo {
  flex-shrink: 0;
}
</style>
