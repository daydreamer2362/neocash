<template>
  <div class="page-no-tab team-page">
    <div class="nav-bar">
      <button class="back-btn" @click="$router.back()"><img src="/icons/back.png" /></button>
      <span class="nav-title">Team</span>
    </div>

    <section class="team-hero panel-glass n-watermark">
      <p class="team-hero-label">My Total Commissions</p>
      <h1 class="team-hero-value">+{{ num(stats.totalCommission) }}</h1>
      <p class="team-hero-sub">Keep your network active. Daily consistency drives long-term growth.</p>
    </section>

    <section class="kpi-grid">
      <article class="kpi-card panel-glass">
        <span class="kpi-label">Commissions Yesterday</span>
        <span class="kpi-value">+{{ num(stats.yesterdayCommission) }}</span>
      </article>
      <article class="kpi-card panel-glass">
        <span class="kpi-label">Total Team Members</span>
        <span class="kpi-value">+{{ num(stats.size) }}</span>
      </article>
      <article class="kpi-card panel-glass">
        <span class="kpi-label">Commissions Today</span>
        <span class="kpi-value">+{{ num(stats.todayCommission) }}</span>
      </article>
      <article class="kpi-card panel-glass">
        <span class="kpi-label">Total Team USDT</span>
        <span class="kpi-value">+{{ num(stats.totalTeamDeposit) }}</span>
      </article>
    </section>

    <section class="invite-card panel-glass n-watermark">
      <div class="invite-head">
        <h3>Invitation</h3>
        <button class="invite-copy-btn" @click="copyInvite" type="button">Copy</button>
      </div>
      <div class="invite-code-row">
        <span class="invite-code">{{ inviteCode || '--' }}</span>
        <img src="/icons/copy.png" class="copy-sm-white" @click="copyInvite" />
      </div>
      <div class="invite-url">{{ displayInviteUrl || '-' }}</div>
    </section>

    <section class="members-card panel-glass n-watermark">
      <h3 class="members-title">New Team Members</h3>
      <div class="members-grid">
        <div class="member-col panel-glass">
          <div class="level-name">Level.B</div>
          <div class="member-row"><span>Today</span><strong>{{ num(stats.todaySize1) }}</strong></div>
          <div class="member-row"><span>Yesterday</span><strong>{{ num(stats.yesterdaySize1) }}</strong></div>
        </div>
        <div class="member-col panel-glass">
          <div class="level-name">Level.C</div>
          <div class="member-row"><span>Today</span><strong>{{ num(stats.todaySize2) }}</strong></div>
          <div class="member-row"><span>Yesterday</span><strong>{{ num(stats.yesterdaySize2) }}</strong></div>
        </div>
      </div>
    </section>

    <section class="share-card panel-glass n-watermark">
      <h3 class="share-title">Share Invite</h3>
      <div class="share-grid">
        <button class="share-item" @click="shareInvite('facebook')" type="button">
          <div class="share-icon share-icon-facebook">f</div>
          <span>Facebook</span>
        </button>
        <button class="share-item" @click="shareInvite('whatsapp')" type="button">
          <div class="share-icon share-icon-whatsapp">W</div>
          <span>Whatsapp</span>
        </button>
        <button class="share-item" @click="copyInvite" type="button">
          <div class="share-icon share-icon-link">🔗</div>
          <span>Copy link</span>
        </button>
      </div>
    </section>

    <section class="comm-deposit-card panel-glass n-watermark">
      <div class="cd-title">Commissions / USDT</div>
      <div class="cd-rate">Rate: Team B {{ num(stats.levelBRatePercent) }}% | Team C {{ num(stats.levelCRatePercent) }}%</div>
      <div class="cd-row"><span class="cd-level">Level.B</span><span>{{ num(stats.level1Commission) }}/{{ num(stats.level1Deposit) }}</span></div>
      <div class="cd-row"><span class="cd-level">Level.C</span><span>{{ num(stats.level2Commission) }}/{{ num(stats.level2Deposit) }}</span></div>
      <a class="cd-link" @click="$router.push('/team-level')">View details</a>
    </section>

    <section class="perf-card panel-glass n-watermark">
      <div class="perf-header">
        <h3>Performance</h3>
        <div class="perf-tabs">
          <button class="perf-tab" :class="{ active: perfTab === 'day' }" @click="perfTab = 'day'" type="button">Day</button>
          <button class="perf-tab" :class="{ active: perfTab === 'week' }" @click="perfTab = 'week'" type="button">Week</button>
          <button class="perf-tab" :class="{ active: perfTab === 'month' }" @click="perfTab = 'month'" type="button">Month</button>
        </div>
      </div>

      <div class="perf-legend">
        <span><i class="legend-dot dot-commission"></i>Commission</span>
        <span><i class="legend-dot dot-deposit"></i>USDT</span>
      </div>

      <div class="perf-chart-wrap">
        <svg class="perf-svg" viewBox="0 0 320 170" preserveAspectRatio="none">
          <defs>
            <linearGradient id="teamAreaA" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stop-color="rgba(79, 140, 255, 0.45)" />
              <stop offset="100%" stop-color="rgba(79, 140, 255, 0.02)" />
            </linearGradient>
            <linearGradient id="teamAreaB" x1="0%" y1="0%" x2="0%" y2="100%">
              <stop offset="0%" stop-color="rgba(108, 194, 223, 0.36)" />
              <stop offset="100%" stop-color="rgba(108, 194, 223, 0.02)" />
            </linearGradient>
          </defs>

          <g class="grid-lines">
            <line v-for="y in [20, 48, 76, 104, 132]" :key="y" x1="0" :y1="y" x2="320" :y2="y" />
          </g>

          <path class="area-b" :d="perfAreaPathB"></path>
          <path class="area-a" :d="perfAreaPathA"></path>

          <polyline class="line-b" :points="perfPointsBString"></polyline>
          <polyline class="line-a" :points="perfPointsAString"></polyline>

          <g>
            <circle v-for="(p, i) in perfPointsA" :key="'a-' + i" class="point-a" :cx="p.x" :cy="p.y" r="2.8" />
            <circle v-for="(p, i) in perfPointsB" :key="'b-' + i" class="point-b" :cx="p.x" :cy="p.y" r="2.8" />
          </g>
        </svg>
      </div>

      <div class="perf-axis-labels" :style="{ gridTemplateColumns: `repeat(${performanceData.labels.length}, minmax(0, 1fr))` }">
        <span v-for="(label, i) in performanceData.labels" :key="i">{{ label }}</span>
      </div>
    </section>
  </div>
