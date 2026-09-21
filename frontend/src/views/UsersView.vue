<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { Refresh, Search, User } from '@element-plus/icons-vue'
import { request } from '@/api/request'
import PageHeader from '@/components/PageHeader.vue'

interface UserItem { id: string; username: string; name: string; role: string; status: number; created_at: string }
const rows = ref<UserItem[]>([])
const loading = ref(false)
const keyword = ref('')
const status = ref('')
async function load() { loading.value = true; try { rows.value = await request({ url: '/system/users' }) } finally { loading.value = false } }
const filteredRows = computed(() => rows.value.filter((row) => (!status.value || String(row.status) === status.value) && (!keyword.value || `${row.username} ${row.name}`.includes(keyword.value))))
function formatDate(value: string) { return value ? new Date(value).toLocaleString('zh-CN', { hour12: false }) : '--' }
function roleLabel(role: string) { return role === 'super_admin' ? '超级管理员' : role === 'admin' ? '管理员' : role }
onMounted(load)
</script>

<template>
  <div class="app-container">
    <PageHeader title="系统用户" description="管理后台账号、角色与登录状态" />
    <div class="filter-card">
      <el-form inline @submit.prevent="load">
        <el-form-item label="账号 / 姓名"><el-input v-model="keyword" clearable placeholder="请输入账号或姓名" style="width: 240px"><template #prefix><el-icon><Search /></el-icon></template></el-input></el-form-item>
        <el-form-item label="状态"><el-select v-model="status" clearable placeholder="全部状态" style="width: 130px"><el-option label="正常" value="1" /><el-option label="停用" value="0" /></el-select></el-form-item>
        <el-form-item><el-button type="primary" :icon="Search">查询</el-button><el-button :icon="Refresh" @click="keyword = ''; status = ''; load()">重置</el-button></el-form-item>
      </el-form>
    </div>
    <section class="table-card">
      <div class="table-toolbar"><div class="table-toolbar-left"><h2 class="card-title">用户列表</h2><el-tag effect="plain">共 {{ filteredRows.length }} 人</el-tag></div><el-button :icon="Refresh" :loading="loading" @click="load">刷新</el-button></div>
      <el-table v-loading="loading" :data="filteredRows" stripe>
        <el-table-column label="用户" min-width="220"><template #default="{ row }"><div class="user-cell"><el-avatar :size="30">{{ row.name?.slice(0, 1) || '用' }}</el-avatar><div><strong>{{ row.name }}</strong><small>{{ row.username }}</small></div></div></template></el-table-column>
        <el-table-column label="角色" min-width="160"><template #default="{ row }"><el-tag effect="plain">{{ roleLabel(row.role) }}</el-tag></template></el-table-column>
        <el-table-column label="状态" width="100"><template #default="{ row }"><el-tag :type="row.status === 1 ? 'success' : 'danger'">{{ row.status === 1 ? '正常' : '停用' }}</el-tag></template></el-table-column>
        <el-table-column label="创建时间" min-width="180"><template #default="{ row }">{{ formatDate(row.created_at) }}</template></el-table-column>
        <template #empty><el-empty :image-size="80" description="暂无系统用户"><el-button type="primary" :icon="User" @click="load">重新加载</el-button></el-empty></template>
      </el-table>
    </section>
  </div>
</template>

<style scoped>
.user-cell { display: flex; align-items: center; gap: 10px; }.user-cell .el-avatar { color: var(--sa-primary); font-size: 12px; background: var(--sa-primary-light); }.user-cell div { display: flex; flex-direction: column; gap: 3px; }.user-cell strong { font-weight: 500; }.user-cell small { color: var(--sa-text-secondary); font-size: 12px; }
</style>
