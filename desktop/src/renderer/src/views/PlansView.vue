<script setup lang="ts">
import { computed, onMounted, ref } from 'vue'
import { useDialog, useMessage } from 'naive-ui'
import type { LivePlan, Product, Script, VoiceProfile } from '@shared/ipc'
import { usePlanStore } from '@renderer/stores/plan'

const message = useMessage()
const dialog = useDialog()
const planStore = usePlanStore()

const products = ref<Product[]>([])
const scripts = ref<Script[]>([])
const voices = ref<VoiceProfile[]>([])

const editing = ref<LivePlan | null>(null)
const form = ref({
  id: '',
  name: '',
  theme: '',
  productId: null as string | null,
  scriptId: null as string | null,
  voiceId: null as string | null,
  bgmPath: '',
  bgmVolume: 0.3,
  autoReply: true
})

async function refresh(): Promise<void> {
  await planStore.load()
  const [ps, ss, vs] = await Promise.all([
    window.api.db.listProducts(),
    window.api.script.list(),
    window.api.voice.list()
  ])
  products.value = ps
  scripts.value = ss
  voices.value = vs
}

onMounted(refresh)

// id → 名称映射（关联项被删后回退显示「—」）
const productName = (id: string | null): string =>
  products.value.find((p) => p.id === id)?.name ?? '—'
const scriptName = (id: string | null): string =>
  scripts.value.find((s) => s.id === id)?.title ?? '—'
const voiceName = (id: string | null): string =>
  voices.value.find((v) => v.id === id)?.name ?? '—'
/** BGM 只显示文件名，完整路径省略 */
const bgmName = (path: string): string => (path ? (path.split(/[\\/]/).pop() ?? path) : '—')

function formatTime(ts: number): string {
  const d = new Date(ts)
  const pad = (n: number): string => String(n).padStart(2, '0')
  return `${d.getMonth() + 1}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}`
}

function openNew(): void {
  form.value = {
    id: '',
    name: '',
    theme: '',
    productId: null,
    scriptId: null,
    voiceId: null,
    bgmPath: '',
    bgmVolume: 0.3,
    autoReply: true
  }
  editing.value = {} as LivePlan
}

function openEdit(p: LivePlan): void {
  form.value = {
    id: p.id,
    name: p.name,
    theme: p.theme,
    productId: p.productId,
    scriptId: p.scriptId,
    voiceId: p.voiceId,
    bgmPath: p.bgmPath,
    bgmVolume: p.bgmVolume,
    autoReply: p.autoReply
  }
  editing.value = p
}

async function pickBgm(): Promise<void> {
  const path = await window.api.dialog.pickFile('音频文件', ['mp3', 'wav', 'm4a', 'flac'])
  if (path) form.value.bgmPath = path
}

async function save(): Promise<void> {
  if (!form.value.name.trim()) {
    message.warning('请填写场次名称')
    return
  }
  const plan: LivePlan = {
    id: form.value.id || crypto.randomUUID(),
    name: form.value.name.trim(),
    theme: form.value.theme.trim(),
    productId: form.value.productId,
    scriptId: form.value.scriptId,
    voiceId: form.value.voiceId,
    bgmPath: form.value.bgmPath,
    bgmVolume: form.value.bgmVolume,
    autoReply: form.value.autoReply,
    createdAt: editing.value?.id ? editing.value.createdAt : Date.now(),
    updatedAt: Date.now()
  }
  await planStore.savePlan(plan)
  editing.value = null
  message.success('场次已保存')
  // 编辑的是当前场次时重新应用一次配置，让改动立即生效
  if (plan.id === planStore.activeId) await planStore.setActive(plan.id)
  await refresh()
}

function remove(p: LivePlan): void {
  dialog.warning({
    title: '删除场次',
    content: `确定删除「${p.name}」吗？`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      await planStore.removePlan(p.id)
      await refresh()
    }
  })
}

async function setCurrent(p: LivePlan): Promise<void> {
  await planStore.setActive(p.id)
  message.success(`已切换到场次：${p.name}`)
}

const productOptions = computed(() =>
  products.value.map((p) => ({ label: p.name, value: p.id }))
)
const scriptOptions = computed(() => scripts.value.map((s) => ({ label: s.title, value: s.id })))
const voiceOptions = computed(() => voices.value.map((v) => ({ label: v.name, value: v.id })))
</script>