</template>

<script>
import { toast } from '../utils/toast'

export default {
  name: 'TeamPage',
  computed: {
    inviteBaseUrl() {
      if (typeof window === 'undefined' || !window.location) return '';
      const host = String(window.location.hostname || '').toLowerCase();
      if (host === 'neocash.online' || host === 'www.neocash.online') {
        return `https://${host}`;
      }
      return String(window.location.origin || '').replace(/\/$/, '');
    },
    displayInviteUrl() {
      const code = String(this.inviteCode || '').trim();
      if (code) return `${this.inviteBaseUrl}/register?invite=${encodeURIComponent(code)}`;
      return '';
    },
    performanceData() {
      const labelsByTab = {
        day: ['06', '09', '12', '15', '18', '21', '24'],
        week: ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun'],
        month: ['W1', 'W2', 'W3', 'W4', 'W5', 'W6']
      };
      const labels = labelsByTab[this.perfTab] || labelsByTab.month;

      const todayC = this.num(this.stats.todayCommission);
      const yestC = this.num(this.stats.yesterdayCommission);
      const totalC = this.num(this.stats.totalCommission);
      const todayD = this.num(this.stats.todayRecharge);
      const lv1C = this.num(this.stats.level1Commission);
      const lv2C = this.num(this.stats.level2Commission);
      const lv1D = this.num(this.stats.level1Deposit);
      const lv2D = this.num(this.stats.level2Deposit);

      let commission = [];
      let deposit = [];

      if (this.perfTab === 'day') {
        commission = [yestC * 0.22, yestC * 0.36, yestC * 0.5, todayC * 0.42, todayC * 0.68, todayC, todayC * 0.84];
        deposit = [todayD * 0.16, todayD * 0.27, todayD * 0.38, todayD * 0.52, todayD * 0.73, todayD, todayD * 0.88];
      } else if (this.perfTab === 'week') {
        commission = [totalC * 0.07, totalC * 0.1, lv1C * 0.8, lv1C, lv2C * 0.75, lv2C, todayC];
        deposit = [todayD * 0.5, todayD * 0.65, lv1D * 0.62, lv1D * 0.82, lv2D * 0.6, lv2D, todayD];
      } else {
        commission = [totalC * 0.2, totalC * 0.36, lv1C, totalC * 0.52, lv2C, totalC * 0.72];
        deposit = [todayD * 0.32, lv1D * 0.55, todayD * 0.68, lv2D * 0.7, todayD * 0.88, todayD];
      }

      return {
        labels,
        commission: this.withFallbackSeries(commission, labels.length, [9, 12, 16, 14, 19, 24, 21]),
        deposit: this.withFallbackSeries(deposit, labels.length, [7, 10, 11, 13, 16, 18, 17])
      };
    },
    perfMax() {
      const all = [...this.performanceData.commission, ...this.performanceData.deposit];
      const peak = Math.max(1, ...all);
      return peak * 1.15;
    },
    perfPointsA() {
      return this.mapSeriesToPoints(this.performanceData.commission);
    },
    perfPointsB() {
      return this.mapSeriesToPoints(this.performanceData.deposit);
    },
    perfPointsAString() {
      return this.perfPointsA.map((p) => `${p.x},${p.y}`).join(' ');
    },
    perfPointsBString() {
      return this.perfPointsB.map((p) => `${p.x},${p.y}`).join(' ');
    },
    perfAreaPathA() {
      return this.buildAreaPath(this.perfPointsA);
    },
    perfAreaPathB() {
      return this.buildAreaPath(this.perfPointsB);
    }
  },
  data() {
    return {
      perfTab: 'month',
      stats: {},
      inviteCode: '',
      inviteUrl: ''
    }
  },
  methods: {
    num(value) {
      const n = Number(value || 0);
      return Number.isFinite(n) ? n : 0;
    },
    withFallbackSeries(series, length, fallback) {
      const normalized = Array.from({ length }, (_, i) => {
        const n = Number(series[i] || 0);
        return Number.isFinite(n) ? Math.max(0, n) : 0;
      });
      if (normalized.some((v) => v > 0)) return normalized;
      return fallback.slice(0, length);
    },
    mapSeriesToPoints(values) {
      const width = 320;
      const chartTop = 18;
      const chartBottom = 132;
      const chartHeight = chartBottom - chartTop;
      const len = values.length;
      if (!len) return [];
      if (len === 1) {
        const y = chartBottom - ((values[0] / this.perfMax) * chartHeight);
        return [{ x: width / 2, y }];
      }
      const step = width / (len - 1);
      return values.map((v, i) => {
        const y = chartBottom - ((v / this.perfMax) * chartHeight);
        return { x: i * step, y: Number.isFinite(y) ? y : chartBottom };
      });
    },
    buildAreaPath(points) {
      if (!points.length) return '';
      const chartBottom = 132;
      const first = points[0];
      const last = points[points.length - 1];
      const linePart = points.map((p) => `L ${p.x} ${p.y}`).join(' ');
      return `M ${first.x} ${chartBottom} ${linePart} L ${last.x} ${chartBottom} Z`;
    },
    async fetchTeam() {
      try {
        const res = await this.$api.teamApi.teamDetails();
        if (res.data) {
          this.stats = res.data;
          this.inviteCode = res.data.inviteCode || this.inviteCode;
          this.inviteUrl = res.data.inviteUrl || this.inviteUrl;
        }
      } catch (e) {}
    },
    async fetchInvite() {
      try {
        const res = await this.$api.myApi.person();
        if (res.data) {
          this.inviteCode = res.data.inviteCode || this.inviteCode;
          this.inviteUrl = res.data.inviteUrl || this.inviteUrl;
        }
      } catch (e) {}
    },
    copyInvite() {
      if (!this.displayInviteUrl && !this.inviteCode) return;
      navigator.clipboard.writeText(this.displayInviteUrl || this.inviteCode);
      toast.show({ title: 'Copied successfully', icon: 'success' });
    },
    shareInvite(platform) {
      const link = this.displayInviteUrl;
      if (!link) {
        toast.show({ title: 'Invite link is not ready yet', icon: 'error' });
        return;
      }
      const text = `Join NeoCash with my invite link: ${link}`;
      const encodedText = encodeURIComponent(text);
      const encodedLink = encodeURIComponent(link);

      if (platform === 'whatsapp') {
        window.open(`https://wa.me/?text=${encodedText}`, '_blank');
        return;
      }
      if (platform === 'facebook') {
        window.open(`https://www.facebook.com/sharer/sharer.php?u=${encodedLink}`, '_blank');
      }
    }
  },
  mounted() {
    this.fetchTeam();
    this.fetchInvite();
  }
}
</script>

