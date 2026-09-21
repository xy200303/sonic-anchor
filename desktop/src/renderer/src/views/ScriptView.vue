<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useDialog, useMessage } from 'naive-ui'
import type { Product, Script, ScriptSegment } from '@shared/ipc'
import { audioEngine } from '@renderer/audio/engine'
import { usePlanStore } from '@renderer/stores/plan'

const message = useMessage()
const dialog = useDialog()
const planStore = usePlanStore()

const products = ref<Product[]>([])
const scripts = ref<Script[]>([])
const selectedProductIds = ref<string[]>([])
const styleHint = ref('')
const pitchCount = ref(4)
const generating = ref(false)
const synthProgress = ref<Record<string, { done: number; total: number }>>({})

const editing = ref<{ script: Script; seg: ScriptSegment } | null>(null)
const editText = ref('')

async function refresh(): Promise<void> {
  products.value = await window.api.db.listProducts()
  scripts.value = await window.api.script.list()
}

onMounted(async () => {
  await refresh()
  // 场次 store 可能尚未初始化（深链直达本页时），确保加载后再读当前主题
  if (planStore.plans.length === 0) await planStore.load()
  // 当前场次有主题且风格要求为空时预填，作为话术生成的方向提示
  if (!styleHint.value && planStore.active?.theme) styleHint.value = planStore.active.theme
  window.api.onScriptDone((payload) => {
    generating.value = false
    if (payload.script) {
      message.success('话术生成完成')
      void refresh()
    } else {
      message.error(payload.error ?? '话术生成失败', { duration: 5000 })
    }
  })
  window.api.onScriptSynthProgress((p) => {
    synthProgress.value = { ...synthProgress.value, [p.scriptId]: p }
  })
})

async function generate(): Promise<void> {
  if (selectedProductIds.value.length === 0) return
  generating.value = true
  const res = await window.api.script.generate({
    productIds: selectedProductIds.value,
    styleHint: styleHint.value,
    pitchCount: pitchCount.value
  })
  if (!res.ok) {
    generating.value = false
    message.error(res.error ?? '生成失败')
  }
}

async function presynthesize(script: Script): Promise<void> {
  await window.api.script.presynthesize(script.id)
  await refresh()
}

function openEdit(script: Script, seg: ScriptSegment): void {
  editing.value = { script, seg }
  editText.value = seg.text
}

async function submitEdit(): Promise<void> {
  if (!editing.value) return
  await window.api.script.updateSegment(editing.value.script.id, {
    ...editing.value.seg,
    text: editText.value
  })
  editing.value = null
  await refresh()
}

function removeScript(script: Script): void {
  dialog.warning({
    title: '删除话术',
    content: `确定删除「${script.title}」吗？关联的合成音频将不再使用。`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      await window.api.script.remove(script.id)
      await refresh()
    }
  })
}

function audition(seg: ScriptSegment): void {
  if (seg.audioPath) void audioEngine.playTts(seg.audioPath)
}

const SEG_TYPE_LABEL: Record<string, string> = {
  opening: '开场',
  pitch: '讲解',
  urge: '催单',
  ending: '结束语'
}
</script>

