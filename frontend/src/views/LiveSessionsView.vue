<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Refresh, Search, VideoCamera } from '@element-plus/icons-vue'
import { request } from '@/api/request'
import PageHeader from '@/components/PageHeader.vue'

interface Session { id: string; room_id: string; anchor_nickname: string; anchor_open_id: string; status: string; started_at: string; ended_at?: string }
const rows = ref<Session[]>([])
const loading = ref(false)
const keyword = ref('')
const status = ref('')
async function load() { loading.value = true; try { rows.value = await request({ url: '/live/sessions' }) } finally { loading.value = false } }
const filteredRows = computed(() => rows.value.filter((row) => (!status.value || row.status === status.value) && (!keyword.value || `${row.room_id} ${row.anchor_nickname} ${row.anchor_open_id}`.includes(keyword.value))))
function formatDate(value?: string) { return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '--' }
onMounted(load)
</script>

<template>
  <div class="app-container">
    <PageHeader title="直播场次" description="查看真实直播间接入状态与历史互动会话" />
    <div class="filter-card">
      <el-form inline @submit.prevent="load">
        <el-form-item label="房间 / 主播"><el-input v-model="keyword" clearable placeholder="输入房间号或主播名称" style="width: 260px"><template #prefix><el-icon><Search /></el-icon></template></el-input></el-form-item>
        <el-form-item label="状态"><el-select v-model="status" clearable placeholder="全部状态" style="width: 140px"><el-option label="直播中" value="live" /><el-option label="已结束" value="ended" /></el-select></el-form-item>
        <el-form-item><el-button type="primary" :icon="Search">查询</el-button><el-button :icon="Refresh" @click="keyword = ''; status = ''; load()">重置</el-button></el-form-item>
      </el-form>
    </div>
    <section class="table-card">
      <div class="table-toolbar"><div class="table-toolbar-left"><h2 class="card-title">场次记录</h2><el-tag effect="plain">共 {{ filteredRows.length }} 场</el-tag></div><el-button :icon="Refresh" :loading="loading" @click="load">刷新</el-button></div>
      <el-table v-loading="loading" :data="filteredRows" stripe>
        <el-table-column label="房间号" min-width="170"><template #default="{ row }"><span class="mono-text">{{ row.room_id }}</span></template></el-table-column>
        <el-table-column label="主播" min-width="150"><template #default="{ row }"><div class="anchor-cell"><el-avatar :size="28">{{ row.anchor_nickname?.slice(0, 1) || '主' }}</el-avatar><span>{{ row.anchor_nickname || '未命名主播' }}</span></div></template></el-table-column>
        <el-table-column label="主播 OpenID" min-width="230"><template #default="{ row }"><span class="mono-text">{{ row.anchor_open_id || '--' }}</span></template></el-table-column>
        <el-table-column label="状态" width="100"><template #default="{ row }"><el-tag :type="row.status === 'live' ? 'success' : 'info'">{{ row.status === 'live' ? '直播中' : '已结束' }}</el-tag></template></el-table-column>
        <el-table-column label="开始时间" min-width="180"><template #default="{ row }">{{ formatDate(row.started_at) }}</template></el-table-column>
        <el-table-column label="结束时间" min-width="180"><template #default="{ row }">{{ formatDate(row.ended_at) }}</template></el-table-column>
        <template #empty><el-empty :image-size="80" description="暂无直播场次记录"><el-button type="primary" :icon="VideoCamera" @click="load">重新加载</el-button></el-empty></template>
      </el-table>
    </section>
  </div>
</template>

<style scoped>
.anchor-cell { display: flex; align-items: center; gap: 9px; }.anchor-cell .el-avatar { color: var(--sa-primary); font-size: 12px; background: var(--sa-primary-light); }
</style>
