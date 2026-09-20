<template>
  <div class="page-no-tab">
    <div class="nav-bar">
      <button class="back-btn" @click="$router.back()"><img src="/icons/back.png" /></button>
      <span class="nav-title">Message</span>
    </div>
    <div class="message-list" v-if="messages.length > 0">
      <div class="message-item card" v-for="(m, i) in messages" :key="i">
        <div class="msg-title">{{ m.title }}</div>
        <div class="msg-date">{{ m.createTime || m.date }}</div>
        <div class="msg-content">{{ m.content }}</div>
      </div>
    </div>
    <div class="no-data" v-else>No messages yet</div>
  </div>
</template>

<script>
export default { 
  name: 'MessagePage',
  data() { return { messages: [] } },
  methods: {
    async fetchMessages() {
      try {
        const res = await this.$api.homeApi.notice();
        const list = Array.isArray(res?.data) ? res.data : (res?.data ? [res.data] : []);
        this.messages = list.filter((item) => {
          const id = String(item?.id || '').toLowerCase();
          const title = String(item?.title || '').toLowerCase();
          const content = String(item?.content || '').toLowerCase();
          const isLegacyWelcome = (text) => /^welcome to .*pay/.test(text);
          const isWelcomeNotice =
            id === 'system-welcome' ||
            isLegacyWelcome(title) ||
            isLegacyWelcome(content);
          return !isWelcomeNotice;
        });
      } catch (e) {}
    }
  },
  mounted() { this.fetchMessages(); }
}
</script>

<style scoped>
.message-list { padding: 16px; }
.message-item { margin-bottom: 12px; }
.msg-title { font-size: 16px; font-weight: 700; margin-bottom: 4px; }
.msg-date { font-size: 11px; color: var(--text-muted); margin-bottom: 8px; }
.msg-content { font-size: 14px; color: var(--text-secondary); line-height: 1.5; }
</style>
