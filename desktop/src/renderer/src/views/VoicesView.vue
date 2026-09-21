<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useDialog, useMessage } from 'naive-ui'
import type { VoiceProfile } from '@shared/ipc'
import { useConfigStore } from '@renderer/stores/config'

const message = useMessage()
const dialog = useDialog()
const configStore = useConfigStore()

const voices = ref<VoiceProfile[]>([])
const adding = ref(false)
const form = ref({ name: '', voiceType: '' })
const testing = ref(false)

async function refresh(): Promise<void> {
  voices.value = await window.api.voice.list()
}

onMounted(async () => {
  await configStore.load()
  await refresh()
})

async function save(): Promise<void> {
  if (!form.value.name.trim() || !form.value.voiceType.trim()) {
    message.warning('请填写音色名称与 voice_type')
    return
  }
  await window.api.voice.save({
    id: `v-${Date.now()}`,
    name: form.value.name.trim(),
    source: 'cloned',
    voiceType: form.value.voiceType.trim(),
    samplePath: null,
    createdAt: Date.now()
  })
  adding.value = false
  form.value = { name: '', voiceType: '' }
  message.success('音色已入库')
  await refresh()
}

function remove(v: VoiceProfile): void {
  dialog.warning({
    title: '删除音色',
    content: `确定删除「${v.name}」吗？`,
    positiveText: '删除',
    negativeText: '取消',
    onPositiveClick: async () => {
      await window.api.voice.remove(v.id)
      await refresh()
    }
  })
}

async function setCurrent(v: VoiceProfile): Promise<void> {
  await configStore.save({ tts: { voiceId: v.voiceType } })
  message.success(`已切换为「${v.name}」`)
}

async function testSpeak(): Promise<void> {
  testing.value = true
  try {
    const res = await window.api.tts.test('你好，欢迎来到直播间，今天给大家带来超值好物。')
    if (res.ok && res.audioPath) {
      const { audioEngine } = await import('@renderer/audio/engine')
      await audioEngine.playTts(res.audioPath)
    } else {
      message.error(res.error ?? '试听合成失败', { duration: 5000 })
    }
  } finally {
    testing.value = false
  }
}
</script>

<template>
  <div class="voices">
    <div class="head">
      <h1 class="title">音色库</h1>
      <div class="head-ops">
        <n-button :loading="testing" @click="testSpeak">试听当前音色</n-button>
        <n-button type="primary" @click="adding = true">录入克隆音色</n-button>
      </div>
    </div>

    <p class="note">
      声音复刻请在火山引擎控制台完成（本人授权 + 样本上传），克隆完成后把 voice_type 填入这里即可使用。请确保已获得声音本人的授权。
    </p>

    <div v-if="voices.length === 0" class="empty">还没有音色</div>

    <div v-else class="cards">
      <div
        v-for="v in voices"
        :key="v.id"
        class="panel-card card"
        :class="{ current: configStore.config.tts.voiceId === v.voiceType }"
      >
        <div class="card-head">
          <span class="name">{{ v.name }}</span>
          <n-tag size="tiny" :type="v.source === 'cloned' ? 'warning' : 'default'">
            {{ v.source === 'cloned' ? '克隆' : '内置' }}
          </n-tag>
        </div>
        <p class="vt">{{ v.voiceType }}</p>
        <div class="ops">
          <n-button
            v-if="configStore.config.tts.voiceId !== v.voiceType"
            size="small"
            type="primary"
            @click="setCurrent(v)"
          >
            设为当前音色
          </n-button>
          <n-tag v-else size="small" type="success">使用中</n-tag>
          <n-button size="small" type="error" ghost @click="remove(v)">删除</n-button>
        </div>
      </div>
    </div>

    <n-modal :show="adding" preset="card" title="录入克隆音色" style="width: 480px" @update:show="adding = false">
      <n-form label-placement="top">
        <n-form-item label="音色名称" required>
          <n-input v-model:value="form.name" placeholder="如：店主本人声音" />
        </n-form-item>
        <n-form-item label="voice_type（火山引擎音色 ID）" required>
          <n-input v-model:value="form.voiceType" placeholder="如：S_xxxxxxxx" />
        </n-form-item>
      </n-form>
      <div class="modal-actions">
        <n-button quaternary @click="adding = false">取消</n-button>
        <n-button type="primary" @click="save">入库</n-button>
      </div>
    </n-modal>
  </div>
</template>

<style scoped>
.voices {
  display: flex;
  flex-direction: column;
  gap: 12px;
}
.head {
  display: flex;
  align-items: center;
  justify-content: space-between;
}
.head-ops {
  display: flex;
  gap: 8px;
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
  grid-template-columns: repeat(auto-fill, minmax(280px, 1fr));
  gap: 12px;
}
.card {
  padding: 14px 16px;
}
.card.current {
  border-color: var(--success);
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
.vt {
  margin: 0 0 10px;
  font-size: 12px;
  color: var(--text-tertiary);
  word-break: break-all;
}
.ops {
  display: flex;
  align-items: center;
  gap: 8px;
}
.modal-actions {
  display: flex;
  justify-content: flex-end;
  gap: 8px;
}
</style>
