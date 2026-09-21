<script setup lang="ts">
import { onMounted, ref } from 'vue'
import { useMessage } from 'naive-ui'
import type { CommentGatewayStatus } from '@shared/ipc'
import { useConfigStore } from '@renderer/stores/config'

const message = useMessage()
const configStore = useConfigStore()

const form = ref({
  streamMode: 'direct' as 'direct' | 'companion',
  serverUrl: '',
  streamKey: '',
  duckingEnabled: true,
  duckingDepthDb: 14,
  micEnabled: false,
  micDeviceId: '',
  autoYield: true,
  llmProvider: 'doubao' as 'doubao' | 'deepseek' | 'qwen',
  llmApiKey: '',
  ttsMode: 'online' as 'online' | 'local',
  ttsAppId: '',
  ttsAccessToken: '',
  ttsCluster: 'volcano_tts',
  commentBackendUrl: 'http://localhost:8090',
  commentDesktopKey: '',
  commentAppId: '',
  commentDevSimulate: false
})

const gatewayStatus = ref<CommentGatewayStatus | null>(null)
const micDevices = ref<{ id: string; name: string }[]>([])

onMounted(async () => {
  await configStore.load()
  const c = configStore.config
  form.value = {
    streamMode: c.stream.mode,
    serverUrl: c.stream.serverUrl,
    streamKey: c.stream.streamKey,
    duckingEnabled: c.audio.duckingEnabled,
    duckingDepthDb: c.audio.duckingDepthDb,
    micEnabled: c.audio.micEnabled,
    micDeviceId: c.audio.micDeviceId,
    autoYield: c.audio.autoYield,
    llmProvider: c.llm.provider,
    llmApiKey: c.llm.apiKey,
    ttsMode: c.tts.mode,
    ttsAppId: c.tts.appId,
    ttsAccessToken: c.tts.accessToken,
    ttsCluster: c.tts.cluster,
    commentBackendUrl: c.comment.backendUrl,
    commentDesktopKey: c.comment.desktopKey,
    commentAppId: c.comment.appId,
    commentDevSimulate: c.comment.devSimulate
  }
  gatewayStatus.value = await window.api.comment.status()
  // 枚举麦克风输入设备
  try {
    const devices = await navigator.mediaDevices.enumerateDevices()
    micDevices.value = devices
      .filter((d) => d.kind === 'audioinput' && d.deviceId)
      .map((d) => ({ id: d.deviceId, name: d.label || '未命名麦克风' }))
  } catch {
    /* 设备枚举失败时保留空列表 */
  }
})

const saving = ref(false)

async function save(): Promise<void> {
  saving.value = true
  try {
    await configStore.save({
      stream: { mode: form.value.streamMode, serverUrl: form.value.serverUrl, streamKey: form.value.streamKey },
      audio: {
        duckingEnabled: form.value.duckingEnabled,
        duckingDepthDb: form.value.duckingDepthDb,
        micEnabled: form.value.micEnabled,
        micDeviceId: form.value.micDeviceId,
        autoYield: form.value.autoYield
      },
      llm: { provider: form.value.llmProvider, apiKey: form.value.llmApiKey },
      tts: {
        mode: form.value.ttsMode,
        appId: form.value.ttsAppId,
        accessToken: form.value.ttsAccessToken,
        cluster: form.value.ttsCluster
      },
      comment: {
        backendUrl: form.value.commentBackendUrl,
        desktopKey: form.value.commentDesktopKey,
        appId: form.value.commentAppId,
        devSimulate: form.value.commentDevSimulate
      }
    })
    message.success('设置已保存')
    // 麦克风配置即时生效
    const { audioEngine } = await import('@renderer/audio/engine')
    if (form.value.micEnabled) {
      await audioEngine
        .startMic(form.value.micDeviceId, {
          autoYield: form.value.autoYield,
          forwardPcm: form.value.streamMode === 'direct'
        })
        .catch(() => message.warning('麦克风接入失败，请检查设备权限'))
    } else {
      audioEngine.stopMic()
    }
  } catch {
    message.error('保存失败，请查看日志')
  } finally {
    saving.value = false
  }
}

