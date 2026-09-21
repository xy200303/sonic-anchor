<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { DataAnalysis, Monitor, VideoCamera, User } from '@element-plus/icons-vue'
import { request } from '@/api/request'
import PageHeader from '@/components/PageHeader.vue'

const data = ref({ apps: 0, active_sessions: 0, events_today: 0, users: 0 })
onMounted(async () => { data.value = await request({ url: '/dashboard' }) })
const cards = [
  { key: 'active_sessions', label: '正在直播', note: '当前在线场次', icon: VideoCamera, tone: 'blue' },
  { key: 'events_today', label: '今日互动事件', note: '评论、礼物及进场', icon: DataAnalysis, tone: 'orange' },
  { key: 'apps', label: '抖音应用', note: '已配置应用数量', icon: Monitor, tone: 'green' },
  { key: 'users', label: '后台用户', note: '平台管理账号', icon: User, tone: 'purple' }
] as const
</script>

<template>
  <div class="app-container">
    <PageHeader title="数据总览" description="查看直播接入与服务运行概况" />
    <div class="metric-grid">
      <div v-for="card in cards" :key="card.key" class="metric-card">
        <div class="metric-icon" :class="card.tone"><el-icon :size="21"><component :is="card.icon" /></el-icon></div>
        <div class="metric-main"><span>{{ card.label }}</span><strong>{{ data[card.key] }}</strong><small>{{ card.note }}</small></div>
      </div>
    </div>
    <div class="dashboard-grid">
      <section class="content-card flow-card">
        <div class="section-heading"><h2>平台接入流程</h2><el-tag type="success" effect="plain">服务在线</el-tag></div>
        <div class="flow-list">
          <div class="flow-item"><span class="flow-step">1</span><div><strong>直播伴侣启动桌面端</strong><p>通过 <code>-token</code> 将直播上下文传入 Electron 客户端。</p></div></div>
          <div class="flow-item"><span class="flow-step">2</span><div><strong>服务端建立直播会话</strong><p>使用官方 Open API 获取房间信息并启动互动任务。</p></div></div>
          <div class="flow-item"><span class="flow-step">3</span><div><strong>回调转发到桌面端</strong><p>HTTP 回调验签、去重后，经 Redis 和 WebSocket 实时推送。</p></div></div>
        </div>
      </section>
      <section class="content-card status-card">
        <div class="section-heading"><h2>运行状态</h2><span class="status-label"><i />正常</span></div>
        <div class="status-row"><span>后端 API</span><strong>在线</strong></div>
        <div class="status-row"><span>Redis 消息总线</span><strong>在线</strong></div>
        <div class="status-row"><span>抖音回调入口</span><strong>待配置</strong></div>
        <div class="status-tip">生产环境请使用公网 HTTPS 地址，并在抖音开放平台配置回调地址。</div>
      </section>
    </div>
  </div>
</template>

<style scoped>
.metric-grid { display: grid; grid-template-columns: repeat(4, minmax(0, 1fr)); gap: 16px; margin-bottom: 16px; }
.metric-card { display: flex; align-items: flex-start; gap: 14px; padding: 20px; border: 1px solid var(--sa-border); border-radius: 6px; background: var(--sa-bg-card); }
.metric-icon { display: grid; width: 44px; height: 44px; flex: 0 0 44px; place-items: center; border-radius: 8px; }
.metric-icon.blue { color: #2b5aed; background: #eaf0ff; }.metric-icon.orange { color: #ed7b2f; background: #fff1e8; }.metric-icon.green { color: #2ba471; background: #e7f8f0; }.metric-icon.purple { color: #7a5af8; background: #f0ecff; }
.metric-main { display: flex; min-width: 0; flex-direction: column; }.metric-main span { color: var(--sa-text-regular); font-size: 13px; }.metric-main strong { margin: 5px 0 2px; color: var(--sa-text-primary); font-size: 28px; line-height: 1.1; }.metric-main small { color: var(--sa-text-secondary); font-size: 12px; }
.dashboard-grid { display: grid; grid-template-columns: minmax(0, 1.35fr) minmax(300px, .65fr); gap: 16px; }
.section-heading { display: flex; align-items: center; justify-content: space-between; margin-bottom: 18px; }.section-heading h2 { margin: 0; font-size: 16px; font-weight: 600; }
.flow-list { display: grid; gap: 18px; }.flow-item { display: flex; align-items: flex-start; gap: 12px; }.flow-step { display: grid; width: 26px; height: 26px; flex: 0 0 26px; place-items: center; border-radius: 50%; color: var(--sa-primary); font-size: 12px; font-weight: 600; background: var(--sa-primary-light); }.flow-item strong { font-size: 14px; font-weight: 600; }.flow-item p { margin: 5px 0 0; color: var(--sa-text-secondary); font-size: 13px; line-height: 1.6; }.flow-item code { padding: 1px 4px; border-radius: 3px; color: var(--sa-primary); background: var(--sa-primary-light); }
.status-row { display: flex; align-items: center; justify-content: space-between; padding: 13px 0; border-bottom: 1px solid var(--sa-border); color: var(--sa-text-regular); font-size: 13px; }.status-row strong { color: var(--sa-success); font-weight: 500; }.status-row:nth-of-type(4) strong { color: var(--sa-warning); }.status-label { color: var(--sa-success); font-size: 12px; }.status-label i { display: inline-block; width: 6px; height: 6px; margin-right: 5px; border-radius: 50%; background: currentColor; }.status-tip { margin-top: 16px; padding: 10px 12px; border-radius: 4px; color: var(--sa-text-secondary); font-size: 12px; line-height: 1.6; background: var(--sa-bg-page); }
@media (max-width: 1100px) { .metric-grid { grid-template-columns: repeat(2, minmax(0, 1fr)); } .dashboard-grid { grid-template-columns: 1fr; } }
</style>