<style scoped>
.team-page {
  --team-accent: #4f8cff;
  --team-accent-soft: rgba(79, 140, 255, 0.18);
  --team-accent-faint: rgba(79, 140, 255, 0.1);
  --team-glass: rgba(255, 255, 255, 0.04);
  --team-glass-strong: rgba(255, 255, 255, 0.06);
  --team-border: rgba(255, 255, 255, 0.1);
  --team-shadow: 0 16px 34px rgba(0, 0, 0, 0.3);
  position: relative;
}

.team-page::before {
  content: '';
  position: absolute;
  inset: 0 0 auto;
  height: 300px;
  background:
    radial-gradient(62% 42% at 82% 2%, rgba(79, 140, 255, 0.13) 0%, rgba(79, 140, 255, 0) 74%),
    radial-gradient(44% 26% at 14% 14%, rgba(93, 212, 244, 0.08) 0%, rgba(93, 212, 244, 0) 76%);
  pointer-events: none;
  z-index: 0;
}

.nav-bar,
.team-hero,
.kpi-grid,
.invite-card,
.members-card,
.share-card,
.comm-deposit-card,
.perf-card {
  position: relative;
  z-index: 1;
}

.panel-glass {
  background: linear-gradient(165deg, var(--team-glass-strong) 0%, var(--team-glass) 70%, rgba(255, 255, 255, 0.02) 100%);
  border: 1px solid var(--team-border);
  border-radius: 20px;
  box-shadow: var(--team-shadow);
  backdrop-filter: blur(18px);
  -webkit-backdrop-filter: blur(18px);
}