<template>
  <div class="plans">
    <div class="head">
      <h1 class="title">场次管理</h1>
      <n-button type="primary" @click="openNew">新建场次</n-button>
    </div>

    <p class="note">场次是一场直播的完整配置方案：主题、商品、话术、音色、BGM 与自动回复。开播前选中对应场次即可一键就位。</p>

    <div v-if="planStore.plans.length === 0" class="empty">还没有场次，点右上角「新建场次」创建</div>

    <div v-else class="cards">
      <div
        v-for="p in planStore.plans"
        :key="p.id"
        class="panel-card card"
        :class="{ current: p.id === planStore.activeId }"
      >
        <div class="card-head">
          <span class="name">{{ p.name }}</span>
          <n-tag v-if="p.id === planStore.activeId" size="small" :bordered="false" class="current-tag">
            当前
          </n-tag>
        </div>
        <p v-if="p.theme" class="theme">{{ p.theme }}</p>
        <p class="field"><span class="fl">商品</span>{{ productName(p.productId) }}</p>
        <p class="field"><span class="fl">话术</span>{{ scriptName(p.scriptId) }}</p>
        <p class="field"><span class="fl">音色</span>{{ voiceName(p.voiceId) }}</p>
        <p class="field"><span class="fl">BGM</span>{{ bgmName(p.bgmPath) }} · 音量 {{ Math.round(p.bgmVolume * 100) }}%</p>
        <p class="field"><span class="fl">自动回复</span>{{ p.autoReply ? '开' : '关' }}</p>
        <p class="updated">更新于 {{ formatTime(p.updatedAt) }}</p>
        <div class="ops">
          <n-button
            v-if="p.id !== planStore.activeId"
            size="small"
            type="primary"
            @click="setCurrent(p)"
          >
            设为当前
          </n-button>
          <n-button size="small" @click="openEdit(p)">编辑</n-button>
          <n-button size="small" type="error" ghost @click="remove(p)">删除</n-button>
        </div>
      </div>
    </div>

    <n-modal
      :show="!!editing"
      preset="card"
      :title="form.id ? '编辑场次' : '新建场次'"
      style="width: 560px"
      @update:show="editing = null"
    >
      <n-form label-placement="top">
        <n-form-item label="场次名称" required>
          <n-input v-model:value="form.name" placeholder="如：周五晚 · 锅具专场" />
        </n-form-item>
        <n-form-item label="本场主题 / 方向">
          <n-input
            v-model:value="form.theme"
            type="textarea"
            :rows="2"
            placeholder="本场主打什么、目标人群、促销节奏（会作为话术生成的方向提示）"
          />
        </n-form-item>
        <n-form-item label="商品">
          <n-select v-model:value="form.productId" :options="productOptions" clearable placeholder="选择商品" />
        </n-form-item>
        <n-form-item label="话术">
          <n-select v-model:value="form.scriptId" :options="scriptOptions" clearable placeholder="选择话术" />
        </n-form-item>
        <n-form-item label="音色">
          <n-select v-model:value="form.voiceId" :options="voiceOptions" clearable placeholder="选择音色" />
        </n-form-item>
        <n-form-item label="BGM">
          <div class="bgm-row">
            <n-button size="small" @click="pickBgm">选择文件</n-button>
            <span class="bgm-name">{{ bgmName(form.bgmPath) }}</span>
          </div>
          <n-slider v-model:value="form.bgmVolume" :min="0" :max="1" :step="0.05" />
        </n-form-item>
        <n-form-item label="自动回复评论">
          <n-switch v-model:value="form.autoReply" />
        </n-form-item>
      </n-form>
      <div class="modal-actions">
        <n-button quaternary @click="editing = null">取消</n-button>
        <n-button type="primary" @click="save">保存</n-button>
      </div>
    </n-modal>
  </div>
</template>

<style scoped>
.plans {
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
.note {
  margin: 0;
  color: var(--text-tertiary);
  font-size: 12px;
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
  grid-template-columns: repeat(auto-fill, minmax(320px, 1fr));
  gap: 12px;
}
.card {
  padding: 14px 16px;
}
.card.current {
  border-color: var(--brand);
}
.card-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 6px;
}
.name {
  font-weight: 600;
}
.current-tag {
  background: rgba(196, 112, 63, 0.14);
  color: var(--brand);
}
.theme {
  margin: 0 0 8px;
  font-size: 12px;
  color: var(--text-secondary);
  overflow: hidden;
  display: -webkit-box;
  -webkit-line-clamp: 2;
  -webkit-box-orient: vertical;
}
.field {
  margin: 4px 0;
  font-size: 12px;
  color: var(--text-secondary);
  display: flex;
  gap: 8px;
}
.fl {
  color: var(--text-tertiary);
  flex-shrink: 0;
}
.updated {
  margin: 8px 0 0;
  font-size: 11px;
  color: var(--text-tertiary);
}
.ops {
  display: flex;
  gap: 8px;
  margin-top: 8px;
}
.bgm-row {
  display: flex;
  align-items: center;
  gap: 8px;
  margin-bottom: 8px;
}
.bgm-name {
  font-size: 12px;
  color: var(--text-tertiary);
  overflow: hidden;
  text-overflow: ellipsis;
  white-space: nowrap;
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
