<template>
  <div class="mobile-frame">
    <router-view />
    <ConfirmDialog />
    <PinModal />

    <nav class="tab-bar" v-if="showTabBar">
      <router-link to="/home" class="tab-item" :class="{ active: activeTab === 'home' }">
        <img src="/tab/home.png" class="tab-icon" />
        <span class="tab-label">Home</span>
      </router-link>

      <router-link to="/payment" class="tab-item" :class="{ active: activeTab === 'payment' }">
        <img src="/tab/pay.png" class="tab-icon" />
        <span class="tab-label">Trade</span>
      </router-link>

      <router-link to="/wallet" class="tab-item center-tab" :class="{ active: activeTab === 'wallet' }">
        <div class="tab-icon-wrap">
          <img src="/tab/wallet.png" class="tab-icon" />
        </div>
      </router-link>

      <router-link to="/statistics" class="tab-item" :class="{ active: activeTab === 'statistics' }">
        <img src="/tab/team.png" class="tab-icon" />
        <span class="tab-label">Stats</span>
      </router-link>

      <router-link to="/my" class="tab-item" :class="{ active: activeTab === 'my' }">
        <img src="/icons/user-line.png" class="tab-icon" />
        <span class="tab-label">Profile</span>
      </router-link>
    </nav>

    <div v-if="forceUpdateRequired" class="update-overlay">
      <div class="update-card">
        <h3>Update Required</h3>
        <p>A new version of NeoCash is available. Please update to continue.</p>
        <p class="update-version">Current: {{ appVersion }} | Required: {{ latestVersion }}</p>
        <button class="update-btn" @click="goToUpdate">Update Now</button>
      </div>
    </div>
  </div>
</template>

<script>
import ConfirmDialog from './components/ConfirmDialog.vue'
import PinModal from './components/PinModal.vue'
import { config } from './api/config'

export default {
  name: 'App',
  components: {
    ConfirmDialog,
    PinModal
  },
  data() {
    return {
      appVersion: config.appVersion,
      latestVersion: '',
      forceUpdateRequired: false,
      downloadUrl: '',
    };
  },
  computed: {
    showTabBar() {
      return !this.$route.meta.hideTabBar
    },
    activeTab() {
      const path = this.$route.path
      if (path.startsWith('/home')) return 'home'
      if (path.startsWith('/payment')) return 'payment'
      if (path.startsWith('/wallet')) return 'wallet'
      if (path.startsWith('/statistics')) return 'statistics'
      if (path.startsWith('/my')) return 'my'
      return ''
    }
  },
  methods: {
    compareVersions(a, b) {
      const left = String(a || '').split('.').map(n => Number(n) || 0);
      const right = String(b || '').split('.').map(n => Number(n) || 0);
      const len = Math.max(left.length, right.length);
      for (let i = 0; i < len; i++) {
        const x = left[i] || 0;
        const y = right[i] || 0;
        if (x > y) return 1;
        if (x < y) return -1;
      }
      return 0;
    },
    async checkAppVersion() {
      try {
        const res = await this.$api.appApi.getLatestAppVersion();
        const data = res?.data || {};
        const requiredVersion = String(data.version || '').trim();
        this.latestVersion = requiredVersion || this.appVersion;
        this.downloadUrl = String(data.downloadUrl || '').trim();
        const isOlder = this.compareVersions(this.appVersion, requiredVersion) < 0;
        this.forceUpdateRequired = Boolean(data.forceUpdate) && isOlder;
      } catch (e) {
        this.forceUpdateRequired = false;
      }
    },
    goToUpdate() {
      if (this.downloadUrl) {
        window.location.href = this.downloadUrl;
      }
    },
  },
  mounted() {
    document.documentElement.setAttribute('data-theme', 'dark');
    this.checkAppVersion();
  }
}
</script>

<style scoped>
.tab-bar a {
  text-decoration: none;
}

.update-overlay {
  position: fixed;
  inset: 0;
  background: var(--overlay-dark);
  z-index: 9999;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 24px;
}

.update-card {
  width: 100%;
  max-width: 332px;
  background: rgba(28, 28, 28, 0.84);
  border-radius: 24px;
  padding: 22px;
  text-align: center;
  border: 1px solid rgba(255, 255, 255, 0.1);
  box-shadow: var(--shadow-card);
  backdrop-filter: blur(20px);
  -webkit-backdrop-filter: blur(20px);
}

.update-card h3 {
  margin: 0 0 10px;
  font-size: 22px;
  font-weight: 800;
  font-family: var(--font-brand);
  color: var(--primary);
}

.update-card p {
  margin: 0 0 10px;
  color: var(--text-secondary);
  font-size: 14px;
}

.update-version {
  font-size: 12px !important;
  color: var(--text-muted) !important;
}

.update-btn {
  width: 100%;
  border: none;
  border-radius: 14px;
  background: var(--gold-gradient);
  color: var(--secondary-color);
  font-weight: 700;
  padding: 13px 12px;
  box-shadow: var(--shadow-btn);
  transition: transform 0.2s ease, box-shadow 0.2s ease, filter 0.2s ease;
}

.update-btn:active {
  transform: scale(0.97);
  box-shadow: 0 8px 20px rgba(202, 253, 0, 0.2);
}

.tab-item .tab-icon {
  filter: var(--icon-filter-tab);
  transition: filter 0.25s ease, transform 0.25s ease;
}

.tab-item.active .tab-icon {
  filter: var(--icon-filter-tab-active);
  transform: translateY(-1px) scale(1.03);
}

.tab-item.center-tab.active .tab-icon {
  filter: var(--icon-filter-on-gold);
  transform: none;
  opacity: 0.9;
}
</style>