.n-watermark {
  position: relative;
  overflow: hidden;
}

.n-watermark::after {
  content: 'N';
  position: absolute;
  right: -10px;
  bottom: -16px;
  font-size: 64px;
  font-weight: 800;
  line-height: 1;
  letter-spacing: -0.02em;
  font-family: var(--font-brand);
  color: rgba(79, 140, 255, 0.08);
  transform: rotate(-14deg);
  transform-origin: bottom right;
  pointer-events: none;
}

.n-watermark-soft::after {
  color: rgba(79, 140, 255, 0.06);
}

.team-hero {
  margin: 0 16px 12px;
  border-radius: 26px;
  padding: 16px;
}

.team-hero-label {
  font-size: 10px;
  letter-spacing: 0.12em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.56);
  font-family: var(--font-label);
}

.team-hero-value {
  margin-top: 4px;
  font-size: clamp(34px, 9vw, 48px);
  line-height: 1.04;
  letter-spacing: -0.02em;
  color: rgba(255, 255, 255, 0.95);
}

.team-hero-sub {
  margin-top: 8px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.66);
  line-height: 1.4;
}

.kpi-grid {
  margin: 0 16px 12px;
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.kpi-card {
  border-radius: 14px;
  padding: 11px;
}

.kpi-label {
  display: block;
  font-size: 10px;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  color: rgba(255, 255, 255, 0.58);
  font-family: var(--font-label);
}

.kpi-value {
  display: block;
  margin-top: 6px;
  font-size: 24px;
  line-height: 1.05;
  font-weight: 800;
  letter-spacing: -0.01em;
  color: rgba(234, 241, 209, 0.95);
}

.invite-card,
.members-card,
.share-card,
.comm-deposit-card,
.perf-card {
  margin: 0 16px 12px;
  padding: 14px;
  border-radius: 22px;
}

.invite-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.invite-head h3 {
  font-size: 17px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.94);
  font-family: var(--font-brand);
}

