<template>
  <div class="page-no-tab login-page">
    <div class="login-header">
      <img src="/logo/logo-icon.jpg" class="login-logo" alt="NeoCash logo" />
      <h1 class="login-brand">NEOCASH</h1>
      <p class="login-subtitle">Secure access to your account</p>
    </div>

    <div class="login-form">
      <div class="login-form-head">
        <h2>Sign In</h2>
        <p>Use your phone number and password to continue.</p>
      </div>

      <div class="input-group">
        <img src="/icons/user-line.png" class="input-icon" />
        <input type="tel" placeholder="Phone" v-model="phone" />
      </div>

      <div class="input-group">
        <img src="/icons/lock-line.png" class="input-icon" />
        <input :type="showPassword ? 'text' : 'password'" placeholder="Password" v-model="password" />
      </div>

      <div class="login-options">
        <a class="link-text" @click="goToRegister">Register</a>
        <label class="checkbox-label">
          <span class="checkbox" :class="{ checked: rememberMe }" @click="rememberMe = !rememberMe">
            <span class="check-mark" v-if="rememberMe">✓</span>
          </span>
          Remember Me
        </label>
      </div>

      <label class="checkbox-label agree-label">
        <span class="checkbox" :class="{ checked: agreePrivacy }" @click="agreePrivacy = !agreePrivacy">
          <span class="check-mark" v-if="agreePrivacy">✓</span>
        </span>
        Agree "<a class="link-text" @click.stop="$router.push('/privacy-policy')">User Privacy Agreement</a>"
      </label>

      <button class="btn-primary login-btn" @click="handleLogin">Sign In</button>

      <div class="gauth-divider">
        <span class="gauth-divider-line"></span>
        <span class="gauth-divider-text">or</span>
        <span class="gauth-divider-line"></span>
      </div>

      <button class="gauth-google-btn" @click="handleGoogleLogin" :disabled="googleLoading">
        <svg class="gauth-google-logo" viewBox="0 0 24 24" width="20" height="20">
          <path fill="#4285F4" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.74 3.27-8.1z"/>
          <path fill="#34A853" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"/>
          <path fill="#FBBC05" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"/>
          <path fill="#EA4335" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"/>
        </svg>
        <span>{{ googleLoading ? 'Signing in...' : 'Sign in with Google' }}</span>
      </button>

      <a class="link-text forgot-link" @click="$router.push('/forgot-password')">Forget Password</a>
    </div>

    <span class="version-text">v{{ appVersion }}</span>

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
import { auth } from '../api/auth'
import { toast } from '../utils/toast'
import { createTestSession, isTestAuthEnabled, verifyTestLogin } from '../utils/testAuth'
import { config } from '../api/config'
import { storage } from '../utils/storage'
import { signInWithGoogle, signOutFirebase } from '../utils/firebase'
import GoogleAuthPopup from '../components/GoogleAuthPopup.vue'