<template>
  <div class="script-view">
    <h1 class="title">话术脚本</h1>

    <div class="panel-card gen">
      <div class="gen-head">
        <span class="label">选择商品</span>
        <n-checkbox-group v-model:value="selectedProductIds">
          <n-checkbox
            v-for="p in products"
            :key="p.id"
            :value="p.id"
            :label="`${p.name}（¥${p.price}）`"
          />
        </n-checkbox-group>
        <span v-if="products.length === 0" class="hint">
          还没有商品，请先到「商品知识库」录入
        </span>
      </div>
      <div class="gen-row">
        <n-input
          v-model:value="styleHint"
          placeholder="风格要求（可选），如：语气亲切、强调性价比"
          class="hint-input"
        />
        <n-input-number v-model:value="pitchCount" :min="2" :max="8" size="medium" placeholder="讲解段数" />
        <n-button
          type="primary"
          :loading="generating"
          :disabled="selectedProductIds.length === 0"
          @click="generate"
        >
          AI 生成话术
        </n-button>
      </div>
    </div>

    <div v-if="scripts.length === 0" class="empty">还没有话术，先生成一份吧</div>

    <div v-for="s in scripts" :key="s.id" class="panel-card script">
      <div class="script-head">
        <span class="script-title">{{ s.title }}</span>
        <div class="script-ops">
          <n-progress
            v-if="synthProgress[s.id] && synthProgress[s.id].done < synthProgress[s.id].total"
            type="line"
            :percentage="Math.round((synthProgress[s.id].done / synthProgress[s.id].total) * 100)"
            class="progress"
          />
          <n-button size="small" @click="presynthesize(s)">预合成</n-button>
          <n-button size="small" type="error" ghost @click="removeScript(s)">删除</n-button>
        </div>
      </div>

      <div class="segments">
        <div v-for="seg in s.segments" :key="seg.id" class="segment">
          <div class="seg-meta">
            <n-tag size="tiny">{{ SEG_TYPE_LABEL[seg.type] }}</n-tag>
            <n-tag
              size="tiny"
              :type="seg.status === 'ready' ? 'success' : seg.status === 'failed' ? 'error' : 'default'"
            >
              {{ seg.status === 'ready' ? '已合成' : seg.status === 'failed' ? '合成失败' : '未合成' }}
            </n-tag>
            <span class="dur">约 {{ seg.estDurationSec }}s</span>
          </div>
          <p class="seg-text">{{ seg.text }}</p>
          <div class="seg-ops">
            <n-button text size="tiny" :disabled="!seg.audioPath" @click="audition(seg)">
              试听
            </n-button>
            <n-button text size="tiny" @click="openEdit(s, seg)">编辑</n-button>
          </div>
        </div>
      </div>
    </div>

    <n-modal
      :show="!!editing"
      preset="card"
      title="编辑段落（保存后需重新合成）"
      style="width: 560px"
      @update:show="editing = null"
    >
      <n-input v-model:value="editText" type="textarea" :rows="6" />
      <div class="modal-actions">
        <n-button quaternary @click="editing = null">取消</n-button>
        <n-button type="primary" @click="submitEdit">保存</n-button>
      </div>
    </n-modal>
  </div>
</template>

<style scoped>
.script-view {
  display: flex;
  flex-direction: column;
  gap: 16px;
}
.title {
  margin: 0;
  font-size: 18px;
  font-weight: 600;
}
.gen {
  padding: 16px;
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.gen-head {
  display: flex;
  align-items: center;
  gap: 12px;
  flex-wrap: wrap;
}
.label {
  color: var(--text-secondary);
  font-size: 13px;
}
.gen-row {
  display: flex;
  gap: 8px;
}
.hint-input {
  flex: 1;
}
.hint {
  color: var(--warning);
  font-size: 12px;
}
.empty {
  color: var(--text-tertiary);
  padding: 32px;
  text-align: center;
  border: 1px dashed var(--border-subtle);
  border-radius: 8px;
}
.script {
  padding: 16px;
}
.script-head {
  display: flex;
  align-items: center;
  justify-content: space-between;
  margin-bottom: 12px;
}
.script-title {
  font-weight: 600;
}
.script-ops {
  display: flex;
  align-items: center;
  gap: 8px;
}
.progress {
  width: 120px;
}
.segments {
  display: flex;
  flex-direction: column;
  gap: 8px;
}
.segment {
  padding: 10px 12px;
  border-radius: 6px;
  background: var(--bg-elevated);
}
.seg-meta {
  display: flex;
  align-items: center;
  gap: 8px;
}
.dur {
  font-size: 11px;
  color: var(--text-tertiary);
}
.seg-text {
  margin: 6px 0;
  font-size: 13px;
}
.seg-ops {
  display: flex;
  gap: 12px;
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
  margin-top: 12px;
}
</style>
