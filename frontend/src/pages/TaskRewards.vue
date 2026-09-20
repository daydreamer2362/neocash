<template>
  <div class="page-no-tab">
    <div class="nav-bar">
      <button class="back-btn" @click="$router.back()"><img src="/icons/back.png" /></button>
      <span class="nav-title">Task Rewards</span>
    </div>
    <div class="subtitle">Earn tokens by completing tasks</div>

    <div class="filter-tabs" style="margin-top: 12px;">
      <button class="filter-tab" :class="{ active: activeTab === 'newbie' }" @click="activeTab = 'newbie'">Newbie Tasks</button>
      <button class="filter-tab" :class="{ active: activeTab === 'team' }" @click="activeTab = 'team'">Team Growth</button>
      <button class="filter-tab" :class="{ active: activeTab === 'daily' }" @click="activeTab = 'daily'">Daily Tasks</button>
    </div>

    <div class="fade-in">
      <div class="card task-card" v-for="(task, i) in visibleTasks" :key="task.id || i">
        <div class="task-header">
          <span class="task-badge" :style="{ color: task.badgeColor }">•{{ task.badge }}</span>
          <div class="task-progress-row">
            <div class="progress-bar"><div class="progress-fill" :style="{ width: task.progress + '%' }"></div></div>
            <span class="progress-text">{{ task.current }} / {{ task.total }}</span>
          </div>
        </div>
        <h3 class="task-title">{{ task.title }}</h3>
        <p class="task-desc">{{ task.desc }}</p>
        <div class="task-footer">
          <div class="reward-row"><img src="/icons/star.png" class="star-icon" /> <span>{{ task.reward }}</span></div>
          <button v-if="task.claimable" class="btn-small" @click="claimTask(task)">Claim</button>
          <span v-else class="status-pill" :class="'status-' + task.status.toLowerCase().replace(' ', '')">{{ task.status }}</span>
        </div>
        <div v-if="task.showRules" class="task-rules">
          <a class="link-text" @click="task.rulesOpen = !task.rulesOpen">Check Task Rules {{ task.rulesOpen ? '▲' : '▼' }}</a>
          <div v-if="task.rulesOpen" class="rules-table">
            <div class="rules-header">
              <span>Daily Purchase and Sale Token Amount</span>
            </div>
            <div class="rules-row">
              <span class="rules-label">Amount</span>
              <span>5000</span><span>10000</span><span>20000</span>
            </div>
            <div class="rules-row">
              <span class="rules-label">Bonus</span>
              <span>50</span><span>111</span><span>128</span>
            </div>
          </div>
        </div>
      </div>
      <div v-if="!visibleTasks.length" class="card task-card empty-card">
        <p class="task-desc">No tasks available in this section right now.</p>
      </div>
    </div>
  </div>
</template>

<script>
import { missionApi } from '../api'
import { toast } from '../utils/toast'

export default {
  name: 'TaskRewardsPage',
  data() {
    return {
      activeTab: 'newbie',
      allTasks: []
    }
  },
  computed: {
    visibleTasks() {
      return this.allTasks.filter((task) => task.uiTab === this.activeTab)
    }
  },
  methods: {
    resolveTab(taskType) {
      const value = String(taskType || '').toLowerCase()
      if (value === 'newbie_tasks' || value === 'newbie') return 'newbie'
      if (value === 'invite_tasks' || value === 'team_growth' || value === 'team') return 'team'
      return 'daily'
    },
    resolveBadge(uiTab) {
      if (uiTab === 'newbie') return { text: 'NEWBIE', color: 'var(--accent-gold)' }
      if (uiTab === 'team') return { text: 'INVITE', color: 'var(--tertiary-accent)' }
      return { text: 'ONGOING', color: 'var(--accent-gold)' }
    },
    normalizeTaskStatus(task) {
      if (task.claimed) return 'Succeed'
      if (task.claimable) return 'In Progress'
      return 'Unfinished'
    },
    async fetchTasks() {
      try {
        const res = await missionApi.task()
        const taskList = Array.isArray(res?.data) ? res.data : (res?.data?.records || [])
        this.allTasks = taskList.map((t) => {
          const uiTab = this.resolveTab(t.taskType)
          const badge = this.resolveBadge(uiTab)
          const current = Number(t.currentNum || t.current || 0)
          const total = Math.max(1, Number(t.totalNum || t.targetValue || 1))
          const claimable = Boolean(t.claimable) || (Number(t.status) === 1 && current >= total)
          const claimed = Boolean(t.claimed) || Number(t.status) === 2 || Number(t.status) === 3

          return {
            ...t,
            uiTab,
            badge: badge.text,
            badgeColor: badge.color,
            title: t.name || t.title || 'Task',
            desc: t.content || t.description || '',
            reward: Number(t.commission || t.reward || t.rewardValue || 0),
            current,
            total,
            progress: Number(t.progress) || ((current / total) * 100) || 0,
            claimed,
            claimable: claimable && !claimed,
            status: this.normalizeTaskStatus({ claimable, claimed }),
            showRules: false,
            rulesOpen: false
          }
        })
      } catch (e) {
        this.allTasks = []
      }
    },
    async claimTask(task) {
      if (!task?.id) return
      try {
        await missionApi.receive(task.id)
        toast.show({ title: 'Task reward claimed', icon: 'success' })
        this.fetchTasks()
      } catch (e) {}
    }
  },
  mounted() {
    this.fetchTasks()
  }
}
</script>

<style scoped>
.subtitle { text-align: center; font-size: 14px; color: var(--text-muted); margin-bottom: 8px; }
.task-card { margin-bottom: 12px; }
.task-header { display: flex; justify-content: space-between; align-items: center; margin-bottom: 8px; }
.task-badge { font-size: 13px; font-weight: 700; color: var(--primary); }
.task-progress-row { display: flex; align-items: center; gap: 8px; flex: 1; margin-left: 16px; }
.progress-text { font-size: 12px; color: var(--text-muted); white-space: nowrap; }
.task-title { font-size: 16px; font-weight: 700; margin-bottom: 6px; }
.task-desc { font-size: 13px; color: var(--text-secondary); line-height: 1.5; margin-bottom: 12px; }
.task-footer { display: flex; justify-content: space-between; align-items: center; }
.reward-row { display: flex; align-items: center; gap: 6px; font-size: 16px; font-weight: 700; }
.star-icon { width: 22px; height: 22px; }
.link-text { color: var(--primary); font-size: 14px; cursor: pointer; text-decoration: underline; }
.rules-table { margin-top: 12px; border: 1px solid var(--border-light); border-radius: var(--radius-sm); overflow: hidden; }
.rules-header { background: var(--primary-light); padding: 8px 12px; font-size: 13px; color: var(--primary); font-weight: 600; }
.rules-row { display: flex; padding: 8px 12px; font-size: 13px; border-top: 1px solid var(--border-light); }
.rules-row span { flex: 1; text-align: center; }
.rules-label { font-weight: 600; color: var(--text-secondary); }
.status-unfinished { background: var(--status-warning-bg); color: var(--status-warning-fg); }
.status-inprogress { background: var(--status-success-bg); color: var(--status-success-fg); }
.empty-card { text-align: center; }
</style>
