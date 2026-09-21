<script setup lang="ts">
import { onMounted, reactive, ref } from 'vue'
import { CopyDocument, Edit, Plus, Refresh, Search, Delete } from '@element-plus/icons-vue'
import { ElMessage, ElMessageBox } from 'element-plus'
import { request } from '@/api/request'
import PageHeader from '@/components/PageHeader.vue'

interface AppItem {
  id: string
  name: string
  app_id: string
  callback_key: string
  callback_url: string
  enabled: boolean
  has_app_secret: boolean
  has_push_secret: boolean
}

const rows = ref<AppItem[]>([])
const loading = ref(false)
const visible = ref(false)
const editing = ref<AppItem | null>(null)
const saving = ref(false)
const keyword = ref('')
const form = reactive({ name: '', app_id: '', app_secret: '', push_secret: '', enabled: true })

async function load() {
  loading.value = true
  try { rows.value = await request({ url: '/douyin/apps' }) } finally { loading.value = false }
}
function open(item?: AppItem) {
  editing.value = item ?? null
  Object.assign(form, { name: item?.name ?? '', app_id: item?.app_id ?? '', app_secret: '', push_secret: '', enabled: item?.enabled ?? true })
  visible.value = true
}
async function save() {
  saving.value = true
  try {
    await request({ method: editing.value ? 'PUT' : 'POST', url: editing.value ? `/douyin/apps/${editing.value.id}` : '/douyin/apps', data: form })
    ElMessage.success(editing.value ? '应用配置已更新' : '应用已创建')
    visible.value = false
    await load()
  } finally { saving.value = false }
}
async function remove(item: AppItem) {
  const confirmed = await ElMessageBox.confirm(`删除后将无法继续接收「${item.name}」的回调，确认删除吗？`, '删除应用', { type: 'warning', confirmButtonText: '删除', cancelButtonText: '取消' }).then(() => true).catch(() => false)
  if (!confirmed) return
  await request({ method: 'DELETE', url: `/douyin/apps/${item.id}` })
  ElMessage.success('应用已删除')
  await load()
}
async function copy(text: string) { await navigator.clipboard.writeText(text); ElMessage.success('回调地址已复制') }
const filteredRows = () => rows.value.filter((row) => !keyword.value || `${row.name} ${row.app_id}`.toLowerCase().includes(keyword.value.toLowerCase()))
onMounted(load)
</script>

<template>
  <div class="app-container">
    <PageHeader title="抖音应用" description="管理开放平台应用、回调地址与服务端密钥">
      <template #actions><el-button type="primary" :icon="Plus" @click="open()">新增应用</el-button></template>
    </PageHeader>
    <div class="filter-card">
      <el-form inline @submit.prevent="load">
        <el-form-item label="应用名称 / AppID"><el-input v-model="keyword" clearable placeholder="请输入名称或 AppID" style="width: 260px" @keyup.enter="load"><template #prefix><el-icon><Search /></el-icon></template></el-input></el-form-item>
        <el-form-item><el-button type="primary" :icon="Search" @click="load">查询</el-button><el-button :icon="Refresh" @click="keyword = ''; load()">重置</el-button></el-form-item>
      </el-form>
    </div>
    <section class="table-card">
      <div class="table-toolbar"><div class="table-toolbar-left"><h2 class="card-title">应用列表</h2><el-tag effect="plain">共 {{ filteredRows().length }} 个</el-tag></div><div class="text-secondary">密钥仅加密存储于服务端</div></div>
      <el-table v-loading="loading" :data="filteredRows()" stripe>
        <el-table-column prop="name" label="应用名称" min-width="150" />
        <el-table-column prop="app_id" label="AppID" min-width="190"><template #default="{ row }"><span class="mono-text">{{ row.app_id }}</span></template></el-table-column>
        <el-table-column label="密钥状态" width="180"><template #default="{ row }"><el-space><el-tag size="small" :type="row.has_app_secret ? 'success' : 'danger'">{{ row.has_app_secret ? 'AppSecret 已配置' : '缺少 AppSecret' }}</el-tag><el-tag size="small" :type="row.has_push_secret ? 'success' : 'warning'">{{ row.has_push_secret ? '回调密钥已配置' : '待配置' }}</el-tag></el-space></template></el-table-column>
        <el-table-column label="回调地址" min-width="300"><template #default="{ row }"><el-button link type="primary" :icon="CopyDocument" @click="copy(row.callback_url)">复制回调地址</el-button></template></el-table-column>
        <el-table-column label="状态" width="90"><template #default="{ row }"><el-tag :type="row.enabled ? 'success' : 'info'" effect="light">{{ row.enabled ? '启用' : '停用' }}</el-tag></template></el-table-column>
        <el-table-column label="操作" width="145" fixed="right"><template #default="{ row }"><el-button link type="primary" :icon="Edit" @click="open(row)">编辑</el-button><el-button link type="danger" :icon="Delete" @click="remove(row)">删除</el-button></template></el-table-column>
        <template #empty><el-empty description="暂无抖音应用，请先新增应用" /></template>
      </el-table>
    </section>
    <el-dialog v-model="visible" :title="editing ? '编辑抖音应用' : '新增抖音应用'" width="560px" :close-on-click-modal="false">
      <el-alert title="AppSecret 和推送密钥只会保存在服务端，不会下发到桌面端。" type="info" :closable="false" show-icon class="dialog-alert" />
      <el-form label-position="top" class="app-form">
        <el-form-item label="应用名称" required><el-input v-model="form.name" placeholder="例如：智能助播正式应用" /></el-form-item>
        <el-form-item label="AppID" required><el-input v-model="form.app_id" placeholder="抖音开放平台应用 AppID" /></el-form-item>
        <el-form-item :label="editing ? 'AppSecret（留空表示不修改）' : 'AppSecret'" required><el-input v-model="form.app_secret" type="password" show-password autocomplete="new-password" /></el-form-item>
        <el-form-item :label="editing ? '推送签名密钥（留空表示不修改）' : '推送签名密钥'" required><el-input v-model="form.push_secret" type="password" show-password autocomplete="new-password" /></el-form-item>
        <el-form-item label="应用状态"><el-switch v-model="form.enabled" active-text="启用" inactive-text="停用" /></el-form-item>
      </el-form>
      <template #footer><el-button @click="visible = false">取消</el-button><el-button type="primary" :loading="saving" @click="save">保存配置</el-button></template>
    </el-dialog>
  </div>
</template>

<style scoped>
.dialog-alert { margin-bottom: 18px; }.app-form :deep(.el-form-item) { margin-bottom: 17px; }
</style>