async function toggleGateway(): Promise<void> {
  if (gatewayStatus.value?.running) {
    await window.api.comment.stop()
  } else {
    await save()
    const res = await window.api.comment.start()
    if (!res.ok) message.error(res.error ?? '评论网关启动失败', { duration: 5000 })
  }
  gatewayStatus.value = await window.api.comment.status()
}
</script>

<template>
  <div class="settings">
    <h1 class="title">设置</h1>

    <n-tabs type="line" class="tabs">
      <n-tab-pane name="stream" tab="推流">
        <n-card class="card">
          <n-form label-placement="top">
            <n-form-item label="推流方式">
              <n-radio-group v-model:value="form.streamMode">
                <n-radio value="direct">直接推流（需要推流码）</n-radio>
                <n-radio value="companion">通过直播伴侣（免推流码）</n-radio>
              </n-radio-group>
            </n-form-item>
            <div v-if="form.streamMode === 'companion'" class="companion-guide">
              <p class="guide-title">直播伴侣模式使用步骤：</p>
              <ol>
                <li>在本软件点「开始直播」启动 AI 声音服务（话术播报 + 评论回复）</li>
                <li>打开抖音直播伴侣，自行添加画面源（摄像头/素材/贴图）</li>
                <li>声音：AI 讲解与 BGM 经系统声音输出，请在伴侣中开启「系统声音」采集；真人讲话使用伴侣的麦克风源</li>
                <li>在伴侣中点击开播，由伴侣负责最终推流</li>
              </ol>
              <p class="guide-note">本系统只负责声音与评论互动，画面完全由直播伴侣负责。</p>
            </div>
            <template v-if="form.streamMode === 'direct'">
              <n-form-item label="推流服务器地址">
                <n-input v-model:value="form.serverUrl" placeholder="rtmp://…" />
              </n-form-item>
              <n-form-item label="串流密钥">
                <n-input v-model:value="form.streamKey" type="password" show-password-on="click" />
              </n-form-item>
            </template>
          </n-form>
        </n-card>
      </n-tab-pane>

      <n-tab-pane name="audio" tab="音频">
        <n-card class="card">
          <n-form label-placement="top">
            <n-form-item label="BGM 闪避（AI 说话时自动压低 BGM）">
              <n-switch v-model:value="form.duckingEnabled" />
            </n-form-item>
            <n-form-item :label="`下压深度：${form.duckingDepthDb} dB`">
              <n-slider v-model:value="form.duckingDepthDb" :min="6" :max="30" :step="1" />
            </n-form-item>

            <n-divider />

            <n-form-item label="真人麦克风（接入混音总线，支持多场景使用）">
              <n-switch v-model:value="form.micEnabled" />
            </n-form-item>
            <template v-if="form.micEnabled">
              <n-form-item label="麦克风设备">
                <n-select
                  v-model:value="form.micDeviceId"
                  :options="micDevices.map((d) => ({ label: d.name, value: d.id }))"
                  placeholder="选择输入设备"
                />
              </n-form-item>
              <n-form-item label="说话自动避让（检测到你说话时暂停 AI 播报，停嘴自动恢复）">
                <n-switch v-model:value="form.autoYield" />
              </n-form-item>
            </template>
          </n-form>
        </n-card>
      </n-tab-pane>

      <n-tab-pane name="llm" tab="大模型">
        <n-card class="card">
          <n-form label-placement="top">
            <n-form-item label="模型供应商">
              <n-select
                v-model:value="form.llmProvider"
                :options="[
                  { label: '火山引擎 · 豆包', value: 'doubao' },
                  { label: 'DeepSeek', value: 'deepseek' },
                  { label: '通义千问', value: 'qwen' }
                ]"
              />
            </n-form-item>
            <n-form-item label="API Key">
              <n-input v-model:value="form.llmApiKey" type="password" show-password-on="click" />
            </n-form-item>
          </n-form>
        </n-card>
      </n-tab-pane>

      <n-tab-pane name="tts" tab="语音合成">
        <n-card class="card">
          <n-form label-placement="top">
            <n-form-item label="合成方式">
              <n-radio-group v-model:value="form.ttsMode">
                <n-radio value="online">在线（火山引擎，推荐）</n-radio>
                <n-radio value="local">本地（需要 GPU，后续开放）</n-radio>
              </n-radio-group>
            </n-form-item>
            <template v-if="form.ttsMode === 'online'">
              <n-form-item label="火山引擎 AppId">
                <n-input v-model:value="form.ttsAppId" placeholder="控制台 → 语音技术 → 应用管理" />
              </n-form-item>
              <n-form-item label="Access Token">
                <n-input v-model:value="form.ttsAccessToken" type="password" show-password-on="click" />
              </n-form-item>
              <n-form-item label="接入集群（Cluster）">
                <n-input v-model:value="form.ttsCluster" placeholder="volcano_tts" />
              </n-form-item>
            </template>
          </n-form>
        </n-card>
      </n-tab-pane>

      <n-tab-pane name="comment" tab="评论监控">
        <n-card class="card">
          <n-form label-placement="top">
            <n-form-item label="服务端地址">
              <n-input v-model:value="form.commentBackendUrl" placeholder="https://live.example.com" />
            </n-form-item>
            <n-form-item label="桌面端接入密钥">
              <n-input v-model:value="form.commentDesktopKey" type="password" show-password-on="click" />
            </n-form-item>
            <n-form-item label="抖音 AppID（可选）">
              <n-input v-model:value="form.commentAppId" placeholder="留空使用服务端默认启用应用" />
            </n-form-item>
            <p class="scene-note">房间号由直播伴侣启动参数自动获取，AppSecret 和推送密钥只在管理后台配置。</p>
            <n-form-item label="开发模式（使用模拟评论源，不连抖音）">
              <n-switch v-model:value="form.commentDevSimulate" />
            </n-form-item>
          </n-form>
          <div class="gateway">
            <n-button type="primary" @click="toggleGateway">
              {{ gatewayStatus?.running ? '停止评论接收' : '启动评论接收' }}
            </n-button>
            <span v-if="gatewayStatus" class="gateway-status">
              状态：{{ gatewayStatus.running ? `运行中（${gatewayStatus.source}）· 已收 ${gatewayStatus.receivedCount} 条` : '未运行' }}
              <span v-if="gatewayStatus.lastError" class="gateway-error"> · {{ gatewayStatus.lastError }}</span>
            </span>
          </div>
        </n-card>
      </n-tab-pane>
    </n-tabs>

    <div class="actions">
      <n-button type="primary" :loading="saving" @click="save">保存设置</n-button>
    </div>
  </div>