.invite-copy-btn {
  border: none;
  border-radius: 999px;
  padding: 6px 11px;
  background: linear-gradient(145deg, #4f8cff 0%, #2e6ae6 100%);
  color: #d0e4ff;
  font-size: 10px;
  font-weight: 800;
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-family: var(--font-label);
}

.invite-code-row {
  margin-top: 8px;
  display: flex;
  align-items: center;
  justify-content: space-between;
}

.invite-code {
  font-size: 20px;
  font-weight: 800;
  letter-spacing: 0.02em;
}

.invite-url {
  margin-top: 8px;
  font-size: 11px;
  color: rgba(255, 255, 255, 0.68);
  line-height: 1.35;
  word-break: break-all;
}

.copy-sm-white {
  width: 16px;
  height: 16px;
  filter: var(--icon-filter-back);
  cursor: pointer;
}

.members-title,
.share-title {
  font-size: 17px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.94);
  font-family: var(--font-brand);
  margin-bottom: 10px;
}

.members-grid {
  display: grid;
  grid-template-columns: repeat(2, minmax(0, 1fr));
  gap: 10px;
}

.member-col {
  padding: 10px;
  border-radius: 14px;
}

.level-name {
  font-size: 16px;
  font-weight: 800;
  color: rgba(203, 219, 158, 0.95);
  margin-bottom: 8px;
}

.member-row {
  display: flex;
  justify-content: space-between;
  font-size: 12px;
  padding: 2px 0;
  color: rgba(255, 255, 255, 0.72);
}

.member-row strong {
  color: rgba(235, 242, 212, 0.95);
}

.share-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 10px;
}

.share-item {
  border: none;
  background: rgba(255, 255, 255, 0.04);
  border-radius: 14px;
  padding: 10px 6px;
  display: flex;
  flex-direction: column;
  align-items: center;
  gap: 8px;
}

.share-icon {
  width: 40px;
  height: 40px;
  border-radius: 50%;
  display: flex;
  align-items: center;
  justify-content: center;
  color: var(--light-app-bg);
  font-size: 18px;
  font-weight: 700;
}

