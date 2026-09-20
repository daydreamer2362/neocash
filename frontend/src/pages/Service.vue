<template>
  <div class="page-no-tab">
    <div class="nav-bar">
      <button class="back-btn" @click="$router.back()"><img src="/icons/back.png" /></button>
      <span class="nav-title">Support</span>
    </div>

    <div class="service-list">
      <button class="service-item card" type="button" @click="openTelegramSupport">
        <div class="service-info">
          <div class="service-name text-green">Official Support</div>
          <div class="service-desc">{{ hasTelegramLink ? 'Tap to chat with us on Telegram' : 'Telegram support not configured yet' }}</div>
          <div class="service-email">{{ hasTelegramLink ? telegramDisplayText : 'Unavailable' }}</div>
        </div>
      </button>
    </div>
  </div>
</template>

<script>
import { toast } from '../utils/toast'

export default {
  name: 'ServicePage',
  data() {
    return {
      telegramUrl: '',
    };
  },
  computed: {
    hasTelegramLink() {
      return Boolean(this.telegramUrl);
    },
    telegramDisplayText() {
      if (!this.telegramUrl) return '';
      try {
        const parsed = new URL(this.telegramUrl);
        return parsed.hostname + parsed.pathname;
      } catch (e) {
        return this.telegramUrl;
      }
    },
  },
  methods: {
    normalizeTelegramUrl(value) {
      const raw = String(value || '').trim();
      if (!raw) return '';

      if (/^https?:\/\//i.test(raw)) return raw;

      if (/^@/.test(raw)) {
        return `https://t.me/${raw.slice(1)}`;
      }

      if (/^(t\.me|telegram\.me)\//i.test(raw)) {
        return `https://${raw}`;
      }

      if (/^[A-Za-z0-9_]{5,32}$/.test(raw)) {
        return `https://t.me/${raw}`;
      }

      return '';
    },
    async fetchSupportData() {
      try {
        const res = await this.$api.appApi.getOfficialServiceData();
        const telegramRaw = String(res?.data?.telegram || '').trim();
        this.telegramUrl = this.normalizeTelegramUrl(telegramRaw);
      } catch (e) {
        this.telegramUrl = '';
      }
    },
    openTelegramSupport() {
      if (!this.telegramUrl) {
        toast.show({ title: 'Telegram support link is not available yet', icon: 'error' });
        return;
      }
      window.open(this.telegramUrl, '_blank');
    },
  },
  mounted() {
    this.fetchSupportData();
  },
}
</script>

<style scoped>
.service-list { padding: 0 16px; }
.service-item {
  display: flex; align-items: center;
  padding: 16px;
  margin-top: 14px;
  width: 100%;
  text-align: left;
  border: 1px solid var(--border-light);
  cursor: pointer;
}
.service-info { flex: 1; }
.service-name { font-size: 16px; font-weight: 700; }
.service-desc { font-size: 13px; color: var(--text-secondary); margin-top: 2px; }
.service-email {
  margin-top: 8px;
  font-size: 14px;
  color: var(--primary);
  font-weight: 600;
}
</style>
