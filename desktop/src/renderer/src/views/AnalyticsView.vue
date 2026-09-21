<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import VChart from 'vue-echarts'
import { use } from 'echarts/core'
import { BarChart, LineChart } from 'echarts/charts'
import {
  GridComponent,
  LegendComponent,
  TooltipComponent
} from 'echarts/components'
import { CanvasRenderer } from 'echarts/renderers'
import type { AnalyticsOverview } from '@shared/ipc'

use([BarChart, LineChart, GridComponent, LegendComponent, TooltipComponent, CanvasRenderer])

const overview = ref<AnalyticsOverview | null>(null)

onMounted(async () => {
  overview.value = await window.api.analytics.overview()
})

const INTENT_LABEL: Record<string, string> = {
  price: '问价',
  question: '提问',
  chitchat: '闲聊',
  spam: '无效',
  other: '其他'
}

const intentOption = computed(() => ({
  tooltip: { trigger: 'axis' as const },
  grid: { left: 40, right: 16, top: 16, bottom: 28 },
  xAxis: {
    type: 'category' as const,
    data: (overview.value?.intents ?? []).map((i) => INTENT_LABEL[i.intent] ?? i.intent),
    axisLabel: { color: '#A8A29A' }
  },
  yAxis: { type: 'value' as const, axisLabel: { color: '#A8A29A' } },
  series: [
    {
      type: 'bar' as const,
      data: (overview.value?.intents ?? []).map((i) => i.count),
      itemStyle: { color: '#C4703F' }
    }
  ]
}))

const sessionOption = computed(() => {
  const ss = [...(overview.value?.sessions ?? [])].reverse()
  return {
    tooltip: { trigger: 'axis' as const },
    legend: { textStyle: { color: '#A8A29A' } },
    grid: { left: 40, right: 16, top: 32, bottom: 28 },
    xAxis: {
      type: 'category' as const,
      data: ss.map((s) => new Date(s.startedAt).toLocaleDateString('zh-CN')),
      axisLabel: { color: '#A8A29A' }
    },
    yAxis: { type: 'value' as const, axisLabel: { color: '#A8A29A' } },
    series: [
      { name: '评论数', type: 'line' as const, data: ss.map((s) => s.commentCount), itemStyle: { color: '#C4703F' } },
      { name: '回复数', type: 'line' as const, data: ss.map((s) => s.replyCount), itemStyle: { color: '#6FA287' } }
    ]
  }
})

async function exportCsv(): Promise<void> {
  const csv = await window.api.analytics.exportCsv()
  if (!csv) return
  const blob = new Blob([csv], { type: 'text/csv;charset=utf-8' })
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = `回复记录-${new Date().toISOString().slice(0, 10)}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

function fmtDuration(sec: number): string {
  const h = Math.floor(sec / 3600)
  const m = Math.round((sec % 3600) / 60)
  return h > 0 ? `${h}小时${m}分` : `${m}分钟`
}
</script>

<template>
  <div class="analytics">
    <div class="head">
      <h1 class="title">数据中心</h1>
      <n-button @click="exportCsv">导出回复记录 CSV</n-button>
    </div>

    <div v-if="!overview || overview.totals.sessions === 0" class="empty">
      还没有直播场次数据，完成一场直播后这里会生成复盘报表
    </div>

    <template v-else>
      <div class="cards">
        <div class="panel-card kpi">
          <span class="kpi-label">累计场次</span>
          <span class="kpi-value">{{ overview.totals.sessions }}</span>
        </div>
        <div class="panel-card kpi">
          <span class="kpi-label">累计时长</span>
          <span class="kpi-value">{{ fmtDuration(overview.totals.totalDurationSec) }}</span>
        </div>
        <div class="panel-card kpi">
          <span class="kpi-label">评论总数</span>
          <span class="kpi-value">{{ overview.totals.commentCount }}</span>
        </div>
        <div class="panel-card kpi">
          <span class="kpi-label">回复率</span>
          <span class="kpi-value">{{ Math.round(overview.totals.replyRate * 100) }}%</span>
        </div>
      </div>

      <div class="charts">
        <div class="panel-card chart">
          <h2 class="chart-title">评论意图分布</h2>
          <VChart :option="intentOption" autoresize style="height: 260px" />
        </div>
        <div class="panel-card chart">
          <h2 class="chart-title">互动趋势</h2>
          <VChart :option="sessionOption" autoresize style="height: 260px" />
        </div>
      </div>

      <div class="panel-card topq">
        <h2 class="chart-title">高频问题 TOP10</h2>
        <div v-if="overview.topQuestions.length === 0" class="empty-small">暂无数据</div>
        <div v-for="(q, i) in overview.topQuestions" :key="i" class="qrow">
          <span class="qtext">{{ q.question }}</span>
          <span class="qcount">{{ q.count }} 次</span>
        </div>
      </div>
    </template>
  </div>
</template>

<style scoped>
.analytics {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}
.empty {
  color: var(--text-tertiary);
  padding: 32px;
  text-align: center;
  border: 1px dashed var(--border-subtle);
  border-radius: 8px;
}
.cards {
  display: grid;
  grid-template-columns: repeat(4, 1fr);
  gap: 12px;
}
.kpi {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.kpi-label {
  font-size: 12px;
  color: var(--text-tertiary);
}
.kpi-value {
  font-size: 24px;
  font-weight: 700;
  font-variant-numeric: tabular-nums;
}
.charts {
  display: grid;
  grid-template-columns: 1fr 1fr;
  gap: 12px;
}
.chart {
  padding: 16px;
}
.chart-title {
  margin: 0 0 8px;
  font-size: 14px;
  font-weight: 600;
}
.topq {
  padding: 16px;
}
.qrow {
  display: flex;
  justify-content: space-between;
  padding: 8px 0;
  border-bottom: 1px solid var(--border-subtle);
  font-size: 13px;
}
.qcount {
  color: var(--text-tertiary);
  font-variant-numeric: tabular-nums;
}
.empty-small {
  color: var(--text-tertiary);
  font-size: 13px;
}
</style>