</template>

<style scoped>
.settings {
  max-width: 760px;
}
.title {
  margin: 0 0 16px;
  font-size: 18px;
  font-weight: 600;
}
.card {
  margin-bottom: 16px;
}
.row {
  display: flex;
  gap: 8px;
  width: 100%;
}
.flex1 {
  flex: 1;
}
.companion-guide {
  margin: 8px 0 16px;
  padding: 12px 14px;
  border-radius: 8px;
  background: var(--bg-elevated);
  font-size: 13px;
  color: var(--text-secondary);
}
.companion-guide ol {
  margin: 8px 0;
  padding-left: 18px;
  display: flex;
  flex-direction: column;
  gap: 4px;
}
.guide-title {
  margin: 0;
  font-weight: 600;
  color: var(--text-primary);
}
.guide-note {
  margin: 8px 0 0;
  font-size: 12px;
  color: var(--text-tertiary);
}
.scene-note {
  margin: 0 0 8px;
  font-size: 12px;
  color: var(--text-tertiary);
}
.gateway {
  display: flex;
  align-items: center;
  gap: 12px;
}
.gateway-status {
  font-size: 12px;
  color: var(--text-secondary);
}
.gateway-error {
  color: var(--danger);
}
.actions {
  display: flex;
  justify-content: flex-end;
}
</style>
