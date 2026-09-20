<template>
  <div class="page-no-tab">
    <div class="nav-bar">
      <button class="back-btn" @click="$router.back()"><img src="/icons/back.png" /></button>
      <span class="nav-title">Team Level</span>
    </div>

    <div class="filter-tabs">
      <button class="filter-tab" :class="{ active: activeLevel === 'B' }" @click="activeLevel = 'B'">Level B</button>
      <button class="filter-tab" :class="{ active: activeLevel === 'C' }" @click="activeLevel = 'C'">Level C</button>
    </div>

    <div class="card level-summary">
      <div class="ls-row">
        <span class="ls-label">Total Members</span>
        <span class="ls-value">{{ activeLevel === 'B' ? (stats.level1Size || 0) : (stats.level2Size || 0) }}</span>
      </div>
      <div class="ls-row">
        <span class="ls-label">Total USDT</span>
        <span class="ls-value text-green"><img src="/icons/usdt.png" class="usdt-icon-inline" /> {{ activeLevel === 'B' ? (stats.level1Deposit || 0) : (stats.level2Deposit || 0) }}</span>
      </div>
      <div class="ls-row">
        <span class="ls-label">Total Commission</span>
        <span class="ls-value text-green">₹ {{ activeLevel === 'B' ? (stats.level1Commission || 0) : (stats.level2Commission || 0) }}</span>
      </div>
    </div>

    <div class="card">
      <h3 class="section-title">Members</h3>
      <div class="member-list" v-if="pageState.list.length > 0">
        <div class="member-item" v-for="(m, i) in pageState.list" :key="i">
          <div class="mi-left">
            <div class="mi-id">ID: {{ shortUserId(m.userId || m.id) }}</div>
            <div class="mi-date text-muted text-sm">Joined: {{ formatDate(m.createTime) }}</div>
          </div>
          <div class="mi-right"><img src="/icons/usdt.png" class="usdt-icon-inline" /> {{ formatMoney(m.deposit || m.rechargeAmount || 0) }}</div>
        </div>
        <div class="load-more" @click="loadMoreAction" v-if="!pageState.finished">{{ pageState.loading ? 'Loading...' : 'Load More' }}</div>
      </div>
      <div class="no-data" v-else>No members found.</div>
    </div>
  </div>
</template>

<script>
import { formatMoney, formatDate } from '../utils/helpers'

export default {
  name: 'TeamLevelPage',
  data() {
    return {
      activeLevel: 'B',
      stats: {},
      pageState: {
        list: [],
        page: 1,
        size: 20,
        loading: false,
        finished: false
      }
    }
  },
  setup() {
    return { formatMoney, formatDate };
  },
  methods: {
    shortUserId(value) {
      if (!value) return '--';
      return String(value).slice(0, 6);
    },
    async fetchStats() {
      try {
        const res = await this.$api.teamApi.teamDetails();
        if (res.data) this.stats = res.data;
      } catch (e) {}
    },
    async refreshAction() {
      this.pageState.list = [];
      this.pageState.page = 1;
      this.pageState.finished = false;
      await this.loadMoreAction();
    },
    async loadMoreAction() {
      if (this.pageState.loading || this.pageState.finished) return;
      this.pageState.loading = true;
      try {
        const level = this.activeLevel === 'C' ? 2 : 1;
        const res = await this.$api.teamApi.subMembers({
          level,
          page: this.pageState.page,
          size: this.pageState.size
        });
        const items = Array.isArray(res?.data) ? res.data : (res?.data?.records || []);
        this.pageState.list.push(...items);
        this.pageState.finished = items.length < this.pageState.size;
        this.pageState.page += 1;
      } catch (e) {
        this.pageState.finished = true;
      } finally {
        this.pageState.loading = false;
      }
    }
  },
  watch: {
    activeLevel() {
      this.refreshAction();
    }
  },
  mounted() {
    this.fetchStats();
    this.refreshAction();
  }
}
</script>

<style scoped>
.level-summary { }
.ls-row { display: flex; justify-content: space-between; padding: 10px 0; border-bottom: 1px solid var(--border-light); }
.ls-row:last-child { border-bottom: none; }
.ls-label { font-size: 14px; color: var(--text-secondary); }
.ls-value { font-size: 16px; font-weight: 700; }
.section-title { font-size: 16px; font-weight: 700; margin-bottom: 12px; }
.member-list { display: flex; flex-direction: column; }
.member-item { display: flex; justify-content: space-between; align-items: center; padding: 12px 0; border-bottom: 1px solid var(--border-light); }
.member-item:last-child { border-bottom: none; }
.mi-id { font-size: 14px; font-weight: 600; }
.mi-right { font-size: 15px; font-weight: 700; color: var(--primary); }
.load-more { text-align: center; padding: 16px; color: var(--primary); font-size: 14px; cursor: pointer; }
.no-data { text-align: center; padding: 32px 16px; color: var(--text-muted); font-size: 14px; }
</style>