.share-icon-facebook { background: linear-gradient(145deg, #4f8cff 0%, #2e6ae6 100%); }
.share-icon-whatsapp { background: linear-gradient(145deg, #5bbd8f 0%, #4ca77e 100%); }
.share-icon-link { background: linear-gradient(145deg, #7ac1e3 0%, #62a9cc 100%); color: #0f1a1f; }

.share-item span {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.78);
  text-transform: uppercase;
  letter-spacing: 0.07em;
  font-family: var(--font-label);
  font-weight: 700;
}

.cd-title {
  font-size: 17px;
  font-weight: 700;
  margin-bottom: 8px;
  color: rgba(255, 255, 255, 0.94);
  font-family: var(--font-brand);
}

.cd-rate {
  font-size: 11px;
  color: rgba(255, 255, 255, 0.62);
  margin-bottom: 8px;
  letter-spacing: 0.06em;
  text-transform: uppercase;
  font-family: var(--font-label);
}

.cd-row {
  display: flex;
  justify-content: space-between;
  font-size: 13px;
  padding: 4px 0;
}

.cd-level {
  font-weight: 700;
  color: rgba(203, 219, 158, 0.95);
}

.cd-link {
  margin-top: 8px;
  font-size: 12px;
  color: rgba(255, 255, 255, 0.8);
  text-decoration: underline;
  cursor: pointer;
  display: inline-block;
}

.perf-header {
  display: flex;
  justify-content: space-between;
  align-items: center;
  gap: 10px;
  margin-bottom: 10px;
}

.perf-header h3 {
  font-size: 18px;
  font-weight: 700;
  color: rgba(255, 255, 255, 0.94);
  font-family: var(--font-brand);
}

.perf-tabs {
  display: flex;
  border: 1px solid rgba(255, 255, 255, 0.14);
  border-radius: 999px;
  overflow: hidden;
}

.perf-tab {
  padding: 6px 12px;
  font-size: 10px;
  border: none;
  background: transparent;
  color: rgba(255, 255, 255, 0.64);
  letter-spacing: 0.08em;
  text-transform: uppercase;
  font-family: var(--font-label);
  font-weight: 700;
}

.perf-tab.active {
  background: linear-gradient(145deg, #4f8cff 0%, #2e6ae6 100%);
  color: #d0e4ff;
}

.perf-legend {
  display: flex;
  gap: 12px;
  margin-bottom: 8px;
}

.perf-legend span {
  font-size: 10px;
  text-transform: uppercase;
  letter-spacing: 0.07em;
  font-family: var(--font-label);
  color: rgba(255, 255, 255, 0.64);
  display: inline-flex;
  align-items: center;
  gap: 6px;
}

.legend-dot {
  width: 8px;
  height: 8px;
  border-radius: 50%;
  display: inline-block;
}

.dot-commission { background: #4f8cff; }
.dot-deposit { background: #5dd4f4; }

.perf-chart-wrap {
  height: 170px;
  border-radius: 14px;
  background: rgba(255, 255, 255, 0.02);
  border: 1px solid rgba(255, 255, 255, 0.08);
  padding: 8px 8px 0;
}

.perf-svg {
  width: 100%;
  height: 145px;
}

.grid-lines line {
  stroke: rgba(255, 255, 255, 0.08);
  stroke-width: 1;
  stroke-dasharray: 3 3;
}

.area-a { fill: url(#teamAreaA); }
.area-b { fill: url(#teamAreaB); }

.line-a {
  fill: none;
  stroke: #4f8cff;
  stroke-width: 2.2;
}

.line-b {
  fill: none;
  stroke: #5dd4f4;
  stroke-width: 2.2;
}

.point-a { fill: #7aaaff; }
.point-b { fill: #8ae0f7; }

.perf-axis-labels {
  margin-top: 6px;
  display: grid;
  grid-template-columns: repeat(7, minmax(0, 1fr));
  gap: 4px;
}

.perf-axis-labels span {
  font-size: 10px;
  color: rgba(255, 255, 255, 0.5);
  text-align: center;
  font-family: var(--font-label);
  letter-spacing: 0.05em;
  text-transform: uppercase;
}

@media (max-width: 420px) {
  .members-grid,
  .kpi-grid {
    grid-template-columns: 1fr;
  }

  .share-grid {
    grid-template-columns: repeat(3, minmax(0, 1fr));
  }
}

@media (max-width: 380px) {
  .team-hero,
  .kpi-grid,
  .invite-card,
  .members-card,
  .share-card,
  .comm-deposit-card,
  .perf-card {
    margin-left: 12px;
    margin-right: 12px;
  }

}
</style>