export default {
  name: 'LoginPage',
  components: { GoogleAuthPopup },
  data() {
    return {
      phone: '',
      password: '',
      showPassword: false,
      rememberMe: true,
      agreePrivacy: true,
      appVersion: config.appVersion,
      googleLoading: false,
      showGooglePopup: false,
      googleIdToken: '',
      googleEmail: '',
      googleDisplayName: '',
    }
  },
  methods: {
    normalizePhone(value) {
      const digits = String(value || '').replace(/\D/g, '');
      return digits.length >= 10 ? digits.slice(-10) : digits;
    },
    buildLoginPayload() {
      const phone = this.normalizePhone(this.phone);
      return {
        phone,
        username: phone,
        account: phone,
        mobile: phone,
        password: this.password
      };
    },

    async handleLogin() {
      const phone = this.normalizePhone(this.phone);
      if (!phone || !this.password) {
        toast.show({ title: 'Please enter phone and password', icon: 'none' })
        return
      }
      if (phone.length !== 10) {
        toast.show({ title: 'Please enter a valid 10-digit phone number', icon: 'none' })
        return
      }
      if (this.password.length < 6) {
        toast.show({ title: 'Password must be at least 6 characters', icon: 'none' })
        return
      }
      if (!this.agreePrivacy) {
        toast.show({ title: 'Please agree to the User Privacy Agreement', icon: 'none' })
        return
      }
      if (isTestAuthEnabled()) {
        const testUser = verifyTestLogin({ phone, password: this.password });
        createTestSession({ phone, username: testUser?.username || phone });
        toast.show({ title: 'Test login successful', icon: 'success' });
        this.$router.push('/home');
        return;
      }
      
      try {
        const res = await this.$api.userApi.login(this.buildLoginPayload());
        
        if (res.data) {
          if (this.rememberMe) {
            storage.set('remember_phone', phone, 90 * 24 * 60 * 60 * 1000);
          } else {
            storage.remove('remember_phone');
          }
          auth.onLoginSuccess(res.data);
          toast.show({ title: 'Login successful', icon: 'success' });
          this.$router.push('/home');
        }
      } catch (e) {
        // Error handling is managed by the http client interceptor
      }
    },

    goToRegister() {
      const inviteCode = String(this.$route.query.invite || this.$route.query.code || this.$route.params.inviteCode || '').trim();
      if (inviteCode) {
        this.$router.push({ name: 'Register', query: { invite: inviteCode } });
        return;
      }
      this.$router.push('/register');
    },

    async handleGoogleLogin() {
      this.googleLoading = true;
      try {
        const googleResult = await signInWithGoogle();
        this.googleIdToken = googleResult.idToken;
        this.googleEmail = googleResult.email;
        this.googleDisplayName = googleResult.displayName;

        const res = await this.$api.userApi.googleLogin({ idToken: googleResult.idToken });
        const data = res?.data || {};

        if (data.newUser) {
          // New user — show the registration popup
          this.showGooglePopup = true;
        } else if (data.token) {
          // Existing user — log them in
          auth.onLoginSuccess(data);
          toast.show({ title: 'Login successful', icon: 'success' });
          this.$router.push('/home');
        }
      } catch (e) {
        await signOutFirebase();
        toast.show({ title: 'Google sign-in failed. Please try again.' });
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
    }
  },
  mounted() {
    const remembered = String(storage.get('remember_phone', '') || '').trim();
    if (remembered) {
      this.phone = remembered;
      this.rememberMe = true;
    }
  }
}
</script>

<style scoped>
.login-page {
  display: flex;
  flex-direction: column;
  align-items: center;
  justify-content: flex-start;
  padding: calc(26px + var(--safe-top)) 24px 32px;
  min-height: 100dvh;
}

.login-logo {
  width: clamp(108px, 34vw, 156px);
  height: auto;
  display: block;
}

.login-header {
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
  margin-bottom: 22px;
}

.login-brand {
  font-size: clamp(30px, 7.4vw, 38px);
  font-weight: 800;
  font-family: var(--font-brand);
  letter-spacing: 0.1em;
  background: linear-gradient(115deg, #d0e4ff 0%, #7aaaff 48%, #2e6ae6 100%);
  -webkit-background-clip: text;
  background-clip: text;
  color: transparent;
  text-align: center;
  text-shadow: 0 8px 26px rgba(79, 140, 255, 0.22);
}

.login-subtitle {
  font-size: 13px;
  font-weight: 500;
  color: rgba(176, 208, 240, 0.76);
  letter-spacing: 0.02em;
  text-align: center;
}

.login-form {
  width: 100%;
  max-width: 396px;
  padding: 20px;
  border-radius: 22px;
  background: rgba(10, 20, 40, 0.85);
  border: 1px solid rgba(79, 140, 255, 0.12);
  box-shadow: var(--shadow-card);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
}

.login-form-head {
  margin-bottom: 14px;
}

.login-form-head h2 {
  font-size: 22px;
  font-weight: 800;
  color: rgba(208, 228, 255, 0.96);
  letter-spacing: 0.01em;
}

.login-form-head p {
  margin-top: 4px;
  font-size: 12.5px;
  color: rgba(150, 180, 210, 0.72);
}

.login-form .input-group {
  margin-bottom: 12px;
}

.login-form .input-group input {
  font-size: 15px;
  font-weight: 600;
}

.login-form .input-group input::placeholder {
  font-size: 13.5px;
  font-weight: 500;
  color: rgba(150, 180, 220, 0.75);
}

.login-options {
  display: flex;
  justify-content: space-between;
  align-items: center;
  margin-bottom: 18px;
  margin-top: 2px;
}

.link-text {
  color: rgba(176, 210, 255, 0.94);
  font-size: 13px;
  font-weight: 700;
  cursor: pointer;
  text-decoration: underline;
}

.checkbox-label {
  display: flex;
  align-items: center;
  gap: 8px;
  font-size: 13px;
  color: var(--text-secondary);
  cursor: pointer;
}

.checkbox {
  width: 20px;
  height: 20px;
  border-radius: 50%;
  border: 1px solid rgba(255, 255, 255, 0.2);
  display: flex;
  align-items: center;
  justify-content: center;
  transition: all 0.2s ease;
  flex-shrink: 0;
  background: rgba(255, 255, 255, 0.03);
}

.checkbox.checked {
  background: linear-gradient(135deg, rgba(79, 140, 255, 0.3) 0%, rgba(46, 106, 230, 0.22) 100%);
  border-color: rgba(79, 140, 255, 0.5);
}

.check-mark {
  color: #b0d0ff;
  font-size: 12px;
  font-weight: 700;
}

.agree-label {
  font-size: 12.5px;
  line-height: 1.42;
  margin-bottom: 24px;
}

.login-btn {
  margin-bottom: 24px;
  font-size: 15px;
  font-weight: 800;
  letter-spacing: 0.01em;
  background: linear-gradient(135deg, #4f8cff 0%, #2e6ae6 100%);
  color: #d0e4ff;
  box-shadow: 0 10px 22px rgba(79, 140, 255, 0.28);
}

.login-btn:hover {
  filter: brightness(1.02);
}

.login-btn:active {
  box-shadow: 0 7px 14px rgba(79, 140, 255, 0.24);
}

.forgot-link {
  display: block;
  text-align: center;
  font-size: 12.5px;
  color: rgba(150, 190, 235, 0.92);
}

.gauth-divider {
  display: flex;
  align-items: center;
  gap: 12px;
  margin-bottom: 16px;
}

.gauth-divider-line {
  flex: 1;
  height: 1px;
  background: rgba(255, 255, 255, 0.08);
}

.gauth-divider-text {
  font-size: 12px;
  font-weight: 600;
  color: rgba(130, 170, 210, 0.55);
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
  color: rgba(208, 228, 255, 0.94);
  font-size: 14px;
  font-weight: 700;
  cursor: pointer;
  transition: all 0.2s ease;
  margin-bottom: 20px;
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

.version-text {
  position: fixed;
  bottom: calc(14px + var(--safe-bottom));
  right: 16px;
  font-size: 12px;
  color: var(--text-muted);
  background: rgba(255, 255, 255, 0.04);
  border: 1px solid rgba(255, 255, 255, 0.08);
  border-radius: 999px;
  padding: 4px 10px;
}

@media (max-width: 380px) {
  .login-page {
    padding-left: 16px;
    padding-right: 16px;
  }

  .login-form {
    padding: 14px;
  }
}
</style>
